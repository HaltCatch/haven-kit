import { TestBed } from '@angular/core/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatButtonHarness } from '@angular/material/button/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { treeTable, hierarchy, rows } from './support';
afterEach(() => TestBed.resetTestingModule());

describe('native table hierarchy row pipeline', () => {
  it('builds roots from canonical flat rows and expands typed 0 independently of string zero', async () => {
    const t = await treeTable();
    expect(t.visible()).toEqual([0, '0']);
    expect(t.table.displayedRows()).toEqual(rows);
    const roots = t.table.table.getCoreRowModel().rows;
    expect(roots[0]!.original).toBe(rows[0]);
    expect(roots[0]!.subRows[0]!.original).toBe(rows[1]);
    const loader = TestbedHarnessEnvironment.loader(t.fixture);
    await (
      await loader.getAllHarnesses(MatButtonHarness.with({ selector: '[aria-expanded]' }))
    )[0]!.click();
    expect(t.table.expandedRowKeys()).toEqual([0]);
    expect(t.visible()).toEqual([0, 'b', 'a', '0']);
    t.table.table.getRow('string:a', true).toggleExpanded();
    await t.fixture.whenStable();
    expect(t.table.expandedRowKeys()).toEqual([0, 'a']);
    expect(t.visible()).toEqual([0, 'b', 'a', 'c', '0']);
    expect(t.element.querySelector('[role="treegrid"]')).toBeNull();
    expect(t.element.querySelectorAll('thead th').length).toBe(4);
  });

  it.each(['root-rows', 'visible-rows'] as const)(
    'uses native %s pagination and distinguishes page units from record count',
    async (pagination) => {
      const t = await treeTable({
        hierarchy: { ...hierarchy, pagination },
        pageSize: 1,
        expandedRowKeys: [0, 'a', '0'],
      });
      expect(t.table.table.getPageCount()).toBe(pagination === 'root-rows' ? 2 : 6);
      expect(t.visible()).toEqual(pagination === 'root-rows' ? [0, 'b', 'a', 'c'] : [0]);
      expect(t.table.status()).toContain('6 records');
      expect(t.table.status()).toContain(
        pagination === 'root-rows' ? '2 root rows' : '6 visible rows',
      );
      t.table.table.nextPage();
      await t.fixture.whenStable();
      expect(t.visible()).toEqual(pagination === 'root-rows' ? ['0', 'd'] : ['b']);
    },
  );

  it.each(['retain-ancestors', 'prune-branches'] as const)(
    'uses native %s filtering without promoting hidden descendants to roots',
    async (filterMode) => {
      const t = await treeTable({
        hierarchy: { ...hierarchy, filterMode },
        expandedRowKeys: [0, 'a', '0'],
      });
      t.table.table.setGlobalFilter('Needle');
      await t.fixture.whenStable();
      expect(t.visible()).toEqual(filterMode === 'retain-ancestors' ? [0, 'a'] : []);
      expect(t.table.displayedRows()).toHaveLength(6);
      t.table.table.setGlobalFilter('');
      t.table.table.setSorting([{ id: 'amount', desc: false }]);
      await t.fixture.whenStable();
      expect(t.visible()).toEqual(['0', 'd', 0, 'b', 'a', 'c']);
    },
  );

  it('keeps single parent/child selection independent and native all-selection covers collapsed filtered descendants', async () => {
    const t = await treeTable();
    const checkbox = t.element.querySelectorAll<HTMLInputElement>(
      'tbody input[type="checkbox"]',
    )[0]!;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    await t.fixture.whenStable();
    expect(t.table.selection()).toEqual([0]);
    expect(t.table.table.getIsAllRowsSelected()).toBe(false);
    t.table.selectAll(true);
    await t.fixture.whenStable();
    expect(new Set(t.table.selection())).toEqual(new Set([0, 'b', 'a', 'c', '0', 'd']));
    expect(t.table.table.getIsAllRowsSelected()).toBe(true);
    t.table.table.getRow('number:0', true).toggleSelected(false, { selectChildren: false });
    await t.fixture.whenStable();
    expect(t.table.selection()).not.toContain(0);
    expect(t.table.selection()).toContain('a');
    t.table.table.setGlobalFilter('Needle');
    await t.fixture.whenStable();
    t.table.selectAll(false);
    await t.fixture.whenStable();
    expect(t.table.selection()).not.toContain('a');
    expect(t.table.selection()).toContain('c');
    expect(t.table.selection()).toContain('0');
  });

  it('exports sorted complete filtered descendants while page export follows actual expanded page rows', async () => {
    const t = await treeTable({ pageSize: 1 });
    t.table.table.setSorting([{ id: 'amount', desc: false }]);
    await t.fixture.whenStable();
    const all = t.table.createCsv({ scope: 'filtered', bom: false });
    expect(all.status).toBe('ready');
    if (all.status === 'ready') {
      expect(all.rowCount).toBe(6);
      expect(all.csv).toBe(
        '"Name","Amount"\r\n"Root A","10"\r\n"Delta","4"\r\n"Root Z","20"\r\n"Beta","1"\r\n"Needle","3"\r\n"Grandchild","2"\r\n',
      );
    }
    const page = t.table.createCsv({ scope: 'page' });
    expect(page.status).toBe('ready');
    if (page.status === 'ready') expect(page.rowCount).toBe(1);
    t.table.table.toggleAllRowsExpanded(true);
    await t.fixture.whenStable();
    const expanded = t.table.createCsv({ scope: 'page' });
    if (expanded.status === 'ready') expect(expanded.rowCount).toBe(2);
    expect(t.table.exportContext().total).toBe(6);
  });

  it('retains unknown initial keys without engine expansion and diagnoses malformed keys or incomplete hierarchy', async () => {
    const t = await treeTable({ expandedRowKeys: ['missing', 0] });
    expect(t.table.expandedRowKeys()).toEqual(['missing', 0]);
    expect(t.visible()).toEqual([0, 'b', 'a', '0']);
    t.fixture.componentRef.setInput('expandedRowKeys', [0, 0]);
    await t.fixture.whenStable();
    expect(t.table.issue()?.code).toBe('expandedRows');
    expect(t.element.querySelector('table')).toBeNull();
    t.fixture.componentRef.setInput('expandedRowKeys', []);
    t.fixture.componentRef.setInput('rows', [
      { id: 'orphan', parent: 'missing', name: 'Orphan', amount: 0 },
    ]);
    await t.fixture.whenStable();
    expect(t.table.issue()?.code).toBe('hierarchy');
    expect(t.element.querySelector('table')).toBeNull();
  });
  it.each(['native', 'controlled'] as const)(
    'clamps visible-row pagination after a %s collapse shrinks the row model',
    async (source) => {
      const t = await treeTable({
        hierarchy: { ...hierarchy, pagination: 'visible-rows' },
        pageSize: 1,
        expandedRowKeys: [0, 'a', '0'],
      });
      t.table.table.setPageIndex(5);
      await t.fixture.whenStable();
      expect(t.visible()).toEqual(['d']);
      if (source === 'native') t.table.table.toggleAllRowsExpanded(false);
      else t.fixture.componentRef.setInput('expandedRowKeys', []);
      await t.fixture.whenStable();
      expect(t.table.table.atoms.pagination.get().pageIndex).toBe(1);
      expect(t.visible()).toEqual(['0']);
    },
  );

  it('keeps expand-all available when only the current root page is already expanded', async () => {
    const t = await treeTable({ pageSize: 1, expandedRowKeys: [0, 'a'] });
    expect(t.table.table.getIsAllRowsExpanded()).toBe(true);
    const loader = TestbedHarnessEnvironment.loader(t.fixture);
    const expandAll = await loader.getHarness(MatButtonHarness.with({ text: 'Expand all rows' }));
    expect(await expandAll.isDisabled()).toBe(false);
    await expandAll.click();
    expect(new Set(t.table.expandedRowKeys())).toEqual(new Set([0, 'a', '0']));
  });
});
