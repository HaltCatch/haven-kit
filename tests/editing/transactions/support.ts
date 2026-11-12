import type { EditingBatch, EditingCommand } from '@haven/schema/editing';
import type { EditingState } from '@haven/runtime/editing';
import { empty } from '../primitives/support.js';

export function state(): EditingState {
  return { document: empty(), sessionId: 'session-1', editRevision: 7 };
}
export function batch(commands: EditingCommand[], source = state()): EditingBatch {
  return {
    protocolVersion: '1.0',
    operationId: 'operation-1',
    expected: {
      documentId: source.document.id,
      sessionId: source.sessionId,
      editRevision: source.editRevision,
    },
    commands,
  };
}
