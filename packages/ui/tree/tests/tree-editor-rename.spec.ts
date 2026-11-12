import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { setupTreeSelection } from '../../../../tests/ui/tree-selection-support';
import { createEditor } from '../../../../tests/ui/tree-editor-support';

beforeEach(setupTreeSelection);
afterEach(() => TestBed.resetTestingModule());
it('keeps a captured rename locale, preserves raw translations and uses Enter/Escape with focus restoration', async () => {
  const { fixture, component, proposals } = await createEditor();
  const row = component.rows().find((row) => row.node().key === 'leaf')!;
  row.beginRename();
  await fixture.whenStable();
  const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('input')!;
  expect(document.activeElement).toBe(input);
  input.value = 'Draft';
  input.dispatchEvent(new Event('input'));
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await fixture.whenStable();
  expect(proposals).toEqual([]);
  expect(document.activeElement?.tagName).toBe('MAT-TREE-NODE');
  row.beginRename();
  await fixture.whenStable();
  const second = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('input')!;
  second.value = 'Renamed leaf';
  second.dispatchEvent(new Event('input'));
  TestBed.inject(TranslocoService).setActiveLang('zh-CN');
  await fixture.whenStable();
  expect(second.value).toBe('Renamed leaf');
  second.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  expect(proposals).toEqual([
    {
      type: 'rename',
      key: 'leaf',
      label: 'Renamed leaf',
      previousLabel: { default: 'Leaf', translations: { 'zh-CN': '叶子', fr: 'Feuille' } },
      locale: 'en-US',
    },
  ]);
  expect(component.index()!.entries.get('leaf')!.node.label).toEqual({
    default: 'Leaf',
    translations: { 'zh-CN': '叶子', fr: 'Feuille' },
  });
});
it.each(['identity', 'nodes', 'readonly', 'disabled'] as const)(
  'rejects a stale rename in the same tick as component %s input replacement',
  async (property) => {
    const { fixture, component, proposals } = await createEditor();
    const row = component.rows().find((row) => row.node().key === 'leaf')!;
    row.beginRename();
    await fixture.whenStable();
    row.draft.set('Stale label');
    fixture.componentRef.setInput(
      property,
      {
        identity: 'new-owner',
        nodes: structuredClone(component.nodes()),
        readonly: true,
        disabled: true,
      }[property],
    );
    row.commitRename();
    expect(proposals).toEqual([]);
    await fixture.whenStable();
    expect(row.editing()).toBeUndefined();
  },
);
it('rejects blank labels locally and ignores Enter while an input method is composing', async () => {
  const { fixture, component, proposals } = await createEditor();
  const row = component.rows().find((row) => row.node().key === 'leaf')!;
  row.beginRename();
  await fixture.whenStable();
  row.draft.set('  ');
  row.commitRename();
  expect(row.renameError()).toBe(true);
  expect(proposals).toEqual([]);
  row.draft.set('Composition');
  row.renameKey(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true }));
  expect(proposals).toEqual([]);
  expect(row.editing()).toBeDefined();
  row.cancelRename();
});

it('leaves Enter on the cancel button to native button activation without committing a rename', async () => {
  const { fixture, component, proposals } = await createEditor();
  const row = component.rows().find((row) => row.node().key === 'leaf')!;
  row.beginRename();
  row.draft.set('Must not save');
  await fixture.whenStable();
  const cancel = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
    '.rename button:last-of-type',
  )!;
  cancel.focus();
  cancel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  expect(proposals).toEqual([]);
  expect(row.editing()).toBeDefined();
  cancel.click();
  expect(row.editing()).toBeUndefined();
  expect(proposals).toEqual([]);
});
