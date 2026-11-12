import type {
  DataSchema,
  JsonObject,
  TableColumn,
  TableHeaderLayout,
  TableView,
} from '@haven/schema';

export const itemSchema: DataSchema = {
  type: 'object',
  required: ['id', 'name', 'amount', 'note', 'status'],
  properties: {
    id: { type: 'number' },
    name: { type: 'string', minLength: 2 },
    amount: { type: 'number', minimum: 0 },
    note: { type: 'string' },
    status: { type: 'string', enum: ['Draft', 'Ready', 'Archived'] },
  },
};
export const columns: TableColumn[] = [
  { id: 'id', path: '/id', header: 'ID', type: 'number' },
  { id: 'name', path: '/name', header: 'Name', type: 'text', editor: { id: 'fixture.text' } },
  { id: 'amount', path: '/amount', header: 'Amount', type: 'number', editor: { id: 'number' } },
  { id: 'note', path: '/note', header: 'Note', type: 'text', renderer: 'fixture.note' },
  {
    id: 'status',
    path: '/status',
    header: 'Status',
    type: 'text',
    editor: {
      id: 'select',
      params: { options: ['Draft', 'Ready', 'Archived'].map((value) => ({ value, label: value })) },
    },
  },
];
export const headerGroups: TableHeaderLayout = [
  'id',
  { id: 'details', header: 'Record details', children: ['name', 'status', 'note'] },
  'amount',
];
export const initialView: TableView = {
  order: ['id', 'name', 'status', 'note', 'amount'],
  pinned: { start: ['id'], end: ['amount'] },
  widths: { id: 120, name: 280, status: 240, note: 620, amount: 160 },
};
/** Deterministic synthetic content only; no product or business fixtures are imported. */
export function createRows(count = 5000): readonly JsonObject[] {
  return Array.from({ length: count }, (_, id) => ({
    id,
    name: `Synthetic record ${String(id).padStart(5, '0')}`,
    amount: ((id * 7919) % 100000) / 100,
    status: ['Draft', 'Ready', 'Archived'][id % 3]!,
    note:
      id % 37 === 0
        ? `Synthetic multiline note ${id}.\nA second line exercises wrapping.\nA third line keeps the row naturally sized.`
        : id % 19 === 0
          ? `Synthetic longer note ${id}. This deterministic sentence exercises natural text wrapping across different column widths and font metrics.`
          : `Synthetic note ${id}.`,
  }));
}
