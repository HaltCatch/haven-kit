import type { ValidationValue } from './validation-reference';
import { submitReadiness } from './submit-readiness';
import type { Resource } from '@angular/core';
import { resource } from '@angular/core';
import { metadata, validate, validateAsync } from '@angular/forms/signals';
import type { FieldContext, SchemaPath } from '@angular/forms/signals';
import type { AsyncValidation, JsonValue, ValidationRef } from '@haven/schema';
import { isValidationResult, validationSnapshot } from '@haven/runtime';
import type { ValidationAdapter } from '@haven/runtime';
import type { ValidationEnvironment } from './validation-plan';
import { bindValidationLifetime } from './validation-lifetime';
import { isEmptyValidationValue, validationPointer } from './cross-field-validation';
type Outcome = 'valid' | 'rejected' | 'input' | 'response';
export function registerAsyncValidation(
  target: SchemaPath<unknown>,
  rule: AsyncValidation,
  resolve: (ref: ValidationRef) => ValidationValue,
  sourceId: string,
  environment: ValidationEnvironment,
): void {
  const dependencies = Object.entries(rule.dependencies ?? {}).map(
    ([key, ref]) => [key, resolve(ref)] as const,
  );
  // Preserve the native resource parameter identity when only unrelated UI/data changed.
  // Weak field identities follow Angular repeat rows and do not retain removed form fields.
  type Params = {
    adapter: ValidationAdapter | undefined;
    value: unknown;
    dependencies: Record<string, unknown>;
    fieldTree: object;
  };
  const inputs = new WeakMap<object, Params>();
  const resources = new WeakMap<
    object,
    Resource<{ params: Params; outcome: Outcome } | undefined>
  >();
  const enabled = (context: FieldContext<unknown>) =>
    environment.active(sourceId, validationPointer(context.pathKeys())) &&
    !isEmptyValidationValue(context.value()) &&
    dependencies.every(([, read]) => !isEmptyValidationValue(read(context)));
  const readParams = (context: FieldContext<unknown>): Params => {
    const { value, fieldTree } = context;
    const next: Params = {
      adapter: environment.adapter(rule.resource),
      value: value(),
      dependencies: Object.fromEntries(dependencies.map(([key, read]) => [key, read(context)])),
      fieldTree,
    };
    const previous = inputs.get(fieldTree);
    if (
      previous &&
      previous.adapter === next.adapter &&
      Object.is(previous.value, next.value) &&
      dependencies.every(([key]) => Object.is(previous.dependencies[key], next.dependencies[key]))
    )
      return previous;
    inputs.set(fieldTree, next);
    return next;
  };
  metadata(target, submitReadiness, (context) => () => {
    if (!enabled(context)) return true;
    const result = resources.get(context.fieldTree);
    return !!result?.hasValue() && result.value().params === readParams(context);
  });
  validate(target, ({ pathKeys }) =>
    environment.active(sourceId, validationPointer(pathKeys())) &&
    !environment.adapter(rule.resource)
      ? { kind: 'validationUnconfigured' }
      : null,
  );
  validateAsync(target, {
    ...(rule.debounceMs === undefined ? {} : { debounce: rule.debounceMs }),
    when: enabled,
    params: readParams,
    factory: (params) => {
      const result = resource<{ params: Params; outcome: Outcome }, ReturnType<typeof params>>({
        params,
        loader: async ({ params, abortSignal }) => {
          resources.set(params.fieldTree, result);
          const completed = (outcome: Outcome) => ({ params, outcome });
          if (!params.adapter) return completed('input');
          let value: JsonValue, dependencies: Record<string, JsonValue>;
          try {
            value = validationSnapshot(params.value);
            dependencies = validationSnapshot(params.dependencies) as Record<string, JsonValue>;
          } catch {
            return completed('input');
          }
          const response = await params.adapter.validate(
            Object.freeze({ value, dependencies, signal: abortSignal }),
          );
          if (!isValidationResult(response)) return completed('response');
          return completed(response.valid ? 'valid' : 'rejected');
        },
      });
      bindValidationLifetime(result, environment.owner);
      return result;
    },
    onSuccess: (result, context) => {
      if (!enabled(context)) return null;
      if (result.params !== readParams(context)) return { kind: 'validationStale' };
      return result.outcome === 'valid'
        ? null
        : result.outcome === 'rejected'
          ? { kind: 'validationRule', ruleId: rule.id, caption: rule.message }
          : { kind: result.outcome === 'input' ? 'validationInput' : 'validationResponse' };
    },
    onError: () => ({ kind: 'validationUnavailable' }),
  });
}
