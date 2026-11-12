import { expect, it } from 'vitest';
import {
  indexTree,
  isTreeEditProposal,
  isTreeEditorActions,
  isTreeEditorSettings,
  treeEditIssue,
  treeKeyboardMove,
  treeMoveProposal,
  validateDocument,
} from '@haven/schema';
import type { HavenDocument, TreeEditProposal, TreeNode } from '@haven/schema';

const nodes: TreeNode[] = [
  {
    key: 'root',
    label: 'Root',
    children: [
      {
        key: 'group',
        label: 'Group',
        children: [
          { key: 0, label: 'Zero' },
          { key: '0', label: 'String zero' },
        ],
      },
      { key: 'empty', label: 'Empty container', children: [] },
      { key: 'leaf', label: { default: 'Leaf', translations: { 'zh-CN': '叶子', fr: 'Feuille' } } },
    ],
  },
];
it('rejects malformed external settings without dereferencing them or accepting host code', () => {
  const index = indexTree(nodes)!;
  const move = treeMoveProposal(index, 0, 'empty', 'inside');
  for (const settings of [null, [], 'readonly', 0, { execute: () => {} }, { readonly: 'true' }]) {
    expect(isTreeEditorSettings(settings)).toBe(false);
    expect(treeEditIssue(index, move, settings)).toBe('config');
  }
  expect(isTreeEditorSettings({ movable: false, fixedKeys: [0, '0'], actions: [] })).toBe(true);
});
it('creates typed stable-key insertion anchors without moving source data or leaking presentation indexes', () => {
  const index = indexTree(nodes)!;
  expect(treeMoveProposal(index, 0, '0', 'after')).toEqual({
    type: 'move',
    key: 0,
    parent: 'group',
    before: null,
  });
  expect(treeMoveProposal(index, '0', 0, 'before')).toEqual({
    type: 'move',
    key: '0',
    parent: 'group',
    before: 0,
  });
  expect(treeMoveProposal(index, 0, 'empty', 'inside')).toEqual({
    type: 'move',
    key: 0,
    parent: 'empty',
    before: null,
  });
  expect(treeEditIssue(index, treeMoveProposal(index, 0, 'empty', 'inside'))).toBeNull();
  expect(nodes[0]!.children![0]!.children!.map((node) => node.key)).toEqual([0, '0']);
  expect(treeMoveProposal(index, 'missing', 'empty', 'inside')).toBeUndefined();
  for (const position of ['before', 'inside', 'after'] as const)
    expect(treeEditIssue(index, treeMoveProposal(index, '0', '0', position))).toBe('unchanged');
});
it('uses the same placement protocol for sibling, indent and outdent keyboard moves', () => {
  const index = indexTree(nodes)!;
  expect(treeKeyboardMove(index, '0', 'up')).toEqual({
    type: 'move',
    key: '0',
    parent: 'group',
    before: 0,
  });
  expect(treeKeyboardMove(index, 0, 'down')).toEqual({
    type: 'move',
    key: 0,
    parent: 'group',
    before: null,
  });
  expect(treeKeyboardMove(index, 'empty', 'indent')).toEqual({
    type: 'move',
    key: 'empty',
    parent: 'group',
    before: null,
  });
  expect(treeKeyboardMove(index, 0, 'outdent')).toEqual({
    type: 'move',
    key: 0,
    parent: 'root',
    before: 'empty',
  });
  expect(treeKeyboardMove(index, 'root', 'outdent')).toBeUndefined();
});
it('diagnoses cycles, leaf destinations, stale anchors, fixed sources and inherited disabled subtrees', () => {
  const index = indexTree(nodes)!;
  expect(treeEditIssue(index, { type: 'move', key: 'group', parent: 'group', before: null })).toBe(
    'cycle',
  );
  expect(treeEditIssue(index, { type: 'move', key: 'group', parent: 0, before: null })).toBe(
    'container',
  );
  expect(treeEditIssue(index, { type: 'move', key: 0, parent: 'empty', before: 'leaf' })).toBe(
    'position',
  );
  expect(treeEditIssue(index, { type: 'move', key: 0, parent: 'missing', before: null })).toBe(
    'missing',
  );
  const proposal = treeMoveProposal(index, 0, 'empty', 'inside')!;
  expect(treeEditIssue(index, proposal, { fixedKeys: [0] })).toBe('fixed');
  expect(treeEditIssue(index, proposal, { fixedKeys: ['empty'] })).toBeNull();
  expect(treeEditIssue(index, proposal, { fixedKeys: ['missing'] })).toBe('config');
  expect(treeEditIssue(index, proposal, { readonly: true })).toBe('blocked');
  expect(treeEditIssue(index, proposal, { movable: false })).toBe('blocked');
  const blocked = structuredClone(nodes);
  blocked[0]!.children![0]!.children![0]!.disabled = true;
  expect(
    treeEditIssue(indexTree(blocked), {
      type: 'move',
      key: 'group',
      parent: 'empty',
      before: null,
    }),
  ).toBe('blocked');
  expect(
    treeEditIssue(
      index,
      { type: 'move', key: 'group', parent: 'empty', before: null },
      { fixedKeys: ['0'] },
    ),
  ).toBe('fixed');
});
it('refuses a structurally valid source move that exceeds the existing 32-level tree budget', () => {
  let deepest: TreeNode = { key: 'depth-31', label: 'Deepest', children: [] };
  for (let level = 30; level >= 0; level--)
    deepest = { key: `depth-${level}`, label: 'Depth', children: [deepest] };
  const index = indexTree([
    deepest,
    { key: 'source', label: 'Source', children: [{ key: 'child', label: 'Child' }] },
  ])!;
  expect(
    treeEditIssue(index, { type: 'move', key: 'source', parent: 'depth-31', before: null }),
  ).toBe('depth');
});
it('carries raw localized CAS snapshots and a captured locale without executing or mutating labels', () => {
  const index = indexTree(nodes)!,
    previousLabel = nodes[0]!.children![2]!.label;
  const proposal: TreeEditProposal = {
    type: 'rename',
    key: 'leaf',
    label: '新叶子',
    previousLabel,
    locale: 'zh-CN',
  };
  expect(isTreeEditProposal(proposal)).toBe(true);
  expect(treeEditIssue(index, proposal)).toBeNull();
  expect(treeEditIssue(index, { ...proposal, previousLabel: 'old' })).toBe('stale');
  expect(treeEditIssue(index, proposal, { renamable: false })).toBe('blocked');
  expect(nodes[0]!.children![2]!.label).toEqual({
    default: 'Leaf',
    translations: { 'zh-CN': '叶子', fr: 'Feuille' },
  });
  expect(isTreeEditProposal({ ...proposal, label: ' ' })).toBe(false);
  expect(isTreeEditProposal({ ...proposal, locale: 'invalid_locale' })).toBe(false);
  expect(isTreeEditProposal({ ...proposal, execute: 'any-script' })).toBe(false);
});
it('accepts bounded named context actions only and makes unavailable actions explicit', () => {
  const actions = [
    { id: 'host.inspect', label: 'Inspect' },
    { id: 'host.locked', label: 'Locked', disabled: true },
  ];
  expect(isTreeEditorActions(actions)).toBe(true);
  expect(isTreeEditorActions([actions[0], actions[0]])).toBe(false);
  expect(isTreeEditorActions([{ id: 'host.inspect', label: 'Inspect', execute: () => {} }])).toBe(
    false,
  );
  const index = indexTree(nodes)!;
  expect(
    treeEditIssue(index, { type: 'action', key: 0, action: 'host.inspect' }, { actions }),
  ).toBeNull();
  for (const action of ['host.locked', 'host.missing'])
    expect(treeEditIssue(index, { type: 'action', key: 0, action }, { actions })).toBe('action');
});
const document = (): HavenDocument => ({
  schemaVersion: '1.0',
  id: 'editor',
  title: 'Editor',
  theme: { preset: 'material', mode: 'dark', density: 'comfortable' },
  dataSchema: { type: 'object', properties: {} },
  actions: { edit: { handler: 'host.proposal' } },
  resources: {},
  ui: {
    id: 'tree',
    kind: 'tree.editor',
    version: 1,
    props: {
      nodes: structuredClone(nodes),
      fixedKeys: ['root'],
      actions: [{ id: 'host.inspect', label: 'Inspect' }],
    },
    events: { proposal: ['edit'] },
  },
});
it('registers a model editing surface without data binding or executable node metadata', () => {
  expect(validateDocument(document()).diagnostics).toEqual([]);
  const fixed = document();
  fixed.ui.props!['fixedKeys'] = ['missing'];
  expect(
    validateDocument(fixed).diagnostics.some((error) => error.code === 'treeEditor.fixed'),
  ).toBe(true);
  const action = document();
  action.ui.props!['actions'] = [{ id: 'inspect', label: 'Inspect', script: 'eval' }];
  expect(
    validateDocument(action).diagnostics.some((error) => error.code === 'treeEditor.actions'),
  ).toBe(true);
  const bound = document();
  bound.ui.bind = '/unused';
  expect(
    validateDocument(bound).diagnostics.some((error) => error.code === 'binding.forbidden'),
  ).toBe(true);
});
