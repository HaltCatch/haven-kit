import type { JsonValue } from '@haven/schema';
export interface ValidationRequest {
  readonly value: JsonValue;
  readonly dependencies: Readonly<Record<string, JsonValue>>;
  readonly signal: AbortSignal;
}
/** Trusted, read-only host operation. No URLs, credentials or executable code in the UI model. */
export interface ValidationAdapter {
  validate(request: ValidationRequest): Promise<{ readonly valid: boolean }>;
}
export function isValidationResult(value: unknown): value is { valid: boolean } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return (
    Object.getPrototypeOf(value) === Object.prototype &&
    Object.getOwnPropertySymbols(value).length === 0 &&
    Object.keys(descriptors).length === 1 &&
    !!descriptors['valid']?.enumerable &&
    'value' in descriptors['valid'] &&
    typeof descriptors['valid'].value === 'boolean'
  );
}
/** Bounded immutable snapshots isolate trusted adapter mistakes from mutable form values. */
export function validationSnapshot(value: unknown): JsonValue {
  let nodes = 0,
    characters = 0;
  const ancestors = new Set<object>();
  const visit = (item: unknown, depth: number): JsonValue => {
    if (++nodes > 10000 || depth > 24) throw new Error('validation.input');
    if (item === null || typeof item === 'boolean') return item;
    if (typeof item === 'number' && Number.isFinite(item)) return item;
    if (typeof item === 'string') {
      characters += item.length;
      if (characters > 262144) throw new Error('validation.input');
      return item;
    }
    if (
      !item ||
      typeof item !== 'object' ||
      ancestors.has(item) ||
      Object.getOwnPropertySymbols(item).length
    )
      throw new Error('validation.input');
    const array = Array.isArray(item),
      proto = Object.getPrototypeOf(item);
    if (array ? proto !== Array.prototype : proto !== Object.prototype && proto !== null)
      throw new Error('validation.input');
    ancestors.add(item);
    const descriptors = Object.getOwnPropertyDescriptors(item),
      keys = Object.keys(descriptors).filter((key) => !array || key !== 'length');
    if (array && (keys.length !== item.length || keys.some((key, index) => key !== String(index))))
      throw new Error('validation.input');
    const entries = keys.map((key) => {
      const d = descriptors[key]!;
      characters += key.length;
      if (characters > 262144 || !d.enumerable || !('value' in d))
        throw new Error('validation.input');
      return [key, visit(d.value, depth + 1)] as const;
    });
    ancestors.delete(item);
    return Object.freeze(
      array ? entries.map(([, child]) => child) : Object.fromEntries(entries),
    ) as JsonValue;
  };
  return visit(value, 0);
}
