import type { ComponentManifest, HavenDocument, UiNode } from '@haven/schema';
import type { EditingCommand } from '@haven/schema/editing';
import { HavenEditingError } from './errors.js';
import { insertNode } from './insert.js';
import { patchTarget } from './patch.js';
import { flattenTree, moveNode, removeNode, updateNode } from './tree.js';

function find(document: HavenDocument, nodeId: string): UiNode {
  const node = flattenTree(document.ui).find((entry) => entry.node.id === nodeId)?.node;
  if (!node) throw new HavenEditingError('editing.missingNode');
  return node;
}
/** Input is an owned, validated envelope; mutations affect only a transaction's private stage. */
export function applyCommand(
  document: HavenDocument,
  command: EditingCommand,
  manifests: ReadonlyMap<string, ComponentManifest> | undefined,
  afterWrite: () => void,
): HavenDocument {
  switch (command.type) {
    case 'node.insert':
      return insertNode(
        document,
        command.parentId,
        command.beforeId,
        command.node,
        command.defaults,
        manifests,
      );
    case 'node.remove':
      find(document, command.nodeId);
      return removeNode(document, command.nodeId);
    case 'node.move': {
      find(document, command.nodeId);
      const parent = find(document, command.parentId);
      if (command.beforeId === command.nodeId) {
        if (!parent.children?.some((child) => child.id === command.nodeId))
          throw new HavenEditingError('editing.position');
        return document;
      }
      const children = (parent.children ?? []).filter((child) => child.id !== command.nodeId);
      const index =
        command.beforeId === null
          ? children.length
          : children.findIndex((child) => child.id === command.beforeId);
      if (index < 0) throw new HavenEditingError('editing.position');
      return moveNode(document, command.nodeId, command.parentId, index, manifests);
    }
    case 'node.patch': {
      find(document, command.nodeId);
      return updateNode(document, command.nodeId, (node) =>
        patchTarget(node, command.patch, 'node', afterWrite),
      );
    }
    case 'document.patch':
      return patchTarget(document, command.patch, 'document', afterWrite);
  }
}
