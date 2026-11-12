import { resolveSchema } from '@haven/schema';
import type { DataSchema } from '@haven/schema';
/** Transport shape only. Bounds/enum/required value semantics stay in the native form compiler. */
export function isTableRowShape(schema: DataSchema, value: unknown): boolean {
  let nodes = 0;
  const active = new WeakSet<object>();
  const json = (entry: unknown, depth: number): boolean => {
    if (++nodes > 100000 || depth > 32) return false;
    if (entry === null || typeof entry === 'string' || typeof entry === 'boolean') return true;
    if (typeof entry === 'number') return Number.isFinite(entry);
    if (!entry || typeof entry !== 'object' || active.has(entry)) return false;
    if (!Array.isArray(entry) && ![Object.prototype, null].includes(Object.getPrototypeOf(entry)))
      return false;
    active.add(entry);
    const valid = Object.entries(Object.getOwnPropertyDescriptors(entry)).every(
      ([key, descriptor]) =>
        (Array.isArray(entry) && key === 'length') ||
        ('value' in descriptor && json(descriptor.value, depth + 1)),
    );
    active.delete(entry);
    return valid;
  };
  const shape = (definition: DataSchema, entry: unknown, depth: number): boolean => {
    if (depth > 32) return false;
    const node = resolveSchema(definition, schema);
    if (!node) return false;
    if (entry === undefined) return true;
    // Existing scalar controls use null for an optional cleared string/number value.
    if (entry === null) return ['null', 'string', 'number'].includes(node.type ?? '');
    if (node.type === 'array')
      return (
        Array.isArray(entry) &&
        (!node.items || entry.every((item) => shape(node.items!, item, depth + 1)))
      );
    if (node.type === 'object') {
      if (typeof entry !== 'object' || Array.isArray(entry)) return false;
      const object = entry as Record<string, unknown>;
      return (
        (node.required ?? []).every((key) => Object.hasOwn(object, key)) &&
        Object.entries(node.properties ?? {}).every(([key, child]) =>
          shape(child, object[key], depth + 1),
        )
      );
    }
    return typeof entry === node.type;
  };
  try {
    return json(value, 0) && shape(schema, value, 0);
  } catch {
    return false;
  }
}
