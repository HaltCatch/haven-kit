import { snapshotJson } from './json-snapshot.js';
import { validateTableData } from '@haven/schema';
import type { JsonObject, JsonValue, TableColumn, TableQuery } from '@haven/schema';
import type { TableDataPage } from './table-data.js';
export class InvalidTableResponse extends Error {}

/** Keep the public table response/error contract while sharing transport validation internally. */
export function snapshotTableJson(value: unknown): JsonValue {
  try {
    return snapshotJson(value);
  } catch {
    throw new InvalidTableResponse();
  }
}
export function copyTablePage(
  value: unknown,
  query: TableQuery,
  columns: readonly TableColumn[],
  rowKey: string,
): TableDataPage {
  const copy = snapshotTableJson(value);
  if (
    !copy ||
    typeof copy !== 'object' ||
    Array.isArray(copy) ||
    Object.keys(copy).some((key) => !['rows', 'total'].includes(key))
  )
    throw new InvalidTableResponse();
  const total = copy['total'],
    rows = copy['rows'];
  if (
    typeof total !== 'number' ||
    !Number.isSafeInteger(total) ||
    total < 0 ||
    !Array.isArray(rows) ||
    rows.length !==
      Math.min(query.pageSize, Math.max(0, total - query.pageIndex * query.pageSize)) ||
    validateTableData(rows, columns, rowKey)
  )
    throw new InvalidTableResponse();
  return Object.freeze({ rows: rows as JsonObject[], total });
}
