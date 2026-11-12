import { isChoiceOptions } from './options.js';
import { isTableRendererId, isTableRendererParams } from './table.js';
import { validateTemporalValue } from './temporal.js';
import type { JsonObject, JsonValue } from './types.js';
import type { TableColumn } from './table.js';
/** Stable host registration ID; JSON contains configuration, never predicates or code. */
export interface TableFilterRef {
  readonly id: string;
  readonly params?: JsonObject;
}
export interface TableColumnFilterValue {
  readonly columnId: string;
  readonly value: JsonValue;
}
export const tableBuiltinFilterIds = [
  'text',
  'number-range',
  'date-range',
  'select',
  'boolean',
  'empty',
] as const;
export function isTableFilterRef(value: unknown): value is TableFilterRef {
  if (!isTableRendererParams(value)) return false;
  const entry = value as Record<string, unknown>;
  return (
    Object.keys(entry).every((key) => key === 'id' || key === 'params') &&
    isTableRendererId(entry['id']) &&
    (entry['params'] === undefined || isTableRendererParams(entry['params'])) &&
    validBuiltinFilterParams(entry['id'], entry['params'] as JsonObject | undefined)
  );
}
export function validBuiltinFilterParams(id: string, params: JsonObject = {}): boolean {
  if (id === 'select')
    return (
      Object.keys(params).every((key) => key === 'options') && isChoiceOptions(params['options'])
    );
  return (
    !tableBuiltinFilterIds.some((builtin) => builtin === id) || Object.keys(params).length === 0
  );
}
export function validBuiltinFilterValue(
  id: string,
  value: unknown,
  params: JsonObject = {},
): boolean {
  if (id === 'text') return typeof value === 'string' && value.length <= 2000;
  if (id === 'boolean') return typeof value === 'boolean';
  if (id === 'empty') return value === 'empty' || value === 'not-empty';
  if (id === 'select')
    return (
      isChoiceOptions(params['options']) &&
      params['options'].some((option) => option.value === value)
    );
  if (id !== 'number-range' && id !== 'date-range') return true;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const range = value as Record<string, unknown>;
  if (
    Object.keys(range).length !== 2 ||
    !Object.hasOwn(range, 'min') ||
    !Object.hasOwn(range, 'max')
  )
    return false;
  const valid = (bound: unknown) =>
    bound === null ||
    (id === 'number-range'
      ? typeof bound === 'number' && Number.isFinite(bound)
      : typeof bound === 'string' &&
        bound !== '' &&
        validateTemporalValue('date', bound) === undefined);
  if (!valid(range['min']) || !valid(range['max'])) return false;
  return (
    range['min'] === null ||
    range['max'] === null ||
    (range['min'] as number | string) <= (range['max'] as number | string)
  );
}
/** Complete applied state, unique typed column IDs and bounded JSON values, never sparse arrays. */
export function isTableColumnFilters(
  value: unknown,
  columns?: readonly TableColumn[],
): value is readonly TableColumnFilterValue[] {
  if (
    !Array.isArray(value) ||
    value.length > 100 ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    Object.getOwnPropertySymbols(value).length ||
    Object.keys(value).length !== value.length
  )
    return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Object.entries(descriptors).some(
      ([key, descriptor]) =>
        key !== 'length' &&
        (!/^(0|[1-9][0-9]*)$/.test(key) ||
          Number(key) >= value.length ||
          !('value' in descriptor) ||
          !descriptor.enumerable),
    )
  )
    return false;
  const ids = new Set<string>();
  return Array.from(value).every((entry: unknown) => {
    if (!isTableRendererParams(entry)) return false;
    const item = entry as Record<string, unknown>,
      id = item['columnId'];
    if (
      Object.keys(item).length !== 2 ||
      !Object.hasOwn(item, 'value') ||
      !isTableRendererId(id) ||
      ids.has(id) ||
      !isTableRendererParams({ value: item['value'] })
    )
      return false;
    ids.add(id);
    if (!columns) return true;
    const definition = columns.find((column) => column.id === id)?.filter;
    return !!definition && validBuiltinFilterValue(definition.id, item['value'], definition.params);
  });
}
