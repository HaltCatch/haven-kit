import { isTableRowShape } from '@haven/runtime';
import { tableFormValue } from './edit-values';
import { createEnvironmentInjector, signal } from '@angular/core';
import type { EnvironmentInjector, Signal, WritableSignal } from '@angular/core';
import { form, validate } from '@angular/forms/signals';
import type { FieldTree } from '@angular/forms/signals';
import { formSchema } from '@haven/ui/form-state';
import type { FieldPolicy } from '@haven/ui/form-state';
import { isChoiceOptions } from '@haven/schema';
import type { DataSchema, JsonObject, TableColumn, TemporalKind } from '@haven/schema';
export function tableEditPolicy(
  columns: readonly TableColumn[],
  parse: ReadonlySet<string>,
  disabled = false,
): (pointer: string) => FieldPolicy {
  return (pointer) => {
    const column = columns.find((entry) => entry.path === pointer),
      id = column?.editor?.id,
      options = column?.editor?.params?.['options'];
    return {
      visible: true,
      disabled,
      readonly: false,
      required: false,
      parseInvalid: parse.has(pointer),
      ...(id && ['date', 'time', 'datetime'].includes(id)
        ? { temporal: [{ kind: id as TemporalKind }] }
        : {}),
      ...(isChoiceOptions(options) ? { optionSets: [options.map((option) => option.value)] } : {}),
    };
  };
}
/** One native form per active row, with a separately destroyable Angular injection lifetime. */
export function createTableEditForm(
  parent: EnvironmentInjector,
  schema: DataSchema,
  row: JsonObject,
  columns: readonly TableColumn[],
  disabled: Signal<boolean>,
) {
  const injector = createEnvironmentInjector([], parent),
    value = signal(tableFormValue(schema, structuredClone(row)) as JsonObject);
  const parse = signal<ReadonlySet<string>>(new Set());
  const owner: { tree?: FieldTree<Record<string, unknown>> } = {};
  const nativeSchema = formSchema(schema, (path) =>
    tableEditPolicy(columns, parse(), disabled() || !!owner.tree?.().submitting())(path),
  );
  const tree = form(
    value as WritableSignal<Record<string, unknown>>,
    (root) => {
      nativeSchema(root);
      // Check transport shape; native schema validators remain the single constraint source.
      validate(root, ({ value }) =>
        isTableRowShape(schema, value()) ? null : { kind: 'tableEditorValue' },
      );
    },
    { injector },
  );
  owner.tree = tree;
  return { tree, value, parse, destroy: () => injector.destroy() };
}
