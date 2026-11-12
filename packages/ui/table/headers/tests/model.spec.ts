import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { HavenThemeDirective } from '@haven/ui/theme';
import { HavenRenderer } from '@haven/ui/renderer';
import { HavenTable } from '@haven/ui/table';
import type { HavenDocument, HavenTheme, JsonObject } from '@haven/schema';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setupTableEditTests, typeTableInput } from '../../../../../tests/ui/table-edit-support';
import { cleanupHeaders, columns, labelled, layout, rows } from './support';

@Component({
  imports: [HavenTable, HavenThemeDirective],
  template: `<section [havenTheme]="theme()" [dir]="direction()">
    <haven-table [columns]="columns" [rows]="rows" [headerGroups]="layout" [view]="view" />
  </section>`,
})
class ThemeHost {
  readonly columns = columns;
  readonly rows = rows;
  readonly layout = layout;
  readonly view = { pinned: { start: ['name'], end: ['tail'] }, widths: { name: 100, tail: 120 } };
  readonly direction = signal('ltr');
  readonly theme = signal<HavenTheme>({ preset: 'material', mode: 'dark', density: 'comfortable' });
}
function document(): HavenDocument {
  return {
    schemaVersion: '1.0',
    id: 'grouped-model',
    title: 'Grouped model',
    dataSchema: {
      type: 'object',
      properties: {
        rows: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'number' },
              name: { type: 'string' },
              score: { type: 'number' },
              enabled: { type: 'boolean' },
              tail: { type: 'string' },
            },
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
        rowKey: '/id',
        editMode: 'row',
        columns: columns.map((column) =>
          column.id === 'name' ? { ...column, editor: { id: 'text' } } : { ...column },
        ) as unknown as JsonObject[],
        headerGroups: JSON.parse(JSON.stringify(layout)),
      },
    },
    actions: {},
    resources: {},
    theme: { preset: 'material', mode: 'dark', density: 'comfortable' },
  };
}
afterEach(cleanupHeaders);
describe('model and theme header integration', () => {
  it('preserves native leaf view state across Material/Glass and RTL without physical pin coordinates', async () => {
    setupTableEditTests();
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1200);
    const fixture = TestBed.createComponent(ThemeHost);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const table = fixture.debugElement.query(By.directive(HavenTable))
      .componentInstance as HavenTable;
    expect(table.pinningPaused()).toBe(false);
    const before = table.view();
    fixture.componentInstance.theme.set({
      preset: 'liquid-glass',
      mode: 'dark',
      density: 'compact',
    });
    fixture.componentInstance.direction.set('rtl');
    await fixture.whenStable();
    expect(element.querySelector('section')?.getAttribute('data-haven-preset')).toBe(
      'liquid-glass',
    );
    expect(element.querySelector('section')?.getAttribute('dir')).toBe('rtl');
    expect(table.view()).toBe(before);
    expect(labelled(element, 'Details')).toHaveLength(2);
    const start = labelled(element, 'Name')[0]!;
    expect(start.classList.contains('pinned')).toBe(true);
    expect(start.style.insetInlineStart).toBe('0px');
    expect(start.style.left).toBe('');
    expect(start.style.right).toBe('');
    expect(element.querySelectorAll('thead tr')).toHaveLength(3);
  });

  it('uses model-driven groups with the same renderer and retains an active row draft after layout edits', async () => {
    setupTableEditTests();
    const fixture = TestBed.createComponent(HavenRenderer),
      renderer = fixture.componentInstance;
    const model = document();
    fixture.componentRef.setInput('document', model);
    fixture.componentRef.setInput('value', { rows: [rows[0]!] });
    await fixture.whenStable();
    expect(renderer.validation().diagnostics).toEqual([]);
    const element = fixture.nativeElement as HTMLElement;
    const table = fixture.debugElement.query(By.directive(HavenTable))
      .componentInstance as HavenTable;
    expect(element.querySelectorAll('thead tr')).toHaveLength(3);
    const edit = [...element.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent?.trim() === 'Edit row',
    )!;
    edit.click();
    await fixture.whenStable();
    const input = element.querySelector<HTMLInputElement>('haven-table-editor-outlet input')!;
    typeTableInput(input, 'Model draft');
    await fixture.whenStable();
    const session = table.editing.session();
    fixture.componentRef.setInput('document', {
      ...model,
      ui: {
        ...model.ui,
        props: {
          ...model.ui.props,
          headerGroups: [
            { id: 'all', header: 'All data', children: ['id', 'name', 'score', 'enabled', 'tail'] },
          ],
        },
      },
    });
    await fixture.whenStable();
    expect(renderer.validation().diagnostics).toEqual([]);
    expect(table.editing.session()).toBe(session);
    expect(input.value).toBe('Model draft');
    expect(element.querySelectorAll('thead tr')).toHaveLength(2);
    await table.editing.save();
    await fixture.whenStable();
    expect((renderer.value()['rows'] as JsonObject[])[0]?.['name']).toBe('Model draft');
  });
  it.each(['headerGroups', 'title'] as const)(
    'retains user leaf view state across immutable model %s updates',
    async (change) => {
      setupTableEditTests();
      const fixture = TestBed.createComponent(HavenRenderer),
        renderer = fixture.componentInstance;
      const model = document();
      fixture.componentRef.setInput('document', model);
      fixture.componentRef.setInput('value', { rows: [rows[0]!] });
      await fixture.whenStable();
      const table = fixture.debugElement.query(By.directive(HavenTable))
        .componentInstance as HavenTable;
      table.table.setColumnVisibility({ score: false });
      table.table.setColumnOrder(['tail', 'score', 'name', 'enabled', 'id']);
      table.table.getColumn('name')!.pin('start');
      table.table.setColumnSizing({ name: 240 });
      await fixture.whenStable();
      const previous = structuredClone(table.view()),
        owner = renderer.documentIdentity();
      const next = structuredClone(model);
      if (change === 'title') next.ui.props!['title'] = 'Updated table title';
      else {
        const groups = next.ui.props!['headerGroups'] as JsonObject[];
        groups[1]!['header'] = 'Updated details';
      }
      fixture.componentRef.setInput('document', next);
      await fixture.whenStable();
      expect(renderer.validation().diagnostics).toEqual([]);
      expect(renderer.documentIdentity()).toBe(owner);
      expect(fixture.debugElement.query(By.directive(HavenTable)).componentInstance).toBe(table);
      expect(table.view()).toEqual(previous);
      expect(table.visibleColumns().map((column) => column.id)).toEqual([
        'name',
        'tail',
        'enabled',
        'id',
      ]);
    },
  );
  it('applies an explicitly changed model view while preserving edits across equivalent immutable defaults', async () => {
    setupTableEditTests();
    const fixture = TestBed.createComponent(HavenRenderer);
    const model = document();
    fixture.componentRef.setInput('document', model);
    fixture.componentRef.setInput('value', { rows: [rows[0]!] });
    await fixture.whenStable();
    const table = fixture.debugElement.query(By.directive(HavenTable))
      .componentInstance as HavenTable;
    table.table.setColumnVisibility({ score: false });
    await fixture.whenStable();
    const configured = {
      hidden: ['enabled'],
      order: ['tail', 'name', 'id', 'score', 'enabled'],
      widths: { name: 120 },
    };
    const next = structuredClone(model);
    next.ui.props!['view'] = configured;
    fixture.componentRef.setInput('document', next);
    await fixture.whenStable();
    expect(table.view()).toEqual(configured);
    table.table.setColumnSizing({ name: 300 });
    await fixture.whenStable();
    fixture.componentRef.setInput('document', structuredClone(next));
    await fixture.whenStable();
    expect(table.view()).toEqual({ ...configured, widths: { name: 300 } });
  });
});
