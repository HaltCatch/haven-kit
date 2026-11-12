import type { DataSchema, HavenDocument, JsonValue, UiNode } from '../types.js';

/** RFC 6902 operations. Tree identity and children are changed only by stable-ID commands. */
export type EditingPatch =
  | { op: 'add' | 'replace' | 'test'; path: string; value: JsonValue }
  | { op: 'remove'; path: string }
  | { op: 'move' | 'copy'; path: string; from: string };
export type EditingCommand =
  | {
      type: 'node.insert';
      parentId: string;
      beforeId: string | null;
      node: UiNode;
      defaults?: { schema?: DataSchema; resources?: HavenDocument['resources'] };
    }
  | { type: 'node.move'; nodeId: string; parentId: string; beforeId: string | null }
  | { type: 'node.remove'; nodeId: string }
  | { type: 'node.patch'; nodeId: string; patch: EditingPatch[] }
  | { type: 'document.patch'; patch: EditingPatch[] };
export interface EditingExpectation {
  documentId: string;
  sessionId: string;
  editRevision: number;
}
export interface EditingBatch {
  protocolVersion: '1.0';
  operationId: string;
  expected: EditingExpectation;
  commands: EditingCommand[];
}
