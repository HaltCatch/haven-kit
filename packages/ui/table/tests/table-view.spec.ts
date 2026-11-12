import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { provideTransloco, TranslocoService } from '@jsverse/transloco';
import { provideHavenTransloco } from '@haven/ui/i18n';
import { HavenTable } from '@haven/ui/table';
import type { JsonObject, TableColumn, TableRowKey, TableView } from '@haven/schema';
import english from '@haven/ui/i18n/locales/en-US.json';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatSelectHarness } from '@angular/material/select/testing';
import { MatCheckboxHarness } from '@angular/material/checkbox/testing';

let viewportWidth = 1024;
const observers = new Set<ViewportObserver>();
class ViewportObserver implements ResizeObserver {
  constructor(readonly callback: ResizeObserverCallback) {}
  observe(): void {
    observers.add(this);
  }
  disconnect(): void {
    observers.delete(this);
  }
  unobserve(): void {
    observers.delete(this);
  }
}
async function resize(fixture: ComponentFixture<HavenTable>, width: number): Promise<void> {
  viewportWidth = width;
  for (const observer of observers) observer.callback([], observer);
  await fixture.whenStable();
}

beforeEach(() => {
  viewportWidth = 1024;
  vi.stubGlobal('ResizeObserver', ViewportObserver);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.classList.contains('scroll') ? viewportWidth : 0;
  });
  TestBed.configureTestingModule({
    providers: [
      provideTransloco({
        config: { defaultLang: 'en-US', availableLangs: ['en-US'], prodMode: true },
      }),
      provideHavenTransloco(),
    ],
  });
  TestBed.inject(TranslocoService).setTranslation({ haven: english }, 'en-US');
});
afterEach(() => {
  TestBed.resetTestingModule();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  observers.clear();
});
const columns: TableColumn[] = [
  { id: 'label', header: 'Label', path: '/label', type: 'text' },
  { id: 'amount', header: 'Amount', path: '/amount', type: 'number' },
  { id: 'active', header: 'Active', path: '/active', type: 'boolean' },
];
const rows: JsonObject[] = [
  { id: 0, other: 'first', label: 'Ten', amount: 10, active: true },
  { id: '0', other: 'second', label: 'Two', amount: 2, active: false },
  { id: 2, other: 'third', label: 'Thirty', amount: 30, active: true },
];
async function createTable(
  selection: readonly TableRowKey[] = [],
): Promise<ComponentFixture<HavenTable>> {
  const fixture = TestBed.createComponent(HavenTable);
  for (const [name, value] of Object.entries({
    rows,
    columns,
    selection,
    pageSize: 1,
    filterable: true,
    selectable: true,
    columnMenu: true,
  }))
    fixture.componentRef.setInput(name, value);
  await fixture.whenStable();
  return fixture;
}
const dom = (fixture: ComponentFixture<HavenTable>) => fixture.nativeElement as HTMLElement;

