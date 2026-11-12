import { describe, expect, it } from 'vitest';
import {
  isTableColumns,
  isTableRendererId,
  isTableRendererParams,
  validateTableData,
} from '../packages/schema/src/table.js';

const column = {
  id: 'amount',
  header: 'Amount',
  path: '/amount',
  type: 'number' as const,
  renderer: 'example.amount-v1',
  rendererParams: { currency: 'EUR', options: { digits: 2 } },
};
describe('table custom cell renderer contract', () => {
  it('accepts stable host IDs and serializable params but never module URLs or scripts', () => {
    expect(isTableColumns([column])).toBe(true);
    expect(isTableRendererId('example.amount-v1')).toBe(true);
    for (const id of [
      '',
      'https://host/x.js',
      'import(x)',
      '../renderer',
      'eval()',
      'x'.repeat(129),
    ])
      expect(isTableRendererId(id)).toBe(false);
    expect(isTableColumns([{ ...column, renderer: 'https://host/x.js' }])).toBe(false);
    expect(
      isTableColumns([{ id: 'amount', header: 'Amount', path: '/amount', rendererParams: {} }]),
    ).toBe(false);
    expect(isTableColumns([{ ...column, rendererParams: ['EUR'] }])).toBe(false);
  });
  it('rejects functions, classes, cycles and excessive parameter resources', () => {
    expect(isTableRendererParams({ currency: 'EUR', flags: [true, 0, null] })).toBe(true);
    for (const value of [
      { fn: () => 1 },
      { value: undefined },
      { value: Infinity },
      { value: new Date() },
      { value: BigInt(1) },
    ])
      expect(isTableRendererParams(value)).toBe(false);
    const cyclic: Record<string, unknown> = {};
    cyclic['self'] = cyclic;
    expect(isTableRendererParams(cyclic)).toBe(false);
    expect(isTableRendererParams({ text: 'x'.repeat(16384) })).toBe(false);
    expect(isTableRendererParams({ items: Array.from({ length: 2049 }, () => 1) })).toBe(false);
    let deep: unknown = {};
    for (let i = 0; i < 18; i++) deep = { next: deep };
    expect(isTableRendererParams(deep)).toBe(false);
    const getter = Object.defineProperty({}, 'secret', {
      get: () => {
        throw new Error('Getter must not execute');
      },
      enumerable: true,
    });
    expect(isTableRendererParams(getter)).toBe(false);
    expect(isTableRendererParams({ values: new Array(2) })).toBe(false);
    expect(isTableRendererParams({ values: Object.assign([1], { extra: true }) })).toBe(false);
  });
  it('keeps scalar custom columns sortable and enforces scalar type compatibility', () => {
    expect(validateTableData([{ id: 0, amount: 10 }], [column], '/id')).toBeNull();
    expect(validateTableData([{ id: 0, amount: { value: 10 } }], [column], '/id')).toEqual({
      code: 'cellValue',
      row: 0,
      column: 'amount',
    });
    const structured = {
      id: 'profile',
      header: 'Profile',
      path: '/profile',
      renderer: 'example.profile',
    };
    expect(isTableColumns([structured])).toBe(true);
    expect(isTableColumns([{ ...structured, sortable: true }])).toBe(false);
    expect(
      validateTableData(
        [{ id: 0, profile: { display: 'A', tags: ['one', 'two'] } }],
        [structured],
        '/id',
      ),
    ).toBeNull();
    expect(
      validateTableData(
        [{ id: 0, profile: {} }],
        [{ id: 'profile', header: 'Profile', path: '/profile' }],
        '/id',
      ),
    ).toEqual({ code: 'cellValue', row: 0, column: 'profile' });
  });
  it('validates the complete row snapshot rather than passing executable sibling values to custom components', () => {
    expect(validateTableData([{ id: 0, amount: 10, sibling: () => 1 }], [column], '/id')).toEqual({
      code: 'cellValue',
      row: 0,
    });
    const cyclic: Record<string, unknown> = { id: 0, amount: 10 };
    cyclic['self'] = cyclic;
    expect(validateTableData([cyclic], [column], '/id')).toEqual({ code: 'cellValue', row: 0 });
  });
});
