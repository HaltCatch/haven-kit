import { Component, input, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TranslocoService } from '@jsverse/transloco';
import { HavenThemeDirective } from '@haven/ui/theme';
import type { HavenTheme, TableColumn } from '@haven/schema';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { HavenTable } from '../../table';
import { createHavenTableCellRenderers } from '../../cell-renderers';
import type { HavenTableCellContext } from '../../cell-renderers';
import { setupTreeSelection } from '../../../../../tests/ui/tree-selection-support';
import { installVirtualGeometry } from '../../virtual/tests/geometry';

const columns: TableColumn[] = [
  { id: 'name', path: '/name', header: 'Name', type: 'text', renderer: 'host.preview' },
  { id: 'amount', path: '/amount', header: 'Amount', type: 'number' },
  { id: 'active', path: '/active', header: 'Active', type: 'boolean' },
];
@Component({ template: `<span>{{ context().value }}</span>` })
class PreviewCell {
  readonly context = input.required<HavenTableCellContext>();
}
@Component({
  imports: [HavenTable, HavenThemeDirective],
  template: `<section [havenTheme]="theme()" [dir]="direction()">
    <haven-table
      [rows]="rows"
      [columns]="columns"
      [virtualization]="config"
      [headerGroups]="groups"
      [view]="view"
      [selectable]="true"
      [filterable]="true"
      [readonly]="readonly()"
      [editActive]="writable"
      [cellRenderers]="renderers"
    />
  </section>`,
})
class Host {
  readonly renderers = createHavenTableCellRenderers([['host.preview', PreviewCell]]);
  readonly columns = columns;
  readonly rows = Array.from({ length: 1000 }, (_, id) => ({
    id: id === 1 ? '0' : id,
    name: `Record ${id}`,
    amount: id,
    active: true,
  }));
  readonly config = { viewportHeight: 180, estimateRowHeight: 48, overscan: 2 };
  readonly groups = [{ id: 'all', header: 'All records', children: ['name', 'amount', 'active'] }];
  readonly view = {
    pinned: { start: ['name'], end: ['active'] },
    widths: { name: 120, amount: 180, active: 120 },
  };
  readonly theme = signal<HavenTheme>({ preset: 'material', mode: 'dark', density: 'comfortable' });
  readonly direction = signal('ltr');
  readonly readonly = signal(false);
  readonly writable = () => !this.readonly();
}
let geometry: ReturnType<typeof installVirtualGeometry>;
beforeEach(() => {
  geometry = installVirtualGeometry({ height: 180, width: 900, header: 80, caption: 24, row: 48 });
  setupTreeSelection();
});
afterEach(() => {
  TestBed.resetTestingModule();
  geometry.restore();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function create() {
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  const element = fixture.nativeElement as HTMLElement,
    table = fixture.debugElement.query(By.directive(HavenTable)).componentInstance as HavenTable;
  const viewport = element.querySelector<HTMLElement>('.scroll')!;
  return {
    fixture,
    element,
    table,
    viewport,
    rendered: () => [
      ...element.querySelectorAll<HTMLTableRowElement>('tbody tr[data-virtual-row-id]'),
    ],
  };
}
it('bounds real tbody rows from first to last, preserves only the focused row, and exports the native collection beyond the DOM', async () => {
  const t = await create();
  expect(t.rendered().length).toBeGreaterThan(0);
  expect(t.rendered().length).toBeLessThan(20);
  expect(t.element.querySelector('table')?.getAttribute('aria-rowcount')).toBe('1002');
  expect(t.rendered()[0]?.getAttribute('aria-rowindex')).toBe('3');
  const focused = t.rendered()[0]!.querySelector<HTMLInputElement>('input')!;
  focused.focus();
  await t.fixture.whenStable();
  t.table.virtualWindow.virtualizer.scrollToIndex(500, { align: 'start' });
  await t.fixture.whenStable();
  expect(t.rendered().some((row) => row.dataset['virtualRowId'] === 'number:500')).toBe(true);
  expect(t.element.querySelectorAll('tr.virtual-spacer').length).toBeGreaterThanOrEqual(2);
  t.table.virtualWindow.virtualizer.scrollToIndex(999, { align: 'end' });
  await t.fixture.whenStable();
  await expect
    .poll(() => t.rendered().some((row) => row.dataset['virtualRowId'] === 'number:999'))
    .toBe(true);
  expect(document.activeElement).toBe(focused);
  expect(t.rendered().length).toBeLessThan(20);
  expect(t.element.querySelectorAll('tr.virtual-spacer').length).toBeGreaterThanOrEqual(1);
  for (const spacer of t.element.querySelectorAll('tr.virtual-spacer')) {
    expect(spacer.getAttribute('aria-hidden')).toBe('true');
    expect(spacer.getAttribute('role')).toBe('presentation');
  }
  expect(t.table.createCsv({ scope: 'page' })).toMatchObject({ status: 'ready', rowCount: 1000 });
  t.viewport.focus();
  await t.fixture.whenStable();
  expect(t.rendered().some((row) => row.dataset['virtualRowId'] === 'number:0')).toBe(false);
  expect(t.rendered().length).toBeLessThan(20);
});
it('keeps all native grouped headers sticky and leaf pins logical through theme, locale, RTL and measured viewport changes', async () => {
  const t = await create();
  const head = t.element.querySelector('thead')!;
  expect(head.querySelectorAll('tr')).toHaveLength(2);
  expect(getComputedStyle(head).position).toBe('sticky');
  expect(t.table.pinningPaused()).toBe(false);
  t.fixture.componentInstance.theme.set({
    preset: 'liquid-glass',
    mode: 'dark',
    density: 'compact',
  });
  t.fixture.componentInstance.direction.set('rtl');
  TestBed.inject(TranslocoService).setActiveLang('zh-CN');
  await t.fixture.whenStable();
  expect(t.element.querySelector('section')?.getAttribute('data-haven-preset')).toBe(
    'liquid-glass',
  );
  expect(t.element.querySelector('tbody td.pinned')?.getAttribute('style')).toContain(
    'inset-inline-start',
  );
  expect([...head.querySelectorAll('th')].some((cell) => cell.rowSpan === 2)).toBe(true);
  geometry.setWidth(200);
  geometry.notifyResize(t.viewport);
  await t.fixture.whenStable();
  expect(t.table.pinningPaused()).toBe(true);
  expect(head.querySelectorAll('.pinned')).toHaveLength(0);
  expect(t.table.view().pinned).toEqual({ start: ['name'], end: ['active'] });
  geometry.setWidth(900);
  geometry.notifyResize(t.viewport);
  await t.fixture.whenStable();
  expect(t.table.pinningPaused()).toBe(false);
  expect(t.rendered().length).toBeLessThan(20);
});
it('resets the native scroll range for readonly sorting and filtering while preserving horizontal offset', async () => {
  const t = await create();
  t.fixture.componentInstance.readonly.set(true);
  await t.fixture.whenStable();
  t.viewport.scrollLeft = 70;
  t.table.virtualWindow.virtualizer.scrollToIndex(900, { align: 'start' });
  await t.fixture.whenStable();
  expect(t.viewport.scrollTop).toBeGreaterThan(1000);
  t.table.table.setSorting([{ id: 'amount', desc: true }]);
  await t.fixture.whenStable();
  expect(t.viewport.scrollTop).toBe(0);
  expect(t.viewport.scrollLeft).toBe(70);
  expect(t.rendered()[0]?.dataset['virtualRowId']).toBe('number:999');
  t.table.virtualWindow.virtualizer.scrollToIndex(900, { align: 'start' });
  await t.fixture.whenStable();
  t.table.table.setGlobalFilter('Record 99');
  await t.fixture.whenStable();
  expect(t.viewport.scrollTop).toBe(0);
  expect(t.viewport.scrollLeft).toBe(70);
  expect(t.table.table.getRowModel().rows).toHaveLength(11);
  expect(t.rendered().length).toBeGreaterThan(0);
  expect(t.rendered().length).toBeLessThan(20);
});

it('measures changing custom-renderer row heights without constraining real rows or mounting the whole collection', async () => {
  const t = await create(),
    row = t.rendered()[0]!;
  expect(t.fixture.debugElement.queryAll(By.directive(PreviewCell))).toHaveLength(
    t.rendered().length,
  );
  const before = t.table.virtualWindow.virtualizer.getTotalSize();
  geometry.notifyResize(row, 120);
  await t.fixture.whenStable();
  await expect.poll(() => t.table.virtualWindow.virtualizer().measurementsCache[0]?.size).toBe(120);
  expect(t.table.virtualWindow.virtualizer.getTotalSize()).toBeGreaterThan(before);
  expect(row.style.height).toBe('');
  expect(row.style.maxHeight).toBe('');
  t.table.virtualWindow.virtualizer.scrollToIndex(999, { align: 'end' });
  await t.fixture.whenStable();
  expect(t.rendered().length).toBeLessThan(20);
  expect(t.fixture.debugElement.queryAll(By.directive(PreviewCell))).toHaveLength(
    t.rendered().length,
  );
});
