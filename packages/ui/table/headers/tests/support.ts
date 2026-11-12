import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { vi } from 'vitest';
import { HavenTable } from '../../table';
import type { TableColumn, TableHeaderLayout } from '@haven/schema';
import { setupTableEditTests } from '../../../../../tests/ui/table-edit-support';

export const columns: TableColumn[] = [
  { id: 'id', path: '/id', header: 'ID' },
  {
    id: 'name',
    path: '/name',
    header: { default: 'Name', translations: { 'zh-CN': '名称' } },
    type: 'text',
  },
  { id: 'score', path: '/score', header: 'Score', type: 'number' },
  { id: 'enabled', path: '/enabled', header: 'Enabled', type: 'boolean' },
  { id: 'tail', path: '/tail', header: 'Tail', type: 'text' },
];
export const rows = [
  { id: 0, name: 'Zero', score: 3, enabled: true, tail: 'Alpha' },
  { id: '0', name: 'String zero', score: 8, enabled: false, tail: 'Beta' },
];
export const layout: TableHeaderLayout = [
  'id',
  {
    id: 'details',
    header: { default: 'Details', translations: { 'zh-CN': '详情' } },
    children: ['name', { id: 'metrics', header: 'Metrics', children: ['score', 'enabled'] }],
  },
  'tail',
];
const observers = new Set<ProbeObserver>();
let width = 1200;
class ProbeObserver implements ResizeObserver {
  constructor(readonly callback: ResizeObserverCallback) {}
  observe(): void {
    observers.add(this);
  }
  disconnect(): void {
    observers.delete(this);
  }
  unobserve(): void {}
}
export async function headerTable(extra: Record<string, unknown> = {}) {
  setupTableEditTests();
  width = 1200;
  vi.stubGlobal('ResizeObserver', ProbeObserver);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.classList.contains('scroll') ? width : 0;
  });
  const fixture = TestBed.createComponent(HavenTable);
  for (const [name, value] of Object.entries({ rows, columns, headerGroups: layout, ...extra }))
    fixture.componentRef.setInput(name, value);
  await fixture.whenStable();
  const element = fixture.nativeElement as HTMLElement;
  return { fixture, table: fixture.componentInstance, element };
}
export async function resize(fixture: ComponentFixture<HavenTable>, next: number) {
  width = next;
  for (const observer of observers) observer.callback([], observer);
  await fixture.whenStable();
}
export function cleanupHeaders() {
  TestBed.resetTestingModule();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  observers.clear();
}
export const headers = (element: HTMLElement) => [
  ...element.querySelectorAll<HTMLTableCellElement>('thead th'),
];
export const labelled = (element: HTMLElement, text: string) =>
  headers(element).filter((cell) => cell.textContent?.trim().replace(/[↑↓↕]/g, '').trim() === text);
