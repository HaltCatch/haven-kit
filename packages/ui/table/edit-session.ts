import { validTableEditResult } from './edit-result';
import { DestroyRef, EnvironmentInjector, computed, effect, inject, signal } from '@angular/core';
import type { Signal } from '@angular/core';
import { fieldAt, submitValidated } from '@haven/ui/form-state';
import {
  readPointer,
  tableRowId,
  validateTableData,
  tableHierarchyEditPathsValid,
} from '@haven/schema';
import type {
  DataSchema,
  JsonObject,
  TableColumn,
  TableRowKey,
  TableHierarchy,
} from '@haven/schema';
import { copyTableEditResult, tableEditPathsValid } from '@haven/runtime';
import type { TableEditHandler, TableEditRequest } from '@haven/runtime';
import { createTableEditForm } from './edit-form';
import { tableSessionRequest } from './edit-request';
import { tableEditorIssue } from './editors';
import type { HavenTableEditors } from './editors';
interface Inputs {
  owner: Signal<string>;
  rows(): readonly JsonObject[];
  columns: Signal<readonly TableColumn[]>;
  rowKey: Signal<string>;
  schema: Signal<DataSchema | undefined>;
  mode: Signal<'cell' | 'row' | undefined>;
  hierarchy(): TableHierarchy | undefined;
  remote: () => boolean;
  scope(): unknown;
  available(): boolean;
  active(): boolean;
  disabled: Signal<boolean>;
  readonly: Signal<boolean>;
  handler(): TableEditHandler | undefined;
  registry: Signal<HavenTableEditors>;
  committed(value: { rowKey: TableRowKey; row: JsonObject }): void;
  cancelled(reason: string): void;
}
export interface HavenTableEditSession {
  id: string;
  rowKey: TableRowKey;
  base: JsonObject;
  draftBase: JsonObject;
  columns: readonly TableColumn[];
  native: ReturnType<typeof createTableEditForm>;
  abort: AbortController;
  identity: string;
  handler: TableEditHandler;
  scope: unknown;
  request?: TableEditRequest;
}

