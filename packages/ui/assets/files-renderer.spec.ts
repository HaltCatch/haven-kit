import { By } from '@angular/platform-browser';
import { expect, it, vi } from 'vitest';
import { HavenFilesField } from './files';
import { HavenRepeat } from '@haven/ui/repeat';
import { fieldAt } from '@haven/ui/form-state';
import {
  deferred,
  document as assetDocument,
  render,
  setupAssetTests,
  source,
} from '../../../tests/ui/asset-support';
import { file, reference } from '../../../tests/ui/files-support';
import type { HavenDocument } from '@haven/schema';
import type { FileReference } from '@haven/runtime';

setupAssetTests();
function document(minItems = 0, maxItems = 3): HavenDocument {
  const model = assetDocument('file');
  model.ui.children![0]!.kind = 'field.files';
  model.dataSchema.required = [];
  Object.assign(model.dataSchema.properties!['asset']!, { minItems, maxItems });
  return model;
}
it('blocks strict submit for failed optional new-file intent until explicitly removed', async () => {
  const work = deferred<FileReference>();
  const fixture = await render(document(), source({ upload: () => work.promise }));
  const field = fixture.debugElement.query(By.directive(HavenFilesField))
    .componentInstance as HavenFilesField;
  const save = vi.fn(async () => {});
  field.choose([file('a')]);
  await fixture.whenStable();
  expect(await fixture.componentInstance.submit({ action: save })).toBe(false);
  work.reject(new Error('PRIVATE'));
  await expect.poll(() => field.uploading()).toBe(false);
  await fixture.whenStable();
  const errors = fieldAt(fixture.componentInstance.fields()!, '/asset')!()
    .errors()
    .map((e) => e.kind);
  expect(errors).toContain('assetIncomplete');
  expect(await fixture.componentInstance.submit({ action: save })).toBe(false);
  expect(save).not.toHaveBeenCalled();
  field.remove(field.rows()[0]!.key);
  await fixture.whenStable();
  expect(await fixture.componentInstance.submit({ action: save })).toBe(true);
  expect(save).toHaveBeenCalledOnce();
});

