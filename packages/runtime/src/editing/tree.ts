import { coreManifests } from '@haven/schema';
import type { ComponentManifest, HavenDocument, UiNode } from '@haven/schema';
import { HavenEditingError } from './errors.js';
import { sameDataScope } from './scope.js';

export interface TreeEntry {
  node: UiNode;
  parentId: string | null;
  depth: number;
}
export function flattenTree(root: UiNode): TreeEntry[] {
  const entries: TreeEntry[] = [];
  const visit = (node: UiNode, parentId: string | null, depth: number) => {
    entries.push({ node, parentId, depth });
    for (const child of node.children ?? []) visit(child, node.id, depth + 1);
  };
  visit(root, null, 0);
  return entries;
}
export function isContainer(
  node: UiNode,
  manifests?: ReadonlyMap<string, ComponentManifest>,
): boolean {
  if (manifests) return manifests.get(`${node.kind}@${node.version}`)?.container === true;
  return coreManifests.some(
    (item) => item.kind === node.kind && item.version === node.version && item.container,
  );
}
/** Immutable primitive for validated documents; public JSON commands do not contain callbacks. */
export function updateNode(
  document: HavenDocument,
  id: string,
  update: (node: UiNode) => UiNode,
): HavenDocument {
  const visit = (node: UiNode): UiNode =>
    node.id === id
      ? update(node)
      : node.children
        ? { ...node, children: node.children.map(visit) }
        : node;
  return { ...document, ui: visit(document.ui) };
}
export function removeNode(document: HavenDocument, id: string): HavenDocument {
  if (document.ui.id === id) throw new HavenEditingError('editing.rootRemoval');
  return detachNode(document, id);
}
/** A same-parent reorder retains expansion; only a departing direct panel loses its reference. */
function detachNode(document: HavenDocument, id: string, retainingParent?: string): HavenDocument {
  // Shared data bindings survive removal of their view.
  const visit = (node: UiNode): UiNode => {
    if (!node.children) return node;
    const directChild = node.children.some((child) => child.id === id);
    const expanded = node.props?.['expandedIds'];
    const props =
      node.kind === 'layout.accordion' &&
      node.id !== retainingParent &&
      directChild &&
      Array.isArray(expanded)
        ? { ...node.props, expandedIds: expanded.filter((panel) => panel !== id) }
        : node.props;
    return {
      ...node,
      ...(props ? { props } : {}),
      children: node.children.filter((child) => child.id !== id).map(visit),
    };
  };
  return { ...document, ui: visit(document.ui) };
}
/** Retains the existing index-after-detachment and clamping semantics of the Studio primitive. */
export function moveNode(
  document: HavenDocument,
  id: string,
  parentId: string,
  index: number,
  manifests?: ReadonlyMap<string, ComponentManifest>,
): HavenDocument {
  const entries = flattenTree(document.ui);
  const source = entries.find((entry) => entry.node.id === id);
  const target = entries.find((entry) => entry.node.id === parentId);
  if (!source?.parentId || !target) throw new HavenEditingError('editing.moveTarget');
  if (!isContainer(target.node, manifests)) throw new HavenEditingError('editing.notContainer');
  if (flattenTree(source.node).some((entry) => entry.node.id === parentId))
    throw new HavenEditingError('editing.moveCycle');
  if (!sameDataScope(document, source.parentId, parentId))
    throw new HavenEditingError('editing.moveScope');
  const next = detachNode(document, id, parentId);
  return updateNode(next, parentId, (parent) => {
    const children = [...(parent.children ?? [])];
    children.splice(Math.max(0, Math.min(index, children.length)), 0, source.node);
    return { ...parent, children };
  });
}
