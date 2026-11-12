import { signal } from '@angular/core';
import type { RichTextContentState } from '@haven/schema';

/** Transient parser output; authoritative values and validation remain in native Signal Forms. */
export interface FieldContentState extends RichTextContentState {
  readonly value: unknown;
  readonly identity: string;
  readonly ready: boolean;
}
export class FieldContentStore {
  readonly #entries = signal<ReadonlyMap<string, FieldContentState>>(new Map());
  set(id: string, state: FieldContentState): void {
    this.#entries.update((entries) => new Map(entries).set(id, Object.freeze({ ...state })));
  }
  remove(id: string): void {
    this.#entries.update((entries) => {
      if (!entries.has(id)) return entries;
      const next = new Map(entries);
      next.delete(id);
      return next;
    });
  }
  get(id: string, identity: string, value: unknown): FieldContentState | undefined {
    const state = this.#entries().get(id);
    return state?.identity === identity && state.value === value ? state : undefined;
  }
}
