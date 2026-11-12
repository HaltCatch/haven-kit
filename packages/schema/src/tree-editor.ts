import { isLocalizedText } from './localization.js';
import { isTreeKey, isTreeSelection } from './tree.js';
import type { TreeKey, TreeNode } from './tree.js';

export type TreeEditorAction = { id: string; label: TreeNode['label']; disabled?: boolean };
export type TreeMoveProposal = {
  type: 'move';
  key: TreeKey;
  parent: TreeKey | null;
  before: TreeKey | null;
};
export type TreeRenameProposal = {
  type: 'rename';
  key: TreeKey;
  label: string;
  previousLabel: TreeNode['label'];
  locale: string;
};
export type TreeActionProposal = { type: 'action'; key: TreeKey; action: string };
export type TreeEditProposal = TreeMoveProposal | TreeRenameProposal | TreeActionProposal;
export interface TreeEditorSettings {
  movable?: boolean;
  renamable?: boolean;
  fixedKeys?: readonly TreeKey[];
  actions?: readonly TreeEditorAction[];
  readonly?: boolean;
  disabled?: boolean;
}
export type TreeEditIssue =
  | 'config'
  | 'missing'
  | 'blocked'
  | 'fixed'
  | 'container'
  | 'cycle'
  | 'position'
  | 'depth'
  | 'unchanged'
  | 'stale'
  | 'label'
  | 'action'
  | 'filtered';

const record = (value: unknown): value is Record<string, unknown> =>
  !!value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const label = (value: unknown): value is TreeNode['label'] =>
  (typeof value === 'string' && value.length <= 4096) || isLocalizedText(value);
export function isTreeEditorActions(value: unknown): value is TreeEditorAction[] {
  return (
    Array.isArray(value) &&
    value.length <= 32 &&
    Array.from(value).every(
      (action: unknown) =>
        record(action) &&
        Object.keys(action).every((key) => ['id', 'label', 'disabled'].includes(key)) &&
        typeof action['id'] === 'string' &&
        /^[a-z][a-z0-9._-]{0,127}$/i.test(action['id']) &&
        label(action['label']) &&
        (action['disabled'] === undefined || typeof action['disabled'] === 'boolean'),
    ) &&
    new Set(value.map((action: TreeEditorAction) => action.id)).size === value.length
  );
}
export function isTreeEditorSettings(value: unknown): value is TreeEditorSettings {
  return (
    record(value) &&
    Object.keys(value).every((key) =>
      ['movable', 'renamable', 'readonly', 'disabled', 'fixedKeys', 'actions'].includes(key),
    ) &&
    ['movable', 'renamable', 'readonly', 'disabled'].every(
      (key) => value[key] === undefined || typeof value[key] === 'boolean',
    ) &&
    (value['fixedKeys'] === undefined || isTreeSelection(value['fixedKeys'])) &&
    (value['actions'] === undefined || isTreeEditorActions(value['actions']))
  );
}
export function sameTreeLabel(left: TreeNode['label'], right: TreeNode['label']): boolean {
  if (typeof left === 'string' || typeof right === 'string') return left === right;
  return (
    left.default === right.default &&
    Object.keys(left.translations).length === Object.keys(right.translations).length &&
    Object.entries(left.translations).every(([key, value]) => right.translations[key] === value)
  );
}
/** Plain JSON proposals cannot carry a host callback, a domain payload or executable configuration. */
export function isTreeEditProposal(value: unknown): value is TreeEditProposal {
  if (!record(value) || !isTreeKey(value['key'])) return false;
  const keys = Object.keys(value);
  if (value['type'] === 'move')
    return (
      keys.length === 4 &&
      keys.every((key) => ['type', 'key', 'parent', 'before'].includes(key)) &&
      (value['parent'] === null || isTreeKey(value['parent'])) &&
      (value['before'] === null || isTreeKey(value['before']))
    );
  if (value['type'] === 'action')
    return (
      keys.length === 3 &&
      keys.every((key) => ['type', 'key', 'action'].includes(key)) &&
      typeof value['action'] === 'string' &&
      /^[a-z][a-z0-9._-]{0,127}$/i.test(value['action'])
    );
  if (
    value['type'] !== 'rename' ||
    keys.length !== 5 ||
    keys.some((key) => !['type', 'key', 'label', 'previousLabel', 'locale'].includes(key)) ||
    typeof value['label'] !== 'string' ||
    !value['label'].trim() ||
    value['label'].length > 4096 ||
    !label(value['previousLabel']) ||
    typeof value['locale'] !== 'string' ||
    value['locale'].length > 40
  )
    return false;
  try {
    return Intl.getCanonicalLocales(value['locale']).length === 1;
  } catch {
    return false;
  }
}