describe('table filtering, selection and view controls', () => {
  it('keeps typed stable selections through pagination, sorting and filtering, and selects filtered loaded rows only', async () => {
    const fixture = await createTable([0]);
    const component = fixture.componentInstance;
    const emitted: TableRowKey[][] = [];
    component.selection.subscribe((value) => emitted.push([...value]));
    component.table.nextPage();
    await fixture.whenStable();
    component.table.getRow('string:0').toggleSelected(true);
    await fixture.whenStable();
    expect(component.selection()).toEqual([0, '0']);
    component.table.setSorting([{ id: 'amount', desc: true }]);
    await fixture.whenStable();
    expect(component.selection()).toEqual([0, '0']);
    component.table.setGlobalFilter('thir');
    await fixture.whenStable();
    expect(component.table.getFilteredRowModel().rows.map((row) => row.original['label'])).toEqual([
      'Thirty',
    ]);
    expect(component.pagination().pageIndex).toBe(0);
    component.table.toggleAllRowsSelected(true);
    await fixture.whenStable();
    expect(component.selection()).toEqual([0, '0', 2]);
    component.table.toggleAllRowsSelected(false);
    await fixture.whenStable();
    expect(component.selection()).toEqual([0, '0']);
    expect(emitted.at(-1)).toEqual([0, '0']);
    component.table.setGlobalFilter('');
    await fixture.whenStable();
    expect(component.table.getSelectedRowModel().rows).toHaveLength(2);
  });
  it('rejects invalid initial controlled keys and only prunes previously known keys after actual data removal', async () => {
    const fixture = await createTable(['missing']);
    const component = fixture.componentInstance;
    expect(component.selection()).toEqual(['missing']);
    expect(dom(fixture).querySelector('[role="alert"]')?.textContent).toContain('Selection');
    fixture.componentRef.setInput('selection', [0, '0']);
    await fixture.whenStable();
    expect(dom(fixture).querySelector('[role="alert"]')).toBeNull();
    fixture.componentRef.setInput('rows', rows.slice(1));
    await fixture.whenStable();
    expect(component.selection()).toEqual(['0']);
    fixture.componentRef.setInput('rowKey', '/other');
    await fixture.whenStable();
    expect(component.selection()).toEqual([]);
  });
  it('uses controlled view state for ordering, visibility, logical pinning and widths without mutating caller configuration', async () => {
    const fixture = await createTable();
    const component = fixture.componentInstance;
    const original: TableView = {
      order: ['amount', 'label', 'active'],
      hidden: ['active'],
      pinned: { start: ['label'] },
      widths: { label: 240 },
    };
    const snapshot = structuredClone(original);
    fixture.componentRef.setInput('view', original);
    await fixture.whenStable();
    expect(component.visibleColumns().map((column) => column.id)).toEqual(['label', 'amount']);
    expect(component.table.getColumn('label')!.getSize()).toBe(240);
    expect(dom(fixture).querySelector('thead th:nth-child(2)')?.classList.contains('pinned')).toBe(
      true,
    );
    component.table.getColumn('amount')!.pin('end');
    await fixture.whenStable();
    expect(component.view().pinned?.end).toEqual(['amount']);
    component.table.getColumn('active')!.toggleVisibility(true);
    await fixture.whenStable();
    expect(component.visibleColumns().map((column) => column.id)).toEqual([
      'label',
      'active',
      'amount',
    ]);
    expect(original).toEqual(snapshot);
    fixture.componentRef.setInput('view', { hidden: ['label', 'amount', 'active'] });
    await fixture.whenStable();
    expect(dom(fixture).querySelector('[role="alert"]')).not.toBeNull();
  });
  it('preserves pinned configuration while measured space is insufficient and restores after resize or validation recovery', async () => {
    const fixture = await createTable();
    const view: TableView = {
      pinned: { start: ['label'], end: ['active'] },
      widths: { label: 240, amount: 200, active: 160 },
    };
    fixture.componentRef.setInput('view', view);
    await fixture.whenStable();
    expect(dom(fixture).querySelectorAll('thead .pinned')).toHaveLength(2);
    await resize(fixture, 447);
    expect(dom(fixture).querySelector('.scroll')?.getAttribute('data-pinning-paused')).toBe('true');
    expect(dom(fixture).querySelector('[data-pinning-notice]')?.textContent).toContain('space');
    expect(dom(fixture).querySelectorAll('.pinned')).toHaveLength(0);
    expect(fixture.componentInstance.view()).toEqual(view);
    await resize(fixture, 448);
    expect(dom(fixture).querySelector('[data-pinning-notice]')).toBeNull();
    expect(dom(fixture).querySelectorAll('thead .pinned')).toHaveLength(2);
    fixture.componentRef.setInput('rows', [rows[0], rows[0]]);
    await fixture.whenStable();
    expect(dom(fixture).querySelector('[role="alert"]')).not.toBeNull();
    expect(observers.size).toBe(1); // Width probe remains; removed viewport observer is disconnected.
    fixture.componentRef.setInput('rows', []);
    await fixture.whenStable();
    expect(dom(fixture).querySelector('[role="alert"]')).toBeNull();
    expect(dom(fixture).querySelector('tbody')?.textContent).toContain('No rows');
    await resize(fixture, 300);
    expect(dom(fixture).querySelector('[data-pinning-notice]')).not.toBeNull();
    fixture.componentRef.setInput('rows', rows);
    await fixture.whenStable();
    await resize(fixture, 900);
    expect(dom(fixture).querySelectorAll('thead .pinned')).toHaveLength(2);
  });
  it('keeps fixed columns beside a horizontally scrollable wide center column while preserving a minimum center interaction area', async () => {
    const fixture = await createTable();
    fixture.componentRef.setInput('columns', [
      ...columns,
      { id: 'other', header: 'Other', path: '/other', type: 'text' },
    ]);
    const view: TableView = {
      pinned: { start: ['label', 'amount'], end: ['active'] },
      widths: { label: 192, amount: 192, active: 160, other: 900 },
    };
    fixture.componentRef.setInput('view', view);
    await resize(fixture, 912);
    expect(fixture.componentInstance.table.getColumn('other')!.getSize()).toBe(900);
    expect(dom(fixture).querySelectorAll('thead .pinned')).toHaveLength(3);
    expect(dom(fixture).querySelector('[data-pinning-notice]')).toBeNull();
    await resize(fixture, 350);
    expect(dom(fixture).querySelectorAll('.pinned')).toHaveLength(0);
    expect(dom(fixture).querySelector('[data-pinning-notice]')).not.toBeNull();
    expect(fixture.componentInstance.view()).toEqual(view);
    await resize(fixture, 591);
    expect(dom(fixture).querySelector('[data-pinning-notice]')).not.toBeNull();
    await resize(fixture, 592); // 544 pinned pixels + the engine's 48-pixel minimum center width.
    expect(dom(fixture).querySelectorAll('thead .pinned')).toHaveLength(3);
    await resize(fixture, 912);
    expect(dom(fixture).querySelector('[data-pinning-notice]')).toBeNull();
    expect(fixture.componentInstance.view()).toEqual(view);
  });
  it('observes the theme width probe even when the first render has invalid rows', async () => {
    let probeWidth = 192;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      return new DOMRect(0, 0, this.classList.contains('width-probe') ? probeWidth : 0, 0);
    });
    const fixture = TestBed.createComponent(HavenTable);
    fixture.componentRef.setInput('columns', columns);
    fixture.componentRef.setInput('rows', [rows[0], rows[0]]);
    await fixture.whenStable();
    expect(dom(fixture).querySelector('[role="alert"]')).not.toBeNull();
    expect(dom(fixture).querySelector('.width-probe')).not.toBeNull();
    expect(observers.size).toBe(1);
    fixture.componentRef.setInput('rows', rows);
    await fixture.whenStable();
    expect(fixture.componentInstance.table.getColumn('label')!.getSize()).toBe(192);
    probeWidth = 256;
    await resize(fixture, 912);
    expect(fixture.componentInstance.table.getColumn('label')!.getSize()).toBe(256);
  });
  it('uses Material selection and visibility controls to update the same controlled view state', async () => {
    const fixture = await createTable();
    Array.from(dom(fixture).querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Columns')!
      .click();
    await fixture.whenStable();
    const loader = TestbedHarnessEnvironment.loader(fixture);
    const pin = await loader.getHarness(
      MatSelectHarness.with({ selector: '[aria-label="Pin Label"]' }),
    );
    await pin.open();
    await pin.clickOptions({ text: 'Start' });
    expect(fixture.componentInstance.view().pinned?.start).toEqual(['label']);
    const active = await loader.getHarness(MatCheckboxHarness.with({ label: 'Active' }));
    await active.uncheck();
    expect(fixture.componentInstance.view().hidden).toEqual(['active']);
    expect(dom(fixture).querySelector('select')).toBeNull();
  });
  it('disables filtering, selection, column settings, sorting and pagination through native controls', async () => {
    const fixture = await createTable();
    const component = fixture.componentInstance;
    const settings = Array.from(dom(fixture).querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Columns',
    );
    settings!.click();
    await fixture.whenStable();
    fixture.componentRef.setInput('disabled', true);
    await fixture.whenStable();
    const controls = Array.from(
      dom(fixture).querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>(
        'input, button, select',
      ),
    );
    expect(controls.length).toBeGreaterThan(10);
    expect(controls.every((control) => control.disabled)).toBe(true);
    const selects =
      await TestbedHarnessEnvironment.loader(fixture).getAllHarnesses(MatSelectHarness);
    expect(selects).toHaveLength(3);
    expect(await Promise.all(selects.map((select) => select.isDisabled()))).toEqual([
      true,
      true,
      true,
    ]);
    expect(dom(fixture).querySelector('select')).toBeNull();
    controls.forEach((control) => control.click());
    await fixture.whenStable();
    expect(component.filter()).toBe('');
    expect(component.selection()).toEqual([]);
    expect(component.view()).toEqual({});
    expect(component.pagination().pageIndex).toBe(0);
  });
});
