import type { FileReference, UploadAdapter } from '@haven/runtime';

export type FileQueueStatus = 'ready' | 'queued' | 'uploading' | 'error' | 'cancelled';
export type FileQueueError = 'config' | 'size' | 'type' | 'upload' | 'reference' | 'duplicate';
/** Transient row key is not a backend reference id and never enters the form value. */
export interface FileQueueEntry {
  readonly key: string;
  readonly name: string;
  readonly status: FileQueueStatus;
  readonly progress: number | null;
  readonly error?: FileQueueError;
  readonly reference?: FileReference;
}
export interface FileQueuePolicy {
  readonly accept: string;
  readonly maxBytes?: number;
  readonly maxItems: number;
  readonly concurrency: number;
}
export interface FileQueueHost {
  readonly adapter?: UploadAdapter;
  readonly policy: FileQueuePolicy;
  value(value: FileReference[]): void;
  busy(value: boolean): void;
  unresolved?(value: boolean): void;
}
