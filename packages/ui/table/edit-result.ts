import { isTableRowShape } from '@haven/runtime';
import type { EnvironmentInjector } from '@angular/core';
import type { Signal } from '@angular/core';
import type { DataSchema, JsonObject, TableColumn } from '@haven/schema';
import { submitValidated } from '@haven/ui/form-state';
import { createTableEditForm } from './edit-form';
/** A canonical host response must satisfy the same native form contract as the submitted draft. */
export async function validTableEditResult(
  injector: EnvironmentInjector,
  schema: DataSchema,
  row: JsonObject,
  columns: readonly TableColumn[],
  disabled: Signal<boolean>,
): Promise<boolean> {
  if (!isTableRowShape(schema, row)) return false;
  const native = createTableEditForm(injector, schema, row, columns, disabled);
  try {
    return await submitValidated(native.tree, { action: async () => undefined });
  } finally {
    native.destroy();
  }
}
