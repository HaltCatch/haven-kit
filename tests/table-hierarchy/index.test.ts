import { describe, expect, it } from 'vitest';
import { buildTableHierarchy } from '@haven/runtime';
import { hierarchy, ready, row } from './support.js';

describe('complete local table hierarchy', () => {
  it('indexes out-of-order records while retaining original flat and sibling order', () => {
    const rows = [
      row('child-b', 'root'),
      row('other', null),
      row('root', null),
      row('child-a', 'root'),
      row('grandchild', 'child-a'),
    ];
    const before = structuredClone(rows),
      index = ready(rows);
    expect(index.rows).toEqual(rows);
    expect(index.roots).toEqual([rows[1], rows[2]]);
    expect(index.children.get('root')).toEqual([rows[0], rows[3]]);
    expect(index.children.get('child-a')).toEqual([rows[4]]);
    expect(index.children.get('grandchild')).toEqual([]);
    expect(index.entries.get('grandchild')).toEqual({
      row: rows[4],
      index: 4,
      parentKey: 'child-a',
      depth: 2,
    });
    expect(index.entries.get('child-b')?.row).toBe(rows[0]);
    expect(index.children.get('root')?.[1]).toBe(rows[3]);
    expect(rows).toEqual(before);
  });

  it('keeps numeric zero and string zero distinct in keys, parent lookup and root markers', () => {
    const zero = row(0, null),
      string = row('0', null),
      child = row('child', 0),
      other = row('other', '0');
    const index = ready([zero, string, child, other]);
    expect(index.entries.size).toBe(4);
    expect(index.children.get(0)).toEqual([child]);
    expect(index.children.get('0')).toEqual([other]);
    const marker = buildTableHierarchy([row('0', 0), row('child', '0')], '/id', {
      ...hierarchy,
      rootValue: 0,
    });
    expect(marker.status).toBe('ready');
    if (marker.status === 'ready') expect(marker.index.roots[0]?.['id']).toBe('0');
  });

  it('supports explicit empty-string roots and escaped nested pointer names without domain defaults', () => {
    const rows = [
      { identity: { 'key/name': 'root' }, linkage: { 'parent~id': '' } },
      { identity: { 'key/name': 'child' }, linkage: { 'parent~id': 'root' } },
    ];
    const result = buildTableHierarchy(rows, '/identity/key~1name', {
      parentPath: '/linkage/parent~0id',
      rootValue: '',
    });
    expect(result.status).toBe('ready');
    if (result.status === 'ready') {
      expect(result.index.roots).toEqual([rows[0]]);
      expect(result.index.children.get('root')?.[0]).toBe(rows[1]);
      expect(result.index.entries.get('root')?.parentKey).toBeNull();
      expect(rows[0]!.linkage['parent~id']).toBe('');
    }
  });

  it('accepts an empty complete collection and the exact 5000-row, 32-level boundaries', () => {
    expect(ready([]).roots).toEqual([]);
    const broad = Array.from({ length: 5000 }, (_, index) => row(index, null));
    expect(ready(broad).roots).toHaveLength(5000);
    const deep = Array.from({ length: 32 }, (_, index) => row(index, index ? index - 1 : null));
    expect(ready(deep.reverse()).entries.get(31)?.depth).toBe(31);
  });

  it('does not interpret filtering and pagination options as permission to transform source records', () => {
    const rows = [row('root', null, { amount: 10 }), row('child', 'root', { amount: 0 })];
    const result = buildTableHierarchy(rows, '/id', {
      ...hierarchy,
      filterMode: 'retain-ancestors',
      pagination: 'root-rows',
    });
    expect(result.status).toBe('ready');
    if (result.status === 'ready') {
      expect(result.index.rows[1]).toBe(rows[1]);
      expect(result.index.children.get('root')?.[0]).toBe(rows[1]);
    }
  });
});
