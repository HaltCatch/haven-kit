import { describe, expect, it } from 'vitest';
import { isTableColumns, isTableRowActions } from '../packages/schema/src/index.js';
import type { TableColumn } from '../packages/schema/src/index.js';
import { prepareTableEdit, tableEditPathsValid } from '../packages/runtime/src/table-edits.js';
const columns: TableColumn[] = [
  { id: 'name', header: 'Name', path: '/name', editor: { id: 'text' } },
];
const request = {
  transactionId: 'a',
  rowKey: 0,
  changes: [
    { columnId: 'name', path: '/name', before: { exists: true as const, value: 'A' }, value: 'B' },
  ],
};
describe('table edit contracts', () => {
  it('allows only bounded named component and action references', () => {
    expect(isTableColumns(columns)).toBe(true);
    expect(isTableColumns([{ ...columns[0], editor: { id: 'https://bad' } }])).toBe(false);
    expect(isTableColumns([{ ...columns[0], editor: { id: 'text', script: 'alert(1)' } }])).toBe(
      false,
    );
    expect(
      isTableRowActions([{ id: 'open', label: 'Open', kind: 'read', actions: ['open'] }]),
    ).toBe(true);
    expect(
      isTableRowActions([{ id: 'open', label: 'Open', kind: 'read', actions: [], url: '/' }]),
    ).toBe(false);
  });
  it('uses typed stable keys and preserves unrelated current values without mutating inputs', () => {
    const rows = [
      { id: '0', name: 'Other' },
      { id: 0, name: 'A', untouched: 'new' },
    ];
    expect(prepareTableEdit(rows, columns, '/id', request)).toEqual({
      status: 'candidate',
      index: 1,
      row: { id: 0, name: 'B', untouched: 'new' },
    });
    expect(rows[1]!.name).toBe('A');
  });
  it('rejects conflicts, duplicates, row identity edits and overlapping paths atomically', () => {
    expect(prepareTableEdit([{ id: 0, name: 'external' }], columns, '/id', request).status).toBe(
      'conflict',
    );
    expect(
      prepareTableEdit(
        [
          { id: 0, name: 'A' },
          { id: 0, name: 'A' },
        ],
        columns,
        '/id',
        request,
      ).status,
    ).toBe('error');
    expect(tableEditPathsValid([{ ...columns[0]!, path: '/id' }], '/id')).toBe(false);
    expect(
      tableEditPathsValid(
        [
          ...columns,
          { id: 'nested', header: 'Nested', path: '/name/nested', editor: { id: 'text' } },
        ],
        '/id',
      ),
    ).toBe(false);
    expect(
      prepareTableEdit([{ id: 0, name: 'A' }], columns, '/id', {
        ...request,
        changes: [...request.changes, ...request.changes],
      }).status,
    ).toBe('error');
  });
  it('distinguishes missing from null and does not accept an unregistered write path', () => {
    expect(
      prepareTableEdit([{ id: 0, name: null }], columns, '/id', {
        ...request,
        changes: [{ ...request.changes[0]!, before: { exists: false } }],
      }).status,
    ).toBe('conflict');
    expect(
      prepareTableEdit([{ id: 0 }], columns, '/id', {
        ...request,
        changes: [{ ...request.changes[0]!, before: { exists: false } }],
      }).status,
    ).toBe('candidate');
    expect(
      prepareTableEdit([{ id: 0, name: 'A' }], columns, '/id', {
        ...request,
        changes: [{ ...request.changes[0]!, path: '/other' }],
      }).status,
    ).toBe('error');
  });
});

it('compares JSON keys structurally and rejects non-scalar edit payloads without throwing', () => {
  const reordered = { value: 'A', exists: true as const };
  expect(
    prepareTableEdit([{ id: 0, name: 'A', other: { b: 2, a: 1 } }], columns, '/id', {
      ...request,
      changes: [{ ...request.changes[0]!, before: reordered }],
    }).status,
  ).toBe('candidate');
  const unsafe = {
    ...request,
    get changes(): typeof request.changes {
      throw new Error('unsafe host value');
    },
  };
  expect(() => prepareTableEdit([{ id: 0, name: 'A' }], columns, '/id', unsafe)).not.toThrow();
  expect(prepareTableEdit([{ id: 0, name: 'A' }], columns, '/id', unsafe)).toEqual({
    status: 'error',
    code: 'request',
  });
});

it('does not apply an earlier cell when a later change conflicts', () => {
  const columns: TableColumn[] = [
    { id: 'name', header: 'Name', path: '/name', editor: { id: 'text' } },
    { id: 'count', header: 'Count', path: '/count', editor: { id: 'number' } },
  ];
  const rows = [
    { id: '0', name: 'Other', count: 4 },
    { id: 0, name: 'Old', count: 9, keep: 'Latest' },
  ];
  const before = structuredClone(rows);
  const result = prepareTableEdit(rows, columns, '/id', {
    transactionId: 'atomic',
    rowKey: 0,
    changes: [
      { columnId: 'name', path: '/name', before: { exists: true, value: 'Old' }, value: 'New' },
      { columnId: 'count', path: '/count', before: { exists: true, value: 3 }, value: 10 },
    ],
  });
  expect(result.status).toBe('conflict');
  expect(rows).toEqual(before);
});
