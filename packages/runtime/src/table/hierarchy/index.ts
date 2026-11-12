import { isTableHierarchy, isTablePointer, isTableRowKey, readPointer } from '@haven/schema';
import type { JsonObject, TableRowKey } from '@haven/schema';
import { snapshotJson } from '../../json-snapshot.js';
import { readonlyHierarchyMap } from './readonly-map.js';
import type { TableHierarchyEntry, TableHierarchyIssue, TableHierarchyResult } from './types.js';
export type * from './types.js';

interface Entry extends TableHierarchyEntry {
  readonly key: TableRowKey;
  depth: number;
}
const failure = (issue: TableHierarchyIssue): TableHierarchyResult =>
  Object.freeze({ status: 'error', issue: Object.freeze(issue) });

/** Index complete flat records for synchronous native getSubRows; no sorting, filtering or writes. */
export function buildTableHierarchy(
  rows: unknown,
  rowKey: unknown,
  hierarchy: unknown,
): TableHierarchyResult {
  try {
    if (
      !isTableHierarchy(hierarchy) ||
      !isTablePointer(rowKey) ||
      rowKey === hierarchy.parentPath ||
      rowKey.startsWith(hierarchy.parentPath + '/') ||
      hierarchy.parentPath.startsWith(rowKey + '/')
    )
      return failure({ code: 'configuration' });
    if (!Array.isArray(rows)) return failure({ code: 'rows' });
    if (rows.length > 5000) return failure({ code: 'limit' });
    let snapshot;
    try {
      snapshot = snapshotJson(rows);
    } catch {
      return failure({ code: 'json' });
    }
    if (!Array.isArray(snapshot)) return failure({ code: 'rows' });
    const entries = new Map<TableRowKey, Entry>(),
      original: JsonObject[] = [];
    for (const [index, value] of snapshot.entries()) {
      if (!value || typeof value !== 'object' || Array.isArray(value))
        return failure({ code: 'rows', row: index });
      const key = readPointer(value, rowKey);
      if (!isTableRowKey(key)) return failure({ code: 'rowKey', row: index, path: rowKey });
      if (entries.has(key)) return failure({ code: 'duplicateKey', row: index, key, path: rowKey });
      if (key === hierarchy.rootValue)
        return failure({ code: 'rootCollision', row: index, key, path: rowKey });
      const parent = readPointer(value, hierarchy.parentPath);
      if (parent !== hierarchy.rootValue && !isTableRowKey(parent))
        return failure({ code: 'parentKey', row: index, key, path: hierarchy.parentPath });
      // Transport validation already rejected array accessors, sparse entries and non-JSON rows.
      const row = Object.getOwnPropertyDescriptor(rows, String(index))!.value as JsonObject;
      original.push(row);
      entries.set(key, {
        row,
        key,
        index,
        parentKey: parent === hierarchy.rootValue ? null : (parent as TableRowKey),
        depth: -1,
      });
    }
    for (const entry of entries.values()) {
      if (entry.parentKey !== null && !entries.has(entry.parentKey))
        return failure({
          code: 'orphan',
          row: entry.index,
          key: entry.key,
          path: hierarchy.parentPath,
        });
    }
    // Walk parent chains iteratively, assigning each depth once. Disconnected cycles cannot hide.
    for (const start of entries.values()) {
      if (start.depth >= 0) continue;
      const path: Entry[] = [],
        active = new Set<TableRowKey>();
      let current = start,
        depth = -1;
      for (;;) {
        if (current.depth >= 0) {
          depth = current.depth;
          break;
        }
        if (active.has(current.key))
          return failure({
            code: 'cycle',
            row: current.index,
            key: current.key,
            path: hierarchy.parentPath,
          });
        active.add(current.key);
        path.push(current);
        if (current.parentKey === null) break;
        current = entries.get(current.parentKey)!;
      }
      for (const entry of path.reverse()) {
        if (++depth >= 32)
          return failure({
            code: 'depth',
            row: entry.index,
            key: entry.key,
            path: hierarchy.parentPath,
          });
        entry.depth = depth;
      }
    }
    const roots: JsonObject[] = [],
      children = new Map<TableRowKey, JsonObject[]>();
    for (const key of entries.keys()) children.set(key, []);
    for (const entry of entries.values()) {
      if (entry.parentKey === null) roots.push(entry.row);
      else children.get(entry.parentKey)!.push(entry.row);
    }
    return Object.freeze({
      status: 'ready',
      index: Object.freeze({
        rows: Object.freeze(original),
        roots: Object.freeze(roots),
        entries: readonlyHierarchyMap(
          new Map(
            [...entries].map(([key, entry]) => [
              key,
              Object.freeze({
                row: entry.row,
                index: entry.index,
                parentKey: entry.parentKey,
                depth: entry.depth,
              }),
            ]),
          ),
        ),
        children: readonlyHierarchyMap(
          new Map([...children].map(([key, value]) => [key, Object.freeze(value)])),
        ),
      }),
    });
  } catch {
    return failure({ code: 'json' });
  }
}
