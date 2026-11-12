import { validationReference } from './validation-reference';
import { applyValidationTarget } from './validation-target';
import { applyEach } from '@angular/forms/signals';
import type { SchemaPath } from '@angular/forms/signals';
import type { DestroyRef } from '@angular/core';
import type { DataSchema, FieldValidation } from '@haven/schema';
import { pointerSegments } from '@haven/schema';
import type { ValidationAdapter } from '@haven/runtime';
import { registerCrossField } from './cross-field-validation';
import { registerAsyncValidation } from './async-validation';
/** Neutral compiler input: no renderer instances, HTTP configuration or form state ownership. */
export interface ValidationScope {
  fields: readonly { sourceId: string; bind: string; rules: readonly FieldValidation[] }[];
  repeats: readonly { bind: string; scope: ValidationScope }[];
}
export interface ValidationEnvironment {
  owner: DestroyRef;
  active(sourceId: string, pointer: string): boolean;
  adapter(resource: string): ValidationAdapter | undefined;
}
export function schemaPathAt(root: SchemaPath<unknown>, pointer: string): SchemaPath<unknown> {
  let path = root;
  for (const segment of pointerSegments(pointer))
    path = (path as unknown as Record<string, SchemaPath<unknown>>)[segment]!;
  return path;
}
export function registerValidationPlan(
  root: SchemaPath<unknown>,
  plan: ValidationScope,
  environment: ValidationEnvironment,
  schema: DataSchema,
): void {
  const register = (
    scope: SchemaPath<unknown>,
    definition: DataSchema | undefined,
    current: ValidationScope,
    depth: number,
    inherited: ReadonlyMap<number, string>,
  ) => {
    for (const field of current.fields) {
      applyValidationTarget(
        scope,
        field.bind,
        definition,
        schema,
        depth,
        inherited,
        (path, _, indices) => {
          const scopedEnvironment: ValidationEnvironment = {
            ...environment,
            active: (source, pointer) => {
              const keys = pointerSegments(pointer);
              return (
                [...indices].every(([position, index]) => keys[position] === index) &&
                environment.active(source, pointer)
              );
            },
          };
          for (const rule of field.rules) {
            const resolve = (ref: { path: string; scope: 'root' | 'item' }) =>
              validationReference(ref.scope === 'item' ? scope : root, ref.path);
            if (rule.type === 'compare')
              registerCrossField(
                path,
                resolve(rule.other),
                rule,
                field.sourceId,
                scopedEnvironment,
              );
            else registerAsyncValidation(path, rule, resolve, field.sourceId, scopedEnvironment);
          }
        },
      );
    }
    for (const repeat of current.repeats)
      applyValidationTarget(
        scope,
        repeat.bind,
        definition,
        schema,
        depth,
        inherited,
        (path, array, indices) => {
          applyEach(path as SchemaPath<unknown[]>, (child) =>
            register(
              child as SchemaPath<unknown>,
              array?.items,
              repeat.scope,
              depth + pointerSegments(repeat.bind).length + 1,
              indices,
            ),
          );
        },
      );
  };
  register(root, schema, plan, 0, new Map());
}
