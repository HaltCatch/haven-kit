import {
  filterFn_includesString,
  filterFn_equals,
  filterFn_inNumberRange,
  filterFn_inDateRange,
  filterFn_empty,
  filterFn_notEmpty,
} from '@tanstack/angular-table';
import type { FilterFn } from '@tanstack/angular-table';
import { readPointer, tableBuiltinFilterIds, validateTemporalValue } from '@haven/schema';
import type { JsonObject, JsonValue, TableColumn, TableRowKey } from '@haven/schema';
import { isTableRowShape } from '@haven/runtime';
import type { HavenTableCellContext, HavenTableCellValue } from './cell-renderers';
import type { HavenTableFilterRegistration } from './filters';
import type { HavenTableCellSnapshots } from './cell-snapshots';
import type { features } from './features';
interface Inputs {
  column: TableColumn;
  registration: HavenTableFilterRegistration;
  locale: string;
  theme: HavenTableCellContext['theme'];
  disabled: boolean;
  readonly: boolean;
  rowKey: string;
  snapshots: HavenTableCellSnapshots;
  revision: object;
}
/** Only the adapter between Haven's contract and official filterFns; TanStack evaluates the rows. */
export function tableColumnFilterFn(input: Inputs): FilterFn<typeof features, JsonObject> {
  const id = input.column.filter!.id,
    params = input.snapshots.snapshot(input.column.filter!.params ?? {});
  const native =
    id === 'text'
      ? filterFn_includesString
      : id === 'number-range'
        ? filterFn_inNumberRange
        : id === 'date-range'
          ? filterFn_inDateRange
          : filterFn_equals;
  const builtin = tableBuiltinFilterIds.some((entry) => entry === id);
  const fn: FilterFn<typeof features, JsonObject> = (row, columnId, filterValue: unknown) => {
    if (id === 'empty')
      return (filterValue === 'empty' ? filterFn_empty : filterFn_notEmpty)(row, columnId, true);
    if (id === 'date-range' && validateTemporalValue('date', row.getValue(columnId)) !== undefined)
      return false;
    if (builtin) return native(row, columnId, filterValue);
    if (!input.registration.matches || !isTableRowShape({ type: 'object' }, row.original))
      throw new Error('Invalid filter row or local predicate');
    const snapshot = input.snapshots.snapshot(row.original, input.revision);
    const result = input.registration.matches(
      Object.freeze({
        rowKey: readPointer(snapshot, input.rowKey) as TableRowKey,
        row: snapshot,
        columnId,
        value: readPointer(snapshot, input.column.path) as HavenTableCellValue | undefined,
        filterValue: filterValue as HavenTableCellValue,
        params,
        locale: input.locale,
        theme: input.theme,
        disabled: input.disabled,
        readonly: input.readonly,
      }),
    );
    if (typeof result !== 'boolean') throw new Error('A filter predicate must return boolean');
    return result;
  };
  // undefined is the only universal clear operation. false/0/null/empty string may be valid filters.
  fn.autoRemove = (value: unknown) => value === undefined;
  fn.resolveFilterValue = (value: JsonValue) => {
    if (id === 'number-range' || id === 'date-range') {
      const range = value as JsonObject;
      return native.resolveFilterValue?.([range['min'], range['max']]);
    }
    if (builtin && id !== 'empty') return native.resolveFilterValue?.(value) ?? value;
    return input.snapshots.snapshot({ value }).value;
  };
  return fn;
}
