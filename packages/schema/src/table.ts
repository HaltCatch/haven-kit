import { isTableFilterRef } from './table-filters.js';
import type { TableFilterRef } from './table-filters.js';
import { isTableEditor, isTableTooltip } from './table-editing.js';
import type { TableEditorRef, TableTooltip } from './table-editing.js';
import { isLocalizedText } from './localization.js';
import type { LocalizedText } from './localization.js';
import { pointerSegments, readPointer } from './pointer.js';
import type { JsonObject, JsonPrimitive } from './types.js';

/** Persisted presentation contract, independent of the rendering/state engine. */
export type TableColumn = {
  id: string;
  header: string | LocalizedText;
  path: string;
  type?: 'text' | 'number' | 'boolean';
  sortable?: boolean;
  renderer?: string;
  rendererParams?: JsonObject;
  editor?: TableEditorRef;
  filter?: TableFilterRef;
  tooltip?: TableTooltip;
};
export type TableDataIssue = {
  code: 'columns' | 'rows' | 'rowKey' | 'duplicateKey' | 'cellValue';
  row?: number;
  column?: string;
};

export function isTablePointer(value: unknown): value is string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.length > 1024) return false;
  try {
    pointerSegments(value);
    return true;
  } catch {
    return false;
  }
}

export function isTableColumns(value: unknown): value is TableColumn[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) return false;
  const ids = new Set<string>();
  return value.every((entry: unknown) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
    const column = entry as Record<string, unknown>;
    if (
      Object.keys(column).some(
        (key) =>
          ![
            'id',
            'header',
            'path',
            'type',
            'sortable',
            'renderer',
            'rendererParams',
            'editor',
            'filter',
            'tooltip',
          ].includes(key),
      )
    )
      return false;
    const id = column['id'];
    if (typeof id !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,127}$/.test(id) || ids.has(id))
      return false;
    ids.add(id);
    return (
      ((typeof column['header'] === 'string' && column['header'].length <= 4096) ||
        isLocalizedText(column['header'])) &&
      isTablePointer(column['path']) &&
      (column['type'] === undefined ||
        (typeof column['type'] === 'string' &&
          ['text', 'number', 'boolean'].includes(column['type']))) &&
      (column['sortable'] === undefined || typeof column['sortable'] === 'boolean') &&
      (column['renderer'] === undefined || isTableRendererId(column['renderer'])) &&
      (column['filter'] === undefined || isTableFilterRef(column['filter'])) &&
      (column['editor'] === undefined || isTableEditor(column['editor'])) &&
      (column['tooltip'] === undefined || isTableTooltip(column['tooltip'])) &&
      (column['rendererParams'] === undefined ||
        (column['renderer'] !== undefined && isTableRendererParams(column['rendererParams']))) &&
      !(
        column['renderer'] !== undefined &&
        column['sortable'] === true &&
        column['type'] === undefined
      )
    );
  });
}

/** Typed key encoding distinguishes numeric 0 from string "0" and never uses row indexes. */
export function tableRowId(row: JsonObject, rowKey: string): string {
  const key = readPointer(row, rowKey);
  if (
    (typeof key === 'string' && key.length > 0 && key.length <= 4096) ||
    (typeof key === 'number' && Number.isFinite(key))
  )
    return `${typeof key}:${key}`;
  throw new Error('Table rows require a nonempty string or finite numeric key');
}

/** Validate supplied local data before sorting/rendering; a bad key is never silently replaced. */
export function validateTableData(
  rows: unknown,
  columns: unknown,
  rowKey: unknown,
): TableDataIssue | null {
  if (!isTableColumns(columns)) return { code: 'columns' };
  if (!isTablePointer(rowKey)) return { code: 'rowKey' };
  if (!Array.isArray(rows)) return { code: 'rows' };
  const ids = new Set<string>();
  const custom = columns.some((column) => column.renderer !== undefined);
  for (const [index, row] of rows.entries()) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return { code: 'rows', row: index };
    if (custom && !serializable(row, 32, 100000, 1048576)) return { code: 'cellValue', row: index };
    let id: string;
    try {
      id = tableRowId(row as JsonObject, rowKey);
    } catch {
      return { code: 'rowKey', row: index };
    }
    if (ids.has(id)) return { code: 'duplicateKey', row: index };
    ids.add(id);
    for (const column of columns) {
      const value = readPointer(row, column.path);
      if (value === undefined || value === null) continue;
      if (column.renderer && !column.type) continue;
      const type = typeof value;
      if (
        !['string', 'number', 'boolean'].includes(type) ||
        (type === 'number' && !Number.isFinite(value)) ||
        (column.type && type !== (column.type === 'text' ? 'string' : column.type))
      )
        return { code: 'cellValue', row: index, column: column.id };
    }
  }
  return null;
}

/** Deterministic scalar comparison. Null/missing values are handled by the table's null ordering. */
export function compareTableValues(
  left: JsonPrimitive | undefined,
  right: JsonPrimitive | undefined,
  collator: Intl.Collator,
): number {
  if (left === right) return 0;
  if (left === null || left === undefined) return -1;
  if (right === null || right === undefined) return 1;
  if (typeof left === 'number' && typeof right === 'number') return left < right ? -1 : 1;
  if (typeof left === 'boolean' && typeof right === 'boolean') return Number(left) - Number(right);
  if (typeof left !== typeof right) return typeof left < typeof right ? -1 : 1;
  return collator.compare(String(left), String(right));
}

/** Stable host registration names, not module URLs or executable expressions. */
export function isTableRendererId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z][A-Za-z0-9._-]{0,127}$/.test(value);
}
/** Bounded serializable component configuration; arbitrary functions/classes are excluded. */
export function isTableRendererParams(value: unknown): value is JsonObject {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    serializable(value, 16, 2048, 16384)
  );
}
function serializable(
  value: unknown,
  maxDepth: number,
  maxNodes: number,
  maxBytes: number,
): boolean {
  let nodes = 0;
  const active = new WeakSet<object>();
  function visit(entry: unknown, depth: number): boolean {
    if (++nodes > maxNodes || depth > maxDepth) return false;
    if (entry === null || typeof entry === 'string' || typeof entry === 'boolean') return true;
    if (typeof entry === 'number') return Number.isFinite(entry);
    if (!entry || typeof entry !== 'object' || active.has(entry)) return false;
    if (
      !Array.isArray(entry) &&
      Object.getPrototypeOf(entry) !== Object.prototype &&
      Object.getPrototypeOf(entry) !== null
    )
      return false;
    if (Array.isArray(entry) && Object.getPrototypeOf(entry) !== Array.prototype) return false;
    if (Object.getOwnPropertySymbols(entry).length > 0) return false;
    if (
      Array.isArray(entry) &&
      (Object.keys(entry).length !== entry.length ||
        Object.keys(entry).some(
          (key) => !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= entry.length,
        ))
    )
      return false;
    active.add(entry);
    const descriptors = Object.getOwnPropertyDescriptors(entry);
    const valid = Object.entries(descriptors).every(
      ([key, descriptor]) =>
        (Array.isArray(entry) && key === 'length') ||
        ('value' in descriptor && descriptor.enumerable && visit(descriptor.value, depth + 1)),
    );
    active.delete(entry);
    return valid;
  }
  try {
    return (
      visit(value, 0) && new TextEncoder().encode(JSON.stringify(value)).byteLength <= maxBytes
    );
  } catch {
    return false;
  }
}
