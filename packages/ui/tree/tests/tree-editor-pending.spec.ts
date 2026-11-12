import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { MatTreeNode } from '@angular/material/tree';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { setupTreeSelection } from '../../../../tests/ui/tree-selection-support';
import { createEditor } from '../../../../tests/ui/tree-editor-support';

beforeEach(setupTreeSelection);
afterEach(() => TestBed.resetTestingModule());

it('keeps an unapplied rename while declining filter, another row selection/edit, drag and move requests', async () => {
  const { fixture, component, proposals } = await createEditor();
  fixture.componentRef.setInput('filterable', true);
  await fixture.whenStable();
  const row = component.rows().find((row) => row.node().key === 'leaf')!;
  const other = component.rows().find((row) => row.node().key === 'empty')!;
  component.select(row.node());
  row.beginRename();
  row.draft.set('Unapplied');
  expect(component.pendingEdits()).toBe(true);
  const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('input')!;
  input.value = 'No matches';
  component.filterInput(input);
  expect(component.filter()).toBe('');
  expect(input.value).toBe('');
  component.select(other.node());
  expect(component.activeKey()).toBe('leaf');
  other.beginRename();
  expect(other.editing()).toBeUndefined();
  expect(component.canDrag(other.node())).toBe(false);
  component.request({
    owner: component.owner(),
    proposal: { type: 'move', key: 'empty', parent: 'group', before: null },
  });
  expect(component.issue()).toBe('blocked');
  expect(proposals).toEqual([]);
  await fixture.whenStable();
  expect(input.disabled).toBe(true);
  expect(row.draft()).toBe('Unapplied');
  row.commitRename();
  expect(proposals).toEqual([
    expect.objectContaining({ type: 'rename', key: 'leaf', label: 'Unapplied' }),
  ]);
  expect(component.pendingEdits()).toBe(false);
});

it('restores native ancestor collapse while allowing another branch to collapse without hiding the draft', async () => {
  const { fixture, component } = await createEditor();
  const row = component.rows().find((row) => row.node().key === 'leaf')!;
  row.beginRename();
  row.draft.set('Visible draft');
  const root = component.index()!.entries.get('root')!.node;
  const group = component.index()!.entries.get('group')!.node;
  expect(component.canCollapse(root)).toBe(false);
  expect(component.canCollapse(group)).toBe(true);
  component.control()!.collapse(root);
  await fixture.whenStable();
  expect(component.control()!.isExpanded(root)).toBe(true);
  expect(row.editing()).toBeDefined();
  component.control()!.collapse(group);
  await fixture.whenStable();
  expect(component.control()!.isExpanded(group)).toBe(false);
  expect(row.draft()).toBe('Visible draft');
  expect(component.pendingEdits()).toBe(true);
  expect(row.renameInput()!.nativeElement.isConnected).toBe(true);
});

it('focuses an existing rename rather than resetting its draft when F2 or beginRename is repeated', async () => {
  const { fixture, component } = await createEditor();
  const row = component.rows().find((row) => row.node().key === 'leaf')!;
  row.beginRename();
  row.draft.set('Keep typed input');
  await fixture.whenStable();
  const session = row.editing();
  const element = fixture.debugElement
    .queryAll(By.directive(MatTreeNode))
    .find((entry) => (entry.injector.get(MatTreeNode).data as { key: string }).key === 'leaf')!
    .nativeElement as HTMLElement;
  element.focus();
  element.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'F2', bubbles: true, cancelable: true }),
  );
  expect(row.editing()).toBe(session);
  expect(row.draft()).toBe('Keep typed input');
  expect(document.activeElement).toBe(row.renameInput()!.nativeElement);
  row.beginRename();
  expect(row.editing()).toBe(session);
  expect(row.draft()).toBe('Keep typed input');
  row.cancelRename();
  expect(component.pendingEdits()).toBe(false);
});
