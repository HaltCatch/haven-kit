import type {
  TreeEditProposal,
  TreeEditorSettings,
  TreeKey,
  TreeMoveDirection,
  TreeNode,
} from '@haven/schema';
import { isTreeEditorSettings } from '@haven/schema';

export interface TreeEditorOwner {
  readonly nodes: readonly TreeNode[];
  readonly identity: string;
  readonly filter: string;
  readonly settings: Required<TreeEditorSettings>;
}
/** Direct component inputs have defaults; explicit malformed replacements cannot reuse a valid owner. */
export function isTreeEditorOwnerSettings(value: unknown): value is Required<TreeEditorSettings> {
  return (
    isTreeEditorSettings(value) &&
    ['readonly', 'disabled', 'movable', 'renamable'].every(
      (key) => typeof value[key as keyof TreeEditorSettings] === 'boolean',
    ) &&
    value.fixedKeys !== undefined &&
    value.actions !== undefined
  );
}

/** Only edit capabilities affect gesture ownership; current labels are provided separately to rows. */
export function sameTreeEditorOwner(left: TreeEditorOwner, right: TreeEditorOwner): boolean {
  if (
    left.nodes !== right.nodes ||
    left.identity !== right.identity ||
    left.filter !== right.filter ||
    !isTreeEditorOwnerSettings(left.settings) ||
    !isTreeEditorOwnerSettings(right.settings)
  )
    return false;
  const a = left.settings,
    b = right.settings;
  if (
    a.readonly !== b.readonly ||
    a.disabled !== b.disabled ||
    a.movable !== b.movable ||
    a.renamable !== b.renamable
  )
    return false;
  const fixed = new Set(b.fixedKeys);
  if (a.fixedKeys.length !== b.fixedKeys.length || a.fixedKeys.some((key) => !fixed.has(key)))
    return false;
  const actions = new Map(b.actions.map((action) => [action.id, action.disabled === true]));
  return (
    a.actions.length === b.actions.length &&
    a.actions.every((action) => actions.get(action.id) === (action.disabled === true))
  );
}
export type TreeEditorRequest =
  | { owner: TreeEditorOwner; proposal: TreeEditProposal }
  | {
      owner: TreeEditorOwner;
      key: TreeKey;
      direction: TreeMoveDirection;
    };
