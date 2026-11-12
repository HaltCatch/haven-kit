import { SelectionModel } from '@angular/cdk/collections';
import { isTreeSelection, treeCascadeKeys, treeChecks } from '@haven/schema';
import type { TreeIndex, TreeKey } from '@haven/schema';

/** CDK owns typed selection; this layer only defines hierarchy propagation. */
export function toggleTreeCascade(
  index: TreeIndex,
  baseline: TreeKey[],
  key: TreeKey,
  leafOnly: boolean,
): TreeKey[] | undefined {
  if (!isTreeSelection(baseline)) return undefined;
  const targets = treeCascadeKeys(index, key, leafOnly);
  if (!targets.length) return undefined;
  const selection = new SelectionModel<TreeKey>(true, baseline, false);
  if (targets.every((target) => selection.isSelected(target))) selection.deselect(...targets);
  else selection.select(...targets);
  if (!leafOnly) {
    // Reconcile only affected ancestors, keeping unrelated/unknown/locked stored keys intact.
    const ancestors = index.entries.get(key)!.path.slice(0, -1).reverse();
    for (const ancestor of ancestors) {
      const check = treeChecks(index, new Set(selection.selected)).get(ancestor)!;
      const descendants = check.total - 1;
      if (!descendants) continue;
      const checked = check.selected - Number(selection.isSelected(ancestor));
      if (checked === descendants) selection.select(ancestor);
      else selection.deselect(ancestor);
    }
  }
  return isTreeSelection(selection.selected) ? selection.selected : undefined;
}
