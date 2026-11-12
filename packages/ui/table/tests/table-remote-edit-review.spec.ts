import { TestBed } from '@angular/core/testing';
import { afterEach, expect, it, vi } from 'vitest';
import { remoteEditTable } from '../../../../tests/ui/table-remote-edit-support';

afterEach(() => TestBed.resetTestingModule());

it.each(['handler', 'readonly', 'session'] as const)(
  'does not deliver a completed write into changed %s configuration during cancellation callbacks',
  async (change) => {
    const t = await remoteEditTable('cell');
    const committed = vi.fn();
    t.table.editCommitted.subscribe(committed);
    t.table.editCancelled.subscribe((reason) => {
      if (reason !== 'committed') return;
      if (change === 'handler')
        t.fixture.componentRef.setInput('remoteEditHandler', {
          commit: vi.fn(async () => ({ status: 'error' as const, code: 'replacement' })),
        });
      else if (change === 'readonly') t.fixture.componentRef.setInput('readonly', true);
      else t.table.editing.begin(t.table.displayedRows()[0]!, ['name']);
    });
    await t.start();
    await t.table.editing.save();
    // The earlier host write has completed. Only the notification/refresh into changed UI is rejected.
    expect(t.serverRows()[0]!['name']).toBe('Changed');
    expect(committed).not.toHaveBeenCalled();
    expect(t.loads).toHaveLength(1);
    if (change === 'session') expect(t.table.editing.session()).not.toBeNull();
  },
);
