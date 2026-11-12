import type { TableColumn } from './table.js';

export type TableRowKey = string | number;
/** Persisted presentation state. Physical engine APIs and user data are not part of this contract. */
export type TableView = {
  order?: string[];
  hidden?: string[];
  pinned?: { start?: string[]; end?: string[] };
  widths?: Record<string, number>;
};
const columnId = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_-]{0,127}$/.test(value);
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const identifiers = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.length <= 100 &&
  value.every(columnId) &&
  new Set(value).size === value.length;

export function isTableRowKey(value: unknown): value is TableRowKey {
  return (
    (typeof value === 'string' && value.length > 0 && value.length <= 4096) ||
    (typeof value === 'number' && Number.isFinite(value))
  );
}
export function isTableSelection(value: unknown): value is TableRowKey[] {
  return Array.isArray(value) && value.every(isTableRowKey) && new Set(value).size === value.length;
}
export function isTableFilter(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 2000;
}
/** With columns supplied, also reject unknown IDs and a view that hides every column. */
export function isTableView(value: unknown, columns?: readonly TableColumn[]): value is TableView {
  if (
    !object(value) ||
    Object.keys(value).some((key) => !['order', 'hidden', 'pinned', 'widths'].includes(key))
  )
    return false;
  const ids: string[] = [];
  for (const name of ['order', 'hidden']) {
    const list = value[name];
    if (list !== undefined) {
      if (!identifiers(list)) return false;
      ids.push(...list);
    }
  }
  const pinned = value['pinned'];
  if (pinned !== undefined) {
    if (!object(pinned) || Object.keys(pinned).some((key) => !['start', 'end'].includes(key)))
      return false;
    const start = pinned['start'] === undefined ? [] : pinned['start'],
      end = pinned['end'] === undefined ? [] : pinned['end'];
    if (!identifiers(start) || !identifiers(end) || start.some((id) => end.includes(id)))
      return false;
    ids.push(...start, ...end);
  }
  const widths = value['widths'];
  if (widths !== undefined) {
    if (!object(widths) || Object.keys(widths).length > 100) return false;
    for (const [id, width] of Object.entries(widths)) {
      if (
        !columnId(id) ||
        typeof width !== 'number' ||
        !Number.isInteger(width) ||
        width < 48 ||
        width > 1200
      )
        return false;
      ids.push(id);
    }
  }
  if (columns) {
    const known = new Set(columns.map((column) => column.id));
    if (ids.some((id) => !known.has(id))) return false;
    const hidden = new Set((value['hidden'] ?? []) as string[]);
    if (columns.length > 0 && columns.every((column) => hidden.has(column.id))) return false;
  }
  return true;
}
