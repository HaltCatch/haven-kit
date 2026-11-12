import type { Field, FieldTree } from '@angular/forms/signals';
import { pointerSegments } from '@haven/schema';
export function fieldAt(
  tree: FieldTree<Record<string, unknown>>,
  pointer: string,
): Field<unknown> | undefined {
  let current: unknown = tree;
  for (const key of pointerSegments(pointer)) {
    if (typeof current !== 'function' && (typeof current !== 'object' || current === null))
      return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === 'function' ? (current as Field<unknown>) : undefined;
}
