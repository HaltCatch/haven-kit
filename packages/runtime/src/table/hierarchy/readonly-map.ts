/** Hide owned mutable Maps behind the standard read-only API; freezing a Map does not prevent set(). */
export function readonlyHierarchyMap<K, V>(source: Map<K, V>): ReadonlyMap<K, V> {
  const view: ReadonlyMap<K, V> = Object.freeze({
    size: source.size,
    get: (key: K) => source.get(key),
    has: (key: K) => source.has(key),
    keys: () => source.keys(),
    values: () => source.values(),
    entries: () => source.entries(),
    [Symbol.iterator]: () => source[Symbol.iterator](),
    forEach: (callback: (value: V, key: K, map: ReadonlyMap<K, V>) => void, thisArg?: unknown) =>
      source.forEach((value, key) => callback.call(thisArg, value, key, view)),
  });
  return view;
}
