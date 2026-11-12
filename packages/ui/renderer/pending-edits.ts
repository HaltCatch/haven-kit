import { computed, signal } from '@angular/core';

interface PendingEdit {
  identity: string;
  kind: string;
  read(): boolean;
}

/** Live control predicates are transient registrations, never copied form values or booleans. */
export class PendingEditStore {
  readonly #entries = signal<ReadonlyMap<string, PendingEdit>>(new Map());
  constructor(private readonly active: (id: string, identity: string, kind: string) => boolean) {}
  readonly pending = computed(() =>
    [...this.#entries()].some(
      ([id, entry]) => this.active(id, entry.identity, entry.kind) && entry.read(),
    ),
  );
  register(id: string, identity: string, kind: string, read: () => boolean): () => void {
    const entry = { identity, kind, read };
    this.#entries.update((entries) => new Map(entries).set(id, entry));
    return () => {
      this.#entries.update((entries) => {
        if (entries.get(id) !== entry) return entries;
        const next = new Map(entries);
        next.delete(id);
        return next;
      });
    };
  }
  clear(): void {
    this.#entries.set(new Map());
  }
}
