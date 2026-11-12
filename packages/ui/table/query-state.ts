import { computed, signal } from '@angular/core';
import type { Signal, WritableSignal } from '@angular/core';
import { isTableFilter, isTableQuery, isTableColumnFilters } from '@haven/schema';
import type { TableColumn, TableQuery, TableColumnFilterValue, JsonValue } from '@haven/schema';
import type { TableDataSource } from '@haven/runtime';
import type { Updater } from '@tanstack/angular-table';
import { updateValue } from './view-state';
const emptyFilters: readonly TableColumnFilterValue[] = Object.freeze([]);
type Pagination = { pageIndex: number; pageSize: number };
type Sorting = { id: string; desc: boolean }[];
interface Inputs {
  source: Signal<TableDataSource | undefined>;
  query: WritableSignal<TableQuery>;
  filter: WritableSignal<string>;
  columnFilters: WritableSignal<readonly TableColumnFilterValue[]>;
  columns: Signal<readonly TableColumn[]>;
  disabled: Signal<boolean>;
  filterable: Signal<boolean>;
}
/** Official controlled TanStack state. Only the active mode is exposed; no row processing lives here. */
export function createTableQueryState(inputs: Inputs) {
  const localPagination = signal<Pagination>({ pageIndex: 0, pageSize: 10 });
  const localSorting = signal<Sorting>([]);
  const appliedFilters = computed(() =>
    inputs.source() ? (inputs.query()?.columnFilters ?? emptyFilters) : inputs.columnFilters(),
  );
  const nativeFilters = computed(() => {
    const values = appliedFilters();
    return isTableColumnFilters(values, inputs.columns())
      ? values.map((entry) => ({ id: entry.columnId, value: entry.value }))
      : [];
  });
  const patch = (change: Partial<TableQuery>) => {
    if (inputs.disabled()) return;
    const next = { ...inputs.query(), ...change };
    if (isTableQuery(next, inputs.columns())) inputs.query.set(next);
  };
  const sorting = (query: TableQuery): Sorting =>
    query.sort.map((item) => ({ id: item.columnId, desc: item.direction === 'desc' }));
  return {
    state: computed(() => {
      const query = inputs.query(),
        remote = !!inputs.source() && isTableQuery(query, inputs.columns());
      return {
        columnFilters: nativeFilters(),
        pagination: remote
          ? { pageIndex: query.pageIndex, pageSize: query.pageSize }
          : localPagination(),
        sorting: remote ? sorting(query) : localSorting(),
        globalFilter: inputs.source()
          ? isTableQuery(query)
            ? query.filter
            : ''
          : inputs.filterable() && isTableFilter(inputs.filter())
            ? inputs.filter()
            : '',
      };
    }),
    pagination: (update: Updater<Pagination>) => {
      if (inputs.source()) {
        const current = inputs.query(),
          next = updateValue(update, { pageIndex: current.pageIndex, pageSize: current.pageSize });
        patch({ ...next, ...(next.pageSize !== current.pageSize ? { pageIndex: 0 } : {}) });
      } else localPagination.update((current) => updateValue(update, current));
    },
    sorting: (update: Updater<Sorting>) => {
      if (inputs.source())
        patch({
          pageIndex: 0,
          sort: updateValue(update, sorting(inputs.query())).map((item) => ({
            columnId: item.id,
            direction: item.desc ? 'desc' : 'asc',
          })),
        });
      else localSorting.update((current) => updateValue(update, current));
    },
    filter: (update: Updater<unknown>) => {
      if (inputs.disabled()) return;
      if (inputs.source())
        patch({ filter: String(updateValue(update, inputs.query().filter)), pageIndex: 0 });
      else inputs.filter.set(String(updateValue(update, inputs.filter())));
    },
    columnFilters: (update: Updater<{ id: string; value: unknown }[]>) => {
      if (inputs.disabled()) return;
      const current = inputs.source()
        ? (inputs.query()?.columnFilters ?? [])
        : inputs.columnFilters();
      const next = updateValue(
        update,
        (isTableColumnFilters(current) ? current : []).map((entry) => ({
          id: entry.columnId,
          value: entry.value,
        })),
      ).map((entry) => ({ columnId: entry.id, value: entry.value as JsonValue }));
      if (!isTableColumnFilters(next, inputs.columns())) return;
      if (inputs.source()) patch({ columnFilters: next, pageIndex: 0 });
      else {
        inputs.columnFilters.set(next);
        localPagination.update((current) => ({ ...current, pageIndex: 0 }));
      }
    },
    resetPage: () =>
      inputs.query.update((query) =>
        isTableQuery(query) && query.pageIndex ? { ...query, pageIndex: 0 } : query,
      ),
  };
}
