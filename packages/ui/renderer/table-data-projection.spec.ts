import { expect, it, vi } from 'vitest';
import { validateTableData } from '@haven/schema';
import { projectTableRows, tableBindingValue } from './table-data-projection';

it('copies every JSON string property, ignores all symbol metadata and keeps transport validation strict', () => {
  const getter = vi.fn(() => 'private');
  const row = { id: 0, name: 'First', unknown: { nested: [1, false, null] } };
  Object.defineProperty(row, Symbol('host identity'), { get: getter, enumerable: true });
  const columns = [{ id: 'name', header: 'Name', path: '/name', renderer: 'test.cell' }];
  expect(validateTableData([row], columns, '/id')).toEqual({ code: 'cellValue', row: 0 });
  const rows = projectTableRows(tableBindingValue({ rows: [row] }, '/rows'));
  expect(rows).toEqual([{ id: 0, name: 'First', unknown: { nested: [1, false, null] } }]);
  expect(rows![0]).not.toBe(row);
  expect(Object.getOwnPropertySymbols(rows![0]!)).toEqual([]);
  expect(validateTableData(rows, columns, '/id')).toBeNull();
  expect(getter).not.toHaveBeenCalled();
});
it('rejects string accessors along the binding and inside rows without calling them', () => {
  const getter = vi.fn(() => []);
  const source = Object.defineProperty({}, 'rows', { get: getter, enumerable: true });
  const row = Object.defineProperty({ id: 0 }, 'name', { get: getter, enumerable: true });
  expect(projectTableRows(tableBindingValue(source, '/rows'))).toBeNull();
  expect(projectTableRows([row])).toBeNull();
  expect(getter).not.toHaveBeenCalled();
});
it('keeps cycles, sparse/extra arrays, invalid numbers/prototypes and hidden data as errors, not empty rows', () => {
  const cycle: Record<string, unknown> = { id: 0 };
  cycle['self'] = cycle;
  const sparse = [1, 2];
  Reflect.deleteProperty(sparse, '0');
  const extra = Object.assign([1], { extra: 'not JSON' });
  const hidden = Object.defineProperty({ id: 0 }, 'name', { value: 'hidden' });
  for (const invalid of [
    [cycle],
    [{ id: 0, value: sparse }],
    [{ id: 0, value: extra }],
    [{ id: 0, value: NaN }],
    [{ id: 0, value: Infinity }],
    [{ id: 0, value: new Date() }],
    [{ id: 0, value: undefined }],
    [hidden],
    sparse,
    Object.assign([{ id: 0 }], { extra: true }),
  ])
    expect(projectTableRows(invalid)).toBeNull();
  expect(projectTableRows([])).toEqual([]);
});
