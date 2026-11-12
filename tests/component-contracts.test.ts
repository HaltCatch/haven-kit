import { describe, expect, it } from 'vitest';
import { validateDocument } from '@haven/schema';
import { document } from './fixtures.js';

describe('extended component publication contracts', () => {
  it('rejects impossible or reversed temporal bounds without a timezone transform', () => {
    const doc = document();
    const field = doc.ui.children![0]!;
    field.kind = 'field.datetime';
    field.props = { min: '2026-03-08T02:30', max: '2026-03-08T03:00' };
    expect(validateDocument(doc).valid).toBe(true);
    field.props = { min: '2026-02-30T02:30' };
    expect(validateDocument(doc).diagnostics.map((item) => item.code)).toContain('temporal.bounds');
    field.props = { min: '2026-03-08T04:00', max: '2026-03-08T03:00' };
    expect(validateDocument(doc).valid).toBe(false);
  });
  it('requires primitive array items for multiselect even without options', () => {
    const doc = document();
    doc.dataSchema.properties!['choices'] = { type: 'array', items: { type: 'boolean' } };
    doc.ui.children!.push({
      id: 'choices',
      kind: 'field.multiselect',
      version: 1,
      bind: '/choices',
    });
    expect(validateDocument(doc).diagnostics.map((item) => item.code)).toContain('binding.items');
    doc.dataSchema.properties!['choices'] = { type: 'array', items: { type: 'number' } };
    expect(validateDocument(doc).valid).toBe(true);
  });
  it('checks row keys, scalar columns and integral page size at publication', () => {
    const doc = document();
    doc.dataSchema.properties!['rows'] = {
      type: 'array',
      items: { type: 'object', properties: { id: { type: 'number' }, label: { type: 'string' } } },
    };
    const table = {
      id: 'grid',
      kind: 'table',
      version: 1,
      bind: '/rows',
      props: {
        rowKey: '/id',
        columns: [{ id: 'label', header: 'Label', path: '/label', type: 'text' }],
        pageSize: 10,
      },
    };
    doc.ui.children!.push(table);
    expect(validateDocument(doc).valid).toBe(true);
    table.props.columns[0]!.path = '/missing';
    table.props.rowKey = '/missing';
    table.props.pageSize = 1.5;
    expect(validateDocument(doc).diagnostics.map((item) => item.code)).toEqual(
      expect.arrayContaining(['table.columnType', 'table.rowKey', 'table.pageSize']),
    );
  });
});
