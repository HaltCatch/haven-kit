import { createMetadataKey, MetadataReducer } from '@angular/forms/signals';
import type { FieldTree } from '@angular/forms/signals';
/** Native metadata holds only predicates over ResourceRef, never a second pending/result store. */
export const submitReadiness = createMetadataKey(MetadataReducer.list<() => boolean>());
export function validationReady<T>(tree: FieldTree<T>): boolean {
  const state = tree();
  if (state.hidden() || state.disabled() || state.readonly()) return true;
  if (
    state
      .metadata(submitReadiness)?.()
      .some((ready) => !ready())
  )
    return false;
  const value = state.value();
  if (!value || typeof value !== 'object') return true;
  if (Array.isArray(value)) {
    for (const child of tree as unknown as Iterable<FieldTree<unknown> | undefined>)
      if (child && !validationReady(child)) return false;
  } else {
    for (const [, child] of tree as unknown as Iterable<[string, FieldTree<unknown> | undefined]>)
      if (child && !validationReady(child)) return false;
  }
  return true;
}
