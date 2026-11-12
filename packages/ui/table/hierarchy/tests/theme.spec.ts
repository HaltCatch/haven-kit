import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TranslocoService } from '@jsverse/transloco';
import { HavenThemeDirective } from '@haven/ui/theme';
import { HavenTable } from '@haven/ui/table';
import type { HavenTheme } from '@haven/schema';
import { afterEach, expect, it, vi } from 'vitest';
import { columns, rows, hierarchy } from './support';
import { setupTreeSelection } from '../../../../../tests/ui/tree-selection-support';
@Component({
  imports: [HavenTable, HavenThemeDirective],
  template: `<section [havenTheme]="theme()" [dir]="direction()">
    <haven-table
      [columns]="columns"
      [rows]="rows"
      [hierarchy]="hierarchy"
      [headerGroups]="groups"
      [expandedRowKeys]="expanded()"
      (expandedRowKeysChange)="expanded.set($event)"
      [view]="view"
      [selectable]="true"
    />
  </section>`,
})
class Host {
  readonly rows = rows;
  readonly columns = columns;
  readonly hierarchy = hierarchy;
  readonly groups = [{ id: 'data', header: 'Data', children: ['name', 'amount'] }];
  readonly expanded = signal<readonly (string | number)[]>([]);
  readonly direction = signal('ltr');
  readonly view = { pinned: { start: ['name'] } };
  readonly theme = signal<HavenTheme>({ preset: 'material', mode: 'dark', density: 'comfortable' });
}
afterEach(() => {
  TestBed.resetTestingModule();
  vi.restoreAllMocks();
});
it('uses native focused buttons, complete group-header spans and logical RTL indentation across themes/locales', async () => {
  setupTreeSelection();
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1200);
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  const element = fixture.nativeElement as HTMLElement;
  const table = fixture.debugElement.query(By.directive(HavenTable))
    .componentInstance as HavenTable;
  expect(element.querySelectorAll('thead tr')).toHaveLength(2);
  expect(
    [...element.querySelectorAll<HTMLTableCellElement>('thead th')].find(
      (cell) => cell.textContent?.trim() === 'Row expansion',
    )?.rowSpan,
  ).toBe(2);
  const button = element.querySelector<HTMLButtonElement>('tbody button[aria-expanded]')!;
  button.focus();
  expect(document.activeElement).toBe(button);
  expect(button.type).toBe('button');
  expect(button.getAttribute('aria-label')).toContain('Level 1');
  expect(button.getAttribute('aria-label')).not.toContain('number:');
  fixture.componentInstance.direction.set('rtl');
  fixture.componentInstance.theme.set({ preset: 'liquid-glass', mode: 'dark', density: 'compact' });
  TestBed.inject(TranslocoService).setActiveLang('zh-CN');
  await fixture.whenStable();
  const marker = button.querySelector<HTMLElement>('.marker')!;
  expect(getComputedStyle(marker).transform).toBe('rotate(180deg)');
  expect(element.querySelector('section')?.getAttribute('data-haven-preset')).toBe('liquid-glass');
  button.click();
  await fixture.whenStable();
  expect(table.expandedRowKeys()).toEqual([0]);
  expect(marker.textContent).toBe('▾');
  expect(marker.classList.contains('collapsed')).toBe(false);
  expect(element.querySelectorAll('tbody tr')).toHaveLength(4);
  expect(table.pinningPaused()).toBe(false);
  expect(element.querySelector('tbody td.pinned')?.getAttribute('style')).toContain(
    'inset-inline-start',
  );
  fixture.componentInstance.theme.set({ preset: 'material', mode: 'dark', density: 'comfortable' });
  fixture.componentInstance.direction.set('ltr');
  TestBed.inject(TranslocoService).setActiveLang('en-US');
  await fixture.whenStable();
  expect(table.expandedRowKeys()).toEqual([0]);
  expect(element.querySelectorAll('tbody tr')).toHaveLength(4);
});
