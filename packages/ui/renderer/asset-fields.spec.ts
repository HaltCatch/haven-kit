import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TranslocoService } from '@jsverse/transloco';
import { HavenFileField, HavenImageField } from '@haven/ui/assets';
import { HavenMultilingualField } from '@haven/ui/form';
import type { FileReference, UploadAdapter } from '@haven/runtime';
import { expect, it, vi } from 'vitest';
import { fieldAt } from '@haven/ui/form-state';

import {
  setupAssetTests,
  deferred,
  document,
  source,
  revoke,
  render,
  fileInput,
  choose,
} from '../../../tests/ui/asset-support';

setupAssetTests();

it.each(['file', 'image'] as const)(
  'binds model-driven %s uploads through the named host adapter and stores only completed references',
  async (kind) => {
    const work = deferred<FileReference>();
    const upload = vi.fn<UploadAdapter['upload']>(() => work.promise);
    const url = vi.fn<UploadAdapter['url']>(async () => 'https://assets.example.test/completed');
    const fixture = await render(document(kind), source({ upload, url }));
    expect(fixture.componentInstance.value()['asset']).toEqual([]);
    expect(fieldAt(fixture.componentInstance.fields()!, '/asset')!().valid()).toBe(false);
    const events: unknown[] = [];
    fixture.componentInstance.uiEvent.subscribe((event) => events.push(event));
    const file = new File(['test'], kind === 'image' ? 'picture.png' : 'note.txt', {
      type: kind === 'image' ? 'image/png' : 'text/plain',
    });
    choose(fileInput(fixture.nativeElement as HTMLElement), file);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload.mock.calls[0]?.slice(0, 2)).toEqual([file, file.name]);
    expect(fixture.componentInstance.value()['asset']).toEqual([]);
    const ref = { id: 'complete', name: file.name, size: file.size, mediaType: file.type };
    work.resolve(ref);
    await expect.poll(() => fixture.componentInstance.value()['asset']).toEqual([ref]);
    await fixture.whenStable();
    expect(fieldAt(fixture.componentInstance.fields()!, '/asset')!().valid()).toBe(true);
    expect(fieldAt(fixture.componentInstance.fields()!, '/asset')!().touched()).toBe(true);
    await expect.poll(() => url.mock.calls.length).toBe(1);
    expect(url.mock.calls[0]?.[0]).toEqual(ref);
    expect(events).toContainEqual({ nodeId: 'asset', event: 'change', value: [ref] });
    expect(JSON.stringify(fixture.componentInstance.value())).not.toMatch(
      /blob:|https:|lastModified/,
    );
    if (kind === 'image') {
      await expect
        .poll(() => (fixture.nativeElement as HTMLElement).querySelector('img')?.src)
        .toBe('https://assets.example.test/completed');
      expect(revoke).toHaveBeenCalledWith('blob:renderer-local');
    }
  },
);

it('preserves a valid saved reference when the upload adapter returns metadata violating model constraints', async () => {
  const saved = { id: 'saved', name: 'saved.txt', mediaType: 'text/plain', size: 1 };
  const fixture = await render(
    document(),
    source({ upload: async () => ({ ...saved, id: 'bad', size: 99 }) }),
  );
  fixture.componentInstance.value.set({ asset: [saved] });
  await fixture.whenStable();
  const control = fixture.debugElement.query(By.directive(HavenFileField))
    .componentInstance as HavenFileField;
  choose(
    fileInput(fixture.nativeElement as HTMLElement),
    new File(['x'], 'okay.txt', { type: 'text/plain' }),
  );
  await expect.poll(() => control.error()).toBe('reference');
  expect(fixture.componentInstance.value()['asset']).toEqual([saved]);
  expect(fieldAt(fixture.componentInstance.fields()!, '/asset')!().valid()).toBe(true);
  control.clear();
  await fixture.whenStable();
  expect(fixture.componentInstance.value()['asset']).toEqual([]);
  expect(fieldAt(fixture.componentInstance.fields()!, '/asset')!().valid()).toBe(false);
});

it('validates overlong or malformed bound references without truncating the renderer value', async () => {
  const fixture = await render(document());
  const saved = { id: 'saved', name: 'saved.txt', mediaType: 'text/plain', size: 1 };
  fixture.componentInstance.value.set({ asset: [saved, saved] });
  await fixture.whenStable();
  expect(fixture.componentInstance.value()['asset']).toEqual([saved, saved]);
  expect(fieldAt(fixture.componentInstance.fields()!, '/asset')!().valid()).toBe(false);
  fixture.componentInstance.value.set({ asset: [{ ...saved, size: -1 }] });
  await fixture.whenStable();
  expect(fieldAt(fixture.componentInstance.fields()!, '/asset')!().valid()).toBe(false);
  expect(fixture.componentInstance.value()['asset']).toEqual([{ ...saved, size: -1 }]);
});

