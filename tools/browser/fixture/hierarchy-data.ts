import type {
  DataSchema,
  JsonObject,
  TableColumn,
  TableHeaderLayout,
  TableView,
} from '@haven/schema';

// Mixed typed keys are metadata validated by the table hierarchy contract, outside editable fields.
export const hierarchyItemSchema: DataSchema = {
  type: 'object',
  required: ['name', 'amount', 'note'],
  properties: {
    name: { type: 'string', minLength: 2 },
    amount: { type: 'number', minimum: 0 },
    note: { type: 'string' },
  },
};
export const hierarchyColumns: TableColumn[] = [
  { id: 'id', path: '/id', header: 'Key' },
  { id: 'name', path: '/name', header: 'Name', type: 'text', editor: { id: 'fixture.tree-text' } },
  { id: 'amount', path: '/amount', header: 'Amount', type: 'number' },
  { id: 'note', path: '/note', header: 'Note', type: 'text' },
];
export const hierarchyGroups: TableHeaderLayout = [
  'id',
  { id: 'tree-details', header: 'Tree data', children: ['name', 'note'] },
  'amount',
];
export const hierarchyView: TableView = {
  pinned: { start: ['id'], end: ['amount'] },
  order: ['id', 'name', 'note', 'amount'],
  widths: { id: 140, name: 300, note: 400, amount: 140 },
};
/** 300 independent roots, five children and one grandchild each: 2100 canonical flat records. */
export function createHierarchyRows(): readonly JsonObject[] {
  return Array.from({ length: 300 }, (_, group) => {
    const key = group === 0 ? 0 : group === 1 ? '0' : `root-${group}`;
    const root: JsonObject = {
      id: key,
      parent: null,
      name: `Tree root ${group}`,
      amount: group,
      note: `Synthetic root ${group}`,
    };
    const children = Array.from({ length: 5 }, (_, child) => ({
      id: `node-${group}-${child}`,
      parent: key,
      name: `Tree child ${group}/${child}`,
      amount: group * 10 + child,
      note:
        child === 2
          ? 'Synthetic multiline note.\nA second line grows naturally.'
          : 'Synthetic child note.',
    }));
    return [
      root,
      ...children,
      {
        id: `leaf-${group}`,
        parent: `node-${group}-2`,
        name: `Tree needle ${group}`,
        amount: group,
        note: 'Synthetic grandchild.',
      },
    ];
  }).flat();
}
