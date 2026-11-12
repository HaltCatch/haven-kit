import jsonPatch from 'fast-json-patch';
import stringify from 'fast-json-stable-stringify';
import { pointerSegments } from '@haven/schema';
import type { EditingPatch } from '@haven/schema/editing';
import { HavenEditingError } from './errors.js';
import { EditingBudgetError } from './budget.js';
import { checkPatchPath } from './patch-path.js';

const nodeKeys = new Set(['props', 'bind', 'rules', 'events', 'validators']);
const documentKeys = new Set(['title', 'theme', 'dataSchema', 'actions', 'resources']);
/** RFC 6902 execution is upstream; this adapter limits the addressed Haven surface. */
export function patchTarget<T>(
  target: T,
  patch: EditingPatch[],
  scope: 'node' | 'document',
  afterWrite: () => void,
): T {
  const allowed = scope === 'node' ? nodeKeys : documentKeys;
  for (const operation of patch) {
    for (const path of [operation.path, ...('from' in operation ? [operation.from] : [])]) {
      let parts: string[];
      try {
        parts = pointerSegments(path);
      } catch {
        throw new HavenEditingError('editing.patchPath');
      }
      if (!parts.length || !allowed.has(parts[0]!))
        throw new HavenEditingError('editing.patchPath');
    }
  }
  try {
    for (const operation of patch) {
      const actual =
        operation.op === 'move'
          ? undefined
          : checkPatchPath(target, operation.path, ['add', 'copy'].includes(operation.op));
      const source =
        'from' in operation ? checkPatchPath(target, operation.from, false) : undefined;
      if (operation.op === 'test') {
        // The upstream equality calls value.hasOwnProperty(); valid JSON can shadow it.
        // Stable JSON comparison preserves RFC object-key and numeric equality without methods.
        if (stringify(actual) !== stringify(operation.value)) throw new Error('test');
      } else if (operation.op === 'move') {
        if (operation.path.startsWith(operation.from + '/')) throw new Error('move cycle');
        // RFC move is remove, then add. The upstream move clamps an out-of-range array index.
        target = jsonPatch.applyPatch(
          target,
          [{ op: 'remove', path: operation.from }],
          true,
          true,
          true,
        ).newDocument;
        afterWrite();
        checkPatchPath(target, operation.path, true);
        target = jsonPatch.applyPatch(
          target,
          [{ op: 'add', path: operation.path, value: source }],
          true,
          true,
          true,
        ).newDocument;
        afterWrite();
      } else {
        target = jsonPatch.applyPatch(target, [operation], true, true, true).newDocument;
        afterWrite();
      }
    }
    return target;
  } catch (error) {
    if (error instanceof EditingBudgetError) throw error;
    throw new HavenEditingError('editing.patch');
  }
}
export const compareDocuments = jsonPatch.compare;
