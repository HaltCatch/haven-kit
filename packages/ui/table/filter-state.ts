import { HavenLocalization } from '@haven/ui';
import { HAVEN_THEME_CONTEXT } from '@haven/ui/theme';
import { tableColumnFilterFn } from './filter-engine';
import { computed, inject } from '@angular/core';
import {
  isTableColumnFilters,
  isTableColumns,
  isTableRendererParams,
  tableBuiltinFilterIds,
} from '@haven/schema';
import type { JsonObject, TableColumn, TableColumnFilterValue } from '@haven/schema';
import { supportsTableColumnFilter } from '@haven/runtime';
import type { TableDataSource } from '@haven/runtime';
import { HAVEN_TABLE_FILTERS } from './filters';
import type { HavenTableFilters } from './filters';
import { HavenTableCellSnapshots } from './cell-snapshots';
interface Inputs {
  columns(): readonly TableColumn[];
  registry(): HavenTableFilters | undefined;
  values(): readonly TableColumnFilterValue[];
  source(): TableDataSource | undefined;
  rows(): readonly JsonObject[];
  rowKey(): string;
  owner(): string;
  disabled(): boolean;
  readonly(): boolean;
  active(): boolean;
}
export function injectTableColumnFilters(input: Inputs) {
  const localization = inject(HavenLocalization),
    theme = inject(HAVEN_THEME_CONTEXT, { optional: true });
  const fallback = inject(HAVEN_TABLE_FILTERS),
    snapshots = inject(HavenTableCellSnapshots);
  const registry = computed(() => input.registry() ?? fallback);
  const columns = computed(() => (isTableColumns(input.columns()) ? input.columns() : []));
  // A callback retained by a child still checks the current owner before Angular propagates inputs.
  const owner = computed(() =>
    JSON.stringify([
      input.owner(),
      input.source()?.identity,
      input.rowKey(),
      columns().map((column) => [column.id, column.path, column.filter]),
      isTableRendererParams({ support: input.source()?.adapter.supportedColumnFilters ?? [] })
        ? input.source()?.adapter.supportedColumnFilters
        : 'invalid',
    ]),
  );
  const active = computed(() => {
    const captured = owner(),
      capturedRegistry = registry(),
      adapter = input.source()?.adapter;
    return () =>
      captured === owner() &&
      capturedRegistry === registry() &&
      adapter === input.source()?.adapter &&
      input.active() &&
      !input.disabled();
  });
  const displayValues = computed(() =>
    isTableColumnFilters(input.values()) ? input.values() : [],
  );
  const available = computed(() =>
    columns().filter(
      (column) =>
        column.filter &&
        (!input.source() ||
          supportsTableColumnFilter(input.source()?.adapter.supportedColumnFilters, column)),
    ),
  );
  const unsupportedRemote = computed(
    () =>
      !!input.source() &&
      columns().some((column) => column.filter && !available().includes(column)),
  );
  const issue = computed(() => {
    const configured = columns(),
      values = input.values();
    if (!isTableColumnFilters(values, configured)) return 'columnFilters';
    for (const column of configured) {
      if (!column.filter) continue;
      const entry = registry().get(column.filter.id);
      if (!entry) return 'filterRegistry';
      const params = snapshots.snapshot(column.filter.params ?? {});
      try {
        if (entry.validateParams && entry.validateParams(params) !== true) return 'filterRegistry';
        const condition = values.find((value) => value.columnId === column.id);
        if (
          condition &&
          entry.accepts(snapshots.snapshot({ value: condition.value }).value, params) !== true
        )
          return 'columnFilters';
        if (
          condition &&
          input.source() &&
          !supportsTableColumnFilter(input.source()?.adapter.supportedColumnFilters, column)
        )
          return 'columnFilters';
        if (
          !input.source() &&
          !tableBuiltinFilterIds.some((id) => id === column.filter!.id) &&
          !entry.matches
        )
          return 'filterRegistry';
      } catch {
        return 'filterRegistry';
      }
    }
    return null;
  });
  const definition = (column: TableColumn) => {
    const entry = column.filter && registry().get(column.filter.id),
      currentTheme = theme?.();
    return entry
      ? {
          enableColumnFilter: true,
          filterFn: tableColumnFilterFn({
            column,
            registration: entry,
            locale: localization.locale(),
            theme: currentTheme ? snapshots.snapshot(currentTheme) : null,
            disabled: input.disabled(),
            readonly: input.readonly(),
            rowKey: input.rowKey(),
            snapshots,
            revision: input.rows(),
          }),
        }
      : { enableColumnFilter: false };
  };
  return {
    registry,
    available,
    unsupportedRemote,
    issue,
    definition,
    owner,
    active,
    displayValues,
  };
}
