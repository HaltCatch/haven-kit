import { describe, expect, it } from 'vitest';
import { coreManifests, validateDocument } from '@haven/schema';
import type { DataSchema, JsonValue } from '@haven/schema';
import { reconcileData } from '@haven/runtime';
import { model } from './schema-support.js';

const config = { parentPath: '/parent', rootValue: '' };
const rowsSchema = (value: ReturnType<typeof model>) =>
  value.dataSchema.properties!['rows']!.items!;
const diagnostics = (value: ReturnType<typeof model>, code: string, path: string) =>
  expect(validateDocument(value).diagnostics).toContainEqual(
    expect.objectContaining({ code, path, nodeId: 'table' }),
  );

describe('model driven local hierarchy', () => {
  it('keeps flat tables valid and advertises optional hierarchy, typed expansion and an explicit event', () => {
    expect(validateDocument(model()).diagnostics).toEqual([]);
    const manifest = coreManifests.find((entry) => entry.kind === 'table')!;
    expect(manifest.properties['hierarchy']).toEqual({ type: 'object', label: '本地树形行' });
    expect(manifest.properties['expandedRowKeys']).toEqual({
      type: 'array',
      label: '初始展开行键',
    });
    expect(manifest.events).toContain('expandedChange');
    const value = model(config),
      before = structuredClone(value);
    value.ui.props!['expandedRowKeys'] = ['root'];
    value.ui.events = { expandedChange: ['observe'] };
    value.actions = { observe: { handler: 'host.observeExpansion' } };
    value.ui.props!['headerGroups'] = [{ id: 'details', header: 'Details', children: ['name'] }];
    expect(validateDocument(value).diagnostics).toEqual([]);
    expect(value.dataSchema).toEqual(before.dataSchema);
    expect(value.ui.props!['hierarchy']).toEqual(config);
  });

  it('locates invalid configuration and rejects remote page semantics without altering either resource', () => {
    const value = model(config);
    value.ui.props!['resource'] = 'records';
    value.resources = { records: { type: 'query', adapter: 'host.records' } };
    const before = structuredClone(value);
    diagnostics(value, 'table.hierarchyResource', '/ui/props/resource');
    expect(value).toEqual(before);
    value.ui.props!['hierarchy'] = { parentPath: '/parent' };
    diagnostics(value, 'table.hierarchy', '/ui/props/hierarchy');
  });

  it('checks explicit parent fields and row-key type compatibility through local schema references', () => {
    for (const parent of [
      undefined,
      { type: 'boolean' },
      { type: 'number' },
      { type: 'object', properties: {} },
    ] as const) {
      const value = model(config);
      if (parent) rowsSchema(value).properties!['parent'] = parent as DataSchema;
      else delete rowsSchema(value).properties!['parent'];
      diagnostics(value, 'table.hierarchyParent', '/ui/props/hierarchy/parentPath');
    }
    const referenced = model(config);
    referenced.dataSchema.$defs = { parent: { type: 'string' } };
    rowsSchema(referenced).properties!['parent'] = { $ref: '#/$defs/parent' };
    expect(validateDocument(referenced).diagnostics).toEqual([]);
  });

  it('never guesses a string marker for null, while preserving native numeric null roots', () => {
    const stringNull = model({ parentPath: '/parent', rootValue: null });
    diagnostics(stringNull, 'table.hierarchyRoot', '/ui/props/hierarchy/rootValue');
    const value = model({ parentPath: '/parent', rootValue: null });
    rowsSchema(value).properties!['key'] = { type: 'number' };
    rowsSchema(value).properties!['parent'] = { type: 'number' };
    value.ui.props!['expandedRowKeys'] = [0];
    const data = {
      rows: [
        { key: 0, parent: null, name: 'Root' },
        { key: 1, parent: 0, name: 'Child' },
      ],
    };
    expect(reconcileData(value.dataSchema, data)).toEqual(data);
    expect(validateDocument(value).diagnostics).toEqual([]);
    const rootsOnly = model({ parentPath: '/parent', rootValue: null });
    rowsSchema(rootsOnly).properties!['parent'] = { type: 'null' };
    expect(validateDocument(rootsOnly).diagnostics).toEqual([]);
    rootsOnly.ui.props!['hierarchy'] = { parentPath: '/parent', rootValue: '' };
    diagnostics(rootsOnly, 'table.hierarchyRoot', '/ui/props/hierarchy/rootValue');
  });

  it('protects parent structure from ordinary editing, including nested ancestors and descendants', () => {
    const value = model(config);
    value.ui.props!['columns'] = [
      { id: 'parent', header: 'Parent', path: '/parent', editor: { id: 'text' } },
    ];
    diagnostics(value, 'table.hierarchyPaths', '/ui/props/hierarchy/parentPath');
    value.ui.props!['columns'] = [{ id: 'parent', header: 'Parent', path: '/parent' }];
    expect(validateDocument(value).diagnostics).toEqual([]);
    value.ui.props!['hierarchy'] = { parentPath: '/key', rootValue: '' };
    diagnostics(value, 'table.hierarchyPaths', '/ui/props/hierarchy/parentPath');
  });

  it('requires initial expansion keys to match the declared key type and excludes the synthetic marker', () => {
    for (const expanded of [[0], ['root', 'root'], [''], ['marker']] as JsonValue[]) {
      const value = model({ parentPath: '/parent', rootValue: 'marker' });
      value.ui.props!['expandedRowKeys'] = expanded;
      diagnostics(value, 'table.expandedRowKeys', '/ui/props/expandedRowKeys');
    }
    const flat = model();
    flat.ui.props!['expandedRowKeys'] = ['root'];
    diagnostics(flat, 'table.expandedRowKeys', '/ui/props/expandedRowKeys');
    flat.ui.props!['expandedRowKeys'] = [];
    expect(validateDocument(flat).diagnostics).toEqual([]);
  });
});
