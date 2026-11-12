import type { LocalizedText } from './localization.js';
/** References are data-only. Item means the nearest repeat row; events are not validation data. */
export interface ValidationRef {
  path: string;
  scope: 'root' | 'item';
}
interface ValidatorBase {
  id: string;
  message: string | LocalizedText;
}
export interface CompareValidation extends ValidatorBase {
  type: 'compare';
  operator: 'eq' | 'ne' | 'lt' | 'lte' | 'gt' | 'gte';
  other: ValidationRef;
}
export interface AsyncValidation extends ValidatorBase {
  type: 'async';
  resource: string;
  dependencies?: Record<string, ValidationRef>;
  debounceMs?: number;
}
export type FieldValidation = CompareValidation | AsyncValidation;
