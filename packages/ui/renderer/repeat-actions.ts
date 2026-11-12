import { reconcileData } from '@haven/runtime';
import { schemaAtPointer } from '@haven/schema';
import type { JsonObject } from '@haven/schema';
import type { HavenRenderer } from './renderer';
import { fieldAt } from '@haven/ui/form-state';
export type RepeatOperation =
  | { type: 'add'; index: number }
  | { type: 'remove'; key: string | number; index: number }
  | { type: 'reorder'; key: string | number; from: number; to: number };
/** Commit an explicit UI proposal using Angular's native array value, preserving item identities. */
export function applyRepeatOperation(
  renderer: HavenRenderer,
  id: string,
  operation: RepeatOperation,
): void {
  const state = renderer.states().get(id);
  if (
    !state ||
    !state.visible ||
    state.disabled ||
    state.readonly ||
    renderer.instances().invalidRepeats.has(id)
  )
    return;
  const node = state.node;
  if (node.kind !== 'form.repeat' || node.bind === undefined || !renderer.validation().valid)
    return;
  const schema = schemaAtPointer(renderer.document().dataSchema, node.bind);
  const field = renderer.fields() && fieldAt(renderer.fields()!, node.bind);
  const current = field?.().value();
  const rows = renderer.instances().rows.get(id) ?? [];
  if (!field || !schema?.items || !Array.isArray(current) || rows.length !== current.length) return;
  const next = [...current] as JsonObject[];
  let event: JsonObject;
  if (operation.type === 'add') {
    if (
      !Number.isInteger(operation.index) ||
      operation.index < 0 ||
      operation.index > next.length ||
      (schema.maxItems !== undefined && next.length >= schema.maxItems)
    )
      return;
    const item = reconcileData(
      schema.items,
      undefined,
      renderer.document().dataSchema,
    ) as JsonObject;
    next.splice(operation.index, 0, item);
    event = { index: operation.index, item: structuredClone(item) };
  } else if (operation.type === 'remove') {
    if (next.length <= (schema.minItems ?? 0) || rows[operation.index]?.key !== operation.key)
      return;
    const [item] = next.splice(operation.index, 1);
    event = { index: operation.index, item: structuredClone(item!), key: operation.key };
  } else {
    if (
      rows[operation.from]?.key !== operation.key ||
      !Number.isInteger(operation.to) ||
      operation.to < 0 ||
      operation.to >= next.length ||
      operation.from === operation.to
    )
      return;
    const [item] = next.splice(operation.from, 1);
    next.splice(operation.to, 0, item!);
    event = { from: operation.from, to: operation.to, key: operation.key };
  }
  field().value.set(next);
  field().markAsDirty();
  field().markAsTouched();
  renderer.dispatch(node, operation.type, event);
}