it('connects model dropzone to native file drops and preserves strict submit rejection after invalid drops', async () => {
  const model = document();
  model.ui.children![0]!.props!['dropzone'] = true;
  const fixture = await render(model);
  const field = fixture.debugElement.query(By.directive(HavenFilesField))
    .componentInstance as HavenFilesField;
  expect(field.dropzone()).toBe(true);
  const zone = (fixture.nativeElement as HTMLElement).querySelector('fieldset')!;
  const send = (files: File[], types = ['Files']) => {
    const event = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: { files, types, items: [] } });
    zone.dispatchEvent(event);
  };
  send([file('a')]);
  await expect.poll(() => field.uploading()).toBe(false);
  await fixture.whenStable();
  expect(JSON.parse(JSON.stringify(fixture.componentInstance.value()))).toEqual({
    asset: [{ id: 'uploaded', name: 'a.txt', mediaType: 'text/plain', size: 1 }],
  });
  const save = vi.fn(async () => {});
  expect(await fixture.componentInstance.submit({ action: save })).toBe(true);
  send([], ['text/plain']);
  await fixture.whenStable();
  expect(field.error()).toBe('drop');
  expect(await fixture.componentInstance.submit({ action: save })).toBe(false);
  expect(save).toHaveBeenCalledOnce();
});
it('keeps native min/max contracts and pending identity when successful values echo through Signal Forms', async () => {
  const a = deferred<FileReference>(),
    b = deferred<FileReference>();
  let serial = 0;
  const fixture = await render(
    document(1, 2),
    source({ upload: () => (++serial === 1 ? a.promise : b.promise) }),
  );
  const field = fixture.debugElement.query(By.directive(HavenFilesField))
    .componentInstance as HavenFilesField;
  const save = vi.fn(async () => {});
  expect(field.maxItems()).toBe(2);
  expect(await fixture.componentInstance.submit({ action: save })).toBe(false);
  field.choose([file('a'), file('b')]);
  const keys = field.rows().map((row) => row.key);
  a.resolve(reference('a'));
  await expect.poll(() => field.value().length).toBe(1);
  await fixture.whenStable();
  expect(field.rows().map((row) => row.key)).toEqual(keys);
  expect(field.uploading()).toBe(true);
  expect(await fixture.componentInstance.submit({ action: save })).toBe(false);
  b.resolve(reference('b'));
  await expect.poll(() => field.uploading()).toBe(false);
  await fixture.whenStable();
  // Angular FieldTree owns symbol row identity; persisted JSON remains metadata-only.
  expect(JSON.parse(JSON.stringify(fixture.componentInstance.value()))).toEqual({
    asset: [reference('a'), reference('b')],
  });
  expect(await fixture.componentInstance.submit({ action: save })).toBe(true);
  field.choose([file('overflow')]);
  await fixture.whenStable();
  expect(field.error()).toBe('count');
  expect(await fixture.componentInstance.submit({ action: save })).toBe(false);
  field.remove(field.rows()[0]!.key);
  await fixture.whenStable();
  expect(await fixture.componentInstance.submit({ action: save })).toBe(true);
});
it.each(['readonly', 'rebind', 'host'] as const)(
  'cancels queues and removes stale pending errors on renderer %s change',
  async (change) => {
    const model = document();
    model.dataSchema.properties!['other'] = { ...model.dataSchema.properties!['asset']! };
    const work = deferred<FileReference>();
    let signal!: AbortSignal;
    const adapter = source({
      upload: (_f, _n, options) => {
        signal = options.signal;
        return work.promise;
      },
    });
    const fixture = await render(model, adapter);
    const field = fixture.debugElement.query(By.directive(HavenFilesField))
      .componentInstance as HavenFilesField;
    field.choose([file('a')]);
    await fixture.whenStable();
    if (change === 'host')
      fixture.componentRef.setInput('host', { uploads: new Map([['test.files', source()]]) });
    else
      fixture.componentRef.setInput('document', {
        ...model,
        ui: {
          ...model.ui,
          children: model.ui.children!.map((node) =>
            change === 'readonly'
              ? { ...node, props: { ...node.props, readonly: true } }
              : { ...node, bind: '/other' },
          ),
        },
      });
    await fixture.whenStable();
    expect(signal.aborted).toBe(true);
    expect(fixture.componentInstance.uploading()).toBe(false);
    work.resolve(reference('stale'));
    await fixture.whenStable();
    expect(fixture.componentInstance.value()).toEqual({ asset: [], other: [] });
    for (const path of ['/asset', '/other'])
      expect(
        fieldAt(fixture.componentInstance.fields()!, path)!()
          .errors()
          .map((e) => e.kind),
      ).not.toContain('uploadPending');
  },
);

it('keeps repeated queue identity across reordering and cancels only the removed row', async () => {
  const model = document();
  const filesSchema = model.dataSchema.properties!['asset']!;
  const fileNode = model.ui.children![0]!;
  model.dataSchema = {
    type: 'object',
    properties: {
      groups: { type: 'array', items: { type: 'object', properties: { asset: filesSchema } } },
    },
  };
  model.ui = {
    id: 'groups',
    kind: 'form.repeat',
    version: 1,
    bind: '/groups',
    props: { title: 'Groups' },
    children: [fileNode],
  };
  const work = deferred<FileReference>();
  let signal!: AbortSignal;
  const fixture = await render(
    model,
    source({
      upload: (_f, _n, options) => {
        signal = options.signal;
        return work.promise;
      },
    }),
  );
  fixture.componentRef.setInput('value', { groups: [{ asset: [] }, { asset: [] }] });
  await fixture.whenStable();
  const repeat = fixture.debugElement.query(By.directive(HavenRepeat))
    .componentInstance as HavenRepeat;
  const controls = () => fixture.debugElement.queryAll(By.directive(HavenFilesField));
  const field = controls()[0]!.componentInstance as HavenFilesField;
  field.choose([file('a')]);
  const identity = field.identity(),
    rowKey = field.rows()[0]!.key;
  repeat.requestMove(repeat.items()[0]!.key, 1);
  await fixture.whenStable();
  expect(controls()[1]!.componentInstance).toBe(field);
  expect(field.identity()).toBe(identity);
  expect(field.rows()[0]!.key).toBe(rowKey);
  expect(signal.aborted).toBe(false);
  repeat.requestRemove(repeat.items()[1]!.key);
  await fixture.whenStable();
  expect(signal.aborted).toBe(true);
  expect(fixture.componentInstance.uploading()).toBe(false);
  work.resolve(reference('late'));
  await fixture.whenStable();
  expect(JSON.parse(JSON.stringify(fixture.componentInstance.value()))).toEqual({
    groups: [{ asset: [] }],
  });
});
