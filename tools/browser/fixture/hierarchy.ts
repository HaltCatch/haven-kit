import {
  ChangeDetectionStrategy,
  Component,
  EnvironmentInjector,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import {
  HavenTable,
  createHavenLocalTableEditHandler,
  createHavenTableEditors,
} from '@haven/ui/table';
import type { HavenTableExportScope } from '@haven/ui/table';
import type { TableHierarchy, TableRowKey } from '@haven/schema';
import { FixtureTextEditor } from './custom-editor';
import {
  createHierarchyRows,
  hierarchyColumns,
  hierarchyGroups,
  hierarchyItemSchema,
  hierarchyView,
} from './hierarchy-data';

@Component({
  selector: 'haven-hierarchy-browser-fixture',
  imports: [HavenTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './hierarchy.html',
})
export class HavenHierarchyBrowserFixture {
  readonly readonly = input(false);
  readonly table = viewChild(HavenTable);
  readonly rows = signal(createHierarchyRows());
  readonly columns = hierarchyColumns;
  readonly groups = hierarchyGroups;
  readonly view = hierarchyView;
  readonly schema = hierarchyItemSchema;
  readonly hierarchy: TableHierarchy = {
    parentPath: '/parent',
    rootValue: null,
    filterMode: 'retain-ancestors',
    pagination: 'visible-rows',
  };
  readonly virtualization = { viewportHeight: 320, estimateRowHeight: 72, overscan: 3 };
  readonly expanded = signal<readonly TableRowKey[]>([]);
  readonly selected = signal<readonly TableRowKey[]>([]);
  readonly writes = signal(0);
  readonly saved = signal({ id: '', parent: '', name: '' });
  readonly exported = signal({ status: 'idle', rows: 0, first: false, last: false });
  readonly expandedJson = computed(() => JSON.stringify(this.expanded()));
  readonly visibleCount = computed(() => this.table()?.table.getRowModel().rows.length ?? 0);
  readonly editors = createHavenTableEditors([
    ['fixture.tree-text', { component: FixtureTextEditor, valueTypes: ['string'] }],
  ]);
  readonly editHandler = createHavenLocalTableEditHandler({
    injector: inject(EnvironmentInjector),
    schema: hierarchyItemSchema,
    columns: hierarchyColumns,
    rowKey: '/id',
    rows: this.rows,
    active: () => !this.readonly(),
    replace: (expected, next) => {
      if (expected !== this.rows() || this.readonly()) return false;
      const changed = next.find((row, index) => row !== expected[index]);
      this.rows.set(next);
      this.writes.update((count) => count + 1);
      if (changed)
        this.saved.set({
          id: String(changed['id']),
          parent: String(changed['parent']),
          name: String(changed['name']),
        });
      return true;
    },
  });
  inspectCsv(scope: HavenTableExportScope): void {
    const result = this.table()!.createCsv({ scope, bom: false });
    this.exported.set(
      result.status === 'ready'
        ? {
            status: result.status,
            rows: result.rowCount,
            first: result.csv.includes('Tree root 0'),
            last: result.csv.includes('Tree child 299/4'),
          }
        : { status: result.status, rows: 0, first: false, last: false },
    );
  }
}
