import { expect, it } from 'vitest';
import {
  isTableColumnFilters,
  isTableFilterRef,
  isTableQuery,
  validBuiltinFilterValue,
} from '@haven/schema';
import { TableDataLoader, initialTableDataState } from '@haven/runtime';
import type { TableColumn, TableQuery } from '@haven/schema';
import type { TableDataRequest } from '@haven/runtime';
const columns: TableColumn[] = [
  { id: 'label', header: 'Label', path: '/label', filter: { id: 'text' } },
  { id: 'active', header: 'Active', path: '/active', filter: { id: 'boolean' } },
];
const query: TableQuery = {
  pageIndex: 0,
  pageSize: 2,
  sort: [],
  filter: '',
  columnFilters: [{ columnId: 'label', value: 'a' }],
};
it('validates dense unique column conditions, strict typed values and canonical inclusive ranges', () => {
  expect(isTableColumnFilters([{ columnId: 'active', value: false }], columns)).toBe(true);
  for (const value of [
    Array(1),
    [{ columnId: 'missing', value: 'a' }],
    [{ columnId: 'active', value: 0 }],
    [...query.columnFilters!, ...query.columnFilters!],
  ])
    expect(isTableColumnFilters(value, columns)).toBe(false);
  expect(
    isTableFilterRef({
      id: 'select',
      params: {
        options: [
          { label: 'Zero', value: 0 },
          { label: 'String', value: '0' },
        ],
      },
    }),
  ).toBe(true);
  expect(validBuiltinFilterValue('select', 0, { options: [{ label: 'Zero', value: 0 }] })).toBe(
    true,
  );
  expect(validBuiltinFilterValue('select', '0', { options: [{ label: 'Zero', value: 0 }] })).toBe(
    false,
  );
  expect(validBuiltinFilterValue('number-range', { min: 0, max: 0 })).toBe(true);
  expect(validBuiltinFilterValue('number-range', { min: 2, max: 1 })).toBe(false);
  expect(validBuiltinFilterValue('date-range', { min: '2024-02-29', max: null })).toBe(true);
  expect(validBuiltinFilterValue('date-range', { min: '2025-02-29', max: null })).toBe(false);
  expect(isTableQuery(query, columns)).toBe(true);
  expect(
    isTableQuery(
      { ...query, columnFilters: [{ columnId: 'label', value: 'x'.repeat(2001) }] },
      columns,
    ),
  ).toBe(false);
  expect(isTableFilterRef({ id: 'custom', params: { run: () => true } })).toBe(false);
});
it('never dispatches unsupported conditions and freezes exact supported definitions and values', async () => {
  let state = initialTableDataState();
  const loader = new TableDataLoader((next) => (state = next));
  const calls: TableDataRequest[] = [];
  const load = async (request: TableDataRequest) => {
    calls.push(request);
    return { rows: [{ id: 0, label: 'server' }], total: 1 };
  };
  await loader.load({ load }, query, columns, '/id', 'en-US');
  expect(state.error).toBe('query');
  expect(calls).toHaveLength(0);
  await loader.load(
    { load, supportedColumnFilters: [{ columnId: 'label', filterId: 'number-range' }] },
    query,
    columns,
    '/id',
    'en-US',
  );
  expect(calls).toHaveLength(0);
  await loader.load(
    { load, supportedColumnFilters: [{ columnId: 'label', filterId: 'text' }] },
    query,
    columns,
    '/id',
    'en-US',
  );
  expect(state.status).toBe('ready');
  expect(calls[0]?.columnFilterDefinitions).toEqual([
    { columnId: 'label', filterId: 'text', params: {} },
  ]);
  expect(Object.isFrozen(calls[0]?.columnFilters?.[0])).toBe(true);
  expect(Object.isFrozen(calls[0]?.columnFilterDefinitions?.[0]?.params)).toBe(true);
});
it('drops responses when declared capabilities are revoked while a request is pending', async () => {
  let state = initialTableDataState();
  const loader = new TableDataLoader((next) => (state = next));
  let resolve!: (value: { rows: []; total: number }) => void;
  const support = [{ columnId: 'label', filterId: 'text' }];
  const adapter = {
    supportedColumnFilters: support,
    load: () => new Promise<{ rows: []; total: number }>((yes) => (resolve = yes)),
  };
  const pending = loader.load(adapter, query, columns, '/id', 'en-US');
  support.splice(0);
  resolve({ rows: [], total: 0 });
  await pending;
  expect(state.error).toBe('query');
  expect(state.rows).toEqual([]);
});
it('rejects accessor conditions without executing getters and rejects malformed capability declarations', async () => {
  let reads = 0;
  const condition = Object.defineProperty({ columnId: 'label' }, 'value', {
    enumerable: true,
    get() {
      reads++;
      return 'a';
    },
  });
  expect(isTableColumnFilters([condition], columns)).toBe(false);
  const list = Object.defineProperty(new Array(1), '0', {
    enumerable: true,
    get() {
      reads++;
      return condition;
    },
  });
  expect(isTableColumnFilters(list, columns)).toBe(false);
  expect(reads).toBe(0);
  let state = initialTableDataState(),
    calls = 0;
  const loader = new TableDataLoader((next) => (state = next));
  await loader.load(
    {
      supportedColumnFilters: [
        { columnId: 'label', filterId: 'text' },
        { columnId: 'label', filterId: 'text' },
      ],
      load: async () => {
        calls++;
        return { rows: [], total: 0 };
      },
    },
    { ...query, columnFilters: [] },
    columns,
    '/id',
    'en-US',
  );
  expect(calls).toBe(0);
  expect(state.error).toBe('query');
});
