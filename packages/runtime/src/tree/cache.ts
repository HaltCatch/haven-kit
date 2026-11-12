import { sameTreeLabel } from '@haven/schema';
import type { RemoteTreeNode, TreeKey } from '@haven/schema';
import type { TreeBranchState, TreeDataEntry } from './types.js';
import { InvalidTreeResponse } from './response.js';

/** Atomic cache merge. Stable keys cannot silently change parent or metadata within a source revision. */
export function mergeTreePaths(
  entries: ReadonlyMap<TreeKey, TreeDataEntry>,
  branches: ReadonlyMap<TreeKey | null, TreeBranchState>,
  paths: readonly (readonly RemoteTreeNode[])[],
): ReadonlyMap<TreeKey, TreeDataEntry> {
  const next = new Map(entries);
  const complete = new Map(
    [...branches]
      .filter(([, branch]) => branch.status === 'ready')
      .map(([parent, branch]) => [parent, new Set(branch.nodes.map((node) => node.key))] as const),
  );
  for (const path of paths) {
    let disabled = false;
    for (const [position, node] of path.entries()) {
      const keys = path.slice(0, position + 1).map((entry) => entry.key),
        previous = next.get(node.key),
        parent = position ? path[position - 1]!.key : null,
        siblings = complete.get(parent);
      disabled ||= node.disabled === true;
      if (
        keys.length > 32 ||
        new Set(keys).size !== keys.length ||
        (siblings && !siblings.has(node.key)) ||
        (previous &&
          ((previous.node.disabled === true) !== (node.disabled === true) ||
            previous.node.hasChildren !== node.hasChildren ||
            !sameTreeLabel(previous.node.label, node.label) ||
            previous.path.length !== keys.length ||
            previous.path.some((key, index) => key !== keys[index])))
      )
        throw new InvalidTreeResponse();
      if (!previous)
        next.set(node.key, Object.freeze({ node, path: Object.freeze(keys), disabled }));
    }
  }
  // Bound the accumulated cache, not just each adapter response.
  if (
    next.size > 5000 ||
    [...next.values()].reduce((sum, { node }) => sum + JSON.stringify(node).length, 0) > 5_000_000
  )
    throw new InvalidTreeResponse();
  return next;
}

export function mergeTreeBranch(
  parent: TreeKey | null,
  nodes: readonly RemoteTreeNode[],
  entries: ReadonlyMap<TreeKey, TreeDataEntry>,
  branches: ReadonlyMap<TreeKey | null, TreeBranchState>,
): ReadonlyMap<TreeKey, TreeDataEntry> {
  const ancestor = parent === null ? undefined : entries.get(parent);
  if (parent !== null && (!ancestor || !ancestor.node.hasChildren)) throw new InvalidTreeResponse();
  const prefix = ancestor?.path.map((key) => entries.get(key)!.node) ?? [];
  const next = mergeTreePaths(
    entries,
    branches,
    nodes.map((node) => [...prefix, node]),
  );
  const keys = new Set(nodes.map((node) => node.key));
  // A prior resolve may know only part of this branch. The complete read must include it.
  for (const entry of next.values()) {
    const directParent = entry.path.length > 1 ? entry.path.at(-2)! : null;
    if (directParent === parent && !keys.has(entry.node.key)) throw new InvalidTreeResponse();
  }
  return next;
}
