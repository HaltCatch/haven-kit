import { signal } from '@angular/core';
import type { EnvironmentInjector } from '@angular/core';
import { submitValidated } from '@haven/ui/form-state';
import { prepareTableEdit, isTableRowShape } from '@haven/runtime';
import type { TableEditHandler, TableEditResult } from '@haven/runtime';
import type { DataSchema, JsonObject, TableColumn } from '@haven/schema';
import { createTableEditForm } from './edit-form';
export interface HavenLocalTableEdits {
  readonly injector: EnvironmentInjector;
  readonly schema: DataSchema;
  readonly columns: readonly TableColumn[];
  readonly rowKey: string;
  readonly rows: () => readonly JsonObject[];
  /** Synchronous atomic compare-and-set; never overwrite a newer parent array. */
  readonly replace: (expected: readonly JsonObject[], next: readonly JsonObject[]) => boolean;
  readonly active: () => boolean;
}
/** Same native schema compiler validates the latest merged candidate; no parallel validator engine. */
export function createHavenLocalTableEditHandler(host: HavenLocalTableEdits): TableEditHandler {
  return {
    commit: async (request, signal) => {
      if (signal.aborted || !host.active()) return { status: 'error', code: 'cancelled' };
      const rows = host.rows(),
        candidate = prepareTableEdit(rows, host.columns, host.rowKey, request);
      if (candidate.status !== 'candidate') return candidate;
      if (!isTableRowShape(host.schema, candidate.row)) return { status: 'invalid', errors: [] };
      const native = createTableEditForm(
        host.injector,
        host.schema,
        candidate.row,
        host.columns,
        signalFalse,
      );
      let result: TableEditResult = { status: 'invalid', errors: [] };
      try {
        await submitValidated(native.tree, {
          action: async () => {
            if (signal.aborted || !host.active()) {
              result = { status: 'error', code: 'cancelled' };
              return;
            }
            const next = rows.map((row, index) =>
              index === candidate.index ? candidate.row : row,
            );
            result = host.replace(rows, next)
              ? { status: 'applied', row: structuredClone(candidate.row) }
              : { status: 'conflict' };
          },
        });
        return result;
      } finally {
        native.destroy();
      }
    },
  };
}
const signalFalse = signal(false).asReadonly();
