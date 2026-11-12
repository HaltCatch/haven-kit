import { readPointer } from '@haven/schema';
import type { JsonObject, TableRowKey, TableView } from '@haven/schema';
import type { Updater } from '@tanstack/angular-table';

export function updateValue<T>(update: Updater<T>, value: T): T {
  return typeof update === 'function' ? (update as (current: T) => T)(value) : update;
}
export function selectionState(keys: readonly TableRowKey[]): Record<string, true> {
  return Object.fromEntries(keys.map((key) => [`${typeof key}:${key}`, true as const]));
}
export function keyMap(rows: readonly JsonObject[], pointer: string): Map<string, TableRowKey> {
  return new Map(
    rows.map((row) => {
      const key = readPointer(row, pointer) as TableRowKey;
      return [`${typeof key}:${key}`, key];
    }),
  );
}
export function viewState(view: TableView) {
  return {
    columnOrder: view.order ?? [],
    columnVisibility: Object.fromEntries((view.hidden ?? []).map((id) => [id, false])),
    columnPinning: { start: view.pinned?.start ?? [], end: view.pinned?.end ?? [] },
    columnSizing: view.widths ?? {},
  };
}
