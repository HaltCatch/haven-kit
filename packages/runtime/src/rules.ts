import { readPointer } from '@haven/schema';
import type { Condition, JsonValue, ValueRef } from '@haven/schema';
export interface DataScope {
  root: unknown;
  item?: unknown;
  event?: unknown;
}
export function resolveValue(ref: ValueRef, scope: DataScope): unknown {
  return 'literal' in ref ? ref.literal : readPointer(scope[ref.scope ?? 'root'], ref.path);
}
/** JSON structural equality: object key order is immaterial, array order is material. */
export function equalJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (
    a === null ||
    b === null ||
    typeof a !== 'object' ||
    typeof b !== 'object' ||
    Array.isArray(a) !== Array.isArray(b)
  )
    return false;
  const left = Object.keys(a);
  const right = Object.keys(b);
  return (
    left.length === right.length &&
    left.every(
      (key) =>
        Object.hasOwn(b, key) &&
        equalJson((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
    )
  );
}
export interface CompiledCondition {
  dependencies: readonly string[];
  evaluate(scope: DataScope): boolean;
}
export function compileCondition(condition: Condition, maxNodes = 256): CompiledCondition {
  let count = 0;
  const dependencies = new Set<string>();
  const reference = (ref: ValueRef) => {
    if ('path' in ref) {
      readPointer({}, ref.path);
      dependencies.add(`${ref.scope ?? 'root'}:${ref.path}`);
    }
  };
  function compile(node: Condition, depth: number): (scope: DataScope) => boolean {
    if (++count > maxNodes || depth > 48) throw new Error('Rule complexity limit exceeded');
    if ('conditions' in node) {
      const children = node.conditions.map((child) => compile(child, depth + 1));
      return node.op === 'and'
        ? (scope) => children.every((child) => child(scope))
        : (scope) => children.some((child) => child(scope));
    }
    if ('condition' in node) {
      const child = compile(node.condition, depth + 1);
      return (scope) => !child(scope);
    }
    if ('value' in node) {
      reference(node.value);
      return (scope) => resolveValue(node.value, scope) !== undefined;
    }
    reference(node.left);
    reference(node.right);
    return (scope) => {
      const left = resolveValue(node.left, scope);
      const right = resolveValue(node.right, scope);
      // Missing values never satisfy comparisons (including ne). Use exists explicitly.
      if (left === undefined || right === undefined) return false;
      switch (node.op) {
        case 'eq':
          return equalJson(left, right);
        case 'ne':
          return !equalJson(left, right);
        case 'contains':
          return typeof left === 'string' && typeof right === 'string'
            ? left.includes(right)
            : Array.isArray(left) && left.some((item: JsonValue) => equalJson(item, right));
        case 'gt':
          return typeof left === 'number' && typeof right === 'number' && left > right;
        case 'gte':
          return typeof left === 'number' && typeof right === 'number' && left >= right;
        case 'lt':
          return typeof left === 'number' && typeof right === 'number' && left < right;
        case 'lte':
          return typeof left === 'number' && typeof right === 'number' && left <= right;
      }
    };
  }
  const evaluate = compile(condition, 0);
  return { dependencies: [...dependencies].sort(), evaluate };
}
/** Dependency matching includes parent replacements and root writes. */
export function affectsDependency(dependency: string, changed: string): boolean {
  return (
    dependency === changed ||
    dependency.startsWith(`${changed}/`) ||
    changed.startsWith(`${dependency}/`)
  );
}
