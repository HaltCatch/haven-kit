import { registerValidationPlan } from './validation-plan';
import { submitReadiness } from './submit-readiness';
import type { ValidationScope, ValidationEnvironment } from './validation-plan';
import { advancedFieldError } from './field-validation';
import type { AdvancedFieldPolicy } from './field-validation';
import {
  applyEach,
  disabled,
  hidden,
  max,
  maxLength,
  min,
  minLength,
  readonly,
  metadata,
  required,
  validate,
} from '@angular/forms/signals';
import type { HavenOptionResolution } from '@haven/ui/form';
import type { SchemaFn, SchemaPath } from '@angular/forms/signals';
import {
  escapePointer,
  resolveSchema,
  isMultiChoiceValue,
  validateTemporalValue,
} from '@haven/schema';
import type { DataSchema, TemporalKind, TemporalBounds } from '@haven/schema';

export interface FieldPolicy extends AdvancedFieldPolicy {
  visible: boolean;
  disabled: boolean;
  readonly: boolean;
  required: boolean;
  multiple?: boolean;
  remote?: readonly HavenOptionResolution[];
  parseInvalid?: boolean;
  uploadPending?: boolean;
  repeatInvalid?: boolean;
  renderLimit?: boolean;
  temporal?: readonly ({ kind: TemporalKind } & TemporalBounds)[];
  optionSets?: readonly (readonly (string | number)[])[];
}
/** Property paths are narrowed only after the validated schema has established their value type. */
export function formSchema(
  schema: DataSchema,
  policy: (pointer: string) => FieldPolicy,
  validation?: { plan: ValidationScope; environment: ValidationEnvironment; ready?: () => boolean },
): SchemaFn<Record<string, unknown>> {
  return (rootPath) => {
    const visit = (path: SchemaPath<unknown>, definition: DataSchema, mandatory = false) => {
      const node = resolveSchema(definition, schema);
      if (!node) return;
      const pointerOf = (keys: readonly string[]) =>
        keys.length ? '/' + keys.map(escapePointer).join('/') : '';
      hidden(path, { when: ({ pathKeys }) => !policy(pointerOf(pathKeys())).visible });
      disabled(path, { when: ({ pathKeys }) => policy(pointerOf(pathKeys())).disabled });
      readonly(path, { when: ({ pathKeys }) => policy(pointerOf(pathKeys())).readonly });
      required(path, {
        when: ({ pathKeys }) => mandatory || policy(pointerOf(pathKeys())).required,
      });
      if (node.type === 'object') {
        const objectPath = path as unknown as Record<string, SchemaPath<unknown>>;
        for (const [key, child] of Object.entries(node.properties ?? {}))
          visit(objectPath[key]!, child, node.required?.includes(key));
      }
      if (node.type === 'array' && node.items)
        applyEach(path as SchemaPath<unknown[]>, (item) =>
          visit(item as unknown as SchemaPath<unknown>, node.items!),
        );
      if (node.type === 'string') {
        const stringPath = path as SchemaPath<string>;
        if (node.minLength !== undefined) minLength(stringPath, node.minLength);
        if (node.maxLength !== undefined) maxLength(stringPath, node.maxLength);
      }
      if (node.type === 'number') {
        const numberPath = path as SchemaPath<number | null>;
        if (node.minimum !== undefined) min(numberPath, node.minimum);
        if (node.maximum !== undefined) max(numberPath, node.maximum);
      }
      validate(path, ({ value, pathKeys }) => {
        const current = value();
        const pointer = pointerOf(pathKeys());
        const state = policy(pointer);
        if (state.renderLimit) return { kind: 'renderLimit' };
        if (state.repeatInvalid) return { kind: 'repeat' };
        if (state.uploadPending) return { kind: 'uploadPending' };
        const advanced = advancedFieldError(current, state, mandatory || state.required);
        if (advanced) return advanced;
        if (node.type === 'array' && Array.isArray(current)) {
          if ((mandatory || state.required) && !current.length) return { kind: 'required' };
          if (node.minItems !== undefined && current.length < node.minItems)
            return { kind: 'minItems' };
          if (node.maxItems !== undefined && current.length > node.maxItems)
            return { kind: 'maxItems' };
        }
        if (state.trees?.length && current !== null && current !== '') {
          if (node.type === 'array') {
            const item = node.items && resolveSchema(node.items, schema);
            if (!Array.isArray(current) || current.some((key) => typeof key !== item?.type))
              return { kind: 'option' };
          } else if (typeof current !== node.type) return { kind: 'option' };
        }
        if (state.parseInvalid) return { kind: 'temporalFormat' };
        for (const temporal of state.temporal ?? []) {
          const issue = validateTemporalValue(temporal.kind, current, temporal);
          if (issue) return { kind: `temporal${issue[0]!.toUpperCase()}${issue.slice(1)}` };
        }
        if (state.multiple) {
          if (!isMultiChoiceValue(current)) return { kind: 'option' };
          if ((mandatory || state.required) && current.length === 0) return { kind: 'required' };
          const item = node.items && resolveSchema(node.items, schema);
          if (current.some((entry) => typeof entry !== item?.type)) return { kind: 'option' };
          if (node.minItems !== undefined && current.length < node.minItems)
            return { kind: 'minItems' };
          if (node.maxItems !== undefined && current.length > node.maxItems)
            return { kind: 'maxItems' };
        }
        for (const remote of state.remote ?? []) {
          const keys =
            current === null || current === '' ? [] : Array.isArray(current) ? current : [current];
          if (remote.failed) return { kind: 'optionsLoad' };
          if (
            remote.pending ||
            !remote.ready ||
            keys.length !== remote.keys.length ||
            keys.some((key, index) => key !== remote.keys[index])
          )
            return { kind: 'optionsPending' };
          if (keys.some((key) => !remote.options.some((option) => option.key === key)))
            return { kind: 'option' };
          const definition =
            state.multiple && node.items ? resolveSchema(node.items, schema) : node;
          if (keys.some((key) => typeof key !== definition?.type)) return { kind: 'option' };
        }
        if (current === null || current === '') return null;
        return policy(pointer).optionSets?.some((options) =>
          state.multiple && Array.isArray(current)
            ? current.some((entry) => !options.includes(entry))
            : !options.some((option) => option === current),
        )
          ? { kind: 'option' }
          : null;
      });
      if (node.enum)
        validate(path, ({ value }) =>
          value() === null ||
          value() === '' ||
          node.enum!.some((candidate) => candidate === value())
            ? null
            : { kind: 'enum' },
        );
    };
    visit(rootPath as unknown as SchemaPath<unknown>, schema);
    if (validation?.ready) metadata(rootPath, submitReadiness, () => validation.ready!);
    if (validation)
      registerValidationPlan(
        rootPath as SchemaPath<unknown>,
        validation.plan,
        validation.environment,
        schema,
      );
  };
}
