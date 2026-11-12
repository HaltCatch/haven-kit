import { pointerSegments } from '../pointer.js';
import { isTableColumns, isTablePointer } from '../table.js';
import { isTableHierarchy } from './contract.js';

const overlaps = (left: string, right: string): boolean => {
  const a = pointerSegments(left),
    b = pointerSegments(right);
  return a.slice(0, Math.min(a.length, b.length)).every((segment, at) => segment === b[at]);
};

/** Cell editors cannot change row identity or move structure; moves need their own atomic protocol. */
export function tableHierarchyEditPathsValid(
  columns: unknown,
  rowKey: unknown,
  hierarchy: unknown,
): boolean {
  if (hierarchy === undefined) return true;
  try {
    return (
      isTableHierarchy(hierarchy) &&
      isTablePointer(rowKey) &&
      isTableColumns(columns) &&
      !overlaps(hierarchy.parentPath, rowKey) &&
      columns.every((column) => !column.editor || !overlaps(hierarchy.parentPath, column.path))
    );
  } catch {
    return false;
  }
}
