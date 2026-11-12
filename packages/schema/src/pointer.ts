import type { DataSchema, JsonValue } from './types.js';
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
export function pointerSegments(pointer: string): string[] {
  if (!/^(?:\/(?:[^~/]|~[01])*)*$/.test(pointer)) throw new Error('Invalid JSON Pointer');
  const parts =
    pointer === ''
      ? []
      : pointer
          .slice(1)
          .split('/')
          .map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'));
  if (parts.some((part) => forbidden.has(part))) throw new Error('Unsafe JSON Pointer');
  return parts;
}
export function escapePointer(value: string): string {
  return value.replace(/~/g, '~0').replace(/\//g, '~1');
}
export function readPointer(value: unknown, pointer: string): unknown {
  let current = value;
  for (const part of pointerSegments(pointer)) {
    if (current === null || typeof current !== 'object' || !Object.hasOwn(current, part))
      return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}
/** Returns a new tree; never mutates the caller or creates prototype properties. */
export function writePointer(value: JsonValue, pointer: string, next: JsonValue): JsonValue {
  const parts = pointerSegments(pointer);
  function update(current: JsonValue, index: number): JsonValue {
    if (index === parts.length) return next;
    const part = parts[index]!;
    if (current === null || typeof current !== 'object') throw new Error('Cannot traverse scalar');
    if (Array.isArray(current)) {
      if (!/^(0|[1-9][0-9]*)$/.test(part) || Number(part) >= current.length)
        throw new Error('Invalid array index');
      return current.map((item, i) => (i === Number(part) ? update(item, index + 1) : item));
    }
    if (!Object.hasOwn(current, part) && index !== parts.length - 1)
      throw new Error('Missing parent');
    return { ...current, [part]: update(current[part] ?? null, index + 1) };
  }
  return update(value, 0);
}
export function resolveSchema(
  schema: DataSchema,
  root: DataSchema,
  seen = new Set<string>(),
): DataSchema | undefined {
  if (!schema.$ref) return schema;
  if (seen.has(schema.$ref)) return undefined;
  seen.add(schema.$ref);
  const target = readPointer(root, schema.$ref.slice(1));
  return target && typeof target === 'object'
    ? resolveSchema(target as DataSchema, root, seen)
    : undefined;
}
export function schemaAtPointer(
  schema: DataSchema,
  pointer: string,
  root: DataSchema = schema,
): DataSchema | undefined {
  let current = resolveSchema(schema, root);
  for (const part of pointerSegments(pointer)) {
    const child: DataSchema | undefined =
      current?.type === 'array' && /^(0|[1-9][0-9]*)$/.test(part)
        ? current.items
        : current?.properties && Object.hasOwn(current.properties, part)
          ? current.properties[part]
          : undefined;
    if (!child) return undefined;
    current = resolveSchema(child, root);
  }
  return current;
}
