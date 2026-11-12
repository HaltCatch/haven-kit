import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Directive,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import type { FormValueControl } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { HavenGlassSurface } from '@haven/ui/glass';
import { HavenFieldPresentation } from '@haven/ui/form';
import type { FileReference, UploadAdapter } from '@haven/runtime';
import {
  assetFileIssue,
  isAssetReference,
  isAssetValue,
  isImageSizeConstraints,
} from '@haven/schema';
import type { ImageSizeConstraints } from '@haven/schema';
import { checkImageSize } from './image-size';
import { HavenAssetDrop } from './drop-zone';

interface UploadJob {
  controller: AbortController;
  adapter: UploadAdapter;
  original: FileReference[];
  accept: string;
  maxBytes: number | undefined;
  identity: string;
  bounds: ImageSizeConstraints;
}
const imports = [MatButtonModule, MatProgressBarModule, HavenGlassSurface, HavenAssetDrop];

/** Browser files and temporary URLs never enter persisted form values. */
@Directive()
abstract class AssetField
  extends HavenFieldPresentation
  implements FormValueControl<FileReference[]>
{
  abstract readonly image: boolean;
  readonly value = model<FileReference[]>([]);
  readonly adapter = input<UploadAdapter>();
  readonly accept = input('');
  readonly identity = input('');
  readonly maxBytes = input<number>();
  readonly dropzone = input(false);
  readonly minWidth = input<number>();
  readonly maxWidth = input<number>();
  readonly minHeight = input<number>();
  readonly maxHeight = input<number>();
  readonly imageBounds = computed<ImageSizeConstraints>(() => ({
    ...(this.minWidth() !== undefined ? { minWidth: this.minWidth()! } : {}),
    ...(this.maxWidth() !== undefined ? { maxWidth: this.maxWidth()! } : {}),
    ...(this.minHeight() !== undefined ? { minHeight: this.minHeight()! } : {}),
    ...(this.maxHeight() !== undefined ? { maxHeight: this.maxHeight()! } : {}),
  }));
  readonly blocked = computed(() => this.disabled() || this.readonly());
  readonly validValue = computed(
    () =>
      isAssetValue(this.value()) &&
      (!this.image ||
        this.value().every((ref) => ref.mediaType.toLowerCase().startsWith('image/'))),
  );
  readonly hasValue = computed(() =>
    Array.isArray(this.value()) ? this.value().length > 0 : this.value() !== null,
  );
  readonly saved = computed(() => (this.validValue() ? this.value()[0] : undefined));
  readonly nativeAccept = computed(() => this.accept() || (this.image ? 'image/*' : ''));
  readonly uploading = signal(false);
  readonly uploadingChange = output<boolean>();
  readonly progress = signal<number | null>(null);
  readonly uploadName = signal('');
  readonly error = signal<string | null>(null);
  readonly previewError = signal(false);
  readonly link = signal<string | null>(null);
  readonly localPreview = signal<string | null>(null);
  readonly preview = computed(() => this.localPreview() ?? this.link());
  readonly picker = viewChild<ElementRef<HTMLInputElement>>('picker');
  readonly chooseButton = viewChild('chooseButton', { read: ElementRef<HTMLButtonElement> });
  readonly #retry = signal(0);
  readonly #destroy = inject(DestroyRef);
  #job: UploadJob | undefined;
  #operation = 0;
  #observedIdentity = '';
  constructor() {
    super();
    this.#destroy.onDestroy(() => this.cancel());
    effect(() => {
      const adapter = this.adapter(),
        value = this.value(),
        blocked = this.blocked();
      const accept = this.accept(),
        maxBytes = this.maxBytes(),
        identity = this.identity(),
        bounds = this.imageBounds();
      untracked(() => {
        if (this.#observedIdentity !== identity) {
          this.#observedIdentity = identity;
          this.error.set(null);
        }
        if (
          this.#job &&
          (blocked ||
            adapter !== this.#job.adapter ||
            value !== this.#job.original ||
            accept !== this.#job.accept ||
            maxBytes !== this.#job.maxBytes ||
            identity !== this.#job.identity ||
            bounds !== this.#job.bounds)
        )
          this.cancel();
      });
    });
    effect((cleanup) => {
      const ref = this.saved(),
        adapter = this.adapter(),
        disabled = this.disabled(),
        identity = this.identity();
      this.#retry();
      const controller = new AbortController();
      let alive = true;
      cleanup(() => {
        alive = false;
        controller.abort();
      });
      untracked(() => {
        this.link.set(null);
        this.previewError.set(false);
      });
      if (!ref || !adapter || disabled) return;
      const current = () =>
        alive &&
        !controller.signal.aborted &&
        !this.#destroy.destroyed &&
        !this.disabled() &&
        this.saved() === ref &&
        this.adapter() === adapter &&
        this.identity() === identity;
      void Promise.resolve()
        .then(() =>
          current()
            ? adapter.url(
                { id: ref.id, name: ref.name, mediaType: ref.mediaType, size: ref.size },
                controller.signal,
              )
            : null,
        )
        .then((url) => {
          if (!current()) return;
          if (typeof url !== 'string' || !url.trim()) throw new Error('Invalid URL');
          // Never bypass Angular URL security; only host-provided HTTP(S)/blob references are usable.
          const parsed = new URL(url, this.picker()?.nativeElement.ownerDocument.baseURI);
          if (!['https:', 'http:', 'blob:'].includes(parsed.protocol))
            throw new Error('Unsupported URL');
          this.link.set(parsed.href);
        })
        .catch(() => {
          if (current()) this.previewError.set(true);
        });
    });
  }
  onFiles(control: HTMLInputElement): void {
    const file = control.files?.[0];
    control.value = '';
    if (file) void this.choose(file);
  }
  onDrop(files: readonly File[] | null): void {
    if (!this.dropzone() || this.blocked() || this.#destroy.destroyed) return;
    if (!files || files.length !== 1) {
      this.error.set(files?.length ? 'singleDrop' : 'drop');
      return;
    }
    void this.choose(files[0]!);
  }
  #current(job: UploadJob): boolean {
    return (
      this.#job === job &&
      !job.controller.signal.aborted &&
      !this.#destroy.destroyed &&
      !this.blocked() &&
      this.adapter() === job.adapter &&
      this.value() === job.original &&
      this.accept() === job.accept &&
      this.maxBytes() === job.maxBytes &&
      this.identity() === job.identity &&
      this.imageBounds() === job.bounds
    );
  }
  #releasePreview(): void {
    const url = this.localPreview();
    this.localPreview.set(null);
    if (url) URL.revokeObjectURL(url);
  }
  async choose(file: File): Promise<void> {
    if (this.blocked() || this.#destroy.destroyed) return;
    const operation = ++this.#operation;
    this.#cancel();
    if (this.#operation !== operation || this.blocked() || this.#destroy.destroyed) return;
    this.error.set(null);
    const issue = assetFileIssue(file, this.accept(), this.maxBytes(), this.image);
    if (issue || (this.image && !isImageSizeConstraints(this.imageBounds()))) {
      this.error.set(issue ?? 'config');
      return;
    }
    const adapter = this.adapter();
    if (!adapter) {
      this.error.set('unconfigured');
      return;
    }
    const job: UploadJob = {
      controller: new AbortController(),
      adapter,
      original: this.value(),
      accept: this.accept(),
      maxBytes: this.maxBytes(),
      identity: this.identity(),
      bounds: this.imageBounds(),
    };
    this.#job = job;
    try {
      if (this.image) this.localPreview.set(URL.createObjectURL(file));
      this.uploadName.set(file.name);
      this.#setUploading(true);
      if (!this.#current(job)) return;
      this.touch.emit();
      if (!this.#current(job)) return;
      // Existing image fields without bounds retain their established upload behaviour.
      if (this.image && Object.values(job.bounds).some((value) => value !== undefined)) {
        const issue = await checkImageSize(this.localPreview()!, job.bounds, job.controller.signal);
        if (!this.#current(job)) return;
        if (issue) {
          this.error.set(issue);
          return;
        }
      }
      const result = await adapter.upload(file, file.name, {
        signal: job.controller.signal,
        progress: (loaded, total) => {
          if (!this.#current(job)) return;
          this.progress.set(
            Number.isFinite(loaded) && loaded >= 0 && Number.isFinite(total) && total > 0
              ? Math.min(100, (loaded / total) * 100)
              : null,
          );
        },
      });
      if (!this.#current(job)) return;
      if (
        !isAssetReference(result) ||
        assetFileIssue(
          { name: result.name, type: result.mediaType, size: result.size },
          this.accept(),
          this.maxBytes(),
          this.image,
        ) !== null
      ) {
        this.error.set('reference');
        return;
      }
      this.#job = undefined;
      this.value.set([
        { id: result.id, name: result.name, mediaType: result.mediaType, size: result.size },
      ]);
    } catch {
      if (this.#current(job)) this.error.set('upload');
    } finally {
      if (
        this.#operation === operation &&
        (this.#job === job || (!this.#job && !job.controller.signal.aborted))
      ) {
        this.#job = undefined;
        this.progress.set(null);
        this.#releasePreview();
        this.#setUploading(false);
      }
    }
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
    const job = this.#job,
      operation = this.#operation;
    this.#job = undefined;
    this.progress.set(null);
    this.#releasePreview();
    // Adapter abort listeners are synchronous host callbacks and can start another upload.
    job?.controller.abort();
    if (this.#operation === operation) this.#setUploading(false);
  }
  clear(): void {
    if (this.blocked()) return;
    const operation = ++this.#operation;
    this.#cancel();
    if (this.#operation !== operation || this.blocked() || this.#destroy.destroyed) return;
    this.error.set(null);
    this.value.set([]);
    if (this.#operation !== operation) return;
    this.touch.emit();
    this.focus();
  }
  retryPreview(): void {
    if (!this.disabled()) this.#retry.update((value) => value + 1);
  }
  focus(options?: FocusOptions): void {
    this.chooseButton()?.nativeElement.focus(options);
  }
}
@Component({
  selector: 'haven-file-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports,
  templateUrl: './upload.html',
  styleUrl: './upload.scss',
})
export class HavenFileField extends AssetField {
  readonly image: boolean = false;
}
@Component({
  selector: 'haven-image-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports,
  templateUrl: './upload.html',
  styleUrl: './upload.scss',
})
export class HavenImageField extends AssetField {
  readonly image: boolean = true;
}
