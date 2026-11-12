/** Copies are shared within one input revision, never across a host data/config update. */
export class TableCellSnapshotCache {
  readonly #revisions = new WeakMap<object, WeakMap<object, object>>();
  snapshot<T extends object>(value: T, revision: object = value): Readonly<T> {
    let objects = this.#revisions.get(revision);
    if (!objects) {
      objects = new WeakMap<object, object>();
      this.#revisions.set(revision, objects);
    }
    const existing = objects.get(value);
    if (existing) return existing as Readonly<T>;
    const copy = structuredClone(value);
    const freeze = (entry: unknown): void => {
      if (!entry || typeof entry !== 'object' || Object.isFrozen(entry)) return;
      for (const nested of Object.values(entry)) freeze(nested);
      Object.freeze(entry);
    };
    freeze(copy);
    objects.set(value, copy);
    return copy;
  }
}
