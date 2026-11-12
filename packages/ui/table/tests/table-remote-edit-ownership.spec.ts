import { TestBed } from '@angular/core/testing';
import { signal as writableSignal } from '@angular/core';
import { afterEach, expect, it, vi } from 'vitest';
import type { TableEditResult } from '@haven/runtime';
import { remoteEditTable } from '../../../../tests/ui/table-remote-edit-support';

afterEach(() => TestBed.resetTestingModule());

it.each(['query', 'source', 'handler', 'readonly', 'disabled', 'permission', 'reload'] as const)(
  'cancels pending writes and ignores late canonical results after %s changes',
  async (change) => {
    let resolve!: (result: TableEditResult) => void;
    let signal!: AbortSignal;
    const active = writableSignal(true);
    const commit = vi.fn((_request, abort: AbortSignal) => {
      signal = abort;
      return new Promise<TableEditResult>((done) => {
        resolve = done;
      });
    });
    const t = await remoteEditTable('cell', { commit });
    t.fixture.componentRef.setInput('editActive', active);
    await t.fixture.whenStable();
    await t.start();
    const committed = vi.fn();
    t.table.editCommitted.subscribe(committed);
    const saving = t.table.editing.save();
    await t.fixture.whenStable();
    expect(commit).toHaveBeenCalledTimes(1);
    if (change === 'query')
      t.fixture.componentRef.setInput('query', { ...t.table.query(), filter: 'new' });
    if (change === 'source')
      t.fixture.componentRef.setInput('source', { ...t.table.source()!, identity: 'replacement' });
    if (change === 'handler')
      t.fixture.componentRef.setInput('remoteEditHandler', { commit: vi.fn() });
    if (change === 'readonly' || change === 'disabled')
      t.fixture.componentRef.setInput(change, true);
    if (change === 'permission') active.set(false);
    if (change === 'reload') t.table.reload();
    // Saving again must synchronously reject stale inputs, even before effect cancellation.
    await t.table.editing.save();
    expect(commit).toHaveBeenCalledTimes(1);
    await t.fixture.whenStable();
    expect(signal.aborted).toBe(true);
    resolve({ status: 'applied', row: { id: 0, name: 'Late', amount: 3, active: true } });
    await saving;
    expect(committed).not.toHaveBeenCalled();
    expect(t.serverRows()[0]!['name']).toBe('First');
  },
);

it.each(['query', 'permission', 'handler'] as const)(
  'checks %s synchronously before issuing the first write',
  async (change) => {
    const commit = vi.fn(async () => ({ status: 'error' as const, code: 'unused' }));
    const t = await remoteEditTable('cell', { commit });
    const active = writableSignal(true);
    t.fixture.componentRef.setInput('editActive', active);
    await t.fixture.whenStable();
    await t.start();
    if (change === 'query')
      t.fixture.componentRef.setInput('query', { ...t.table.query(), pageIndex: 1 });
    if (change === 'permission') active.set(false);
    if (change === 'handler')
      t.fixture.componentRef.setInput('remoteEditHandler', { commit: vi.fn() });
    await t.table.editing.save();
    expect(commit).not.toHaveBeenCalled();
  },
);
