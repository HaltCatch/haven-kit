import { describe, expect, it } from 'vitest';
import {
  isTableFilter,
  isTableRowKey,
  isTableSelection,
  isTableView,
} from '../packages/schema/src/table-view.js';
import type { TableColumn } from '../packages/schema/src/table.js';
const columns: TableColumn[] = [
  { id: 'label', header: 'Label', path: '/label' },
  { id: 'amount', header: 'Amount', path: '/amount' },
  { id: 'active', header: 'Active', path: '/active' },
];
describe('table view and interaction contracts', () => {
  it('keeps numeric and textual keys distinct, rejects duplicates and unstable values', () => {
    expect(isTableSelection([0, '0', 1, 'a'])).toBe(true);
    for (const value of [[0, 0], ['a', 'a'], [null], [true], [{}], [NaN], [Infinity], [''], 'a'])
      expect(isTableSelection(value)).toBe(false);
    expect(isTableRowKey(-2)).toBe(true);
    expect(isTableRowKey('x'.repeat(4097))).toBe(false);
  });
  it('validates independent ordering, hidden and logical pinned regions', () => {
    expect(
      isTableView(
        {
          order: ['amount', 'label'],
          hidden: ['active'],
          pinned: { start: ['label'], end: ['amount'] },
          widths: { label: 240 },
        },
        columns,
      ),
    ).toBe(true);
    expect(isTableView({}, columns)).toBe(true);
    expect(isTableView({ order: ['label', 'label'] }, columns)).toBe(false);
    expect(isTableView({ pinned: { start: ['label'], end: ['label'] } }, columns)).toBe(false);
    expect(isTableView({ pinned: { left: ['label'] } }, columns)).toBe(false);
    expect(isTableView({ arbitraryScript: 'x' }, columns)).toBe(false);
  });
  it('rejects unknown column references and hiding every existing column', () => {
    for (const value of [
      { order: ['missing'] },
      { hidden: ['missing'] },
      { pinned: { start: ['missing'] } },
      { widths: { missing: 200 } },
    ])
      expect(isTableView(value, columns)).toBe(false);
    expect(isTableView({ hidden: ['label', 'amount', 'active'] }, columns)).toBe(false);
    expect(isTableView({ hidden: ['active'] }, columns)).toBe(true);
  });
  it('bounds widths and identifiers rather than accepting arbitrary CSS', () => {
    for (const width of [0, 47, 1201, -20, 80.5, Infinity, '100px', null])
      expect(isTableView({ widths: { label: width } }, columns)).toBe(false);
    expect(isTableView({ widths: { label: 48, amount: 1200 } }, columns)).toBe(true);
    expect(isTableView({ order: ['bad/id'] })).toBe(false);
    expect(isTableView({ order: ['__proto__'] })).toBe(false);
    expect(isTableView({ pinned: { start: null } })).toBe(false);
  });
  it('limits text filter inputs while keeping literal punctuation nonexecutable', () => {
    expect(isTableFilter('')).toBe(true);
    expect(isTableFilter('<script>literal.*</script>')).toBe(true);
    expect(isTableFilter('x'.repeat(2000))).toBe(true);
    expect(isTableFilter('x'.repeat(2001))).toBe(false);
    expect(isTableFilter({ text: 'a' })).toBe(false);
  });
});
