import { describe, expect, it, vi } from 'vitest';
import { isTableHeaderLayout } from '@haven/schema';
import type { TableHeaderLayout } from '@haven/schema';
import { columns } from './support.js';

describe('bounded presentation-only grouped headers', () => {
  it('accepts mixed nested groups and localizable labels while keeping caller inputs unchanged', () => {
    const layout: TableHeaderLayout = [
      {
        id: 'details',
        header: { default: 'Details', translations: { 'zh-CN': '详情' } },
        children: ['name'],
      },
      {
        id: 'values',
        header: 'Values',
        children: [{ id: 'nested', header: '', children: ['amount'] }],
      },
    ];
    const before = structuredClone({ layout, columns });
    expect(isTableHeaderLayout(layout, columns)).toBe(true);
    expect({ layout, columns }).toEqual(before);
    expect(isTableHeaderLayout(['amount', 'name'], columns)).toBe(true);
    // Group IDs have an independent presentation namespace; they may equal a public leaf ID.
    expect(
      isTableHeaderLayout([{ id: 'name', header: 'Group', children: ['name', 'amount'] }], columns),
    ).toBe(true);
  });

  it.each([
    undefined,
    null,
    [],
    ['name'],
    ['name', 'name', 'amount'],
    ['name', 'unknown'],
    [0, 'amount'],
    [{ id: 'empty', header: 'Empty', children: [] }, 'name', 'amount'],
    [
      { id: 'same', header: 'One', children: ['name'] },
      { id: 'same', header: 'Two', children: ['amount'] },
    ],
    [{ id: 'invalid:id', header: 'No', children: ['name', 'amount'] }],
    [{ id: 'a', header: 'No', children: ['name', 'amount'], renderer: 'application.handler' }],
    [{ id: 'a', header: 42, children: ['name', 'amount'] }],
    [{ id: 'a', header: 'x'.repeat(4097), children: ['name', 'amount'] }],
    [
      {
        id: 'a',
        header: { default: 'A', translations: { invalid_locale: 'A' } },
        children: ['name', 'amount'],
      },
    ],
  ])('rejects incomplete, duplicate, malformed or executable layouts: %j', (layout) => {
    expect(isTableHeaderLayout(layout, columns)).toBe(false);
  });

  it('rejects invalid flat columns rather than changing the independent data contract', () => {
    expect(isTableHeaderLayout(['name', 'amount'], [])).toBe(false);
    expect(
      isTableHeaderLayout(['name', 'amount'], [{ ...columns[0], renderer: 'https://bad' }]),
    ).toBe(false);
    expect(isTableHeaderLayout(['name', 'amount'], [...columns, columns[0]])).toBe(false);
  });

  it('rejects cycles, sparse arrays, symbols, classes and accessors without evaluating labels', () => {
    const group: { id: string; header: string; children: unknown[] } = {
      id: 'cycle',
      header: 'Cycle',
      children: [],
    };
    group.children.push(group);
    const getter = vi.fn(() => 'A');
    const withGetter = { id: 'getter', children: ['name', 'amount'] };
    Object.defineProperty(withGetter, 'header', { get: getter, enumerable: true });
    const label = { default: 'A', translations: {} };
    Object.defineProperty(label.translations, 'en-US', { get: getter, enumerable: true });
    const symbolic = ['name', 'amount'];
    Object.defineProperty(symbolic, Symbol('domain'), { value: true });
    class Group {
      id = 'domain';
      header = 'Domain';
      children = ['name', 'amount'];
    }
    for (const layout of [
      [group],
      new Array(2),
      symbolic,
      [new Group()],
      [withGetter],
      [{ id: 'localized', header: label, children: ['name', 'amount'] }],
    ])
      expect(isTableHeaderLayout(layout, columns)).toBe(false);
    expect(getter).not.toHaveBeenCalled();
  });

  it('accepts eight total header levels including leaves and rejects a ninth level', () => {
    let layout: TableHeaderLayout = ['name', 'amount'];
    for (let depth = 1; depth <= 7; depth++)
      layout = [{ id: `group${depth}`, header: 'Group', children: layout }];
    expect(isTableHeaderLayout(layout, columns)).toBe(true);
    layout = [{ id: 'eighthGroup', header: 'Group', children: layout }];
    expect(isTableHeaderLayout(layout, columns)).toBe(false);
  });

  it('bounds groups and all items across the entire layout, rather than per branch', () => {
    const flat = Array.from({ length: 100 }, (_, id) => ({
      id: `c${id}`,
      header: 'Column',
      path: `/c${id}`,
    }));
    const maximum: TableHeaderLayout = flat.map((column) => ({
      id: `g${column.id}`,
      header: 'Group',
      children: [column.id],
    }));
    expect(isTableHeaderLayout(maximum, flat)).toBe(true); // 100 groups + 100 leaves = 200 items.
    const oversized: TableHeaderLayout = [{ id: 'outer', header: 'Outer', children: maximum }];
    expect(isTableHeaderLayout(oversized, flat)).toBe(false);
  });
});
