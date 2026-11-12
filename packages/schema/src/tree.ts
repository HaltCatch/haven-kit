import { isLocalizedText } from './localization.js';
import type { LocalizedText } from './localization.js';

export type TreeKey = string | number;
/** Complete local hierarchy. Remote/lazy children and domain payloads are not this contract. */
export type TreeNode = {
  key: TreeKey;
  label: string | LocalizedText;
  disabled?: boolean;
  children?: TreeNode[];
};
export interface TreeEntry {
  readonly node: TreeNode;
  readonly path: readonly TreeKey[];
  readonly disabled: boolean;
}
export interface TreeIndex {
  readonly roots: readonly TreeNode[];
  readonly entries: ReadonlyMap<TreeKey, TreeEntry>;
}
export function isTreeKey(value: unknown): value is TreeKey {
  return (
    (typeof value === 'string' && value.length > 0 && value.length <= 4096) ||
    (typeof value === 'number' && Number.isFinite(value))
  );
}
export function isTreeNodes(value: unknown): value is TreeNode[] {
  if (!Array.isArray(value) || value.length > 5000) return false;
  const pending = value.map((node) => ({ node: node as unknown, depth: 1 }));
  const keys = new Set<TreeKey>();
  const objects = new Set<object>();
  let count = 0;
  while (pending.length) {
    const { node, depth } = pending.pop()!;
    if (++count > 5000 || depth > 32 || !node || typeof node !== 'object' || Array.isArray(node))
      return false;
    if (objects.has(node)) return false;
    objects.add(node);
    const entry = node as Record<string, unknown>;
    if (
      Object.keys(entry).some((key) => !['key', 'label', 'disabled', 'children'].includes(key)) ||
      !isTreeKey(entry['key']) ||
      keys.has(entry['key']) ||
      !(
        (typeof entry['label'] === 'string' && entry['label'].length <= 4096) ||
        isLocalizedText(entry['label'])
      ) ||
      (entry['disabled'] !== undefined && typeof entry['disabled'] !== 'boolean')
    )
      return false;
    keys.add(entry['key']);
    if (entry['children'] !== undefined) {
      if (!Array.isArray(entry['children']) || entry['children'].length > 5000) return false;
      pending.push(
        ...entry['children'].map((node) => ({ node: node as unknown, depth: depth + 1 })),
      );
    }
  }
  return true;
}
/** Validate once, then create an independent read-only snapshot and an O(1) typed-key lookup. */
export function indexTree(value: unknown): TreeIndex | undefined {
  if (!isTreeNodes(value)) return undefined;
  const entries = new Map<TreeKey, TreeEntry>();
  const copy = (node: TreeNode, path: readonly TreeKey[], disabled: boolean): TreeNode => {
    const nextPath = Object.freeze([...path, node.key]);
    const next: TreeNode = {
      key: node.key,
      label: typeof node.label === 'string' ? node.label : structuredClone(node.label),
    };
    if (node.disabled !== undefined) next.disabled = node.disabled;
    const blocked = disabled || node.disabled === true;
    if (node.children) next.children = node.children.map((child) => copy(child, nextPath, blocked));
    if (next.children) Object.freeze(next.children);
    if (typeof next.label !== 'string') {
      if (next.label.translations) Object.freeze(next.label.translations);
      Object.freeze(next.label);
    }
    Object.freeze(next);
    entries.set(node.key, Object.freeze({ node: next, path: nextPath, disabled: blocked }));
    return next;
  };
  return Object.freeze({
    roots: Object.freeze(value.map((node) => copy(node, [], false))),
    entries,
  });
}
export function treePath(index: TreeIndex, key: TreeKey): readonly TreeNode[] {
  return index.entries.get(key)?.path.map((key) => index.entries.get(key)!.node) ?? [];
}
/** Existing disabled selections remain representable; user interaction separately prevents edits. */
export function isTreeValue(value: unknown, nodes: unknown, leafOnly = false): boolean {
  const index = indexTree(nodes);
  if (!index) return false;
  if (value === null || value === '') return true;
  if (!isTreeKey(value)) return false;
  const entry = index.entries.get(value);
  return !!entry && (!leafOnly || !entry.node.children?.length);
}
/** Keep matching branches and the ancestors needed to reach matching descendants. */
export function filterTree(
  index: TreeIndex,
  query: string,
  label: (node: TreeNode) => string,
): readonly TreeNode[] {
  const text = query.trim().toLocaleLowerCase();
  if (!text) return index.roots;
  const visit = (nodes: readonly TreeNode[]): TreeNode[] =>
    nodes.flatMap((node) => {
      if (label(node).toLocaleLowerCase().includes(text)) return [node];
      const children = visit(node.children ?? []);
      return children.length ? [{ ...node, children }] : [];
    });
  return visit(index.roots);
}

/** A multiple selection uses distinct typed keys; empty means explicitly unselected. */
export function isTreeSelection(value: unknown): value is TreeKey[] {
  return (
    Array.isArray(value) &&
    value.length <= 5000 &&
    Array.from(value).every(isTreeKey) &&
    new Set(value).size === value.length
  );
}
/** Unknown selections remain visible in the field, but are invalid until explicitly corrected. */
export function isTreeMultipleValue(value: unknown, nodes: unknown, leafOnly = false): boolean {
  if (!isTreeSelection(value)) return false;
  const index = indexTree(nodes);
  return (
    !!index &&
    value.every((key) => {
      const entry = index.entries.get(key);
      return !!entry && (!leafOnly || !entry.node.children?.length);
    })
  );
}
