import {
  DestroyRef,
  Directive,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  signal,
  untracked,
} from '@angular/core';
import type { Signal } from '@angular/core';
import { HavenFieldPresentation } from '@haven/ui/form';
import { assetFileIssue, isAssetReference } from '@haven/schema';
import type { FileReference, UploadAdapter } from '@haven/runtime';
interface ImageUploadJob {
  controller: AbortController;
  value: string;
  owner: string;
  adapter: UploadAdapter;
  maxBytes: number | undefined;
}

/** One host-owned image transfer, with cancellation separate from editor loading. */
@Directive()
export abstract class RichTextImageField extends HavenFieldPresentation {
  readonly value = model('');
  readonly identity = input('');
  readonly adapter = input<UploadAdapter>();
  readonly maxImageBytes = input<number>();
  readonly uploadingChange = output<boolean>();
  readonly uploading = signal(false);
  readonly progress = signal<number | null>(null);
  readonly failure = signal<string | null>(null);
  readonly imageUploadEnabled = computed(() => !!this.adapter());
  abstract readonly blocked: Signal<boolean>;
  protected abstract insertImage(file: FileReference): void;
  readonly #destroy = inject(DestroyRef);
  #upload: ImageUploadJob | undefined;
  #operation = 0;
  constructor() {
    super();
    effect(() => {
      this.adapter();
      this.identity();
      this.disabled();
      this.readonly();
      this.maxImageBytes();
      this.value();
      if (this.#upload && !this.#current(this.#upload)) untracked(() => this.cancel());
    });
    this.#destroy.onDestroy(() => this.cancel());
  }
  onFiles(input: HTMLInputElement): void {
    const file = input.files?.[0];
    input.value = '';
    if (file) void this.choose(file);
  }
  async choose(file: File): Promise<void> {
    if (this.blocked() || this.#destroy.destroyed) return;
    const operation = ++this.#operation;
    this.#cancel();
    if (operation !== this.#operation || this.blocked() || this.#destroy.destroyed) return;
    const adapter = this.adapter();
    if (!adapter) {
      this.failure.set('richText.uploadUnavailable');
      return;
    }
    const issue = assetFileIssue(
      file,
      'image/png,image/jpeg,image/gif,image/webp,image/avif',
      this.maxImageBytes(),
      true,
    );
    if (issue) {
      this.failure.set('richText.imageInvalid');
      return;
    }
    const job = {
      controller: new AbortController(),
      value: this.value(),
      owner: this.identity(),
      adapter,
      maxBytes: this.maxImageBytes(),
    };
    this.#upload = job;
    this.progress.set(null);
    this.failure.set(null);
    try {
      this.#setUploading(true);
      // Public outputs can synchronously cancel, rebind or replace this transfer.
      if (!this.#current(job)) return;
      const ref = await adapter.upload(file, file.name, {
        signal: job.controller.signal,
        progress: (loaded, total) => {
          if (this.#current(job) && Number.isFinite(loaded) && Number.isFinite(total) && total > 0)
            this.progress.set(Math.min(100, Math.max(0, (loaded / total) * 100)));
        },
      });
      if (!this.#current(job)) return;
      if (
        !isAssetReference(ref) ||
        assetFileIssue(
          { name: ref.name, type: ref.mediaType, size: ref.size },
          'image/png,image/jpeg,image/gif,image/webp,image/avif',
          this.maxImageBytes(),
          true,
        )
      )
        throw new Error('Invalid image reference');
      this.insertImage(ref);
    } catch {
      if (this.#current(job)) this.failure.set('richText.uploadError');
    } finally {
      if (this.#upload === job) this.cancel();
    }
  }
  #current(job: ImageUploadJob): boolean {
    return (
      this.#upload === job &&
      !job.controller.signal.aborted &&
      !this.#destroy.destroyed &&
      !this.blocked() &&
      this.value() === job.value &&
      this.identity() === job.owner &&
      this.adapter() === job.adapter &&
      this.maxImageBytes() === job.maxBytes
    );
  }
  #setUploading(value: boolean): void {
    const changed = this.uploading() !== value;
    this.uploading.set(value);
    if (changed && !this.#destroy.destroyed) this.uploadingChange.emit(value);
  }
  cancel(): void {
    ++this.#operation;
    this.#cancel();
  }
  #cancel(): void {
    const job = this.#upload,
      operation = this.#operation;
    this.#upload = undefined;
    this.progress.set(null);
    // AbortSignal callbacks may synchronously start another transfer.
    job?.controller.abort();
    if (operation === this.#operation) this.#setUploading(false);
  }
}
