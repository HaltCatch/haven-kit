import { expect, it } from 'vitest';
import { isTreeSelection, isTreeMultipleValue, validateDocument } from '@haven/schema';
import type { HavenDocument, TreeNode } from '@haven/schema';
const nodes: TreeNode[] = [
  { key: 0, label: 'Numeric zero' },
  { key: '0', label: 'String zero' },
  { key: 'locked', label: 'Locked', disabled: true },
];
it('uses explicit unique typed arrays, preserving disabled values but diagnosing unknown selections', () => {
  expect(isTreeSelection([0, '0'])).toBe(true);
  expect(isTreeMultipleValue([0, '0', 'locked'], nodes)).toBe(true);
  expect(isTreeMultipleValue([], nodes)).toBe(true);
  for (const value of [
    null,
    '0',
    [0, 0],
    ['0', '0'],
    [''],
    [NaN],
    {},
    Array.from({ length: 5001 }, (_, i) => i),
  ])
    expect(isTreeSelection(value)).toBe(false);
  const unknown = ['missing'];
  expect(isTreeSelection(unknown)).toBe(true);
  expect(isTreeMultipleValue(unknown, nodes)).toBe(false);
  expect(unknown).toEqual(['missing']);
  expect(
    isTreeMultipleValue(
      ['parent'],
      [{ key: 'parent', label: 'Parent', children: [{ key: 'leaf', label: 'Leaf' }] }],
      true,
    ),
  ).toBe(false);
});
it('rejects sparse selections instead of treating holes as selected keys', () => {
  const sparse = [0];
  Reflect.deleteProperty(sparse, '0');
  expect(isTreeSelection(sparse)).toBe(false);
  expect(isTreeMultipleValue(sparse, nodes)).toBe(false);
  expect(Object.hasOwn(sparse, 0)).toBe(false);
  expect(JSON.stringify(sparse)).toBe('[null]');
});
const document = (): HavenDocument => ({
  schemaVersion: '1.0',
  id: 'tree-multiple',
  title: 'Tree multi',
  theme: { preset: 'material', mode: 'dark', density: 'comfortable' },
  actions: {},
  resources: {},
  dataSchema: {
    type: 'object',
    properties: { keys: { type: 'array', items: { type: 'number' }, minItems: 1, maxItems: 2 } },
  },
  ui: {
    id: 'multi',
    kind: 'field.tree-multiselect',
    version: 1,
    bind: '/keys',
    props: {
      nodes: [
        { key: 0, label: 'Zero' },
        { key: 2, label: 'Two' },
      ],
      leafOnly: true,
    },
  },
});
it('registers the model kind with an explicit homogeneous array item contract', () => {
  const d = document();
  expect(validateDocument(d).diagnostics).toEqual([]);
  for (const items of [{ type: 'object' }, undefined, { type: 'boolean' }] as const) {
    const invalid = document();
    if (items) invalid.dataSchema.properties!['keys']!.items = items;
    else delete invalid.dataSchema.properties!['keys']!.items;
    const result = validateDocument(invalid);
    expect(result.valid).toBe(false);
    if (items) expect(result.diagnostics.some((e) => e.code === 'tree.binding')).toBe(true);
  }
  const mismatch = document();
  mismatch.ui.props!['nodes'] = [{ key: '0', label: 'String zero' }];
  expect(validateDocument(mismatch).diagnostics.some((e) => e.code === 'tree.keyType')).toBe(true);
  const text = document();
  text.dataSchema.properties!['keys']!.items = { type: 'string' };
  text.ui.props!['nodes'] = [{ key: '0', label: 'String zero' }];
  expect(validateDocument(text).valid).toBe(true);
  const referenced = document();
  referenced.dataSchema.$defs = { key: { type: 'number' } };
  referenced.dataSchema.properties!['keys']!.items = { $ref: '#/$defs/key' };
  expect(validateDocument(referenced).valid).toBe(true);
});
