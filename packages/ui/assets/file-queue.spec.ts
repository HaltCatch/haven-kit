import { expect, it, vi } from 'vitest';
import type { FileReference, UploadAdapter } from '@haven/runtime';
import { HavenFileQueue } from './file-queue';
import { deferred } from '../../../tests/ui/asset-support';

const ref = (id: string): FileReference => ({
  id,
  name: `${id}.txt`,
  mediaType: 'text/plain',
  size: 1,
});
const file = (id: string) => new File([id], `${id}.txt`, { type: 'text/plain' });
function create(concurrency = 2, maxItems = 10, initial: FileReference[] = []) {
  const jobs: {
    name: string;
    options: Parameters<UploadAdapter['upload']>[2];
    work: ReturnType<typeof deferred<FileReference>>;
  }[] = [];
  const value = vi.fn<(value: FileReference[]) => void>(),
    busy = vi.fn<(value: boolean) => void>();
  const queue = new HavenFileQueue(
    {
      adapter: {
        upload: (_file, name, options) => {
          const work = deferred<FileReference>();
          jobs.push({ name, options, work });
          return work.promise;
        },
        url: async () => '',
      },
      policy: { accept: 'text/plain', maxItems, concurrency },
      value,
      busy,
    },
    initial,
  );
  return { queue, jobs, value, busy };
}
const settle = () => new Promise<void>((resolve) => queueMicrotask(resolve));
it('bounds concurrency with RxJS, keeps success order by list position and includes queued rows in pending', async () => {
  const { queue, jobs, value } = create(2);
  queue.add([file('a'), file('b'), file('c')]);
  expect(jobs.map((j) => j.name)).toEqual(['a.txt', 'b.txt']);
  expect(queue.rows().map((r) => r.status)).toEqual(['uploading', 'uploading', 'queued']);
  jobs[1]!.work.resolve(ref('b'));
  await settle();
  await settle();
  expect(jobs.map((j) => j.name)).toEqual(['a.txt', 'b.txt', 'c.txt']);
  jobs[2]!.work.resolve(ref('c'));
  jobs[0]!.work.resolve(ref('a'));
  await settle();
  await settle();
  expect(value.mock.lastCall?.[0].map((r) => r.id)).toEqual(['a', 'b', 'c']);
  expect(queue.busy()).toBe(false);
  queue.destroy();
});
it('counts saved, failed, queued and active rows toward capacity without silent partial additions', async () => {
  const { queue, jobs } = create(1, 3, [ref('saved')]);
  expect(queue.add([file('a'), new File(['x'], 'wrong.png', { type: 'image/png' })])).toBe(true);
  expect(queue.add([file('overflow')])).toBe(false);
  expect(queue.rows()).toHaveLength(3);
  const failed = queue.rows().find((r) => r.status === 'error')!;
  expect(failed.error).toBe('type');
  queue.remove(failed.key);
  expect(queue.add([file('b')])).toBe(true);
  queue.cancel(queue.rows().find((r) => r.name === 'b.txt')!.key);
  expect(queue.rows().at(-1)?.status).toBe('cancelled');
  jobs[0]!.work.resolve(ref('a'));
  await settle();
  await settle();
  expect(jobs).toHaveLength(1);
  queue.destroy();
});
it('preserves stable tasks during reorder and uses current user order when late uploads complete', async () => {
  const { queue, jobs, value } = create(2, 10, [ref('existing')]);
  queue.add([file('a'), file('b')]);
  const a = queue.rows()[1]!.key,
    b = queue.rows()[2]!.key;
  jobs[0]!.options.progress(1, 2);
  expect(queue.rows()[1]!.progress).toBe(50);
  queue.move(b, -1);
  queue.move(b, -1);
  expect(queue.rows()[0]!.key).toBe(b);
  jobs[0]!.work.resolve(ref('a'));
  jobs[1]!.work.resolve(ref('b'));
  await settle();
  expect(queue.rows()[2]!.key).toBe(a);
  expect(value.mock.lastCall?.[0].map((r) => r.id)).toEqual(['b', 'existing', 'a']);
  queue.destroy();
});
it('retries failed jobs on the same row key and rejects duplicate adapter identities', async () => {
  const { queue, jobs, value } = create(1, 10, [ref('existing')]);
  queue.add([file('a')]);
  const key = queue.rows()[1]!.key;
  jobs[0]!.work.reject(new Error('PRIVATE'));
  await settle();
  await settle();
  expect(queue.rows()[1]).toMatchObject({ key, status: 'error', error: 'upload' });
  queue.retry(key);
  expect(jobs).toHaveLength(2);
  jobs[1]!.work.resolve(ref('existing'));
  await settle();
  expect(queue.rows()[1]).toMatchObject({ key, status: 'error', error: 'duplicate' });
  expect(value).not.toHaveBeenCalled();
  queue.destroy();
});
it('cancels and removes in-flight tasks before native abort callbacks can synchronously replace them', async () => {
  const { queue, jobs, value } = create(1);
  queue.add([file('a')]);
  const old = queue.rows()[0]!.key;
  jobs[0]!.options.signal.addEventListener('abort', () => queue.add([file('b')]), { once: true });
  queue.remove(old);
  expect(jobs).toHaveLength(2);
  expect(queue.busy()).toBe(true);
  expect(queue.rows()[0]!.name).toBe('b.txt');
  jobs[0]!.work.resolve(ref('stale'));
  await settle();
  expect(value.mock.calls.flatMap((c) => c[0]).map((r) => r.id)).not.toContain('stale');
  jobs[1]!.work.resolve(ref('b'));
  await settle();
  expect(value.mock.lastCall?.[0].map((r) => r.id)).toEqual(['b']);
  queue.destroy();
});
it('supports synchronous busy cancellation before any upload starts', () => {
  const upload = vi.fn<UploadAdapter['upload']>();
  const queue = new HavenFileQueue(
    {
      adapter: { upload, url: async () => '' },
      policy: { accept: '', maxItems: 10, concurrency: 2 },
      value: () => {},
      busy: (value) => {
        if (value) for (const row of queue.rows()) queue.cancel(row.key);
      },
    },
    [],
  );
  queue.add([file('a'), file('b')]);
  expect(upload).not.toHaveBeenCalled();
  expect(queue.rows().map((r) => r.status)).toEqual(['cancelled', 'cancelled']);
  queue.destroy();
});
it('destroys all queued/active jobs before abort callbacks can enqueue another task', async () => {
  const { queue, jobs } = create(1);
  queue.add([file('a'), file('b')]);
  jobs[0]!.options.signal.addEventListener('abort', () => queue.add([file('late')]));
  queue.destroy();
  expect(jobs[0]!.options.signal.aborted).toBe(true);
  expect(queue.add([file('late')])).toBe(false);
  jobs[0]!.work.resolve(ref('a'));
  await settle();
  expect(jobs).toHaveLength(1);
});
