import { effect, untracked } from '@angular/core';
import type { Signal, WritableSignal } from '@angular/core';
import { isTableSelection } from '@haven/schema';
import type { JsonObject, TableColumn, TableDataIssue, TableRowKey } from '@haven/schema';
import type { TableDataSource } from '@haven/runtime';
import type { LocalTable } from './features';
interface Inputs {
  table: LocalTable;
  source: Signal<TableDataSource | undefined>;
  pageSize: Signal<number>;
  rows: Signal<readonly JsonObject[]>;
  columns: Signal<readonly TableColumn[]>;
  issue: Signal<TableDataIssue | null>;
  keys: Signal<Map<string, TableRowKey>>;
  rowKey: Signal<string>;
  selection: WritableSignal<readonly TableRowKey[]>;
}
/** Existing complete-data behavior. Remote windows must never prune off-page selected keys. */
export function bindLocalTableData(inputs: Inputs): void {
  effect(() => {
    if (inputs.source()) return;
    const configured = inputs.pageSize();
    const size = Number.isInteger(configured) ? Math.min(1000, Math.max(1, configured)) : 10;
    untracked(() => {
      inputs.table.setPageSize(size);
      inputs.table.setPageIndex(0);
    });
  });
  effect(() => {
    if (inputs.source()) return;
    inputs.rows();
    const ids = new Set(
      inputs
        .columns()
        .filter((column) => column.sortable ?? (!column.renderer || !!column.type))
        .map((column) => column.id),
    );
    untracked(() => {
      const sorting = inputs.table.atoms.sorting.get(),
        retained = sorting.filter((item) => ids.has(item.id));
      if (retained.length !== sorting.length) inputs.table.setSorting(retained);
      inputs.table.setPageIndex(0);
    });
  });
  let previous: Map<string, TableRowKey> | undefined, previousPointer: string | undefined;
  effect(() => {
    if (inputs.source()) {
      previous = undefined;
      previousPointer = undefined;
      return;
    }
    if (inputs.issue()) return;
    const keys = inputs.keys(),
      pointer = inputs.rowKey();
    untracked(() => {
      const current = inputs.selection();
      if (previousPointer !== undefined && previousPointer !== pointer) inputs.selection.set([]);
      else if (previous && isTableSelection(current)) {
        const retained = current.filter(
          (key) => !previous!.has(`${typeof key}:${key}`) || keys.has(`${typeof key}:${key}`),
        );
        if (retained.length !== current.length) inputs.selection.set(retained);
      }
    });
    previous = keys;
    previousPointer = pointer;
  });
}
