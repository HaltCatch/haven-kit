import { describe, expect, it } from 'vitest';
import type { JsonObject, TableRowKey } from '@haven/schema';
import type { TableHierarchyEntry } from '@haven/runtime';
import { ready, row } from './support.js';

describe('table hierarchy immutable owned index', () => {
  it('freezes owned arrays and metadata but leaves original host records untouched', () => {
    const rows = [row('root', null, { title: 'Original' }), row('child', 'root')],
      index = ready(rows);
    expect(index.rows).not.toBe(rows);
    expect(index.rows[0]).toBe(rows[0]);
    expect(index.entries.get('root')?.row).toBe(rows[0]);
    expect(Object.isFrozen(rows)).toBe(false);
    expect(Object.isFrozen(rows[0])).toBe(false);
    expect(Object.isFrozen(index)).toBe(true);
    expect(Object.isFrozen(index.rows)).toBe(true);
    expect(Object.isFrozen(index.roots)).toBe(true);
    expect(Object.isFrozen(index.children.get('root'))).toBe(true);
    expect(Object.isFrozen(index.entries.get('root'))).toBe(true);
    rows[0]!['title'] = 'Host owns this';
    expect(index.entries.get('root')?.row['title']).toBe('Host owns this');
    expect(index.entries.get('root')?.parentKey).toBeNull();
    expect(() => (index.roots as JsonObject[]).push(row('bad', null))).toThrow();
  });

  it('provides the standard read-only Map API without leaking a mutable Map through callbacks', () => {
    const index = ready([row(0, null), row('0', 0)]);
    expect([...index.entries.keys()]).toEqual([0, '0']);
    expect([...index.entries.values()].map((entry) => entry.index)).toEqual([0, 1]);
    expect([...index.entries.entries()]).toEqual([...index.entries]);
    expect(index.entries.has('missing')).toBe(false);
    const owner = {};
    index.entries.forEach(function (this: object, _value, key, map) {
      expect(this).toBe(owner);
      expect(map).toBe(index.entries);
      expect(map.has(key)).toBe(true);
      expect('set' in map).toBe(false);
    }, owner);
    const mutable = index.entries as Map<TableRowKey, TableHierarchyEntry>;
    expect(() => mutable.set('injected', index.entries.get(0)!)).toThrow();
    expect(() => Map.prototype.set.call(index.children, 'injected', [])).toThrow();
    expect(index.entries.size).toBe(2);
    expect(index.children.get('0')).toEqual([]);
  });
});
