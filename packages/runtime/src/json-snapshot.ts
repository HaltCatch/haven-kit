import type { JsonValue } from '@haven/schema';
export class InvalidJsonResponse extends Error {}

/** Copy a bounded JSON response before exposing it. Reject getters, classes, cycles and non-JSON numbers. */
export function snapshotJson(value: unknown): JsonValue {
  let nodes = 0,
    characters = 0;
  const ancestors = new WeakSet<object>();
  function visit(item: unknown, depth: number): JsonValue {
    if (++nodes > 100000 || depth > 32) throw new InvalidJsonResponse();
    if (item === null || typeof item === 'boolean') return item;
    if (typeof item === 'string') {
      characters += item.length;
      if (characters > 5000000) throw new InvalidJsonResponse();
      return item;
    }
    if (typeof item === 'number' && Number.isFinite(item)) return item;
    if (
      !item ||
      typeof item !== 'object' ||
      ancestors.has(item) ||
      Object.getOwnPropertySymbols(item).length
    )
      throw new InvalidJsonResponse();
    const array = Array.isArray(item),
      proto = Object.getPrototypeOf(item);
    if (array ? proto !== Array.prototype : proto !== Object.prototype && proto !== null)
      throw new InvalidJsonResponse();
    const descriptors = Object.getOwnPropertyDescriptors(item),
      keys = Object.keys(descriptors).filter((key) => !array || key !== 'length');
    if (array && (keys.length !== item.length || keys.some((key, index) => key !== String(index))))
      throw new InvalidJsonResponse();
    ancestors.add(item);
    const entries = keys.map((key) => {
      const descriptor = descriptors[key]!;
      if (!descriptor.enumerable || !('value' in descriptor)) throw new InvalidJsonResponse();
      characters += key.length;
      if (characters > 5000000) throw new InvalidJsonResponse();
      return [key, visit(descriptor.value, depth + 1)] as const;
    });
    ancestors.delete(item);
    // The public JSON types remain compatible; runtime freezing prevents adapter mutation after acceptance.
    return Object.freeze(
      array ? entries.map(([, child]) => child) : Object.fromEntries(entries),
    ) as JsonValue;
  }
  return visit(value, 0);
}
