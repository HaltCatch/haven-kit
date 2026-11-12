import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TranslocoService } from '@jsverse/transloco';
import { expect, it, vi } from 'vitest';
import { setupAssetTests, source } from '../../../tests/ui/asset-support';
import { createFiles, file, reference } from '../../../tests/ui/files-support';
import { HavenAssetDrop } from './drop-zone';
import { HavenFileField, HavenImageField } from './upload';

setupAssetTests();
function transfer(files: readonly File[], directory = false) {
  return {
    files,
    types: ['Files'],
    dropEffect: 'none',
    items: directory
      ? [
          {
            kind: 'file',
            webkitGetAsEntry: () => ({ isDirectory: true }),
          },
        ]
      : [],
  };
}
function drag(target: HTMLElement, type: string, data: object) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: data });
  target.dispatchEvent(event);
  return event;
}

it('uses the same bounded queue for native multiple drops and preserves active uploads across presentation toggles', async () => {
  const { fixture, field, jobs } = await createFiles([reference('old')], 1, 3);
  const zone = (fixture.nativeElement as HTMLElement).querySelector('fieldset')!;
  const ignored = drag(zone, 'drop', transfer([file('ignored')]));
  expect(ignored.defaultPrevented).toBe(false);
  expect(jobs).toHaveLength(0);
  fixture.componentRef.setInput('dropzone', true);
  await fixture.whenStable();
  const accepted = drag(zone, 'drop', transfer([file('a'), file('b')]));
  expect(accepted.defaultPrevented).toBe(true);
  expect(field.rows().map((row) => row.name)).toEqual(['old.txt', 'a.txt', 'b.txt']);
  expect(jobs).toHaveLength(1);
  fixture.componentRef.setInput('dropzone', false);
  await fixture.whenStable();
  expect(jobs[0]!.options.signal.aborted).toBe(false);
  jobs[0]!.work.resolve(reference('a'));
  await expect.poll(() => jobs.length).toBe(2);
  jobs[1]!.work.resolve(reference('b'));
  await expect.poll(() => field.uploading()).toBe(false);
  expect(field.value()).toEqual([reference('old'), reference('a'), reference('b')]);
});

it('keeps nested drag feedback stable, resets blocked zones and leaves native file buttons accessible', async () => {
  const { fixture } = await createFiles();
  fixture.componentRef.setInput('dropzone', true);
  await fixture.whenStable();
  const zone = (fixture.nativeElement as HTMLElement).querySelector('fieldset')!;
  const child = zone.querySelector('button')!;
  const directive = fixture.debugElement
    .query(By.directive(HavenAssetDrop))
    .injector.get(HavenAssetDrop);
  drag(zone, 'dragenter', transfer([file('a')]));
  drag(child, 'dragenter', transfer([file('a')]));
  drag(child, 'dragleave', transfer([file('a')]));
  expect(directive.active()).toBe(true);
  drag(zone, 'dragleave', transfer([file('a')]));
  expect(directive.active()).toBe(false);
  drag(zone, 'dragenter', transfer([file('a')]));
  fixture.componentRef.setInput('disabled', true);
  await fixture.whenStable();
  expect(directive.active()).toBe(false);
  fixture.componentRef.setInput('disabled', false);
  await fixture.whenStable();
  expect(directive.active()).toBe(false);
  child.focus();
  expect(document.activeElement).toBe(child);
  expect((fixture.nativeElement as HTMLElement).textContent).toContain('Drop files here');
  TestBed.inject(TranslocoService).setActiveLang('zh-CN');
  await fixture.whenStable();
  expect((fixture.nativeElement as HTMLElement).textContent).toContain('将文件拖到此处');
});

it('rejects folders, links and capacity overflow without silently uploading a partial selection', async () => {
  const { fixture, field, jobs } = await createFiles([reference('old')], 1, 2);
  fixture.componentRef.setInput('dropzone', true);
  await fixture.whenStable();
  const zone = (fixture.nativeElement as HTMLElement).querySelector('fieldset')!;
  drag(zone, 'drop', transfer([file('folder')], true));
  expect(field.error()).toBe('drop');
  expect(field.unresolved()).toBe(true);
  const link = drag(zone, 'drop', { types: ['text/uri-list'], files: [], items: [] });
  expect(link.defaultPrevented).toBe(true);
  expect(field.error()).toBe('drop');
  drag(zone, 'drop', transfer([file('a'), file('b')]));
  expect(field.error()).toBe('count');
  expect(field.value()).toEqual([reference('old')]);
  expect(jobs).toHaveLength(0);
  drag(zone, 'drop', transfer([file('valid')]));
  expect(field.unresolved()).toBe(false);
  expect(jobs).toHaveLength(1);
});

it.each(['readonly', 'disabled'] as const)(
  'blocks file drops synchronously when %s changes',
  async (property) => {
    const { fixture, field, jobs } = await createFiles([reference('old')]);
    fixture.componentRef.setInput('dropzone', true);
    await fixture.whenStable();
    fixture.componentRef.setInput(property, true);
    // Dispatch before descendant bindings refresh: the field must check current inputs itself.
    const zone = (fixture.nativeElement as HTMLElement).querySelector('fieldset')!;
    drag(zone, 'drop', transfer([file('a')]));
    expect(jobs).toHaveLength(0);
    expect(field.value()).toEqual([reference('old')]);
    await fixture.whenStable();
    const blocked = transfer([file('a')]);
    drag(zone, 'dragover', blocked);
    expect(blocked.dropEffect).toBe('none');
    expect(drag(zone, 'drop', blocked).defaultPrevented).toBe(true);
    expect(jobs).toHaveLength(0);
  },
);

it('keeps dropped queue work out of a new owner after a synchronous touch callback', async () => {
  const { fixture, field, jobs } = await createFiles([reference('old')]);
  fixture.componentRef.setInput('dropzone', true);
  await fixture.whenStable();
  field.touch.subscribe(() => fixture.componentRef.setInput('identity', 'new-owner'));
  drag(
    (fixture.nativeElement as HTMLElement).querySelector('fieldset')!,
    'drop',
    transfer([file('a')]),
  );
  expect(jobs).toHaveLength(0);
  await fixture.whenStable();
  expect(field.value()).toEqual([reference('old')]);
  expect(field.uploading()).toBe(false);
});

it.each([HavenFileField, HavenImageField])(
  'shares file validation and single-value replacement for %s',
  async (component) => {
    const fixture = TestBed.createComponent(component);
    const upload = vi.fn(source().upload);
    fixture.componentRef.setInput('label', 'Asset');
    fixture.componentRef.setInput('adapter', source({ upload }));
    fixture.componentRef.setInput('dropzone', true);
    fixture.componentRef.setInput('accept', 'image/png');
    await fixture.whenStable();
    const zone = (fixture.nativeElement as HTMLElement).querySelector('fieldset')!;
    drag(zone, 'drop', transfer([file('a'), file('b')]));
    expect(fixture.componentInstance.error()).toBe('singleDrop');
    expect(upload).not.toHaveBeenCalled();
    drag(zone, 'drop', transfer([file('a')]));
    expect(fixture.componentInstance.error()).toBe('type');
    expect(upload).not.toHaveBeenCalled();
    const image = new File(['png'], 'image.png', { type: 'image/png' });
    drag(zone, 'drop', transfer([image]));
    await expect.poll(() => fixture.componentInstance.uploading()).toBe(false);
    expect(upload).toHaveBeenCalledOnce();
    expect(fixture.componentInstance.value()).toEqual([
      { id: 'uploaded', name: 'image.png', mediaType: 'image/png', size: 3 },
    ]);
  },
);
