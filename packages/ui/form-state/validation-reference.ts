import type { FieldContext, SchemaPath } from '@angular/forms/signals';
import { pointerSegments } from '@haven/schema';
export type ValidationValue = (context: FieldContext<unknown>) => unknown;
/** Optional/missing rows have no FieldTree. Resolve existence before native valueOf can throw. */
export function validationReference(scope: SchemaPath<unknown>, pointer: string): ValidationValue {
  const segments = pointerSegments(pointer);
  let path = scope;
  for (const segment of segments)
    path = (path as unknown as Record<string, SchemaPath<unknown>>)[segment]!;
  return (context) => {
    let field: unknown = context.fieldTreeOf(scope);
    for (const segment of segments) {
      if (typeof field !== 'function') return undefined;
      field = (field as unknown as Record<string, unknown>)[segment];
    }
    return typeof field === 'function' ? context.valueOf(path) : undefined;
  };
}