it.each(['file', 'image'] as const)(
  'enforces initially readonly model-driven %s fields while allowing saved previews',
  async (kind) => {
    const upload = vi.fn<UploadAdapter['upload']>(source().upload);
    const fixture = await render(document(kind, true), source({ upload }));
    const saved = {
      id: 'saved',
      name: kind === 'image' ? 'a.png' : 'a.txt',
      mediaType: kind === 'image' ? 'image/png' : 'text/plain',
      size: 1,
    };
    fixture.componentInstance.value.set({ asset: [saved] });
    await fixture.whenStable();
    const control = fixture.debugElement.query(
      By.directive(kind === 'image' ? HavenImageField : HavenFileField),
    ).componentInstance as HavenFileField | HavenImageField;
    expect(control.readonly()).toBe(true);
    expect(fileInput(fixture.nativeElement as HTMLElement).disabled).toBe(true);
    await control.choose(new File(['x'], saved.name, { type: saved.mediaType }));
    control.clear();
    expect(upload).not.toHaveBeenCalled();
    expect(fixture.componentInstance.value()['asset']).toEqual([saved]);
    await expect.poll(() => control.link()).toBe('https://assets.example.test/image.png');
  },
);

it('edits explicitly declared multilingual properties and preserves unrendered locales through UI language and node changes', async () => {
  const model = document();
  model.dataSchema = {
    type: 'object',
    properties: {
      title: {
        type: 'object',
        properties: {
          'en-US': { type: 'string' },
          'zh-CN': { type: 'string' },
          'fr-FR': { type: 'string' },
        },
      },
    },
  };
  model.resources = {};
  model.ui.children = [
    {
      id: 'title',
      kind: 'field.multilingual',
      version: 1,
      bind: '/title',
      props: { label: 'Content', locales: ['en-US', 'zh-CN'] },
    },
  ];
  const fixture = await render(model);
  fixture.componentInstance.value.set({
    title: { 'en-US': 'Initial', 'zh-CN': '原文', 'fr-FR': 'Conservé' },
  });
  await fixture.whenStable();
  const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
    'input[lang="en-US"]',
  )!;
  input.value = 'A;B；C';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await fixture.whenStable();
  expect(fixture.componentInstance.value()['title']).toEqual({
    'en-US': 'A;B；C',
    'zh-CN': '原文',
    'fr-FR': 'Conservé',
  });
  TestBed.inject(TranslocoService).setActiveLang('zh-CN');
  fixture.componentRef.setInput('document', {
    ...model,
    ui: {
      ...model.ui,
      children: [
        { ...model.ui.children![0]!, props: { label: '内容', locales: ['zh-CN'], readonly: true } },
      ],
    },
  });
  await fixture.whenStable();
  expect(fixture.debugElement.query(By.directive(HavenMultilingualField))).not.toBeNull();
  const visible = (fixture.nativeElement as HTMLElement).querySelectorAll('input');
  expect(visible).toHaveLength(1);
  expect(visible[0]!.readOnly).toBe(true);
  expect(fixture.componentInstance.value()['title']).toEqual({
    'en-US': 'A;B；C',
    'zh-CN': '原文',
    'fr-FR': 'Conservé',
  });
});

it('isolates public event snapshots from saved references', async () => {
  const fixture = await render(document());
  fixture.componentInstance.uiEvent.subscribe((event) => {
    if (event.event === 'change' && Array.isArray(event.value)) {
      (event.value[0] as Record<string, unknown>)['name'] = 'listener mutation';
    }
  });
  choose(
    fileInput(fixture.nativeElement as HTMLElement),
    new File(['x'], 'original.txt', { type: 'text/plain' }),
  );
  await expect
    .poll(() => fixture.componentInstance.value()['asset'])
    .toEqual([{ id: 'uploaded', name: 'original.txt', mediaType: 'text/plain', size: 1 }]);
});

it('keeps malformed runtime multilingual values invalid without crashing or silently repairing them', async () => {
  const model = document();
  model.dataSchema = {
    type: 'object',
    properties: {
      title: {
        type: 'object',
        properties: { 'en-US': { type: 'string' } },
      },
    },
  };
  model.resources = {};
  model.ui.children = [
    {
      id: 'title',
      kind: 'field.multilingual',
      version: 1,
      bind: '/title',
      props: { locales: ['en-US'] },
    },
  ];
  const fixture = await render(model);
  fixture.componentInstance.value.set({ title: null });
  await fixture.whenStable();
  const control = fixture.debugElement.query(By.directive(HavenMultilingualField))
    .componentInstance as HavenMultilingualField;
  expect(control.validValue()).toBe(false);
  expect(fieldAt(fixture.componentInstance.fields()!, '/title')!().valid()).toBe(false);
  const input = (fixture.nativeElement as HTMLElement).querySelector('input')!;
  expect(input.value).toBe('');
  expect(input.readOnly).toBe(true);
  expect(fixture.componentInstance.value()['title']).toBeNull();
});
