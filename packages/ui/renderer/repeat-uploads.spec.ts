import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideTransloco, TranslocoService } from '@jsverse/transloco';
import { provideHavenTransloco } from '@haven/ui/i18n';
import english from '@haven/ui/i18n/locales/en-US.json';
import { HavenRepeat } from '@haven/ui/repeat';
import { HavenFileField } from '@haven/ui/assets';
import type { UploadAdapter, FileReference } from '@haven/runtime';
import type { HavenDocument, JsonObject } from '@haven/schema';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { HavenRenderer } from './renderer';
import type { HavenUiEvent } from './renderer';
import { fieldAt } from '@haven/ui/form-state';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
function document(): HavenDocument {
  return {
    schemaVersion: '1.0',
    id: 'repeat-uploads',
    title: 'Repeated uploads',
    dataSchema: {
      type: 'object',
      properties: {
        groups: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              rows: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    asset: {
                      type: 'array',
                      maxItems: 1,
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          name: { type: 'string' },
                          mediaType: { type: 'string' },
                          size: { type: 'number' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    ui: {
      id: 'groups',
      kind: 'form.repeat',
      version: 1,
      bind: '/groups',
      props: { title: 'Groups' },
      children: [
        {
          id: 'rows',
          kind: 'form.repeat',
          version: 1,
          bind: '/rows',
          props: { title: 'Rows' },
          children: [
            { id: 'name', kind: 'field.text', version: 1, bind: '/name', props: { label: 'Name' } },
            {
              id: 'asset',
              kind: 'field.file',
              version: 1,
              bind: '/asset',
              props: { label: 'Attachment', resource: 'files' },
            },
          ],
        },
      ],
    },
    theme: { preset: 'material', mode: 'dark', density: 'comfortable' },
    actions: {},
    resources: { files: { type: 'upload', adapter: 'test.files' } },
  };
}
function data(): JsonObject {
  return {
    groups: [
      {
        rows: [
          { name: 'A', asset: [] },
          { name: 'B', asset: [] },
          { name: 'C', asset: [] },
        ],
      },
      { rows: [{ name: 'D', asset: [] }] },
    ],
  };
}
beforeEach(() => {
  TestBed.configureTestingModule({
    providers: [
      provideTransloco({
        config: { defaultLang: 'en-US', availableLangs: ['en-US'], prodMode: true },
      }),
      provideHavenTransloco(),
    ],
  });
  TestBed.inject(TranslocoService).setTranslation({ haven: english }, 'en-US');
});
afterEach(() => TestBed.resetTestingModule());
async function setup() {
  const work = deferred<FileReference>();
  let signal!: AbortSignal;
  const source: UploadAdapter = {
    upload: (_file, _name, context) => {
      signal = context.signal;
      return work.promise;
    },
    url: async () => 'https://assets.example.test/file',
  };
  const fixture = TestBed.createComponent(HavenRenderer);
  fixture.componentRef.setInput('document', document());
  fixture.componentRef.setInput('value', data());
  fixture.componentRef.setInput('host', { uploads: new Map([['test.files', source]]) });
  await fixture.whenStable();
  const renderer = fixture.componentInstance;
  expect(renderer.validation().diagnostics).toEqual([]);
  const controls = () => fixture.debugElement.queryAll(By.directive(HavenFileField));
  const [outer, inner] = fixture.debugElement
    .queryAll(By.directive(HavenRepeat))
    .map((entry) => entry.componentInstance as HavenRepeat);
  const savedControl = controls()[1]!.componentInstance as HavenFileField;
  const identity = savedControl.identity();
  const fileInput = (controls()[1]!.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
    'input[type="file"]',
  )!;
  Object.defineProperty(fileInput, 'files', {
    configurable: true,
    value: [new File(['test'], 'B.txt', { type: 'text/plain' })],
  });
  fileInput.dispatchEvent(new Event('change', { bubbles: true }));
  await fixture.whenStable();
  expect(renderer.uploading()).toBe(true);
  expect(fieldAt(renderer.fields()!, '/groups/0/rows/1/asset')!().valid()).toBe(false);
  return {
    fixture,
    renderer,
    work,
    signal,
    outer: outer!,
    inner: inner!,
    savedControl,
    identity,
    controls,
  };
}

it('keeps the same nested upload owner across inner and outer reordering and another row deletion', async () => {
  const { fixture, renderer, work, signal, outer, inner, savedControl, identity, controls } =
    await setup();
  const instanceId = [...renderer.instances().contexts].find(
    ([, context]) => context.source.id === 'asset' && context.scope === '/groups/0/rows/1',
  )![0];
  const events: HavenUiEvent[] = [];
  renderer.uiEvent.subscribe((event) => events.push(event));
  const bKey = inner.items()[1]!.key,
    cKey = inner.items()[2]!.key;
  inner.requestMove(bKey, 0);
  await fixture.whenStable();
  inner.requestRemove(cKey);
  await fixture.whenStable();
  outer.requestMove(outer.items()[0]!.key, 1);
  await fixture.whenStable();
  expect(controls()[1]!.componentInstance).toBe(savedControl);
  expect(savedControl.identity()).toBe(identity);
  expect(signal.aborted).toBe(false);
  expect(savedControl.uploading()).toBe(true);
  expect(renderer.instances().contexts.get(instanceId)?.scope).toBe('/groups/1/rows/0');
  expect(fieldAt(renderer.fields()!, '/groups/1/rows/0/asset')!().valid()).toBe(false);
  const ref = { id: 'saved-B', name: 'B.txt', mediaType: 'text/plain', size: 4 };
  work.resolve(ref);
  await expect.poll(() => renderer.uploading()).toBe(false);
  await fixture.whenStable();
  expect(structuredClone(renderer.value())).toEqual({
    groups: [
      { rows: [{ name: 'D', asset: [] }] },
      {
        rows: [
          { name: 'B', asset: [ref] },
          { name: 'A', asset: [] },
        ],
      },
    ],
  });
  expect(fieldAt(renderer.fields()!, '/groups/1/rows/0/asset')!().valid()).toBe(true);
  expect(events.filter((event) => event.nodeId === 'asset')).toEqual([
    { nodeId: 'asset', instanceId, event: 'change', value: [ref] },
  ]);
});

it('aborts a removed nested upload owner and suppresses late success without changing remaining rows', async () => {
  const { fixture, renderer, work, signal, inner, savedControl, controls } = await setup();
  const events: HavenUiEvent[] = [];
  renderer.uiEvent.subscribe((event) => events.push(event));
  const key = inner.items()[1]!.key;
  inner.requestMove(key, 0);
  await fixture.whenStable();
  inner.requestRemove(key);
  await fixture.whenStable();
  expect(signal.aborted).toBe(true);
  expect(renderer.uploading()).toBe(false);
  expect(controls().some((entry) => entry.componentInstance === savedControl)).toBe(false);
  const remaining = structuredClone(renderer.value());
  work.resolve({ id: 'stale-B', name: 'B.txt', mediaType: 'text/plain', size: 4 });
  await Promise.resolve();
  await fixture.whenStable();
  expect(structuredClone(renderer.value())).toEqual(remaining);
  expect(remaining).toEqual({
    groups: [
      {
        rows: [
          { name: 'A', asset: [] },
          { name: 'C', asset: [] },
        ],
      },
      { rows: [{ name: 'D', asset: [] }] },
    ],
  });
  expect(events.filter((event) => event.nodeId === 'asset')).toEqual([]);
  expect(renderer.fields()!().valid()).toBe(true);
});
