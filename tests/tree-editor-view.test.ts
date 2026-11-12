import { expect, it } from 'vitest';
import { validateDocument } from '@haven/schema';
import type { HavenDocument, JsonObject, JsonValue } from '@haven/schema';

function document(props: JsonObject = {}): HavenDocument {
  return {
    schemaVersion: '1.0',
    id: 'tree-view',
    title: 'Tree view',
    theme: { preset: 'material', mode: 'dark', density: 'comfortable' },
    dataSchema: { type: 'object', properties: {} },
    actions: {},
    resources: {},
    ui: {
      id: 'tree',
      kind: 'tree.editor',
      version: 1,
      props: {
        nodes: [
          { key: 'root', label: 'Root', children: [{ key: 0, label: 'Number' }] },
          { key: '0', label: 'String' },
        ],
        ...props,
      },
    },
  };
}

it('keeps legacy and independently controlled view inputs valid without adding a data binding', () => {
  for (const props of [
    {},
    { selection: [] },
    { selection: [0] },
    { selection: ['0'] },
    { expandedKeys: ['root', 0, '0'] },
    { filter: '' },
    { selection: ['0'], expandedKeys: ['root'], filter: 'x'.repeat(4096) },
  ]) {
    const value = document(props);
    expect(validateDocument(value).diagnostics).toEqual([]);
    expect(value.ui.bind).toBeUndefined();
  }
});

it.each([
  ['selection', [0, '0']],
  ['selection', [0, 0]],
  ['selection', ['missing']],
  ['selection', null],
  ['expandedKeys', ['root', 'root']],
  ['expandedKeys', ['missing']],
  ['expandedKeys', [false]],
  ['filter', 'x'.repeat(4097)],
  ['filter', 0],
] satisfies [string, JsonValue][])(
  'returns a located view diagnostic for invalid %s state',
  (property, value) => {
    const result = validateDocument(document({ [property]: value }));
    expect(result.diagnostics).toContainEqual({
      code: `treeEditor.${property}`,
      path: `/ui/props/${property}`,
      nodeId: 'tree',
      message: expect.any(String),
    });
  },
);

it('validates membership against the complete current tree with strict string/number identity', () => {
  const value = document({ selection: ['0'], expandedKeys: [0] });
  value.ui.props!['nodes'] = [
    { key: 'root', label: 'Root', children: [{ key: 0, label: 'Number' }] },
  ];
  expect(validateDocument(value).diagnostics.map((item) => item.code)).toEqual([
    'treeEditor.selection',
  ]);
  value.ui.props!['selection'] = [0];
  value.ui.props!['expandedKeys'] = ['0'];
  expect(validateDocument(value).diagnostics.map((item) => item.code)).toEqual([
    'treeEditor.expandedKeys',
  ]);
});
