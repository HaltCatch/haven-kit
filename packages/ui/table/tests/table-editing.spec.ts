import { TestBed } from '@angular/core/testing';
import { afterEach, expect, it, vi } from 'vitest';
import { editTable, typeTableInput } from '../../../../tests/ui/table-edit-support';
afterEach(() => TestBed.resetTestingModule());
it('edits one row through real native fields, atomically saves and keeps table navigation stable', async () => {
  const t = await editTable();
  t.button('Edit row').click();
  await t.fixture.whenStable();
  const inputs = t.root.querySelectorAll<HTMLInputElement>('haven-table-editor-outlet input');
  typeTableInput(inputs[0]!, 'Changed');
  typeTableInput(inputs[1]!, '-1');
  await t.fixture.whenStable();
  await t.table.editing.save();
  await t.fixture.whenStable();
  expect(t.rows()[0]!.name).toBe('First');
  expect(t.table.editing.session()).not.toBeNull();
  expect(t.root.querySelector('[role="alert"]')?.textContent).toContain('validation');
  expect(t.button('Next page').disabled).toBe(true);
  typeTableInput(inputs[1]!, '9');
  await t.fixture.whenStable();
  await t.table.editing.save();
  await t.fixture.whenStable();
  expect(t.rows()[0]).toEqual({ id: 0, name: 'Changed', amount: 9, active: true });
  expect(t.table.editing.session()).toBeNull();
  expect(t.button('Next page').disabled).toBe(false);
});
it('retains a conflicting draft, preserves unrelated updates and cancel never writes', async () => {
  const t = await editTable('cell');
  t.button('Edit').click();
  await t.fixture.whenStable();
  typeTableInput(
    t.root.querySelector<HTMLInputElement>('haven-table-editor-outlet input')!,
    'Draft',
  );
  await t.fixture.whenStable();
  t.replace([{ ...t.rows()[0]!, name: 'External' }, t.rows()[1]!]);
  await t.fixture.whenStable();
  await t.table.editing.save();
  await t.fixture.whenStable();
  expect(t.table.editing.error()).toBe('conflict');
  expect(t.rows()[0]!.name).toBe('External');
  expect(t.root.querySelector<HTMLInputElement>('haven-table-editor-outlet input')!.value).toBe(
    'Draft',
  );
  t.table.editing.cancel();
  await t.fixture.whenStable();
  t.button('Edit').click();
  await t.fixture.whenStable();
  typeTableInput(
    t.root.querySelector<HTMLInputElement>('haven-table-editor-outlet input')!,
    'Merged',
  );
  await t.fixture.whenStable();
  t.replace([{ ...t.rows()[0]!, amount: 12 }, t.rows()[1]!]);
  await t.fixture.whenStable();
  await t.table.editing.save();
  await t.fixture.whenStable();
  expect(t.rows()[0]).toMatchObject({ name: 'Merged', amount: 12 });
});
it('uses awaited results, preserves failure drafts and discards late owner results', async () => {
  const t = await editTable();
  let resolve!: (value: {
    status: 'applied';
    row: { id: number; name: string; amount: number; active: boolean };
  }) => void;
  let signal!: AbortSignal;
  t.fixture.componentRef.setInput('editHandler', {
    commit: vi.fn((_request, abort: AbortSignal) => {
      signal = abort;
      return new Promise((done) => {
        resolve = done;
      });
    }),
  });
  await t.fixture.whenStable();
  t.button('Edit row').click();
  await t.fixture.whenStable();
  typeTableInput(
    t.root.querySelector<HTMLInputElement>('haven-table-editor-outlet input')!,
    'Pending',
  );
  await t.fixture.whenStable();
  const committed = vi.fn();
  t.table.editCommitted.subscribe(committed);
  const saving = t.table.editing.save();
  await t.fixture.whenStable();
  expect(t.rows()[0]!.name).toBe('First');
  expect(t.table.editing.session()?.native.tree().submitting()).toBe(true);
  expect(t.root.querySelector<HTMLInputElement>('haven-table-editor-outlet input')!.disabled).toBe(
    true,
  );
  await t.table.editing.save();
  expect(t.table.editHandler()!.commit).toHaveBeenCalledTimes(1);
  t.fixture.componentRef.setInput('owner', 'new-page');
  await t.fixture.whenStable();
  expect(signal.aborted).toBe(true);
  resolve({ status: 'applied', row: { id: 0, name: 'Pending', amount: 3, active: true } });
  await saving;
  expect(committed).not.toHaveBeenCalled();
  expect(t.rows()[0]!.name).toBe('First');
});
it('rejects remote editing without an explicit remote write port and read-only mutation', async () => {
  const t = await editTable();
  t.fixture.componentRef.setInput('readonly', true);
  await t.fixture.whenStable();
  expect(t.button('Edit row').disabled).toBe(true);
  t.fixture.componentRef.setInput('readonly', false);
  t.fixture.componentRef.setInput('source', {
    identity: 'remote',
    adapter: { load: async () => ({ rows: [], total: 0 }) },
  });
  await t.fixture.whenStable();
  expect(t.table.extensionIssue()).toBe('handler');
});
