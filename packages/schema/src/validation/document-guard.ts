import type { Diagnostic, JsonObject, JsonValue, ValidationLimits } from '../types.js';

type GuardFailure = { readonly ok: false; readonly diagnostic: Diagnostic };
type GuardedJson = { readonly ok: true; readonly value: JsonValue } | GuardFailure;
type Container = JsonObject | JsonValue[];
type Task =
  | { readonly exit: object }
  | {
      readonly source: unknown;
      readonly depth: number;
      readonly target: Container;
      readonly key: string;
    };
interface CapturedObject {
  readonly copy: Container;
  readonly entries: readonly (readonly [string, unknown])[];
}
const reject = (code: string, message: string): GuardFailure => ({
  ok: false,
  diagnostic: { code, path: '', message },
});

/** Capture data descriptors once; neither JSON.stringify nor later validators read host objects. */
function capture(source: object): CapturedObject | GuardFailure {
  const array = Array.isArray(source),
    prototype = Object.getPrototypeOf(source);
  if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null)
    return reject(
      'structure.json',
      array ? 'Expected plain JSON arrays' : 'Expected plain JSON objects',
    );
  const descriptors = Object.getOwnPropertyDescriptors(source);
  if (Object.getOwnPropertySymbols(descriptors).length)
    return reject('structure.json', 'Expected JSON string data properties');
  const entries: (readonly [string, unknown])[] = [];
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (array && key === 'length') continue;
    if (['__proto__', 'constructor', 'prototype'].includes(key))
      return reject('structure.key', 'Unsafe object key');
    if (!descriptor.enumerable || !('value' in descriptor))
      return reject('structure.json', 'Expected enumerable JSON data properties');
    entries.push([key, descriptor.value]);
  }
  if (array) {
    const length = descriptors['length'];
    if (
      !length ||
      !('value' in length) ||
      !Number.isSafeInteger(length.value) ||
      length.value < 0 ||
      entries.length !== length.value ||
      entries.some(([key], index) => key !== String(index))
    )
      return reject('structure.json', 'Expected dense JSON arrays without extra properties');
  }
  const copy: Container = array ? [] : (Object.create(null) as JsonObject);
  // Reserve property order before LIFO traversal fills values, retaining semantic diagnostic order.
  for (const [key] of entries) (copy as JsonObject)[key] = null;
  return { copy, entries };
}

/** Enforce the existing physical JSON budgets and retain shared, acyclic object identity. */
export function guardDocumentJson(value: unknown, limits: ValidationLimits): GuardedJson {
  try {
    const root: JsonObject = { value: null },
      queue: Task[] = [{ source: value, depth: 0, target: root, key: 'value' }],
      active = new WeakSet<object>(),
      captured = new WeakMap<object, CapturedObject>();
    let nodes = 0;
    while (queue.length) {
      const task = queue.pop()!;
      if ('exit' in task) {
        active.delete(task.exit);
        continue;
      }
      if (++nodes > limits.maxNodes * 100 || task.depth > limits.maxDepth)
        return reject('limit.complexity', 'Document exceeds structural limits');
      const source = task.source;
      if (source !== null && typeof source === 'object') {
        if (active.has(source))
          return reject('structure.json', 'Document must be an acyclic JSON tree');
        let state = captured.get(source);
        if (!state) {
          const next = capture(source);
          if ('ok' in next) return next;
          state = next;
          captured.set(source, state);
        }
        (task.target as JsonObject)[task.key] = state.copy;
        active.add(source);
        queue.push({ exit: source });
        for (const [key, child] of state.entries)
          queue.push({ source: child, depth: task.depth + 1, target: state.copy, key });
      } else {
        if (
          (source !== null && !['string', 'number', 'boolean'].includes(typeof source)) ||
          (typeof source === 'number' && !Number.isFinite(source))
        )
          return reject('structure.json', 'Expected finite JSON values');
        (task.target as JsonObject)[task.key] = source as JsonValue;
      }
    }
    const snapshot = root['value']!;
    if (new TextEncoder().encode(JSON.stringify(snapshot)).byteLength > limits.maxBytes)
      return reject('limit.bytes', 'Document is too large');
    return { ok: true, value: snapshot };
  } catch {
    // Proxy prototype/ownKeys/descriptor traps may throw. Their exception text is not model data.
    return reject('structure.json', 'Expected inspectable JSON values');
  }
}
