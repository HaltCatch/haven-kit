import type { ValidationValue } from './validation-reference';
import { validate } from '@angular/forms/signals';
import type { SchemaPath } from '@angular/forms/signals';
import { escapePointer } from '@haven/schema';
import type { CompareValidation } from '@haven/schema';
import type { ValidationEnvironment } from './validation-plan';
export const isEmptyValidationValue = (value: unknown): boolean =>
  value === undefined || value === null || value === '';
export const validationPointer = (keys: readonly string[]): string =>
  keys.length ? '/' + keys.map(escapePointer).join('/') : '';
export function registerCrossField(
  target: SchemaPath<unknown>,
  other: ValidationValue,
  rule: CompareValidation,
  sourceId: string,
  environment: ValidationEnvironment,
): void {
  validate(target, (context) => {
    const { value, pathKeys } = context;
    if (!environment.active(sourceId, validationPointer(pathKeys()))) return null;
    const left = value(),
      right = other(context);
    if (isEmptyValidationValue(left) || isEmptyValidationValue(right)) return null;
    let valid = false;
    if (typeof left === typeof right && ['number', 'string', 'boolean'].includes(typeof left)) {
      if (rule.operator === 'eq') valid = left === right;
      else if (rule.operator === 'ne') valid = left !== right;
      else if (
        typeof left === 'number' &&
        typeof right === 'number' &&
        Number.isFinite(left) &&
        Number.isFinite(right)
      )
        switch (rule.operator) {
          case 'lt':
            valid = left < right;
            break;
          case 'lte':
            valid = left <= right;
            break;
          case 'gt':
            valid = left > right;
            break;
          case 'gte':
            valid = left >= right;
        }
    }
    return valid ? null : { kind: 'validationRule', ruleId: rule.id, caption: rule.message };
  });
}
