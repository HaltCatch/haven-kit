import { validateDocument } from '@haven/schema';
import type { Diagnostic, HavenDocument, ValidationOptions, ValidationResult } from '@haven/schema';
import { captureDocument, captureEditingBatch } from '@haven/schema/editing';
import type { EditingPatch } from '@haven/schema/editing';
import { applyCommand } from './commands.js';
import { checkEditingBudget, EditingBudgetError } from './budget.js';
import { HavenEditingError } from './errors.js';
import { compareDocuments } from './patch.js';
import { flattenTree } from './tree.js';

export interface EditingState {
  readonly document: HavenDocument;
  readonly sessionId: string;
  readonly editRevision: number;
}
export type EditingResult =
  | {
      readonly ok: true;
      readonly document: HavenDocument;
      readonly editRevision: number;
      readonly operationId: string;
      readonly changes: EditingPatch[];
      readonly validation: ValidationResult;
    }
  | { readonly ok: false; readonly diagnostics: Diagnostic[]; readonly commandIndex?: number };
export interface EditingOptions extends ValidationOptions {
  /** Drafts may remain semantically incomplete; acceptance/publish callers request strict validity. */
  requireValid?: boolean;
}
const failure = (code: string, path: string, commandIndex?: number): EditingResult => ({
  ok: false,
  diagnostics: [{ code, path, message: code }],
  ...(commandIndex === undefined ? {} : { commandIndex }),
});
/** Synchronous staging, not persistence: the owner commits this result once and owns idempotency. */
export function applyEditingBatch(
  state: EditingState,
  input: unknown,
  options: EditingOptions = {},
): EditingResult {
  const captured = captureEditingBatch(input);
  if (!captured.ok) return captured;
  const baseline = captureDocument(state.document, options);
  if (
    !baseline.ok ||
    baseline.validation.diagnostics.some((item) => item.code.startsWith('limit.'))
  )
    return { ok: false, diagnostics: baseline.validation.diagnostics };
  const batch = structuredClone(captured.batch);
  if (
    batch.expected.documentId !== baseline.document.id ||
    batch.expected.sessionId !== state.sessionId ||
    batch.expected.editRevision !== state.editRevision
  )
    return failure('editing.conflict', '/expected');
  if (
    !Number.isSafeInteger(state.editRevision) ||
    state.editRevision < 0 ||
    state.editRevision >= Number.MAX_SAFE_INTEGER
  )
    return failure('editing.revision', '/expected/editRevision');
  const entries = flattenTree(baseline.document.ui);
  if (new Set(entries.map((entry) => entry.node.id)).size !== entries.length)
    return failure('editing.duplicateNode', '/ui');
  let stage = structuredClone(baseline.document);
  for (const [index, command] of batch.commands.entries()) {
    try {
      stage = applyCommand(stage, command, options.manifests, () =>
        checkEditingBudget(stage, options.limits),
      );
    } catch (error) {
      if (error instanceof EditingBudgetError)
        return { ok: false, diagnostics: [error.diagnostic], commandIndex: index };
      return failure(
        error instanceof HavenEditingError ? error.code : 'editing.command',
        `/commands/${index}`,
        index,
      );
    }
    // Bound intermediate growth as well as the final result; no partly valid state escapes.
    const validation = validateDocument(stage, options);
    if (
      !validation.structural ||
      validation.diagnostics.some((item) => item.code.startsWith('limit.'))
    )
      return { ok: false, diagnostics: validation.diagnostics, commandIndex: index };
  }
  const validation = validateDocument(stage, options);
  if (options.requireValid && !validation.valid)
    return { ok: false, diagnostics: validation.diagnostics };
  const changes = compareDocuments(baseline.document, stage) as EditingPatch[];
  return {
    ok: true,
    document: stage,
    editRevision: state.editRevision + (changes.length ? 1 : 0),
    operationId: batch.operationId,
    changes,
    validation,
  };
}
