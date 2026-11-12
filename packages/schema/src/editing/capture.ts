import type {
  Diagnostic,
  HavenDocument,
  JsonValue,
  ValidationResult,
  ValidationLimits,
} from '../types.js';
import { defaultLimits, validateDocument } from '../validate.js';
import type { ValidationOptions } from '../validate.js';
import { guardDocumentJson } from '../validation/document-guard.js';
import validateBatch from '../generated/validate-editing.js';
import type { EditingBatch } from './types.js';

export type CapturedJson = { ok: true; value: JsonValue } | { ok: false; diagnostic: Diagnostic };
/** Physical JSON budgets only; successful capture is not a document/schema validation. */
export function captureBoundedJson(
  value: unknown,
  limits: Partial<ValidationLimits> = {},
): CapturedJson {
  return guardDocumentJson(value, { ...defaultLimits, ...limits });
}

export type CapturedDocument =
  | { ok: true; document: HavenDocument; validation: ValidationResult }
  | { ok: false; validation: ValidationResult };
/** Own the JSON snapshot before any consumer reads or clones it. Draft semantic errors survive. */
export function captureDocument(value: unknown, options: ValidationOptions = {}): CapturedDocument {
  const captured = guardDocumentJson(value, { ...defaultLimits, ...options.limits });
  if (!captured.ok)
    return {
      ok: false,
      validation: {
        structural: false,
        valid: false,
        diagnostics: [captured.diagnostic],
        capabilities: [],
      },
    };
  // JSON transport has tree semantics; shared acyclic host references must not alias edits.
  const document = JSON.parse(JSON.stringify(captured.value)) as HavenDocument;
  const validation = validateDocument(document, options);
  return validation.structural ? { ok: true, document, validation } : { ok: false, validation };
}
export type CapturedEditingBatch =
  { ok: true; batch: EditingBatch } | { ok: false; diagnostics: Diagnostic[] };
/** Envelope depth includes commands and does not reduce the document's existing depth budget. */
export function captureEditingBatch(value: unknown): CapturedEditingBatch {
  const captured = guardDocumentJson(value, { ...defaultLimits, maxDepth: 64 });
  if (!captured.ok) return { ok: false, diagnostics: [captured.diagnostic] };
  if (!validateBatch(captured.value))
    return {
      ok: false,
      diagnostics: (validateBatch.errors ?? []).slice(0, 100).map((error) => ({
        code: `editing.structure.${error.keyword}`,
        path: error.instancePath,
        message: error.message ?? 'Invalid editing batch',
      })),
    };
  const batch = JSON.parse(JSON.stringify(captured.value)) as EditingBatch;
  if (
    batch.commands.reduce(
      (count, command) => count + ('patch' in command ? command.patch.length : 0),
      0,
    ) > 512
  )
    return {
      ok: false,
      diagnostics: [
        { code: 'editing.limit', path: '/commands', message: 'Too many patch operations' },
      ],
    };
  return { ok: true, batch };
}
