import { computed, signal } from '@angular/core';
import { EMPTY, ReplaySubject, Subject, defer, mergeMap, takeUntil } from 'rxjs';
import { assetFileIssue, isAssetReference } from '@haven/schema';
import type { FileReference } from '@haven/runtime';
import type { FileQueueEntry, FileQueueHost } from './file-queue-types';
interface Job {
  key: string;
  file: File;
  abort: AbortController;
  cancel: ReplaySubject<void>;
}

/** RxJS owns the bounded work queue. This class only owns per-file metadata/commit identity. */
export class HavenFileQueue {
  readonly rows = signal<readonly FileQueueEntry[]>([]);
  readonly busy = computed(() =>
    this.rows().some((row) => row.status === 'queued' || row.status === 'uploading'),
  );
  readonly #work = new Subject<Job>();
  readonly #jobs = new Map<string, Job>();
  readonly #files = new Map<string, File>();
  readonly #subscription;
  #alive = true;
  #serial = 0;
  constructor(
    readonly host: FileQueueHost,
    initial: readonly FileReference[],
  ) {
    this.rows.set(
      initial.map((reference) => ({
        key: this.#key(),
        name: reference.name,
        status: 'ready',
        progress: null,
        reference,
      })),
    );
    this.#subscription = this.#work
      .pipe(
        mergeMap(
          (job) =>
            defer(() => (this.#current(job, 'queued') ? this.#run(job) : EMPTY)).pipe(
              takeUntil(job.cancel),
            ),
          host.policy.concurrency,
        ),
      )
      .subscribe();
  }
  #key(): string {
    return `file-${++this.#serial}`;
  }
  #current(job: Job, status?: FileQueueEntry['status']): boolean {
    return (
      this.#alive &&
      this.#jobs.get(job.key) === job &&
      !job.abort.signal.aborted &&
      (!status || this.rows().some((row) => row.key === job.key && row.status === status))
    );
  }
  #update(key: string, update: (row: FileQueueEntry) => FileQueueEntry): void {
    this.rows.update((rows) => rows.map((row) => (row.key === key ? update(row) : row)));
  }
  #publish(value = false): void {
    if (!this.#alive) return;
    if (value)
      this.host.value(this.rows().flatMap((row) => (row.reference ? [row.reference] : [])));
    if (this.#alive) this.host.unresolved?.(this.rows().some((row) => row.status === 'error'));
    if (this.#alive) this.host.busy(this.busy());
  }
  add(files: readonly File[]): boolean {
    if (!this.#alive || files.length + this.rows().length > this.host.policy.maxItems) return false;
    const jobs: Job[] = [];
    const additions = files.map((file) => {
      const key = this.#key(),
        issue = assetFileIssue(file, this.host.policy.accept, this.host.policy.maxBytes);
      this.#files.set(key, file);
      if (issue)
        return { key, name: file.name, status: 'error' as const, progress: null, error: issue };
      const job = { key, file, abort: new AbortController(), cancel: new ReplaySubject<void>(1) };
      this.#jobs.set(key, job);
      jobs.push(job);
      return { key, name: file.name, status: 'queued' as const, progress: null };
    });
    this.rows.update((rows) => [...rows, ...additions]);
    this.#publish();
    for (const job of jobs) if (this.#current(job, 'queued')) this.#work.next(job);
    return true;
  }
  async #run(job: Job): Promise<void> {
    this.#update(job.key, (row) => ({ ...row, status: 'uploading', progress: null }));
    this.#publish();
    if (!this.#current(job, 'uploading')) return;
    try {
      const reference = await this.host.adapter!.upload(job.file, job.file.name, {
        signal: job.abort.signal,
        progress: (loaded, total) => {
          if (!this.#current(job, 'uploading')) return;
          const progress =
            Number.isFinite(loaded) && loaded >= 0 && Number.isFinite(total) && total > 0
              ? Math.min(100, (loaded / total) * 100)
              : null;
          this.#update(job.key, (row) => ({ ...row, progress }));
        },
      });
      if (!this.#current(job, 'uploading')) return;
      const invalid =
        !isAssetReference(reference) ||
        assetFileIssue(
          { name: reference.name, type: reference.mediaType, size: reference.size },
          this.host.policy.accept,
          this.host.policy.maxBytes,
        ) !== null;
      const duplicate =
        !invalid &&
        this.rows().some((row) => row.key !== job.key && row.reference?.id === reference.id);
      this.#jobs.delete(job.key);
      if (invalid || duplicate)
        this.#update(job.key, (row) => ({
          ...row,
          status: 'error',
          progress: null,
          error: duplicate ? 'duplicate' : 'reference',
        }));
      else {
        this.#files.delete(job.key);
        this.#update(job.key, (row) => ({
          key: row.key,
          name: reference.name,
          status: 'ready',
          progress: null,
          reference: {
            id: reference.id,
            name: reference.name,
            mediaType: reference.mediaType,
            size: reference.size,
          },
        }));
      }
      this.#publish(!invalid && !duplicate);
    } catch {
      if (this.#current(job, 'uploading')) {
        this.#jobs.delete(job.key);
        this.#update(job.key, (row) => ({
          ...row,
          status: 'error',
          progress: null,
          error: 'upload',
        }));
        this.#publish();
      }
    }
  }
  #abort(job: Job): void {
    // Both RxJS teardown and native AbortSignal listeners may synchronously reenter the host.
    job.cancel.next();
    job.cancel.complete();
    job.abort.abort();
  }
  cancel(key: string): void {
    const job = this.#jobs.get(key);
    if (!this.#alive || !job) return;
    this.#jobs.delete(key);
    this.#update(key, (row) => ({ ...row, status: 'cancelled', progress: null }));
    this.#publish();
    this.#abort(job);
  }
  retry(key: string): void {
    if (!this.#alive) return;
    const row = this.rows().find((row) => row.key === key),
      file = this.#files.get(key);
    if (!row || !file || !['error', 'cancelled'].includes(row.status)) return;
    const issue = assetFileIssue(file, this.host.policy.accept, this.host.policy.maxBytes);
    if (issue) return;
    const job = { key, file, abort: new AbortController(), cancel: new ReplaySubject<void>(1) };
    this.#jobs.set(key, job);
    this.#update(key, (row) => ({ key, name: row.name, status: 'queued', progress: null }));
    this.#publish();
    if (this.#current(job, 'queued')) this.#work.next(job);
  }
  remove(key: string): void {
    if (!this.#alive || !this.rows().some((row) => row.key === key)) return;
    const job = this.#jobs.get(key);
    this.#jobs.delete(key);
    this.#files.delete(key);
    this.rows.update((rows) => rows.filter((row) => row.key !== key));
    this.#publish(true);
    if (job) this.#abort(job);
  }
  move(key: string, offset: -1 | 1): void {
    if (!this.#alive) return;
    const rows = [...this.rows()],
      index = rows.findIndex((row) => row.key === key),
      target = index + offset;
    if (index < 0 || target < 0 || target >= rows.length) return;
    [rows[index], rows[target]] = [rows[target]!, rows[index]!];
    this.rows.set(rows);
    this.#publish(true);
  }
  destroy(): void {
    if (!this.#alive) return;
    this.#alive = false;
    const jobs = [...this.#jobs.values()];
    this.#jobs.clear();
    this.#files.clear();
    this.#subscription.unsubscribe();
    this.#work.complete();
    for (const job of jobs) this.#abort(job);
  }
}
