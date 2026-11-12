import { InjectionToken, reflectComponentType } from '@angular/core';
import type { Provider, Type } from '@angular/core';
import { isTableRendererId, isChoiceOptions, schemaAtPointer } from '@haven/schema';
import type { DataSchema, TableColumn, JsonObject } from '@haven/schema';
import type { HavenTableCellContext } from './cell-renderers';
import { HavenTableBuiltinEditor } from './builtin-editor';
export interface HavenTableEditorContext extends HavenTableCellContext {
  readonly editorId: string;
  readonly label: string;
  readonly schema: Readonly<DataSchema>;
}
export interface HavenTableEditorRegistration {
  readonly component: Type<unknown>;
  readonly valueTypes: readonly ('string' | 'number' | 'boolean')[];
  readonly validateParams?: (params: Readonly<JsonObject>) => boolean;
}
export type HavenTableEditors = ReadonlyMap<string, HavenTableEditorRegistration>;
const builtins = {
  text: ['string'],
  textarea: ['string'],
  number: ['number'],
  checkbox: ['boolean'],
  switch: ['boolean'],
  date: ['string'],
  time: ['string'],
  datetime: ['string'],
  select: ['string', 'number'],
  radio: ['string', 'number'],
} as const;
export function createHavenTableEditors(
  entries: Iterable<readonly [string, HavenTableEditorRegistration]> = [],
): HavenTableEditors {
  const registry = new Map<string, HavenTableEditorRegistration>();
  for (const [id, valueTypes] of Object.entries(builtins))
    registry.set(
      id,
      Object.freeze({
        component: HavenTableBuiltinEditor,
        valueTypes: Object.freeze([...valueTypes]),
      }),
    );
  for (const [id, entry] of entries) {
    const mirror = reflectComponentType(entry.component);
    if (
      !isTableRendererId(id) ||
      registry.has(id) ||
      !mirror?.isStandalone ||
      !['context', 'field'].every((name) =>
        mirror.inputs.some((input) => input.templateName === name),
      ) ||
      !entry.valueTypes.length ||
      entry.valueTypes.some((type) => !['string', 'number', 'boolean'].includes(type))
    )
      throw new Error(`Invalid or duplicate table editor: ${id}`);
    registry.set(id, Object.freeze({ ...entry, valueTypes: Object.freeze([...entry.valueTypes]) }));
  }
  // Expose only the ReadonlyMap operations; the backing registration map stays private.
  const result: HavenTableEditors = Object.freeze({
    get size() {
      return registry.size;
    },
    get: (id: string) => registry.get(id),
    has: (id: string) => registry.has(id),
    entries: () => registry.entries(),
    keys: () => registry.keys(),
    values: () => registry.values(),
    forEach: (
      callback: (value: HavenTableEditorRegistration, key: string, map: HavenTableEditors) => void,
      thisArg?: unknown,
    ) => registry.forEach((entry, id) => callback.call(thisArg, entry, id, result)),
    [Symbol.iterator]: () => registry[Symbol.iterator](),
  });
  return result;
}
export const HAVEN_TABLE_EDITORS = new InjectionToken<HavenTableEditors>('Haven table editors', {
  providedIn: 'root',
  factory: () => createHavenTableEditors(),
});
export function provideHavenTableEditors(
  entries: Iterable<readonly [string, HavenTableEditorRegistration]>,
): Provider {
  return { provide: HAVEN_TABLE_EDITORS, useValue: createHavenTableEditors(entries) };
}
export function tableEditorIssue(
  columns: readonly TableColumn[],
  schema: DataSchema,
  registry: HavenTableEditors,
): boolean {
  return columns.some((column) => {
    if (!column.editor) return false;
    const entry = registry.get(column.editor.id),
      definition = schemaAtPointer(schema, column.path),
      params = column.editor.params ?? {};
    if (!entry || !definition?.type || !entry.valueTypes.some((type) => type === definition.type))
      return true;
    if (entry.validateParams) {
      try {
        if (!entry.validateParams(params)) return true;
      } catch {
        return true;
      }
    }
    if (column.editor.id === 'select' || column.editor.id === 'radio')
      return (
        Object.keys(params).some((key) => key !== 'options') ||
        !isChoiceOptions(params['options']) ||
        params['options'].some((option) => typeof option.value !== definition.type)
      );
    return Object.hasOwn(builtins, column.editor.id) && Object.keys(params).length > 0;
  });
}
