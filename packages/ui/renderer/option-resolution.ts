import { signal } from '@angular/core';
import type { OptionsAdapter } from '@haven/runtime';
import type { HavenOptionResolution } from '@haven/ui/form';

export class OptionResolutionStore<Adapter = OptionsAdapter> {
  readonly #entries = signal<
    ReadonlyMap<string, { owner: string; adapter: Adapter; state: HavenOptionResolution }>
  >(new Map());
  set(owner: string, id: string, adapter: Adapter, state: HavenOptionResolution): void {
    this.#entries.update((entries) => new Map(entries).set(id, { owner, adapter, state }));
  }
  remove(id: string): void {
    this.#entries.update((entries) => {
      if (!entries.has(id)) return entries;
      const next = new Map(entries);
      next.delete(id);
      return next;
    });
  }
  get(owner: string, id: string, adapter: Adapter | undefined): HavenOptionResolution {
    const entry = this.#entries().get(id);
    return adapter && entry?.owner === owner && entry.adapter === adapter
      ? entry.state
      : { keys: [], options: [], pending: !!adapter, ready: false, failed: !adapter };
  }
}
