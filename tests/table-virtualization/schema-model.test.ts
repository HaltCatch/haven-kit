import { describe, expect, it } from 'vitest';
import { coreManifests, validateDocument } from '@haven/schema';
import type { JsonValue } from '@haven/schema';
import { model } from '../table-hierarchy/schema-support.js';

describe('model virtualization diagnostics', () => {
  it('adds one optional display property without a new component kind or version', () => {
    const manifest = coreManifests.find((entry) => entry.kind === 'table')!;
    expect(manifest.version).toBe(1);
    expect(manifest.properties['virtualization']).toEqual({ type: 'object', label: '虚拟滚动' });
    const value = model(),
      before = structuredClone(value);
    expect(validateDocument(value).diagnostics).toEqual([]);
    value.ui.props!['virtualization'] = {};
    expect(validateDocument(value).diagnostics).toEqual([]);
    expect(value).toEqual({
      ...before,
      ui: { ...before.ui, props: { ...before.ui.props, virtualization: {} } },
    });
  });

  it('allows local flat/hierarchical collections and remote loaded pages without rewriting resources', () => {
    const local = model({ parentPath: '/parent', rootValue: '' });
    local.ui.props!['virtualization'] = { viewportHeight: 480, estimateRowHeight: 36, overscan: 5 };
    expect(validateDocument(local).diagnostics).toEqual([]);
    const remote = model();
    remote.ui.props = { ...remote.ui.props, virtualization: {}, resource: 'records', pageSize: 25 };
    remote.resources = { records: { type: 'query', adapter: 'host.records' } };
    const before = structuredClone(remote);
    expect(validateDocument(remote).diagnostics).toEqual([]);
    expect(remote).toEqual(before);
    remote.ui.props!['hierarchy'] = { parentPath: '/parent', rootValue: '' };
    expect(validateDocument(remote).diagnostics).toContainEqual(
      expect.objectContaining({ code: 'table.hierarchyResource' }),
    );
  });

  it.each([
    { value: { viewportHeight: 63 }, property: 'viewportHeight' },
    { value: { estimateRowHeight: 513 }, property: 'estimateRowHeight' },
    { value: { overscan: 0.5 }, property: 'overscan' },
    { value: { viewportHeight: '480px' }, property: 'viewportHeight' },
    { value: { 'unknown/key~': 1 }, property: 'unknown~1key~0' },
  ])(
    'locates the invalid $property as an exact JSON pointer for tools and people',
    ({ value, property }) => {
      const document = model();
      document.ui.props!['virtualization'] = value as JsonValue;
      const result = validateDocument(document);
      expect(result.structural).toBe(true);
      expect(result.diagnostics).toEqual([
        expect.objectContaining({
          code: 'table.virtualization',
          nodeId: 'table',
          path: `/ui/props/virtualization/${property}`,
        }),
      ]);
    },
  );

  it('reports whole-property shape defects without guessing an enabled/default configuration', () => {
    for (const virtualization of [null, false, [], 'auto']) {
      const value = model();
      value.ui.props!['virtualization'] = virtualization;
      expect(validateDocument(value).diagnostics).toContainEqual(
        expect.objectContaining({
          code: 'table.virtualization',
          path: '/ui/props/virtualization',
          nodeId: 'table',
        }),
      );
    }
  });

  it('uses the actual nested component path instead of hardcoding the document root', () => {
    const value = model();
    const table = value.ui;
    table.props!['virtualization'] = { overscan: 51 };
    value.ui = { id: 'container', kind: 'layout.stack', version: 1, children: [table] };
    expect(validateDocument(value).diagnostics).toEqual([
      expect.objectContaining({
        code: 'table.virtualization',
        nodeId: 'table',
        path: '/ui/children/0/props/virtualization/overscan',
      }),
    ]);
  });

  it('keeps valid settings on readonly/disabled tables and does not bypass validation for them', () => {
    const value = model();
    value.ui.props = { ...value.ui.props, readonly: true, virtualization: { overscan: 0 } };
    value.ui.rules = { disabled: { op: 'eq', left: { literal: true }, right: { literal: true } } };
    const before = structuredClone(value);
    expect(validateDocument(value).diagnostics).toEqual([]);
    expect(value).toEqual(before);
    value.ui.props!['virtualization'] = { overscan: -1 };
    expect(validateDocument(value).diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'table.virtualization',
        path: '/ui/props/virtualization/overscan',
      }),
    );
  });
});
