import { TestBed } from '@angular/core/testing';
import { afterEach, expect, it } from 'vitest';
import type { JsonObject } from '@haven/schema';
import { typeTableInput } from '../../../../../tests/ui/table-edit-support';
import { renderHierarchy } from './support';

afterEach(() => TestBed.resetTestingModule());

it('normalizes numeric root markers without losing descendants and commits a child through the original flat array', async () => {
  const t = await renderHierarchy();
  expect(t.renderer.validation().diagnostics).toEqual([]);
  expect(t.table.table.getRowModel().rows.map((row) => row.original['id'])).toEqual([0, 1]);
  expect((t.renderer.value()['rows'] as JsonObject[])[1]!['parent']).toBeNull();
  const buttons = t.element.querySelectorAll<HTMLButtonElement>('[aria-label="Edit Name"]');
  buttons[1]!.click();
  await t.fixture.whenStable();
  typeTableInput(
    t.element.querySelector<HTMLInputElement>('haven-table-editor-outlet input')!,
    'Edited child',
  );
  await t.fixture.whenStable();
  t.renderer.value.update((data) => ({
    ...data,
    rows: (data['rows'] as JsonObject[]).map((row) =>
      row['id'] === 1 ? { ...row, note: 'Concurrent note' } : row,
    ),
  }));
  await t.table.editing.save();
  await t.fixture.whenStable();
  expect(structuredClone(t.renderer.value()['rows'])).toEqual([
    { id: 1, parent: 0, name: 'Edited child', note: 'Concurrent note' },
    { id: 0, parent: null, name: 'Root', note: 'Root note' },
  ]);
  expect(t.document.ui.props!['expandedRowKeys']).toEqual([0]);
});

it('retains user expansion across cosmetic model changes and applies an explicit initial expansion change', async () => {
  const t = await renderHierarchy();
  t.table.table.getRow('number:0')!.toggleExpanded(false);
  await t.fixture.whenStable();
  expect(t.table.table.getRowModel().rows).toHaveLength(1);
  const cosmetic = structuredClone(t.document);
  cosmetic.ui.props!['title'] = 'New caption';
  t.fixture.componentRef.setInput('document', cosmetic);
  await t.fixture.whenStable();
  expect(t.table.expandedRowKeys()).toEqual([]);
  expect(t.table.table.getRowModel().rows).toHaveLength(1);
  const changed = structuredClone(cosmetic);
  changed.ui.props!['expandedRowKeys'] = [];
  t.fixture.componentRef.setInput('document', changed);
  await t.fixture.whenStable();
  const expanded = structuredClone(changed);
  expanded.ui.props!['expandedRowKeys'] = [0];
  t.fixture.componentRef.setInput('document', expanded);
  await t.fixture.whenStable();
  expect(t.table.table.getRowModel().rows).toHaveLength(2);
});

it('refuses an old child expansion output before a replacement model has propagated', async () => {
  const t = await renderHierarchy();
  const next = structuredClone(t.document);
  next.ui.props!['expandedRowKeys'] = [];
  t.fixture.componentRef.setInput('document', next);
  t.table.expandedRowKeys.set([0]);
  await t.fixture.whenStable();
  expect(t.table.expandedRowKeys()).toEqual([]);
  expect(t.table.table.getRowModel().rows).toHaveLength(1);
});

it('emits typed expansion through the renderer while readonly and leaves persisted models and row data unchanged', async () => {
  const t = await renderHierarchy();
  const readonly = structuredClone(t.document);
  readonly.ui.props!['readonly'] = true;
  t.fixture.componentRef.setInput('document', readonly);
  await t.fixture.whenStable();
  const values: unknown[] = [];
  t.renderer.uiEvent.subscribe((event) => values.push(event));
  const reference = t.renderer.value(),
    before = structuredClone(reference);
  t.table.table.getRow('number:0')!.toggleExpanded(false);
  await t.fixture.whenStable();
  expect(t.table.expandedRowKeys()).toEqual([]);
  expect(values).toEqual([{ nodeId: 'records', event: 'expandedChange', value: [] }]);
  expect(t.renderer.value()).toBe(reference);
  expect(structuredClone(t.renderer.value())).toEqual(before);
  expect(readonly.ui.props!['expandedRowKeys']).toEqual([0]);
});
