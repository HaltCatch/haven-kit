import { describe, expect, it } from 'vitest';
import {
  compareTableValues,
  isTableColumns,
  isTablePointer,
  tableRowId,
  validateTableData,
} from '../packages/schema/src/table.js';
import type { TableColumn } from '../packages/schema/src/table.js';

const columns: TableColumn[] = [
  {
    id: 'name',
    header: { default: 'Name', translations: { 'zh-CN': '名称' } },
    path: '/profile/name',
    type: 'text',
  },
  { id: 'amount', header: 'Amount', path: '/amount', type: 'number' },
];

describe('generic local table contract', () => {
  it('accepts localizable nested columns but rejects duplicate IDs and unsupported configuration', () => {
    expect(isTableColumns(columns)).toBe(true);
    expect(isTableColumns([...columns, columns[0]])).toBe(false);
    expect(isTableColumns([{ ...columns[0], render: 'eval()' }])).toBe(false);
    expect(isTableColumns([{ ...columns[0], type: 'html' }])).toBe(false);
    expect(isTableColumns([{ ...columns[0], type: ['number'] }])).toBe(false);
    expect(isTableColumns([])).toBe(false);
    expect(
      isTableColumns(
        Array.from({ length: 101 }, (_, id) => ({ id: `c${id}`, header: 'Name', path: '/name' })),
      ),
    ).toBe(false);
  });
  it('uses explicit safe JSON Pointers, including escaped property names', () => {
    expect(isTablePointer('/a~1b/c~0d')).toBe(true);
    for (const path of ['', 'profile.name', '/__proto__/value', '/constructor', '/a~2b'])
      expect(isTablePointer(path)).toBe(false);
    expect(isTableColumns([{ id: 'name', header: 'Name', path: '/prototype/name' }])).toBe(false);
  });
  it('distinguishes numeric zero from string zero and never silently substitutes indexes', () => {
    expect(tableRowId({ id: 0 }, '/id')).toBe('number:0');
    expect(tableRowId({ id: '0' }, '/id')).toBe('string:0');
    expect(validateTableData([{ id: 0 }, { id: '0' }], columns, '/id')).toBeNull();
    expect(() => tableRowId({}, '/id')).toThrow();
    expect(() => tableRowId({ id: '' }, '/id')).toThrow();
    expect(() => tableRowId({ id: true }, '/id')).toThrow();
  });
  it('identifies missing/duplicate keys before rendering or sorting', () => {
    expect(validateTableData([{ id: 'a' }, { id: 'a' }], columns, '/id')).toEqual({
      code: 'duplicateKey',
      row: 1,
    });
    expect(validateTableData([{ id: 'a' }, {}], columns, '/id')).toEqual({
      code: 'rowKey',
      row: 1,
    });
    expect(validateTableData([null], columns, '/id')).toEqual({ code: 'rows', row: 0 });
    expect(validateTableData({}, columns, '/id')).toEqual({ code: 'rows' });
    expect(validateTableData([], columns, 'id')).toEqual({ code: 'rowKey' });
    expect(validateTableData([], [], '/id')).toEqual({ code: 'columns' });
  });
  it('preserves caller rows and rejects structured or incorrectly typed display values', () => {
    const rows = [
      { id: 0, profile: { name: 'Alice' }, amount: 0 },
      { id: 'b', profile: { name: '' }, amount: null },
    ];
    const before = structuredClone(rows);
    expect(validateTableData(rows, columns, '/id')).toBeNull();
    expect(rows).toEqual(before);
    expect(validateTableData([{ id: 1, amount: '12' }], columns, '/id')).toEqual({
      code: 'cellValue',
      row: 0,
      column: 'amount',
    });
    expect(validateTableData([{ id: 1, amount: Infinity }], columns, '/id')).toEqual({
      code: 'cellValue',
      row: 0,
      column: 'amount',
    });
    expect(validateTableData([{ id: 1, amount: {} }], columns, '/id')).toEqual({
      code: 'cellValue',
      row: 0,
      column: 'amount',
    });
  });
  it('sorts native values without lexicographic numeric errors or mutating stored values', () => {
    const collator = new Intl.Collator('en', { numeric: true });
    expect(compareTableValues(2, 10, collator)).toBeLessThan(0);
    expect(compareTableValues(false, true, collator)).toBeLessThan(0);
    expect(compareTableValues('Item 2', 'Item 10', collator)).toBeLessThan(0);
    expect(compareTableValues(null, 0, collator)).toBeLessThan(0);
    expect(compareTableValues(0, undefined, collator)).toBeGreaterThan(0);
    expect(compareTableValues(0, 0, collator)).toBe(0);
    expect(compareTableValues(0, '0', collator)).not.toBe(0);
  });
});
