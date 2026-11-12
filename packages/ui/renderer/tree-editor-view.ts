import { computed, linkedSignal } from '@angular/core';
import { isTreeSelection } from '@haven/schema';
import type { JsonObject, TreeKey } from '@haven/schema';

type Property = 'selection' | 'expandedKeys' | 'filter';

/** Optional JSON view inputs are independent; omitted inputs retain instance-local behavior. */
export function treeEditorView(owner: () => string, props: () => JsonObject | undefined) {
  const selected = linkedSignal({ source: owner, computation: (): TreeKey | null => null });
  const expanded = linkedSignal({ source: owner, computation: (): readonly TreeKey[] => [] });
  const filter = linkedSignal({ source: owner, computation: () => '' });
  const controlled = (property: Property) => Object.hasOwn(props() ?? {}, property);
  const active = computed(() => {
    const keys = props()?.['selection'];
    return controlled('selection')
      ? isTreeSelection(keys)
        ? (keys[0] ?? null)
        : null
      : selected();
  });
  const expansion = computed(() => {
    const keys = props()?.['expandedKeys'];
    return controlled('expandedKeys') ? (isTreeSelection(keys) ? keys : []) : expanded();
  });
  const query = computed(() => {
    const value = props()?.['filter'];
    return controlled('filter') ? (typeof value === 'string' ? value : '') : filter();
  });
  // A new controlled view is a new event generation, but not a new local-state owner.
  const identity = computed(() =>
    JSON.stringify([
      owner(),
      ...(['selection', 'expandedKeys', 'filter'] as const).map((key) => [
        controlled(key),
        props()?.[key],
      ]),
    ]),
  );
  let restoring = false;
  return {
    active,
    expanded: expansion,
    filter: query,
    identity,
    controlled,
    restoring: () => restoring,
    select: (key: TreeKey | null) => selected.set(key),
    expand: (keys: readonly TreeKey[]) => expanded.set(keys),
    search: (value: string) => filter.set(value),
    restore: (write: () => void) => {
      if (restoring) return;
      restoring = true;
      try {
        write();
      } finally {
        restoring = false;
      }
    },
  };
}
