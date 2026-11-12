import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
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
import { HavenFieldPresentation } from '@haven/ui/form';
import { HavenGlassSurface } from '@haven/ui/glass';
import { assetFileIssue, isAssetAccept, isAssetListLimit, isAssetListValue } from '@haven/schema';
import type { FileReference, UploadAdapter } from '@haven/runtime';
import { HavenFileQueue } from './file-queue';
import type { FileQueueEntry } from './file-queue-types';
import { HavenAssetDrop } from './drop-zone';

interface FilesSettings {
  adapter: UploadAdapter | undefined;
  identity: string;
  accept: string;
  maxBytes: number | undefined;
  maxItems: number;
  concurrency: number;
  blocked: boolean;
}

@Component({
  selector: 'haven-files-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatProgressBarModule, HavenGlassSurface, HavenAssetDrop],
  templateUrl: './files.html',
  styleUrl: './files.scss',
})
export class HavenFilesField
  extends HavenFieldPresentation
  implements FormValueControl<FileReference[]>
{
  readonly value = model<FileReference[]>([]);
  readonly adapter = input<UploadAdapter>();
  readonly identity = input('');
  readonly accept = input('');
  readonly maxBytes = input<number>();
  readonly maxItems = input(100);
  readonly concurrency = input(2);
  readonly dropzone = input(false);
  readonly blocked = computed(() => this.disabled() || this.readonly());
  readonly validValue = computed(() => isAssetListValue(this.value()));
  readonly error = signal<string | null>(null);
  readonly uploading = signal(false);
  readonly unresolved = signal(false);
  readonly unresolvedChange = output<boolean>();
  readonly uploadingChange = output<boolean>();
  readonly #queue = signal<HavenFileQueue | undefined>(undefined);
  readonly rows = computed(() => this.#queue()?.rows() ?? []);
  readonly #destroy = inject(DestroyRef);
  readonly #element = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly picker = viewChild<ElementRef<HTMLInputElement>>('picker');
  readonly #settings = computed(() => ({
    adapter: this.adapter(),
    identity: this.identity(),
    accept: this.accept(),
    maxBytes: this.maxBytes(),
    maxItems: this.maxItems(),
    concurrency: this.concurrency(),
    blocked: this.blocked(),
  }));
  #settingsOwner: FilesSettings | undefined;
  #baseline: FileReference[] | undefined;
  constructor() {
    super();
    this.#destroy.onDestroy(() => {
      const queue = this.#queue();
      this.#queue.set(undefined);
      queue?.destroy();
    });
    effect(() => {
      const settings = this.#settings(),
        value = this.value();
      untracked(() => {
        if (settings === this.#settingsOwner && value === this.#baseline) return;
        const previous = this.#queue();
        this.#queue.set(undefined);
        this.#settingsOwner = settings;
        this.#baseline = value;
        previous?.destroy();
        if (this.#destroy.destroyed || settings !== this.#settings() || value !== this.value())
          return;
        this.error.set(null);
        const valid =
          isAssetAccept(settings.accept) &&
          isAssetListLimit(settings.maxItems) &&
          Number.isInteger(settings.concurrency) &&
          settings.concurrency >= 1 &&
          settings.concurrency <= 4 &&
          assetFileIssue({ name: '', type: '', size: 0 }, '', settings.maxBytes) !== 'config';
        if (valid && isAssetListValue(value)) {
          const queue = new HavenFileQueue(
            {
              ...(settings.adapter ? { adapter: settings.adapter } : {}),
              policy: {
                accept: settings.accept,
                maxItems: settings.maxItems,
                concurrency: settings.concurrency,
                ...(settings.maxBytes !== undefined ? { maxBytes: settings.maxBytes } : {}),
              },
              value: (next) => {
                if (!this.#owns(queue)) {
                  queue.destroy();
                  return;
                }
                this.#baseline = next;
                this.value.set(next);
                if (!this.#owns(queue)) queue.destroy();
              },
              unresolved: (unresolved) => {
                if (!this.#owns(queue)) {
                  queue.destroy();
                  return;
                }
                this.#setUnresolved(
                  unresolved ||
                    this.error() !== null ||
                    (Array.isArray(this.value()) && this.value().length > this.maxItems()),
                );
                if (!this.#owns(queue)) queue.destroy();
              },
              busy: (busy) => {
                if (!this.#owns(queue)) {
                  queue.destroy();
                  return;
                }
                this.#setUploading(busy);
                if (!this.#owns(queue)) queue.destroy();
              },
            },
            value,
          );
          this.#queue.set(queue);
        } else this.error.set(valid ? 'reference' : 'config');
        if (valid && isAssetListValue(value) && value.length > settings.maxItems)
          this.error.set('count');
        this.#setUnresolved(this.error() !== null);
        if (this.#settingsOwner !== this.#settings() || this.#baseline !== this.value()) return;
        this.#setUploading(this.#queue()?.busy() ?? false);
      });
    });
  }
  #owns(queue: HavenFileQueue): boolean {
    return (
      !this.#destroy.destroyed &&
      this.#queue() === queue &&
      this.#settingsOwner === this.#settings() &&
      this.#baseline === this.value()
    );
  }
  #setUnresolved(value: boolean): void {
    const changed = this.unresolved() !== value;
    this.unresolved.set(value);
    if (changed && !this.#destroy.destroyed) this.unresolvedChange.emit(value);
  }
  #setUploading(value: boolean): void {
    const changed = this.uploading() !== value;
    this.uploading.set(value);
    if (changed && !this.#destroy.destroyed) this.uploadingChange.emit(value);
  }
  onFiles(control: HTMLInputElement): void {
    const files = Array.from(control.files ?? []);
    control.value = '';
    this.choose(files);
  }
  onDrop(files: readonly File[] | null): void {
    if (!this.dropzone() || this.blocked() || this.#destroy.destroyed) return;
    if (!files) {
      this.error.set('drop');
      this.#setUnresolved(true);
      return;
    }
    this.choose(files);
  }
  choose(files: readonly File[]): void {
    const queue = this.#queue();
    if (this.blocked() || !queue || !this.#owns(queue) || !files.length) return;
    this.error.set(null);
    if (!this.adapter()) {
      this.error.set('unconfigured');
      this.#setUnresolved(true);
      return;
    }
    this.touch.emit();
    if (!this.#owns(queue) || this.blocked()) return;
    if (!queue.add(files)) {
      this.error.set('count');
      this.#setUnresolved(true);
    }
  }
  cancel(key: string): void {
    if (!this.blocked()) this.#queue()?.cancel(key);
  }
  retry(key: string): void {
    const queue = this.#queue();
    if (!this.blocked() && queue && this.#owns(queue)) {
      this.error.set(null);
      queue.retry(key);
    }
  }
  remove(key: string): void {
    if (this.blocked()) return;
    const queue = this.#queue();
    if (!queue || !this.#owns(queue)) return;
    this.error.set(null);
    queue.remove(key);
    this.touch.emit();
  }
  move(key: string, offset: -1 | 1): void {
    if (this.blocked()) return;
    const queue = this.#queue();
    if (!queue || !this.#owns(queue)) return;
    queue.move(key, offset);
    this.touch.emit();
  }
  canRetry(row: FileQueueEntry): boolean {
    return (
      row.status === 'cancelled' ||
      (row.status === 'error' && !['config', 'size', 'type'].includes(row.error ?? ''))
    );
  }
  rowLabel(action: string, row: FileQueueEntry): string {
    return this.localization.message(`asset.files.${action}`, { name: row.name });
  }
  focus(options?: FocusOptions): void {
    this.#element.nativeElement.querySelector<HTMLElement>('[data-choose]')?.focus(options);
  }
}
