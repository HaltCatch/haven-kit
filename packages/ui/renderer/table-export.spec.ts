import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { afterEach, expect, it, vi } from 'vitest';
import type { HavenDocument } from '@haven/schema';
import { HavenRenderer } from './renderer';
import { HavenTable } from '@haven/ui/table';
import { setupTableEditTests } from '../../../tests/ui/table-edit-support';
afterEach(() => {
  TestBed.resetTestingModule();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it.each(['material', 'liquid-glass'] as const)(
  'wires model CSV controls and native download without changing %s theme or data',
  async (preset) => {
    setupTableEditTests();
    const document: HavenDocument = {
      schemaVersion: '1.0',
      id: 'csv',
      title: 'CSV',
      actions: {},
      resources: {},
      theme: { preset, mode: 'dark', density: 'comfortable' },
      dataSchema: {
        type: 'object',
        properties: {
          rows: {
            type: 'array',
            items: {
              type: 'object',
              properties: { id: { type: 'number' }, label: { type: 'string' } },
            },
          },
        },
      },
      ui: {
        id: 'table',
        kind: 'table',
        version: 1,
        bind: '/rows',
        props: {
          exportable: true,
          rowKey: '/id',
          columns: [{ id: 'label', path: '/label', header: 'Label', type: 'text' }],
        },
      },
    };
    const fixture = TestBed.createComponent(HavenRenderer);
    fixture.componentRef.setInput('document', document);
    fixture.componentRef.setInput('value', { rows: [{ id: 0, label: 'One' }] });
    await fixture.whenStable();
    expect(fixture.componentInstance.validation().diagnostics).toEqual([]);
    const table = fixture.debugElement.query(By.directive(HavenTable))
      .componentInstance as HavenTable;
    expect(table.exportable()).toBe(true);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const revoke = vi.fn();
    vi.stubGlobal(
      'URL',
      Object.assign(class {}, {
        createObjectURL: vi.fn(() => 'blob:csv'),
        revokeObjectURL: revoke,
      }),
    );
    const root = fixture.nativeElement as HTMLElement;
    const buttons = root.querySelectorAll<HTMLButtonElement>('haven-table-export-controls button');
    expect(buttons.length).toBe(2);
    buttons[0]!.click();
    await fixture.whenStable();
    expect(click).toHaveBeenCalledOnce();
    expect(table.csv.result()).toMatchObject({ status: 'ready', rowCount: 1, scope: 'filtered' });
    expect(root.querySelector('[role="status"]')?.textContent).toContain('1');
    expect(fixture.componentInstance.document().theme?.preset).toBe(preset);
    expect(structuredClone(fixture.componentInstance.value())).toEqual({
      rows: [{ id: 0, label: 'One' }],
    });
    await expect.poll(() => revoke.mock.calls.length).toBe(1);
  },
);
