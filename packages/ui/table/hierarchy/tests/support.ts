import { TestBed } from '@angular/core/testing';
import type { TableColumn, TableHierarchy } from '@haven/schema';
import { HavenTable } from '../../table';
import { setupTreeSelection } from '../../../../../tests/ui/tree-selection-support';

export const columns: TableColumn[] = [
  { id: 'name', header: 'Name', path: '/name', type: 'text' },
  { id: 'amount', header: 'Amount', path: '/amount', type: 'number' },
];
export const rows = [
  { id: 0, parent: '', name: 'Root Z', amount: 20 },
  { id: 'b', parent: 0, name: 'Beta', amount: 1 },
  { id: '0', parent: '', name: 'Root A', amount: 10 },
  { id: 'a', parent: 0, name: 'Needle', amount: 3 },
  { id: 'c', parent: 'a', name: 'Grandchild', amount: 2 },
  { id: 'd', parent: '0', name: 'Delta', amount: 4 },
];
export const hierarchy: TableHierarchy = { parentPath: '/parent', rootValue: '' };
export async function treeTable(extra: Record<string, unknown> = {}) {
  setupTreeSelection();
  const fixture = TestBed.createComponent(HavenTable);
  for (const [key, value] of Object.entries({
    rows,
    columns,
    hierarchy,
    selectable: true,
    pageSize: 10,
    filterable: true,
    exportable: true,
    ...extra,
  }))
    fixture.componentRef.setInput(key, value);
  await fixture.whenStable();
  const table = fixture.componentInstance;
  return {
    fixture,
    table,
    element: fixture.nativeElement as HTMLElement,
    visible: () => table.table.getRowModel().rows.map((row) => row.original['id']),
  };
}
