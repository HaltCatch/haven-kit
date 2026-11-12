import { TestBed } from '@angular/core/testing';
import { afterEach, expect, it, vi } from 'vitest';
import type { TableEditRequest, TableEditResult } from '@haven/runtime';
import { remoteEditTable } from '../../../../tests/ui/table-remote-edit-support';
import { typeTableInput } from '../../../../tests/ui/table-edit-support';

afterEach(() => TestBed.resetTestingModule());

it.each(['cell', 'row'] as const)(
  'commits %s drafts to the explicit remote port and reloads without changing local data',
  async (mode) => {
    const t = await remoteEditTable(mode);
    const committed = vi.fn();
    t.table.editCommitted.subscribe(committed);
    await t.start();
    expect(t.serverRows()[0]!['name']).toBe('First');
    await t.table.editing.save();
    await t.fixture.whenStable();
    await expect.poll(() => t.table.dataState().status).toBe('ready');
    expect(t.calls).toHaveLength(1);
    expect(t.calls[0]).toMatchObject({
      rowKey: 0,
      changes: [
        {
          columnId: 'name',
          path: '/name',
          before: { exists: true, value: 'First' },
          value: 'Changed',
        },
      ],
    });
    expect(Object.isFrozen(t.calls[0]!.changes[0])).toBe(true);
    expect(t.localCalls).toEqual([]);
    expect(t.table.rows()[0]!['name']).toBe('Local decoy');
    expect(t.table.displayedRows()[0]!['name']).toBe('Changed');
    expect(committed).toHaveBeenCalledExactlyOnceWith({ rowKey: 0, row: t.serverRows()[0] });
    expect(t.table.editing.session()).toBeNull();
    expect(t.loads).toHaveLength(2);
  },
);

it.each(['conflict', 'invalid', 'error'] as const)(
  'retains a remote %s draft without silently patching the loaded window',
  async (status) => {
    const result: TableEditResult =
      status === 'invalid'
        ? { status, errors: [{ path: '/name', code: 'server' }] }
        : status === 'error'
          ? { status, code: 'rejected' }
          : { status };
    const t = await remoteEditTable('cell', { commit: async () => result });
    await t.start('Retained');
    await t.table.editing.save();
    await t.fixture.whenStable();
    expect(t.table.editing.session()).not.toBeNull();
    expect(t.table.editing.error()).toBe(status === 'error' ? 'failed' : status);
    expect(t.root.querySelector<HTMLInputElement>('haven-table-editor-outlet input')!.value).toBe(
      'Retained',
    );
    expect(t.table.displayedRows()[0]!['name']).toBe('First');
    expect(t.loads).toHaveLength(1);
  },
);

it('requires an explicit remote handler even when the same table retains a local CAS handler', async () => {
  const t = await remoteEditTable();
  t.fixture.componentRef.setInput('remoteEditHandler', undefined);
  await t.fixture.whenStable();
  expect(t.table.extensionIssue()).toBe('handler');
  t.table.editing.begin(t.table.displayedRows()[0]!, ['name']);
  expect(t.table.editing.session()).toBeNull();
  expect(t.localCalls).toEqual([]);
});

it('retains uncertain saves and reuses the transaction only while the intent is unchanged', async () => {
  const requests: TableEditRequest[] = [];
  const t = await remoteEditTable('cell', {
    commit: async (request) => {
      requests.push(request);
      throw new Error('Transport ended');
    },
  });
  await t.start();
  await t.table.editing.save();
  expect(t.table.editing.error()).toBe('uncertain');
  await t.table.editing.save();
  expect(requests[1]!.transactionId).toBe(requests[0]!.transactionId);
  typeTableInput(
    t.root.querySelector<HTMLInputElement>('haven-table-editor-outlet input')!,
    'Another intent',
  );
  await t.fixture.whenStable();
  await t.table.editing.save();
  expect(requests[2]!.transactionId).not.toBe(requests[0]!.transactionId);
});

it('keeps write success distinct from a failed read refresh and retries only loading', async () => {
  const t = await remoteEditTable('cell');
  let fail = true;
  const load = vi.fn(async () => {
    if (fail) throw new Error('Offline');
    return { rows: t.serverRows(), total: 2 };
  });
  // The read adapter can fail after the original successful window without changing its identity.
  t.table.source()!.adapter.load = load;
  await t.start();
  const committed = vi.fn();
  t.table.editCommitted.subscribe(committed);
  await t.table.editing.save();
  await t.fixture.whenStable();
  await expect.poll(() => t.table.dataState().status).toBe('error');
  await t.fixture.whenStable();
  expect(t.serverRows()[0]!['name']).toBe('Changed');
  expect(t.table.editing.session()).toBeNull();
  expect(committed).toHaveBeenCalledTimes(1);
  expect(t.table.editRefreshFailed()).toBe(true);
  expect(t.root.textContent).toContain('Changes were saved');
  t.table.reload();
  await t.fixture.whenStable();
  await expect.poll(() => t.table.dataState().status).toBe('error');
  expect(t.table.editRefreshFailed()).toBe(true);
  expect(t.calls).toHaveLength(1);
  fail = false;
  t.table.reload();
  await t.fixture.whenStable();
  await expect.poll(() => t.table.dataState().status).toBe('ready');
  expect(t.calls).toHaveLength(1);
  expect(load).toHaveBeenCalledTimes(3);
  expect(t.table.editRefreshFailed()).toBe(false);
});
