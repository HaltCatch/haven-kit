import { computed, signal } from '@angular/core';
import type { WritableSignal } from '@angular/core';

/** Ephemeral control feedback is scoped to a renderer revision, never persisted form data. */
export class NodeFeedbackStore {
  readonly #uploads = signal<ReadonlyMap<string, string>>(new Map());
  readonly #incompleteAssets = signal<ReadonlyMap<string, string>>(new Map());
  readonly #parseErrors = signal<ReadonlyMap<string, string>>(new Map());
  constructor(
    readonly owner: () => string,
    readonly active: (id: string) => boolean,
  ) {}
  readonly uploading = computed(() =>
    [...this.#uploads()].some(([id, owner]) => owner === this.owner() && this.active(id)),
  );
  #set(entries: WritableSignal<ReadonlyMap<string, string>>, id: string, active: boolean): void {
    const owner = this.owner();
    entries.update((previous) => {
      if ((!active && !previous.has(id)) || (active && previous.get(id) === owner)) return previous;
      const next = new Map(previous);
      if (active) next.set(id, owner);
      else next.delete(id);
      return next;
    });
  }
  setUploading(id: string, active: boolean): void {
    this.#set(this.#uploads, id, active);
  }
  uploadPending(id: string): boolean {
    return this.#uploads().get(id) === this.owner();
  }
  setAssetIncomplete(id: string, invalid: boolean): void {
    this.#set(this.#incompleteAssets, id, invalid);
  }
  assetIncomplete(id: string): boolean {
    return this.#incompleteAssets().get(id) === this.owner();
  }
  setParseError(id: string, invalid: boolean): void {
    this.#set(this.#parseErrors, id, invalid);
  }
  parseInvalid(id: string): boolean {
    return this.#parseErrors().get(id) === this.owner();
  }
  forget(id: string): void {
    this.setUploading(id, false);
    this.setAssetIncomplete(id, false);
    this.setParseError(id, false);
  }
}
