import { readPointer, writePointer } from '@haven/schema';
import type { JsonObject, JsonPrimitive } from '@haven/schema';
import { sameTableValue, snapshotTableEdit, tablePriorValue } from '@haven/runtime';
import type { TableCellChange, TableEditRequest } from '@haven/runtime';
import type { HavenTableEditSession } from './edit-session';

/** Retrying an unchanged intent uses one transaction ID; a changed draft is a new intent. */
export function tableSessionRequest(
  current: HavenTableEditSession,
): TableEditRequest | 'scope' | 'unchanged' {
  const changes: TableCellChange[] = current.columns.flatMap((column) => {
    const value = readPointer(current.native.value(), column.path) as JsonPrimitive | undefined;
    return value === undefined || sameTableValue(value, readPointer(current.draftBase, column.path))
      ? []
      : [
          {
            columnId: column.id,
            path: column.path,
            before: tablePriorValue(current.base, column.path),
            value: structuredClone(value),
          },
        ];
  });
  const replay = changes.reduce(
    (row, change) => writePointer(row, change.path, change.value) as JsonObject,
    current.draftBase,
  );
  if (!sameTableValue(replay, current.native.value())) return 'scope';
  if (!changes.length) return 'unchanged';
  if (!current.request || !sameTableValue(current.request.changes, changes))
    current.request = snapshotTableEdit({
      transactionId: crypto.randomUUID(),
      rowKey: current.rowKey,
      changes,
    });
  return current.request;
}
