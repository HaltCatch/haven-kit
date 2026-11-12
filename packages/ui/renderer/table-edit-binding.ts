import { projectTableRows } from './table-data-projection';
import type { EnvironmentInjector } from '@angular/core';
import { fieldAt } from '@haven/ui/form-state';
import { createHavenLocalTableEditHandler } from '@haven/ui/table';
import type { TableEditHandler } from '@haven/runtime';
import type { DataSchema, JsonObject, TableColumn, UiNode } from '@haven/schema';
import type { HavenRenderer } from './renderer';
/** Native array fields provide the atomic local write; a table does not own a second root model. */
export function bindTableEdits(
  renderer: HavenRenderer,
  currentNode: () => UiNode,
  owner: () => string,
  injector: EnvironmentInjector,
  schema: DataSchema,
  columns: readonly TableColumn[],
  rowKey: string,
): TableEditHandler {
  const identity = owner();
  const field = () => {
    const tree = renderer.fields();
    return tree && fieldAt(tree, currentNode().bind ?? '');
  };
  const active = () => {
    const state = renderer.states().get(currentNode().id);
    return (
      owner() === identity &&
      !!state?.visible &&
      !state.disabled &&
      !state.readonly &&
      renderer.validation().valid
    );
  };
  const handler = createHavenLocalTableEditHandler({
    injector,
    schema,
    columns,
    rowKey,
    active,
    rows: () => field()?.().value() as JsonObject[],
    replace: (expected, next) => {
      const target = field();
      if (!active() || !target || target().value() !== expected) return false;
      target().value.set([...next]);
      target().markAsDirty();
      target().markAsTouched();
      return true;
    },
  });
  return {
    commit: (request, signal) => {
      // Recheck current native data before prepareTableEdit reads or spreads it.
      // Validation does not replace the native reference used by compare-and-set.
      if (projectTableRows(field()?.().value()) === null)
        return Promise.resolve({ status: 'error', code: 'rows' });
      return handler.commit(request, signal);
    },
  };
}
