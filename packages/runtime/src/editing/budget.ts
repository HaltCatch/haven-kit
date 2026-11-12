import { captureBoundedJson } from '@haven/schema/editing';
import type { Diagnostic, ValidationLimits } from '@haven/schema';

export class EditingBudgetError extends Error {
  constructor(readonly diagnostic: Diagnostic) {
    super(diagnostic.code);
  }
}
/** Each copy/write is checked before the next operation can amplify its result. */
export function checkEditingBudget(value: unknown, limits?: Partial<ValidationLimits>): void {
  const captured = captureBoundedJson(value, limits);
  if (!captured.ok) throw new EditingBudgetError(captured.diagnostic);
}
