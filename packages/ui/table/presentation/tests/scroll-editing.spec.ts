import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { editTable, editColumns, editSchema } from '../../../../../tests/ui/table-edit-support';
import { typeTableInput } from '../../../../../tests/ui/table-edit-support';
import { installVirtualGeometry } from '../../virtual/tests/geometry';

let geometry: ReturnType<typeof installVirtualGeometry>;
beforeEach(() => {
  geometry = installVirtualGeometry({ height: 180, row: 48 });
});
afterEach(() => {
  TestBed.resetTestingModule();
  geometry.restore();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it.each(['cell', 'row'] as const)(
  'retains the exact focused %s draft while scrolling away and back, then commits only through the original flat CAS',
  async (mode) => {
    const initial = Array.from({ length: 500 }, (_, id) => ({
        id,
        name: `Record ${id}`,
        amount: id,
        active: true,
      })),
      t = await editTable(mode, editColumns, editSchema, initial);
    t.fixture.componentRef.setInput('virtualization', {
      viewportHeight: 180,
      estimateRowHeight: 48,
      overscan: 2,
    });
    await t.fixture.whenStable();
    t.root.querySelector<HTMLButtonElement>('[data-table-edit-row="number:0"]')!.click();
    await t.fixture.whenStable();
    const input = t.root.querySelector<HTMLInputElement>('haven-table-editor-outlet input')!,
      session = t.table.editing.session();
    typeTableInput(input, 'Scrolled draft');
    input.focus();
    await t.fixture.whenStable();
    t.table.virtualWindow.virtualizer.scrollToIndex(499, { align: 'end' });
    await t.fixture.whenStable();
    expect(t.root.querySelector('tr[data-virtual-row-id="number:499"]')).not.toBeNull();
    expect(t.root.querySelectorAll('tbody tr[data-virtual-row-id]').length).toBeLessThan(20);
    expect(t.root.querySelector('haven-table-editor-outlet input')).toBe(input);
    expect(document.activeElement).toBe(input);
    expect(t.table.editing.session()).toBe(session);
    expect(t.rows()[0]?.['name']).toBe('Record 0');
    t.table.virtualWindow.virtualizer.scrollToIndex(0, { align: 'start' });
    await t.fixture.whenStable();
    expect(t.root.querySelector('haven-table-editor-outlet input')).toBe(input);
    expect(input.value).toBe('Scrolled draft');
    await t.table.editing.save();
    await t.fixture.whenStable();
    expect(t.rows()[0]?.['name']).toBe('Scrolled draft');
    expect(t.rows()[499]).toEqual(initial[499]);
    expect(t.rows()).toHaveLength(500);
  },
);
