import { expect, it } from 'vitest';
import { indexTree, treeCascadeKeys, treeChecks, validateDocument } from '@haven/schema';
import type { HavenDocument, TreeNode } from '@haven/schema';

const nodes: TreeNode[] = [
  {
    key: 'root',
    label: 'Root',
    children: [
      {
        key: 'branch',
        label: 'Branch',
        children: [
          { key: 0, label: 'Zero' },
          { key: '0', label: 'String zero' },
        ],
      },
      {
        key: 'locked',
        label: 'Locked',
        disabled: true,
        children: [{ key: 'saved', label: 'Saved' }],
      },
    ],
  },
];

it('computes full-tree tri-state counts with typed keys and excludes inherited disabled subtrees', () => {
  const index = indexTree(nodes)!;
  const baseline = new Set([0, 'saved', 'unknown']);
  const checks = treeChecks(index, baseline);
  expect(checks.get('root')).toEqual({ state: 'indeterminate', total: 4, selected: 1 });
  expect(checks.get('branch')).toEqual({ state: 'indeterminate', total: 3, selected: 1 });
  expect(checks.get(0)?.state).toBe('checked');
  expect(checks.get('0')?.state).toBe('unchecked');
  expect(checks.get('saved')).toEqual({ state: 'checked', total: 0, selected: 0 });
  expect(treeCascadeKeys(index, 'root')).toEqual(['root', 'branch', 0, '0']);
  expect(treeCascadeKeys(index, 'locked')).toEqual([]);
  expect(treeCascadeKeys(index, 'unknown')).toEqual([]);
  expect([...baseline]).toEqual([0, 'saved', 'unknown']);
});
it('lets leaf-only branches address only real leaves and keeps disabled-only branches unselected', () => {
  const index = indexTree(nodes)!;
  expect(treeCascadeKeys(index, 'root', true)).toEqual([0, '0']);
  expect(treeChecks(index, new Set([0, '0']), true).get('root')).toEqual({
    state: 'checked',
    total: 2,
    selected: 2,
  });
  const empty = indexTree([{ key: 1, label: 'Empty', children: [nodes[0]!.children![1]!] }])!;
  expect(treeCascadeKeys(empty, 1, true)).toEqual([]);
  expect(treeChecks(empty, new Set(), true).get(1)?.state).toBe('unchecked');
});
it('keeps cascade an explicit boolean model capability for tree multiselect only', () => {
  const d: HavenDocument = {
    schemaVersion: '1.0',
    id: 'cascade',
    title: 'Cascade',
    theme: { preset: 'material', mode: 'dark', density: 'comfortable' },
    dataSchema: {
      type: 'object',
      properties: { keys: { type: 'array', items: { type: 'string' } } },
    },
    ui: {
      id: 'field',
      kind: 'field.tree-multiselect',
      version: 1,
      bind: '/keys',
      props: {
        cascade: true,
        leafOnly: true,
        nodes: [{ key: 'branch', label: 'Branch', children: [{ key: 'leaf', label: 'Leaf' }] }],
      },
    },
    resources: {},
    actions: {},
  };
  expect(validateDocument(d).diagnostics).toEqual([]);
  d.ui.props!['cascade'] = 'true';
  expect(validateDocument(d).valid).toBe(false);
});
