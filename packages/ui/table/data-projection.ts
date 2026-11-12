import type { JsonObject, JsonValue } from '@haven/schema';

/** Project native form values to owned JSON rows; private symbol identity stays in the form.
 * Returns null for invalid or over-budget data, without invoking accessors. */
export function projectHavenTableRows(source: unknown): JsonObject[] | null {
  try {
    if (!Array.isArray(source)) return null;
    const entries = arrayEntries(source);
    return entries.map((entry) => {
      let nodes = 0;
      const active = new WeakSet<object>();
      const copy = (value: unknown, depth: number): JsonValue => {
        if (++nodes > 100000 || depth > 32) throw new Error('bounds');
        if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        if (!value || typeof value !== 'object' || active.has(value)) throw new Error('value');
        active.add(value);
        let result: JsonValue;
        if (Array.isArray(value)) result = arrayEntries(value).map((item) => copy(item, depth + 1));
        else {
          if (![Object.prototype, null].includes(Object.getPrototypeOf(value)))
            throw new Error('prototype');
          result = Object.fromEntries(
            Object.entries(Object.getOwnPropertyDescriptors(value)).map(([key, descriptor]) => {
              if (!('value' in descriptor) || !descriptor.enumerable) throw new Error('property');
              return [key, copy(descriptor.value, depth + 1)];
            }),
          );
        }
        active.delete(value);
        return result;
      };
      const row = copy(entry, 0);
      if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('row');
      if (new TextEncoder().encode(JSON.stringify(row)).byteLength > 1048576)
        throw new Error('bytes');
      return row;
    });
  } catch {
    return null;
  }
}
function arrayEntries(value: unknown[]): unknown[] {
  if (Object.getPrototypeOf(value) !== Array.prototype) throw new Error('prototype');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const length = Object.getOwnPropertyDescriptor(value, 'length')?.value as number;
  const entries = Object.entries(descriptors).filter(([key]) => key !== 'length');
  if (entries.length !== length) throw new Error('sparse');
  return entries.map(([key, descriptor], index) => {
    if (key !== String(index) || !('value' in descriptor) || !descriptor.enumerable)
      throw new Error('property');
    return descriptor.value;
  });
}
