import { isTreeEditProposal, isTreeEditorSettings, sameTreeLabel } from './tree-editor.js';
import type { TreeEditIssue, TreeMoveProposal } from './tree-editor.js';
import type { TreeIndex, TreeKey, TreeNode } from './tree.js';

export type TreeDropPosition = 'before' | 'inside' | 'after';
export type TreeMoveDirection = 'up' | 'down' | 'indent' | 'outdent';
export const treeParent = (index: TreeIndex, key: TreeKey): TreeKey | null =>
  index.entries.get(key)?.path.at(-2) ?? null;
const siblings = (index: TreeIndex, parent: TreeKey | null): readonly TreeNode[] =>
  parent === null ? index.roots : (index.entries.get(parent)?.node.children ?? []);

/** Translate a stable target/position into an insertion anchor; no visual array index escapes. */
export function treeMoveProposal(
  index: TreeIndex,
  key: TreeKey,
  target: TreeKey,
  position: TreeDropPosition,
): TreeMoveProposal | undefined {
  if (!index.entries.has(key) || !index.entries.has(target)) return undefined;
  if (key === target) return { type: 'move', key, parent: treeParent(index, key), before: key };
  if (position === 'inside') return { type: 'move', key, parent: target, before: null };
  const parent = treeParent(index, target);
  const peers = siblings(index, parent).filter((node) => node.key !== key);
  return {
    type: 'move',
    key,
    parent,
    before:
      position === 'before'
        ? target
        : (peers[peers.findIndex((node) => node.key === target) + 1]?.key ?? null),
  };
}
export function treeKeyboardMove(
  index: TreeIndex,
  key: TreeKey,
  direction: TreeMoveDirection,
): TreeMoveProposal | undefined {
  if (!index.entries.has(key)) return undefined;
  const parent = treeParent(index, key),
    peers = siblings(index, parent),
    position = peers.findIndex((node) => node.key === key);
  if (direction === 'up')
    return position > 0
      ? treeMoveProposal(index, key, peers[position - 1]!.key, 'before')
      : undefined;
  if (direction === 'down')
    return position + 1 < peers.length
      ? treeMoveProposal(index, key, peers[position + 1]!.key, 'after')
      : undefined;
  if (direction === 'indent')
    return position > 0
      ? treeMoveProposal(index, key, peers[position - 1]!.key, 'inside')
      : undefined;
  return parent !== null ? treeMoveProposal(index, key, parent, 'after') : undefined;
}

/** Generic structure guards only. Hosts must still check current revision and application permissions. */
export function treeEditIssue(
  index: TreeIndex | undefined,
  proposal: unknown,
  settings: unknown = {},
): TreeEditIssue | null {
  if (!index || !isTreeEditorSettings(settings) || !isTreeEditProposal(proposal)) return 'config';
  if (settings.fixedKeys?.some((key) => !index.entries.has(key))) return 'config';
  const source = index.entries.get(proposal.key);
  if (!source) return 'missing';
  if (settings.readonly || settings.disabled || source.disabled) return 'blocked';
  const fixed = new Set(settings.fixedKeys ?? []);
  if (fixed.has(proposal.key)) return 'fixed';
  if (proposal.type === 'action')
    return settings.actions?.some((action) => action.id === proposal.action && !action.disabled)
      ? null
      : 'action';
  if (proposal.type === 'rename') {
    if (settings.renamable === false) return 'blocked';
    if (!sameTreeLabel(source.node.label, proposal.previousLabel)) return 'stale';
    return typeof source.node.label === 'string' && source.node.label === proposal.label
      ? 'unchanged'
      : null;
  }
  if (settings.movable === false) return 'blocked';
  const parent = proposal.parent === null ? undefined : index.entries.get(proposal.parent);
  if (proposal.parent !== null && !parent) return 'missing';
  if (parent?.disabled) return 'blocked';
  if (parent && parent.node.children === undefined) return 'container';
  if (parent?.path.includes(proposal.key)) return 'cycle';
  let height = 1;
  for (const entry of index.entries.values())
    if (entry.path.includes(proposal.key)) {
      if (entry.disabled) return 'blocked';
      if (fixed.has(entry.node.key)) return 'fixed';
      height = Math.max(height, entry.path.length - source.path.length + 1);
    }
  if ((parent?.path.length ?? 0) + height > 32) return 'depth';
  const before = proposal.before,
    original = siblings(index, proposal.parent),
    next = original.filter((node) => node.key !== proposal.key);
  if (before !== null && !next.some((node) => node.key === before))
    return before === proposal.key && treeParent(index, proposal.key) === proposal.parent
      ? 'unchanged'
      : 'position';
  const position = before === null ? next.length : next.findIndex((node) => node.key === before);
  const keys = next.map((node) => node.key);
  keys.splice(position, 0, proposal.key);
  return treeParent(index, proposal.key) === proposal.parent &&
    keys.every((key, i) => original[i]?.key === key)
    ? 'unchanged'
    : null;
}
