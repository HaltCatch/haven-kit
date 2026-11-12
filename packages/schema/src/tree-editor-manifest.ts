import { indexTree, isTreeSelection } from './tree.js';
import { isTreeEditorActions } from './tree-editor.js';
import type { ComponentManifest, Diagnostic, UiNode } from './types.js';

export const treeEditorManifest: ComponentManifest = {
  kind: 'tree.editor',
  version: 1,
  title: 'Controlled tree editor',
  container: false,
  binding: 'none',
  dataTypes: [],
  events: ['activate', 'expandedChange', 'filterChange', 'proposal'],
  properties: {
    title: { type: 'string', label: 'Title', localizable: true },
    nodes: { type: 'array', label: 'Complete local tree' },
    readonly: { type: 'boolean', label: 'Readonly' },
    filterable: { type: 'boolean', label: 'Filter' },
    movable: { type: 'boolean', label: 'Move proposals' },
    renamable: { type: 'boolean', label: 'Rename proposals' },
    fixedKeys: { type: 'array', label: 'Fixed node keys' },
    actions: { type: 'array', label: 'Named context actions' },
    selection: { type: 'array', label: 'Controlled active node' },
    expandedKeys: { type: 'array', label: 'Controlled expanded keys' },
    filter: { type: 'string', label: 'Controlled filter' },
  },
};
export function validateTreeEditorNode(node: UiNode, path: string): Diagnostic[] {
  if (node.kind !== 'tree.editor') return [];
  const index = indexTree(node.props?.['nodes']),
    fixed = node.props?.['fixedKeys'],
    actions = node.props?.['actions'];
  const errors: Diagnostic[] = [];
  const add = (code: string, prop: string, message: string) =>
    errors.push({ code, path: `${path}/props/${prop}`, nodeId: node.id, message });
  if (!index) add('tree.nodes', 'nodes', 'Expected a complete uniquely keyed local tree');
  if (
    fixed !== undefined &&
    (!isTreeSelection(fixed) || (index && fixed.some((key) => !index.entries.has(key))))
  )
    add('treeEditor.fixed', 'fixedKeys', 'Fixed keys must uniquely identify existing nodes');
  if (actions !== undefined && !isTreeEditorActions(actions))
    add(
      'treeEditor.actions',
      'actions',
      'Expected up to 32 uniquely named context actions with localized labels',
    );
  for (const property of ['selection', 'expandedKeys'] as const) {
    const keys = node.props?.[property];
    if (
      keys !== undefined &&
      (!isTreeSelection(keys) ||
        (property === 'selection' && keys.length > 1) ||
        (index && keys.some((key) => !index.entries.has(key))))
    )
      add(
        `treeEditor.${property}`,
        property,
        property === 'selection'
          ? 'Selection must contain zero or one existing typed node key'
          : 'Expanded keys must uniquely identify existing nodes',
      );
  }
  const filter = node.props?.['filter'];
  if (filter !== undefined && (typeof filter !== 'string' || filter.length > 4096))
    add('treeEditor.filter', 'filter', 'Filter must be a string of at most 4096 characters');
  return errors;
}
