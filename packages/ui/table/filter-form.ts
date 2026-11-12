import { createEnvironmentInjector, signal } from '@angular/core';
import type { EnvironmentInjector, Signal } from '@angular/core';
import { form, validate } from '@angular/forms/signals';
import { formSchema } from '@haven/ui/form-state';
import { isTableRendererParams } from '@haven/schema';
import type { JsonObject, JsonValue } from '@haven/schema';
import { isTableRowShape } from '@haven/runtime';
import { tableFormValue } from './edit-values';
import type { HavenTableFilterRegistration } from './filters';
/** Internal native identities are not JSON. Reject unsafe data before cloning string properties. */
export function captureFilterValue(value: unknown): { value: JsonValue } | undefined {
  if (!isTableRowShape({ type: 'object' }, { value })) return undefined;
  const copy = structuredClone({ value });
  return isTableRendererParams(copy) ? (copy as { value: JsonValue }) : undefined;
}
export function createTableFilterForm(
  parent: EnvironmentInjector,
  registration: HavenTableFilterRegistration,
  params: Readonly<JsonObject>,
  applied: JsonValue | undefined,
  disabled: Signal<boolean>,
) {
  const injector = createEnvironmentInjector([], parent),
    parse = signal<ReadonlySet<string>>(new Set());
  try {
    const definition = registration.valueSchema(params);
    const schema = { type: 'object' as const, properties: { value: definition } };
    const initial = applied === undefined ? registration.initialValue(params) : applied;
    const value = signal(
      tableFormValue(schema, { value: structuredClone(initial) }) as Record<string, unknown>,
    );
    const nativeSchema = formSchema(schema, () => ({
      visible: true,
      disabled: disabled(),
      readonly: false,
      required: false,
    }));
    const tree = form(
      value,
      (root) => {
        nativeSchema(root);
        validate(root, ({ value }) => {
          const snapshot = captureFilterValue(value()['value']);
          if (!snapshot || parse().size) return { kind: 'tableFilter' };
          try {
            return registration.accepts(snapshot.value, params) === true
              ? null
              : { kind: 'tableFilter' };
          } catch {
            return { kind: 'tableFilter' };
          }
        });
      },
      { injector },
    );
    return { tree, value, parse, destroy: () => injector.destroy() };
  } catch (error) {
    injector.destroy();
    throw error;
  }
}
