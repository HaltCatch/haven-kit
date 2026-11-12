import { describe, expect, it, vi } from 'vitest';
import {
  isTableExpandedRowKeys,
  isTableHierarchy,
  tableHierarchyEditPathsValid,
} from '@haven/schema';
import type { TableColumn, TableHierarchy } from '@haven/schema';

const hierarchy: TableHierarchy = { parentPath: '/relation/parent', rootValue: '' };
const columns: TableColumn[] = [
  { id: 'name', header: 'Name', path: '/name', editor: { id: 'text' } },
];

describe('table hierarchy JSON contract', () => {
  it('keeps root markers explicit and typed and supports both filtering and pagination modes', () => {
    for (const rootValue of ['', '0', 0, null]) {
      expect(isTableHierarchy({ ...hierarchy, rootValue })).toBe(true);
      for (const filterMode of ['retain-ancestors', 'prune-branches'])
        for (const pagination of ['root-rows', 'visible-rows'])
          expect(isTableHierarchy({ ...hierarchy, rootValue, filterMode, pagination })).toBe(true);
    }
    const value = Object.assign(Object.create(null) as object, hierarchy);
    expect(isTableHierarchy(Object.freeze(value))).toBe(true);
    expect(isTableHierarchy(hierarchy)).toBe(true);
    expect(hierarchy).toEqual({ parentPath: '/relation/parent', rootValue: '' });
  });

  it.each([
    null,
    [],
    {},
    { parentPath: '/parent' },
    { rootValue: null },
    { parentPath: '', rootValue: '' },
    { parentPath: 'parent', rootValue: '' },
    { parentPath: '/bad~escape', rootValue: '' },
    { parentPath: '/__proto__/parent', rootValue: '' },
    { ...hierarchy, parentPath: '/' + 'x'.repeat(1024) },
    { ...hierarchy, rootValue: NaN },
    { ...hierarchy, rootValue: Infinity },
    { ...hierarchy, rootValue: false },
    { ...hierarchy, rootValue: {} },
    { ...hierarchy, rootValue: 'x'.repeat(4097) },
    { ...hierarchy, filterMode: 'guess' },
    { ...hierarchy, pagination: 'loaded-page' },
    { ...hierarchy, url: 'https://invalid.example' },
    { ...hierarchy, getSubRows: () => [] },
  ])('rejects absent markers, unsafe pointers and unsupported configuration: %j', (value) => {
    expect(isTableHierarchy(value)).toBe(false);
  });

  it('never evaluates configuration or expansion accessors and rejects classes, symbols and sparse arrays', () => {
    const getter = vi.fn(() => '/parent');
    const config = { rootValue: '' };
    Object.defineProperty(config, 'parentPath', { enumerable: true, get: getter });
    const nonEnumerable = { ...hierarchy };
    Object.defineProperty(nonEnumerable, 'rootValue', { value: '', enumerable: false });
    class DomainConfig {
      parentPath = '/parent';
      rootValue = '';
    }
    for (const value of [
      config,
      nonEnumerable,
      new DomainConfig(),
      { ...hierarchy, [Symbol('private')]: true },
    ])
      expect(isTableHierarchy(value)).toBe(false);
    const keys = [0];
    Object.defineProperty(keys, 0, { enumerable: true, get: getter });
    const extra = [0];
    Object.defineProperty(extra, 'domain', { value: true });
    const symbol = [0];
    Object.defineProperty(symbol, Symbol('private'), { value: true });
    class KeyList extends Array<number> {}
    for (const value of [keys, extra, symbol, new Array(1), new KeyList(0)])
      expect(isTableExpandedRowKeys(value)).toBe(false);
    expect(getter).not.toHaveBeenCalled();
  });
});

describe('public expansion keys', () => {
  it('preserves typed zero and uses a bounded complete array of unique keys', () => {
    expect(isTableExpandedRowKeys([0, '0'])).toBe(true);
    expect(isTableExpandedRowKeys(Object.freeze([]))).toBe(true);
    expect(isTableExpandedRowKeys(Array.from({ length: 5000 }, (_, key) => key))).toBe(true);
    for (const value of [
      null,
      {},
      [0, 0],
      ['', 'a'],
      [NaN],
      [Infinity],
      [null],
      Array.from({ length: 5001 }, (_, key) => key),
    ])
      expect(isTableExpandedRowKeys(value)).toBe(false);
  });
});

describe('structure editing boundary', () => {
  it('allows ordinary cell editors and readonly parent columns without coupling to field names', () => {
    expect(tableHierarchyEditPathsValid(columns, '/key', undefined)).toBe(true);
    expect(tableHierarchyEditPathsValid(columns, '/key', hierarchy)).toBe(true);
    expect(
      tableHierarchyEditPathsValid(
        [...columns, { id: 'parent', header: 'Parent', path: hierarchy.parentPath }],
        '/key',
        hierarchy,
      ),
    ).toBe(true);
    // A slash inside an object key is not a parent/child relationship between pointer segments.
    expect(
      tableHierarchyEditPathsValid(
        [{ id: 'name', header: 'Name', path: '/relation/parent', editor: { id: 'text' } }],
        '/key',
        { parentPath: '/relation~1parent', rootValue: '' },
      ),
    ).toBe(true);
  });

  it('rejects both directions of overlap for keys and built-in or host cell editors', () => {
    for (const parentPath of ['/key', '/key/nested', '/relation'])
      expect(
        tableHierarchyEditPathsValid(
          columns,
          parentPath === '/relation' ? '/relation/key' : '/key',
          { ...hierarchy, parentPath },
        ),
      ).toBe(false);
    for (const path of ['/relation', '/relation/parent', '/relation/parent/nested'])
      for (const id of ['text', 'host.editor'])
        expect(
          tableHierarchyEditPathsValid(
            [{ ...columns[0], path, editor: { id } }],
            '/key',
            hierarchy,
          ),
        ).toBe(false);
    expect(tableHierarchyEditPathsValid([], '/key', hierarchy)).toBe(false);
    expect(tableHierarchyEditPathsValid(columns, '/__proto__', hierarchy)).toBe(false);
    expect(tableHierarchyEditPathsValid(columns, '/key', { parentPath: '/parent' })).toBe(false);
  });
});
