import { Directive, computed, effect, input, output, signal } from '@angular/core';

/** Native file transfer only. Uploading, validation and ownership stay with the field. */
@Directive({
  selector: '[havenAssetDrop]',
  exportAs: 'havenAssetDrop',
  host: {
    '[class.dropzone]': 'havenAssetDrop()',
    '[class.drop-active]': 'active()',
    '(dragenter)': 'enter($event)',
    '(dragover)': 'over($event)',
    '(dragleave)': 'leave()',
    '(drop)': 'drop($event)',
  },
})
export class HavenAssetDrop {
  readonly havenAssetDrop = input(false);
  readonly dropBlocked = input(false);
  readonly filesDropped = output<readonly File[] | null>();
  readonly #depth = signal(0);
  readonly active = computed(
    () => this.havenAssetDrop() && !this.dropBlocked() && this.#depth() > 0,
  );
  constructor() {
    effect(() => {
      if (!this.havenAssetDrop() || this.dropBlocked()) this.#depth.set(0);
    });
  }

  #files(event: DragEvent): boolean {
    return this.havenAssetDrop() && Array.from(event.dataTransfer?.types ?? []).includes('Files');
  }
  enter(event: DragEvent): void {
    if (!this.#files(event)) return;
    event.preventDefault();
    if (!this.dropBlocked()) this.#depth.update((depth) => depth + 1);
  }
  over(event: DragEvent): void {
    if (!this.havenAssetDrop()) return;
    event.preventDefault();
    if (event.dataTransfer)
      event.dataTransfer.dropEffect = !this.dropBlocked() && this.#files(event) ? 'copy' : 'none';
  }
  leave(): void {
    this.#depth.update((depth) => Math.max(0, depth - 1));
  }
  drop(event: DragEvent): void {
    this.#depth.set(0);
    if (!this.havenAssetDrop()) return;
    // Prevent the browser from navigating to a file, including drops on a blocked field.
    event.preventDefault();
    event.stopPropagation();
    if (this.dropBlocked()) return;
    if (!this.#files(event) || !event.dataTransfer) {
      this.filesDropped.emit(null);
      return;
    }
    const transfer = event.dataTransfer;
    let files: readonly File[] | null = null;
    try {
      const directory = Array.from(transfer.items ?? []).some(
        (item) => item.kind === 'file' && item.webkitGetAsEntry?.()?.isDirectory === true,
      );
      if (!directory && transfer.files.length) files = Array.from(transfer.files);
    } catch {
      // Inaccessible or unsupported drops are rejected without exposing native exceptions.
    }
    this.filesDropped.emit(files);
  }
}
