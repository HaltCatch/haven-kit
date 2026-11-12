import { expect, it } from 'vitest';
import { setupAssetTests } from '../../../tests/ui/asset-support';
import { createFiles, file, reference } from '../../../tests/ui/files-support';
setupAssetTests();
it('honours synchronous pending cancellation before starting any transport', async () => {
  const { field, upload } = await createFiles();
  field.uploadingChange.subscribe((value) => {
    if (value) for (const row of field.rows()) field.cancel(row.key);
  });
  field.choose([file('a'), file('b')]);
  expect(upload).not.toHaveBeenCalled();
  expect(field.uploading()).toBe(false);
  expect(field.rows().map((row) => row.status)).toEqual(['cancelled', 'cancelled']);
});
it('does not start a transport after a touch listener changes the owner synchronously', async () => {
  const { fixture, field, upload } = await createFiles();
  field.touch.subscribe(() => fixture.componentRef.setInput('identity', 'next-owner'));
  field.choose([file('a')]);
  expect(upload).not.toHaveBeenCalled();
  await fixture.whenStable();
  expect(field.rows()).toEqual([]);
});
it('does not overwrite a new pending job started by the cancelled adapter AbortSignal callback', async () => {
  const { field, jobs } = await createFiles([], 1);
  field.choose([file('a')]);
  const old = field.rows()[0]!.key;
  jobs[0]!.options.signal.addEventListener('abort', () => field.choose([file('b')]), {
    once: true,
  });
  field.cancel(old);
  expect(jobs).toHaveLength(2);
  expect(field.uploading()).toBe(true);
  jobs[0]!.work.resolve(reference('late'));
  await Promise.resolve();
  expect(field.value()).toEqual([]);
  jobs[1]!.work.resolve(reference('b'));
  await expect.poll(() => field.uploading()).toBe(false);
  expect(field.value()).toEqual([reference('b')]);
});
it('keeps the queue started by a completed-pending listener and emits the successful value first', async () => {
  const { field, jobs } = await createFiles([], 1);
  let next = false;
  field.uploadingChange.subscribe((value) => {
    if (!value && !next) {
      next = true;
      expect(field.value()).toEqual([reference('a')]);
      field.choose([file('b')]);
    }
  });
  field.choose([file('a')]);
  jobs[0]!.work.resolve(reference('a'));
  await expect.poll(() => jobs.length).toBe(2);
  expect(field.uploading()).toBe(true);
  jobs[1]!.work.resolve(reference('b'));
  await expect.poll(() => field.uploading()).toBe(false);
  expect(field.value()).toEqual([reference('a'), reference('b')]);
});
it('allows a synchronous failed-intent callback to remove the row without resurrecting incomplete state', async () => {
  const { field, jobs } = await createFiles();
  field.unresolvedChange.subscribe((value) => {
    if (value) for (const row of field.rows()) if (row.status === 'error') field.remove(row.key);
  });
  field.choose([file('a')]);
  jobs[0]!.work.reject(new Error('failed'));
  await expect.poll(() => field.uploading()).toBe(false);
  expect(field.unresolved()).toBe(false);
  expect(field.rows()).toEqual([]);
});
it('does not call stale adapter after synchronous configuration replacement in pending output', async () => {
  const { fixture, field, upload } = await createFiles();
  field.uploadingChange.subscribe((value) => {
    if (value) fixture.componentRef.setInput('adapter', undefined);
  });
  field.choose([file('a')]);
  expect(upload).not.toHaveBeenCalled();
  await fixture.whenStable();
  expect(field.uploading()).toBe(false);
  expect(field.value()).toEqual([]);
});
