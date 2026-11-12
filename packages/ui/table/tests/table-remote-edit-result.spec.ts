import { TestBed } from '@angular/core/testing';
import { afterEach, expect, it, vi } from 'vitest';
import type { TableEditResult } from '@haven/runtime';
import { remoteEditTable } from '../../../../tests/ui/table-remote-edit-support';

afterEach(() => TestBed.resetTestingModule());

it.each([
  { id: '0', name: 'Changed', amount: 3, active: true },
  { id: 0, name: 'Changed', amount: 'invalid', active: true },
  { id: 0, name: '', amount: 3, active: true },
  { id: 0, name: 'Changed', amount: -3, active: true },
])('rejects invalid canonical row %j and retains the editable draft', async (row) => {
  const t = await remoteEditTable('cell', { commit: async () => ({ status: 'applied', row }) });
  const committed = vi.fn();
  t.table.editCommitted.subscribe(committed);
  await t.start();
  await t.table.editing.save();
  expect(t.table.editing.error()).toBe('response');
  expect(t.table.editing.session()).not.toBeNull();
  expect(committed).not.toHaveBeenCalled();
  expect(t.loads).toHaveLength(1);
});

it('rejects malicious canonical getters before executing them or notifying a commit', async () => {
  let reads = 0;
  const result = {
    status: 'applied',
    get row() {
      reads++;
      return { id: 0, name: 'Changed' };
    },
  };
  const t = await remoteEditTable('cell', { commit: async () => result as TableEditResult });
  await t.start();
  await t.table.editing.save();
  expect(reads).toBe(0);
  expect(t.table.editing.error()).toBe('response');
});
