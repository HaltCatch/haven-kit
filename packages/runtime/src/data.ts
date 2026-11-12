import { resolveSchema } from '@haven/schema';
import type { DataSchema, JsonValue } from '@haven/schema';

/** Preserve compatible input values when the UI schema changes; initialize new fields only. */
export function reconcileData(schema: DataSchema, current?: JsonValue, root = schema): JsonValue {
  const resolved = resolveSchema(schema, root);
  if (!resolved) throw new Error('Unresolved data schema');
  switch (resolved.type) {
    case 'object': {
      const prior =
        current !== null && typeof current === 'object' && !Array.isArray(current) ? current : {};
      const entries = Object.entries(resolved.properties ?? {}).map(([key, child]) => [
        key,
        reconcileData(child, Object.hasOwn(prior, key) ? prior[key] : undefined, root),
      ]);
      const result = Object.fromEntries(entries) as Record<string, JsonValue>;
      return Object.keys(prior).length === entries.length &&
        entries.every(([key, value]) => prior[key as string] === value)
        ? prior
        : result;
    }
    case 'array': {
      if (!Array.isArray(current)) return [];
      const items = current.map((value) =>
        resolved.items ? reconcileData(resolved.items, value, root) : value,
      );
      return items.every((value, index) => value === current[index]) ? current : items;
    }
    case 'string':
      return typeof current === 'string' ? current : '';
    case 'number':
      return typeof current === 'number' && Number.isFinite(current) ? current : null;
    case 'boolean':
      return typeof current === 'boolean' ? current : false;
    case 'null':
      return null;
    default:
      return current ?? null;
  }
}
