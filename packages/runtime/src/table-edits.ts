import { isTableEditRequest } from './table-edit-protocol.js';
import { isTablePointer, readPointer, tableRowId, writePointer } from '@haven/schema';
import type { JsonObject, JsonPrimitive, TableColumn, TableRowKey } from '@haven/schema';
export type TablePriorValue =
  { readonly exists: false } | { readonly exists: true; readonly value: JsonPrimitive };
export interface TableCellChange {
  readonly columnId: string;
  readonly path: string;
  readonly before: TablePriorValue;
  readonly value: JsonPrimitive;
}
export interface TableEditRequest {
  readonly transactionId: string;
  readonly rowKey: TableRowKey;
  readonly changes: readonly TableCellChange[];
}
export interface TableEditFieldError {
  readonly path: string;
  readonly code: string;
}
export type TableEditResult =
  | { readonly status: 'applied'; readonly row: JsonObject }
  | { readonly status: 'conflict' }
  | { readonly status: 'invalid'; readonly errors: readonly TableEditFieldError[] }
  | { readonly status: 'error'; readonly code: string };
export interface TableEditHandler {
  commit(request: TableEditRequest, signal: AbortSignal): Promise<TableEditResult>;
}
/** JSON structure comparison shares the rule runtime's object-order-independent semantics. */
export { equalJson as sameTableValue } from './rules.js';
import { equalJson as sameTableValue } from './rules.js';
export function tablePriorValue(row: JsonObject, path: string): TablePriorValue {
  const value = readPointer(row, path) as JsonPrimitive | undefined;
  return value === undefined ? { exists: false } : { exists: true, value: structuredClone(value) };
}
/** Paths are JSON Pointers; a row key and any overlapping edit address are immutable. */
export function tableEditPathsValid(columns: readonly TableColumn[], rowKey: string): boolean {
  const paths = columns.filter((column) => column.editor).map((column) => column.path);
  const overlaps = (a: string, b: string) =>
    a === b || a.startsWith(b + '/') || b.startsWith(a + '/');
  return (
    isTablePointer(rowKey) &&
    paths.every(
      (path, index) =>
        isTablePointer(path) &&
        !overlaps(path, rowKey) &&
        paths.slice(0, index).every((other) => !overlaps(path, other)),
    )
  );
}
export type TableEditCandidate =
  | { readonly status: 'candidate'; readonly row: JsonObject; readonly index: number }
  | Exclude<TableEditResult, { status: 'applied' }>;
/** Compare only edited paths against the latest row, preserving unrelated concurrent values. */
function prepare(
  rows: readonly JsonObject[],
  columns: readonly TableColumn[],
  rowKey: string,
  request: TableEditRequest,
): TableEditCandidate {
  if (
    !isTableEditRequest(request) ||
    !tableEditPathsValid(columns, rowKey) ||
    !request.transactionId ||
    !request.changes.length ||
    request.changes.length > columns.length
  )
    return { status: 'error', code: 'request' };
  const id = `${typeof request.rowKey}:${request.rowKey}`,
    ids = new Set<string>();
  let index = -1;
  try {
    rows.forEach((row, i) => {
      const key = tableRowId(row, rowKey);
      if (ids.has(key)) throw new Error('duplicate');
      ids.add(key);
      if (key === id) index = i;
    });
  } catch {
    return { status: 'error', code: 'rows' };
  }
  if (index < 0) return { status: 'conflict' };
  let row = rows[index]!;
  const changed = new Set<string>();
  for (const change of request.changes) {
    const column = columns.find((entry) => entry.id === change.columnId);
    if (!column?.editor || column.path !== change.path || changed.has(column.id))
      return { status: 'error', code: 'request' };
    changed.add(column.id);
    if (!sameTableValue(tablePriorValue(row, change.path), change.before))
      return { status: 'conflict' };
    try {
      row = writePointer(row, change.path, structuredClone(change.value)) as JsonObject;
    } catch {
      return { status: 'error', code: 'request' };
    }
  }
  return { status: 'candidate', row, index };
}

/** Invalid runtime callers receive a diagnostic rather than throwing through table rendering. */
export function prepareTableEdit(
  rows: readonly JsonObject[],
  columns: readonly TableColumn[],
  rowKey: string,
  request: TableEditRequest,
): TableEditCandidate {
  try {
    return prepare(rows, columns, rowKey, request);
  } catch {
    return { status: 'error', code: 'request' };
  }
}