export function injectTableEditing(inputs: Inputs) {
  const parent = inject(EnvironmentInjector),
    destroy = inject(DestroyRef);
  const session = signal<HavenTableEditSession | null>(null),
    error = signal('');
  const identity = computed(() =>
    JSON.stringify([
      inputs.owner(),
      inputs.rowKey(),
      inputs.schema(),
      inputs.mode(),
      inputs.hierarchy(),
      inputs.columns().map((c) => [c.id, c.path, c.editor]),
    ]),
  );
  const problem = computed(() => {
    if (!inputs.mode()) return '';
    const schema = inputs.schema();
    if (schema?.type !== 'object') return 'schema';
    if (!tableEditPathsValid(inputs.columns(), inputs.rowKey())) return 'paths';
    if (!tableHierarchyEditPathsValid(inputs.columns(), inputs.rowKey(), inputs.hierarchy()))
      return 'hierarchyPaths';
    if (tableEditorIssue(inputs.columns(), schema, inputs.registry())) return 'editor';
    return inputs.handler() ? '' : 'handler';
  });
  const cancel = (reason = 'cancelled') => {
    const current = session();
    if (!current) return;
    session.set(null);
    current.abort.abort();
    current.native.destroy();
    error.set('');
    inputs.cancelled(reason);
  };
  destroy.onDestroy(() => cancel('owner'));
  effect(() => {
    const current = session();
    if (!current) return;
    if (
      current.identity !== identity() ||
      current.scope !== inputs.scope() ||
      !inputs.active() ||
      !inputs.available() ||
      inputs.disabled() ||
      inputs.readonly() ||
      problem() ||
      current.handler !== inputs.handler() ||
      !inputs.rows().some((row) => readPointer(row, inputs.rowKey()) === current.rowKey)
    )
      cancel('owner');
  });
  const begin = (row: JsonObject, columnIds: readonly string[]) => {
    if (
      session() ||
      problem() ||
      !inputs.mode() ||
      inputs.disabled() ||
      inputs.readonly() ||
      !inputs.active() ||
      !inputs.available()
    )
      return;
    const columns = inputs
      .columns()
      .filter((column) => column.editor && columnIds.includes(column.id));
    if (!columns.length || validateTableData(inputs.rows(), inputs.columns(), inputs.rowKey()))
      return;
    const base = structuredClone(row),
      key = readPointer(row, inputs.rowKey()) as TableRowKey;
    error.set('');
    const native = createTableEditForm(
      parent,
      inputs.schema()!,
      row,
      inputs.columns(),
      inputs.disabled,
    );
    session.set({
      id: tableRowId(row, inputs.rowKey()),
      rowKey: key,
      base,
      draftBase: structuredClone(native.value()),
      columns,
      native,
      abort: new AbortController(),
      identity: identity(),
      handler: inputs.handler()!,
      scope: inputs.scope(),
    });
  };
  const currentSession = (current: HavenTableEditSession) =>
    session() === current &&
    !current.abort.signal.aborted &&
    current.identity === identity() &&
    current.scope === inputs.scope() &&
    inputs.active() &&
    inputs.available() &&
    current.handler === inputs.handler() &&
    !inputs.disabled() &&
    !inputs.readonly() &&
    !problem() &&
    inputs.rows().some((row) => readPointer(row, inputs.rowKey()) === current.rowKey);
  const save = async () => {
    const current = session();
    if (!current || current.native.tree().submitting() || !currentSession(current)) return;
    error.set('');
    try {
      const accepted = await submitValidated(current.native.tree, {
        action: async () => {
          if (!currentSession(current)) return;
          const request = tableSessionRequest(current);
          if (request === 'scope') {
            error.set('scope');
            return;
          }
          if (request === 'unchanged') {
            cancel('unchanged');
            return;
          }
          if (!currentSession(current)) return;
          const response = await current.handler.commit(request, current.abort.signal);
          if (!currentSession(current)) return;
          let result;
          try {
            result = copyTableEditResult(response);
          } catch {
            error.set('response');
            return;
          }
          if (result.status === 'applied') {
            if (
              validateTableData([result.row], inputs.columns(), inputs.rowKey()) ||
              readPointer(result.row, inputs.rowKey()) !== current.rowKey
            ) {
              error.set('response');
              return;
            }
            const valid = await validTableEditResult(
              parent,
              inputs.schema()!,
              result.row,
              inputs.columns(),
              inputs.disabled,
            );
            if (!currentSession(current)) return;
            if (!valid) {
              error.set('response');
              return;
            }
            if (!currentSession(current)) return;
            cancel('committed');
            // Cancellation/focus callbacks can synchronously replace the owner or its permissions.
            if (
              current.identity === identity() &&
              current.scope === inputs.scope() &&
              current.handler === inputs.handler() &&
              !session() &&
              inputs.active() &&
              inputs.available() &&
              !inputs.disabled() &&
              !inputs.readonly() &&
              !problem()
            )
              inputs.committed({ rowKey: current.rowKey, row: structuredClone(result.row) });
          } else {
            error.set(
              result.status === 'conflict'
                ? 'conflict'
                : result.status === 'invalid'
                  ? 'invalid'
                  : 'failed',
            );
            if (result.status === 'invalid')
              return result.errors.flatMap((entry) => {
                const field = current.columns.some((column) => column.path === entry.path)
                  ? fieldAt(current.native.tree, entry.path)
                  : undefined;
                return field ? [{ kind: entry.code, fieldTree: field }] : [];
              });
          }
        },
      });
      if (!accepted && currentSession(current)) {
        error.set(current.native.tree().pending() ? 'pending' : 'invalid');
        current.native.tree().errorSummary()[0]?.fieldTree().focusBoundControl();
      }
    } catch {
      if (currentSession(current)) error.set(inputs.remote() ? 'uncertain' : 'failed');
    }
  };
  return {
    session,
    error,
    problem,
    begin,
    save,
    cancel,
    current: () => {
      const value = session();
      return !!value && currentSession(value);
    },
  };
}
