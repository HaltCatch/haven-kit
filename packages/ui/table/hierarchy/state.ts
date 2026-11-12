import { computed, effect, untracked } from '@angular/core';
import type { WritableSignal } from '@angular/core';
import { buildTableHierarchy } from '@haven/runtime';
import { isTableExpandedRowKeys, readPointer, tableRowId } from '@haven/schema';
import type { JsonObject, TableHierarchy, TableRowKey } from '@haven/schema';
import type { ExpandedState, Updater } from '@tanstack/angular-table';
import type { LocalTable } from '../features';
import { updateValue } from '../view-state';

interface Inputs {
  table(): LocalTable;
  rows(): readonly JsonObject[];
  rowKey(): string;
  hierarchy(): TableHierarchy | undefined;
  owner(): string;
  remote(): boolean;
  blocked(): boolean;
  active(): boolean;
  editingKey(): TableRowKey | undefined;
  collection(): boolean;
  anchorPage(pageIndex: number): void;
  expanded: WritableSignal<readonly TableRowKey[]>;
}
export interface HierarchyToggle {
  readonly id: string;
  readonly owner: string;
}
/** One native engine owns expansion; this only translates typed public keys and canonical rows. */
export function createTableHierarchyState(input: Inputs) {
  const configured = computed(() => input.hierarchy() !== undefined);
  const result = computed(() =>
    configured() ? buildTableHierarchy(input.rows(), input.rowKey(), input.hierarchy()) : null,
  );
  const index = computed(() => {
    const value = result();
    return value?.status === 'ready' ? value.index : undefined;
  });
  const owner = computed(() => JSON.stringify([input.owner(), input.rowKey(), input.hierarchy()]));
  const issue = computed(() => {
    if (!isTableExpandedRowKeys(input.expanded())) return 'expandedRows';
    if (!configured()) return input.expanded().length ? 'expandedRows' : null;
    return input.remote() || result()?.status === 'error' ? 'hierarchy' : null;
  });
  const enabled = computed(() => configured() && !issue());
  const records = computed(() => {
    const map = new Map<string, TableRowKey>();
    for (const [key, entry] of index()?.entries ?? [])
      map.set(tableRowId(entry.row, input.rowKey()), key);
    return map;
  });
  const expandable = computed(
    () =>
      new Set(
        [...(index()?.children ?? [])]
          .filter(([, children]) => children.length > 0)
          .map(([key]) => key),
      ),
  );
  const expanded = computed<Record<string, boolean>>(() => {
    const state: Record<string, boolean> = {};
    if (!enabled()) return state;
    for (const key of input.expanded()) {
      const entry = index()?.entries.get(key);
      if (entry && expandable().has(key)) state[tableRowId(entry.row, input.rowKey())] = true;
    }
    // A controlled host collapse cannot unmount an unapplied child editor.
    let parent = index()?.entries.get(input.editingKey()!)?.parentKey;
    while (parent !== null && parent !== undefined) {
      const entry = index()!.entries.get(parent)!;
      state[tableRowId(entry.row, input.rowKey())] = true;
      parent = entry.parentKey;
    }
    return state;
  });
  const allowed = () => enabled() && !input.blocked() && input.active();
  const change = (update: Updater<ExpandedState>) => {
    if (!allowed()) return;
    const next = updateValue(update, expanded());
    const keys = [...records()]
      .filter(([id, key]) => expandable().has(key) && (next === true || next[id] === true))
      .map(([, key]) => key);
    const previous = input.expanded(),
      selected = new Set(keys);
    if (previous.length !== keys.length || previous.some((key) => !selected.has(key)))
      input.expanded.set(keys);
  };
  effect(() => {
    if (
      !enabled() ||
      input.collection() ||
      input.hierarchy()?.pagination !== 'visible-rows' ||
      !input.active()
    )
      return;
    const table = input.table(),
      pagination = table.atoms.pagination.get(),
      editing = index()?.entries.get(input.editingKey()!);
    if (editing) {
      // Host expansion can move a pending row to another page without closing its ancestors.
      // Locate it in the native expanded model; keep user navigation locked during the draft.
      const id = tableRowId(editing.row, input.rowKey()),
        position = table.getPrePaginatedRowModel().rows.findIndex((row) => row.id === id),
        page = Math.floor(position / pagination.pageSize);
      if (position >= 0 && page !== pagination.pageIndex) untracked(() => input.anchorPage(page));
      return;
    }
    if (input.blocked()) return;
    const lastPage = Math.max(0, table.getPageCount() - 1);
    if (pagination.pageIndex > lastPage) untracked(() => table.setPageIndex(lastPage));
  });
  return {
    configured,
    enabled,
    owner,
    issue,
    index,
    expanded,
    change,
    roots: () => (configured() ? (enabled() ? index()!.roots : []) : input.rows()),
    children: (row: JsonObject) =>
      enabled()
        ? index()?.children.get(readPointer(row, input.rowKey()) as TableRowKey)
        : undefined,
    width: computed(() => {
      const depth = Math.max(
        0,
        ...[...(index()?.entries.values() ?? [])].map((entry) => entry.depth),
      );
      return `calc(var(--haven-spacing) * ${5 + depth * 2})`;
    }),
    toggle(request: HierarchyToggle, table: LocalTable) {
      if (!allowed() || request.owner !== owner()) return;
      const row = table.getCoreRowModel().rowsById[request.id];
      if (row?.getCanExpand()) row.toggleExpanded();
    },
    toggleAll(request: { owner: string; expanded: boolean }, table: LocalTable) {
      if (allowed() && request.owner === owner()) table.toggleAllRowsExpanded(request.expanded);
    },
  };
}
