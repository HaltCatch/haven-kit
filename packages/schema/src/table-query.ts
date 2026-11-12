import { isTableColumnFilters } from './table-filters.js';
import type { TableColumnFilterValue } from './table-filters.js';
import { isTableFilter } from './table-view.js';
import type { TableColumn } from './table.js';

/** Offset query only. Column IDs are an allowlist; host adapters map them to trusted server fields. */
export interface TableQuery {
  readonly pageIndex: number;
  readonly pageSize: number;
  readonly sort: readonly { readonly columnId: string; readonly direction: 'asc' | 'desc' }[];
  readonly filter: string;
  readonly columnFilters?: readonly TableColumnFilterValue[];
}
export function isTableQuery(
  value: unknown,
  columns?: readonly TableColumn[],
): value is TableQuery {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const query = value as Record<string, unknown>;
  if (
    Object.keys(query).some(
      (key) => !['pageIndex', 'pageSize', 'sort', 'filter', 'columnFilters'].includes(key),
    )
  )
    return false;
  const index = query['pageIndex'],
    size = query['pageSize'],
    sort = query['sort'];
  if (
    typeof index !== 'number' ||
    !Number.isSafeInteger(index) ||
    index < 0 ||
    typeof size !== 'number' ||
    !Number.isInteger(size) ||
    size < 1 ||
    size > 1000 ||
    !Number.isSafeInteger(index * size) ||
    !isTableFilter(query['filter']) ||
    (query['columnFilters'] !== undefined &&
      !isTableColumnFilters(query['columnFilters'], columns)) ||
    !Array.isArray(sort) ||
    sort.length > 1
  )
    return false;
  return sort.every((item: unknown) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
    const entry = item as Record<string, unknown>,
      id = entry['columnId'];
    if (
      Object.keys(entry).some((key) => !['columnId', 'direction'].includes(key)) ||
      typeof id !== 'string' ||
      !/^[A-Za-z][A-Za-z0-9_-]{0,127}$/.test(id) ||
      !['asc', 'desc'].includes(String(entry['direction'])) ||
      typeof entry['direction'] !== 'string'
    )
      return false;
    return (
      !columns ||
      columns.some(
        (column) => column.id === id && (column.sortable ?? (!column.renderer || !!column.type)),
      )
    );
  });
}
