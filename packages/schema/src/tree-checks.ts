import type { TreeIndex, TreeKey, TreeNode } from './tree.js';

export type TreeCheckState = 'checked' | 'unchecked' | 'indeterminate';
export interface TreeCheck {
  readonly state: TreeCheckState;
  readonly total: number;
  readonly selected: number;
}

/** Counts use the complete hierarchy, never the filtered or expanded presentation. */
export function treeChecks(
  index: TreeIndex,
  selected: ReadonlySet<TreeKey>,
  leafOnly = false,
): ReadonlyMap<TreeKey, TreeCheck> {
  const checks = new Map<TreeKey, TreeCheck>();
  const visit = (node: TreeNode): TreeCheck => {
    const children = (node.children ?? []).map(visit);
    const blocked = index.entries.get(node.key)!.disabled;
    const eligible = !blocked && (!leafOnly || !node.children?.length);
    const total = blocked ? 0 : Number(eligible) + children.reduce((n, c) => n + c.total, 0);
    const count = blocked
      ? 0
      : Number(eligible && selected.has(node.key)) + children.reduce((n, c) => n + c.selected, 0);
    const state = total
      ? count === total
        ? 'checked'
        : count
          ? 'indeterminate'
          : 'unchecked'
      : selected.has(node.key)
        ? 'checked'
        : 'unchecked';
    const check: TreeCheck = { state, total, selected: count };
    checks.set(node.key, check);
    return check;
  };
  index.roots.forEach(visit);
  return checks;
}

/** Disabled subtrees are immutable; leaf-only branches still address their eligible leaves. */
export function treeCascadeKeys(index: TreeIndex, key: TreeKey, leafOnly = false): TreeKey[] {
  const keys: TreeKey[] = [];
  const visit = (node: TreeNode) => {
    if (index.entries.get(node.key)!.disabled) return;
    if (!leafOnly || !node.children?.length) keys.push(node.key);
    node.children?.forEach(visit);
  };
  const entry = index.entries.get(key);
  if (entry) visit(entry.node);
  return keys;
}
