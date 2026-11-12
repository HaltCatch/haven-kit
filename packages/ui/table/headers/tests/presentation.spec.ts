import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatButtonHarness } from '@angular/material/button/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanupHeaders, headerTable, headers, labelled, resize } from './support';

afterEach(cleanupHeaders);
describe('native nested table headers', () => {
  it('uses true spans for uneven depths, retains shallow sorting, and renders auxiliary columns only once', async () => {
    const t = await headerTable({
      selectable: true,
      rowActions: [{ id: 'inspect', label: 'Inspect', kind: 'read' }],
    });
    expect(t.element.querySelectorAll('thead tr')).toHaveLength(3);
    expect(labelled(t.element, 'Details')[0]!.colSpan).toBe(3);
    expect(labelled(t.element, 'Metrics')[0]!.colSpan).toBe(2);
    expect(labelled(t.element, 'ID')).toHaveLength(1);
    expect(labelled(t.element, 'ID')[0]!.rowSpan).toBe(3);
    expect(labelled(t.element, 'Name')[0]!.rowSpan).toBe(2);
    expect(labelled(t.element, 'Tail')[0]!.rowSpan).toBe(3);
    expect(t.element.querySelectorAll('thead input[type="checkbox"]')).toHaveLength(1);
    expect(t.element.querySelector('thead input')!.closest('th')!.rowSpan).toBe(3);
    expect(labelled(t.element, 'Row actions')).toHaveLength(1);
    expect(labelled(t.element, 'Row actions')[0]!.rowSpan).toBe(3);
    const loader = TestbedHarnessEnvironment.loader(t.fixture);
    await (await loader.getHarness(MatButtonHarness.with({ text: /Score/ }))).click();
    expect(t.table.table.atoms.sorting.get()).toEqual([{ id: 'score', desc: false }]);
    expect(t.table.table.getRowModel().rows.map((row) => row.original['id'])).toEqual([0, '0']);
    await (await loader.getHarness(MatButtonHarness.with({ text: /ID/ }))).click();
    expect(t.table.table.atoms.sorting.get()[0]?.id).toBe('id');
    expect(headers(t.element).filter((cell) => cell.scope === 'colgroup')).toHaveLength(2);
    t.table.table.setColumnVisibility({ score: false, enabled: false });
    await t.fixture.whenStable();
    expect(t.element.querySelectorAll('thead tr')).toHaveLength(2);
    expect(labelled(t.element, 'ID')[0]!.rowSpan).toBe(2);
    expect(labelled(t.element, 'Metrics')).toHaveLength(0);
    expect(labelled(t.element, 'Details')[0]!.colSpan).toBe(1);
  });

  it('splits groups across logical start, center and end without making center fragments sticky', async () => {
    const t = await headerTable({
      headerGroups: [
        'id',
        { id: 'details', header: 'Details', children: ['name', 'score'] },
        { id: 'status', header: 'Status', children: ['enabled', 'tail'] },
      ],
      view: {
        pinned: { start: ['name', 'enabled'], end: ['score', 'tail'] },
        widths: { name: 80, enabled: 90, score: 110, tail: 120, id: 70 },
      },
    });
    const details = labelled(t.element, 'Details'),
      status = labelled(t.element, 'Status');
    expect(details).toHaveLength(2);
    expect(status).toHaveLength(2);
    expect(details.map((cell) => cell.colSpan)).toEqual([1, 1]);
    expect(details[0]!.style.insetInlineStart).toBe('0px');
    expect(status[0]!.style.insetInlineStart).toBe('80px');
    expect(details[1]!.style.insetInlineEnd).toBe('120px');
    expect(status[1]!.style.insetInlineEnd).toBe('0px');
    expect(t.table.visibleColumns().map((column) => column.id)).toEqual([
      'name',
      'enabled',
      'id',
      'score',
      'tail',
    ]);
    t.fixture.componentRef.setInput('view', { pinned: { start: ['name'], end: ['tail'] } });
    await t.fixture.whenStable();
    const mixed = labelled(t.element, 'Details');
    expect(mixed).toHaveLength(2);
    expect(mixed[0]!.classList.contains('pinned')).toBe(true);
    expect(mixed[1]!.classList.contains('pinned')).toBe(false);
    expect(mixed[0]!.colSpan).toBe(1);
    expect(mixed[1]!.colSpan).toBe(1);
    await resize(t.fixture, 40);
    expect(t.table.pinningPaused()).toBe(true);
    expect(t.element.querySelectorAll('thead .pinned')).toHaveLength(0);
    await resize(t.fixture, 1200);
    expect(t.element.querySelectorAll('thead .pinned').length).toBeGreaterThan(0);
  });

  it('keeps native leaf reordering and hiding semantics, including repeated noncontiguous group fragments', async () => {
    const t = await headerTable({
      headerGroups: [
        { id: 'a', header: 'A group', children: ['id', 'name'] },
        { id: 'b', header: 'B group', children: ['score', 'enabled', 'tail'] },
      ],
    });
    t.table.table.setColumnOrder(['id', 'score', 'name', 'enabled', 'tail']);
    await t.fixture.whenStable();
    expect(labelled(t.element, 'A group')).toHaveLength(2);
    expect(labelled(t.element, 'B group')).toHaveLength(2);
    expect(t.table.visibleColumns().map((column) => column.id)).toEqual([
      'id',
      'score',
      'name',
      'enabled',
      'tail',
    ]);
    t.table.table.setColumnVisibility({ score: false, enabled: false, tail: false });
    await t.fixture.whenStable();
    expect(labelled(t.element, 'B group')).toHaveLength(0);
    expect(labelled(t.element, 'A group')).toHaveLength(1);
    expect(labelled(t.element, 'A group')[0]!.colSpan).toBe(2);
    expect(t.table.view().hidden).toEqual(['score', 'enabled', 'tail']);
  });

  it('localizes group and leaf captions while retaining leaf view state and flat behavior', async () => {
    const t = await headerTable({ view: { hidden: ['enabled'] } });
    TestBed.inject(TranslocoService).setActiveLang('zh-CN');
    await t.fixture.whenStable();
    expect(labelled(t.element, '详情')).toHaveLength(1);
    expect(labelled(t.element, '名称')).toHaveLength(1);
    expect(t.table.view().hidden).toEqual(['enabled']);
    t.fixture.componentRef.setInput('headerGroups', undefined);
    await t.fixture.whenStable();
    expect(t.element.querySelectorAll('thead tr')).toHaveLength(1);
    expect(headers(t.element)).toHaveLength(4);
    expect(t.table.visibleColumns().map((column) => column.id)).toEqual([
      'id',
      'name',
      'score',
      'tail',
    ]);
  });

  it('fails visibly for an invalid direct-component layout instead of silently dropping or duplicating columns', async () => {
    const t = await headerTable({ headerGroups: ['name', 'name'] });
    expect(t.table.issue()?.code).toBe('headerGroups');
    expect(t.element.querySelector('table')).toBeNull();
    expect(t.element.querySelector('[role="alert"]')?.textContent).toContain(
      'Invalid header group',
    );
  });
  it('keeps invalid row data out of native column construction even when a valid group layout exists', async () => {
    const t = await headerTable({
      rows: [{ id: 0, name: 'Bad row', score: Number.POSITIVE_INFINITY, enabled: true, tail: '' }],
    });
    expect(t.table.issue()?.code).toBe('cellValue');
    expect(() => t.table.table.getAllColumns()).not.toThrow();
    expect(t.table.createCsv({ scope: 'filtered' })).toEqual({
      status: 'error',
      code: 'unavailable',
    });
  });
});
