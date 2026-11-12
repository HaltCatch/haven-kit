import { InjectionToken, reflectComponentType } from '@angular/core';
import type { Provider, Type } from '@angular/core';
import {
  isTableRendererId,
  tableBuiltinFilterIds,
  validBuiltinFilterParams,
  validBuiltinFilterValue,
  isChoiceOptions,
} from '@haven/schema';
import type { DataSchema, JsonObject, JsonValue } from '@haven/schema';
import type {
  HavenTableCellContext,
  HavenTableCellObject,
  HavenTableCellValue,
} from './cell-renderers';
import { HavenTableBuiltinFilter } from './filter-builtin';
export interface HavenTableFilterContext {
  readonly columnId: string;
  readonly filterId: string;
  readonly label: string;
  readonly params: HavenTableCellObject;
  readonly locale: string;
  readonly theme: HavenTableCellContext['theme'];
  readonly disabled: boolean;
  /** Reports incomplete native inputs; this draft must not be applied until corrected. */
  readonly parseError: (key: string, invalid: boolean) => void;
}
export interface HavenTableFilterMatchContext extends HavenTableCellContext {
  readonly filterValue: HavenTableCellValue;
}
export interface HavenTableFilterRegistration {
  readonly component: Type<unknown>;
  readonly valueSchema: (params: Readonly<JsonObject>) => DataSchema;
  readonly initialValue: (params: Readonly<JsonObject>) => JsonValue;
  readonly accepts: (value: JsonValue, params: Readonly<JsonObject>) => boolean;
  readonly validateParams?: (params: Readonly<JsonObject>) => boolean;
  /** Optional only for a server-only registration. This predicate never filters remote windows. */
  readonly matches?: (context: HavenTableFilterMatchContext) => boolean;
}
export type HavenTableFilters = ReadonlyMap<string, HavenTableFilterRegistration>;
export function createHavenTableFilters(
  entries: Iterable<readonly [string, HavenTableFilterRegistration]> = [],
): HavenTableFilters {
  const registry = new Map<string, HavenTableFilterRegistration>();
  for (const id of tableBuiltinFilterIds)
    registry.set(
      id,
      Object.freeze({
        component: HavenTableBuiltinFilter,
        valueSchema: (params: Readonly<JsonObject>): DataSchema =>
          id === 'number-range' || id === 'date-range'
            ? {
                type: 'object',
                properties: {
                  min: { type: id === 'number-range' ? 'number' : 'string' },
                  max: { type: id === 'number-range' ? 'number' : 'string' },
                },
              }
            : id === 'boolean'
              ? { type: 'boolean' }
              : id === 'select'
                ? {
                    enum: isChoiceOptions(params['options'])
                      ? params['options'].map((option) => option.value)
                      : [],
                  }
                : {
                    type: 'string',
                    ...(id === 'text' ? { maxLength: 2000 } : { enum: ['empty', 'not-empty'] }),
                  },
        initialValue: (params: Readonly<JsonObject>): JsonValue =>
          id === 'number-range' || id === 'date-range'
            ? { min: null, max: null }
            : id === 'boolean'
              ? false
              : id === 'empty'
                ? 'empty'
                : id === 'select'
                  ? isChoiceOptions(params['options'])
                    ? (params['options'].find((option) => !option.disabled)?.value ?? null)
                    : null
                  : '',
        accepts: (value: JsonValue, params: Readonly<JsonObject>) =>
          validBuiltinFilterValue(id, value, params),
        validateParams: (params: Readonly<JsonObject>) => validBuiltinFilterParams(id, params),
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
      !['valueSchema', 'initialValue', 'accepts'].every(
        (key) => typeof entry[key as keyof HavenTableFilterRegistration] === 'function',
      )
    )
      throw new Error(`Invalid or duplicate table filter: ${id}`);
    registry.set(id, Object.freeze({ ...entry }));
  }
  const result: HavenTableFilters = Object.freeze({
    get size() {
      return registry.size;
    },
    get: (id: string) => registry.get(id),
    has: (id: string) => registry.has(id),
    entries: () => registry.entries(),
    keys: () => registry.keys(),
    values: () => registry.values(),
    forEach: (
      callback: (value: HavenTableFilterRegistration, key: string, map: HavenTableFilters) => void,
      thisArg?: unknown,
    ) => registry.forEach((value, key) => callback.call(thisArg, value, key, result)),
    [Symbol.iterator]: () => registry[Symbol.iterator](),
  });
  return result;
}
export const HAVEN_TABLE_FILTERS = new InjectionToken<HavenTableFilters>('Haven table filters', {
  providedIn: 'root',
  factory: () => createHavenTableFilters(),
});
export function provideHavenTableFilters(
  entries: Iterable<readonly [string, HavenTableFilterRegistration]>,
): Provider {
  return { provide: HAVEN_TABLE_FILTERS, useValue: createHavenTableFilters(entries) };
}
