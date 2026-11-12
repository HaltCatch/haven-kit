import {
  ChangeDetectionStrategy,
  Component,
  EnvironmentInjector,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Dir } from '@angular/cdk/bidi';
import { HavenThemeDirective } from '@haven/ui/theme';
import {
  HavenTable,
  createHavenLocalTableEditHandler,
  createHavenTableCellRenderers,
  createHavenTableEditors,
} from '@haven/ui/table';
import type { HavenTheme, TableRowKey, TableView, TableVirtualization } from '@haven/schema';
import { columns, createRows, headerGroups, initialView, itemSchema } from './data';
import { FixtureNoteCell } from './custom-cell';
import { FixtureTextEditor } from './custom-editor';
import { HavenHierarchyBrowserFixture } from './hierarchy';

@Component({
  selector: 'haven-browser-fixture',
  imports: [HavenTable, HavenThemeDirective, Dir, HavenHierarchyBrowserFixture],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './fixture.html',
})
export class HavenBrowserFixture {
  readonly table = viewChild.required(HavenTable);
  readonly exported = signal({ status: 'idle', rows: 0, first: false, last: false });
  readonly columns = columns;
  readonly groups = headerGroups;
  readonly itemSchema = itemSchema;
  readonly rows = signal(createRows());
  readonly writes = signal(0);
  readonly selected = signal<readonly TableRowKey[]>([]);
  readonly view = signal<TableView>(initialView);
  readonly theme = signal<HavenTheme>({ preset: 'material', mode: 'dark', density: 'comfortable' });
  readonly direction = signal<'ltr' | 'rtl'>('ltr');
  readonly readonly = signal(false);
  readonly virtual = signal(true);
  readonly wide = signal(false);
  readonly virtualization = computed<TableVirtualization | undefined>(() =>
    this.virtual() ? { viewportHeight: 320, estimateRowHeight: 64, overscan: 3 } : undefined,
  );
  readonly renderers = createHavenTableCellRenderers([['fixture.note', FixtureNoteCell]]);
  readonly editors = createHavenTableEditors([
    ['fixture.text', { component: FixtureTextEditor, valueTypes: ['string'] }],
  ]);
  readonly editHandler = createHavenLocalTableEditHandler({
    injector: inject(EnvironmentInjector),
    schema: itemSchema,
    columns,
    rowKey: '/id',
    rows: this.rows,
    active: () => !this.readonly(),
    replace: (expected, next) => {
      if (this.rows() !== expected || this.readonly()) return false;
      this.rows.set(next);
      this.writes.update((count) => count + 1);
      return true;
    },
  });
  toggleTheme(): void {
    this.theme.update((value) => ({
      ...value,
      preset: value.preset === 'material' ? 'liquid-glass' : 'material',
    }));
  }
  widenColumns(): void {
    this.wide.update((value) => !value);
    const factor = this.wide() ? 2 : 1;
    this.view.update((value) => ({
      ...value,
      widths: Object.fromEntries(
        Object.entries(initialView.widths!).map(([id, width]) => [
          id,
          Math.min(1200, width * factor),
        ]),
      ),
    }));
  }
  load(count: number): void {
    this.rows.set(createRows(count));
  }
  enlargeText(): void {
    this.theme.update((value) => ({
      ...value,
      tokens: { ...value.tokens, fontSize: '24px', fontFamily: 'serif' },
    }));
  }
  inspectCsv(): void {
    const result = this.table().createCsv({ scope: 'page', bom: false });
    this.exported.set(
      result.status === 'ready'
        ? {
            status: result.status,
            rows: result.rowCount,
            first: result.csv.includes('Synthetic record 00000'),
            last: result.csv.includes(
              `Synthetic record ${String(this.rows().length - 1).padStart(5, '0')}`,
            ),
          }
        : { status: result.status, rows: 0, first: false, last: false },
    );
  }
}
