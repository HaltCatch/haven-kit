import { describe, expect, it } from 'vitest';
import { isRemoteTreeNodes, isTreeNodes, validateDocument } from '@haven/schema';
import type { HavenDocument, JsonObject, RemoteTreeNode } from '@haven/schema';
import { document } from '../fixtures.js';

const records: RemoteTreeNode[] = [
  { key: 0, label: 'Numeric zero', hasChildren: true },
  {
    key: '0',
    label: { default: 'Zero', translations: { 'zh-CN': '零' } },
    hasChildren: false,
    disabled: true,
  },
];

function model(kind = 'tree', props: JsonObject = { resource: 'hierarchy' }): HavenDocument {
  const value = document();
  value.resources = { hierarchy: { adapter: 'application.hierarchy', type: 'tree' } };
  value.dataSchema.properties!['keys'] = { type: 'array', items: { type: 'string' } };
  value.ui = {
    id: 'remote',
    kind,
    version: 1,
    ...(kind.startsWith('field.')
      ? { bind: kind === 'field.tree-multiselect' ? '/keys' : '/title' }
      : {}),
    props,
  };
  return value;
}

describe('remote tree record contract', () => {
  it('keeps typed keys and explicit unknown descendants separate from complete local trees', () => {
    expect(isRemoteTreeNodes(records)).toBe(true);
    expect(isRemoteTreeNodes([])).toBe(true);
    expect(isTreeNodes(records)).toBe(false);
    expect(isRemoteTreeNodes([{ key: 'leaf', label: 'Leaf' }])).toBe(false);
  });

  it('rejects duplicates, sparse arrays, oversized lists and unsupported record metadata', () => {
    const sparse: unknown[] = [records[0]];
    Reflect.deleteProperty(sparse, 0);
    for (const value of [
      null,
      {},
      [null],
      [[]],
      sparse,
      [records[0], records[0]],
      [{ ...records[0], key: NaN }],
      [{ ...records[0], key: '' }],
      [{ ...records[0], label: 'x'.repeat(4097) }],
      [{ ...records[0], label: { default: '', translations: { invalid_locale: 'Invalid' } } }],
      [{ ...records[0], hasChildren: 'false' }],
      [{ ...records[0], disabled: 0 }],
      [{ ...records[0], children: [] }],
      [{ ...records[0], url: '/domain' }],
      Array.from({ length: 5001 }, (_, key) => ({ key, label: '', hasChildren: false })),
    ])
      expect(isRemoteTreeNodes(value)).toBe(false);
  });
});

describe('remote tree model ports', () => {
  it.each(['tree', 'field.tree-select', 'field.tree-multiselect', 'field.cascader'])(
    'registers %s with the same named resource contract',
    (kind) => expect(validateDocument(model(kind)).diagnostics).toEqual([]),
  );

  it('does not treat a remote resource as an empty or partially loaded local tree', () => {
    for (const nodes of [[], [{ key: 'inline', label: 'Inline' }]])
      expect(
        validateDocument(model('tree', { nodes, resource: 'hierarchy' })).diagnostics,
      ).toContainEqual(
        expect.objectContaining({ code: 'resource.conflict', path: '/ui/props/nodes' }),
      );
    const local = model('field.tree-select', { nodes: [{ key: 'leaf', label: 'Leaf' }] });
    expect(validateDocument(local).valid).toBe(true);
    local.ui.props = {};
    expect(validateDocument(local).diagnostics).toContainEqual(
      expect.objectContaining({ code: 'tree.nodes' }),
    );
  });

  it('rejects empty names, URLs and missing or mismatched resource bindings', () => {
    for (const resource of ['', 'https://example.com/tree', '../hierarchy'])
      expect(validateDocument(model('tree', { resource })).diagnostics).toContainEqual(
        expect.objectContaining({ code: 'tree.resource' }),
      );
    const absent = model();
    absent.resources = {};
    expect(validateDocument(absent).diagnostics).toContainEqual(
      expect.objectContaining({ code: 'resource.type' }),
    );
    const wrong = model();
    wrong.resources['hierarchy']!.type = 'options';
    expect(validateDocument(wrong).diagnostics).toContainEqual(
      expect.objectContaining({ code: 'resource.type' }),
    );
    const url = model();
    url.resources['hierarchy']!.adapter = 'https://example.com/tree';
    expect(validateDocument(url).structural).toBe(false);
  });

  it('requires homogeneous scalar arrays independently of whether children are loaded', () => {
    const value = model('field.tree-multiselect');
    value.dataSchema.properties!['keys']!.items = { type: 'boolean' };
    expect(validateDocument(value).diagnostics).toContainEqual(
      expect.objectContaining({ code: 'tree.binding' }),
    );
    value.dataSchema.properties!['keys']!.items = { type: 'number' };
    expect(validateDocument(value).valid).toBe(true);
  });

  it('rejects remote cascade and does not grant editing rights over an incomplete hierarchy', () => {
    const cascade = model('field.tree-multiselect', { resource: 'hierarchy', cascade: true });
    expect(validateDocument(cascade).diagnostics).toContainEqual(
      expect.objectContaining({ code: 'tree.cascadeRemote' }),
    );
    cascade.ui.props!['cascade'] = false;
    expect(validateDocument(cascade).valid).toBe(true);
    for (const kind of ['tree.editor', 'field.select', 'table'])
      expect(validateDocument(model(kind)).valid).toBe(false);
    const editor = model('tree.editor', { nodes: [], resource: 'hierarchy' });
    expect(validateDocument(editor).diagnostics).toContainEqual(
      expect.objectContaining({ code: 'property.unknown', path: '/ui/props/resource' }),
    );
  });
});
