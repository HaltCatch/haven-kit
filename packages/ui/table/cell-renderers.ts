import { InjectionToken, reflectComponentType } from '@angular/core';
import type { Provider, Type } from '@angular/core';
import { isTableRendererId } from '@haven/schema';
import type { HavenTheme, JsonPrimitive, TableRowKey } from '@haven/schema';

export type HavenTableCellValue =
  JsonPrimitive | readonly HavenTableCellValue[] | HavenTableCellObject;
export type HavenTableCellObject = { readonly [key: string]: HavenTableCellValue };
export type HavenTableCellContext = Readonly<{
  rowKey: TableRowKey;
  row: HavenTableCellObject;
  columnId: string;
  value: HavenTableCellValue | undefined;
  params: HavenTableCellObject;
  locale: string;
  theme:
    | (Readonly<Omit<HavenTheme, 'tokens'>> & {
        readonly tokens?: Readonly<Record<string, string>>;
      })
    | null;
  disabled: boolean;
  readonly: boolean;
}>;
/** Normal standalone components must expose an Angular input named `context`. */
export type HavenTableCellRenderers = ReadonlyMap<string, Type<unknown>>;

export function createHavenTableCellRenderers(
  entries: Iterable<readonly [string, Type<unknown>]>,
): HavenTableCellRenderers {
  const components = new Map<string, Type<unknown>>();
  for (const [id, component] of entries) {
    if (!isTableRendererId(id)) throw new Error(`Invalid table cell renderer ID: ${id}`);
    if (components.has(id)) throw new Error(`Duplicate table cell renderer: ${id}`);
    const mirror = reflectComponentType(component);
    if (!mirror?.isStandalone || !mirror.inputs.some((input) => input.templateName === 'context'))
      throw new Error(
        `Table cell renderer ${id} must be a standalone component with a context input`,
      );
    components.set(id, component);
  }
  // The backing map is not exposed: callers cannot mutate registrations shared by DI.
  const registry: HavenTableCellRenderers = Object.freeze({
    get size() {
      return components.size;
    },
    get: (id: string) => components.get(id),
    has: (id: string) => components.has(id),
    entries: () => components.entries(),
    keys: () => components.keys(),
    values: () => components.values(),
    forEach: (
      callback: (
        value: Type<unknown>,
        key: string,
        map: ReadonlyMap<string, Type<unknown>>,
      ) => void,
      thisArg?: unknown,
    ) => {
      for (const [id, component] of components) callback.call(thisArg, component, id, registry);
    },
    [Symbol.iterator]: () => components[Symbol.iterator](),
  } satisfies HavenTableCellRenderers);
  return registry;
}
export const HAVEN_TABLE_CELL_RENDERERS = new InjectionToken<HavenTableCellRenderers>(
  'Haven table cell renderers',
  {
    providedIn: 'root',
    factory: () => createHavenTableCellRenderers([]),
  },
);
export function provideHavenTableCellRenderers(renderers: HavenTableCellRenderers): Provider {
  return {
    provide: HAVEN_TABLE_CELL_RENDERERS,
    useValue: createHavenTableCellRenderers(renderers),
  };
}
