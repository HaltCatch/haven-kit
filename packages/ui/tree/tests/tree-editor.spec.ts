import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { MatTreeNode } from '@angular/material/tree';
import { afterEach, beforeEach, expect, it } from 'vitest';
import type { TreeKey } from '@haven/schema';
import { setupTreeSelection } from '../../../../tests/ui/tree-selection-support';
import { createEditor, editorNodes } from '../../../../tests/ui/tree-editor-support';

beforeEach(setupTreeSelection);
afterEach(() => TestBed.resetTestingModule());
it('emits stable-key keyboard proposals while preserving host tree order, identity and focus', async () => {
  const { fixture, component, proposals } = await createEditor();
  const element = fixture.debugElement
    .queryAll(By.directive(MatTreeNode))
    .find((row) => (row.injector.get(MatTreeNode).data as { key: TreeKey }).key === 0)!
    .nativeElement as HTMLElement;
  element.focus();
  element.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      altKey: true,
      bubbles: true,
      cancelable: true,
    }),
  );
  expect(proposals).toEqual([{ type: 'move', key: 0, parent: 'group', before: null }]);
  expect(component.nodes()).toBe(editorNodes);
  expect(editorNodes[0]!.children![0]!.children!.map((node) => node.key)).toEqual([0, '0']);
  expect(document.activeElement).toBe(element);
  element.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'ArrowLeft',
      altKey: true,
      bubbles: true,
      cancelable: true,
    }),
  );
  expect(proposals[1]).toEqual({ type: 'move', key: 0, parent: 'root', before: 'empty' });
  // The host can reject either proposal simply by keeping the controlled input unchanged.
  await fixture.whenStable();
  expect(component.nodes()).toBe(editorNodes);
});
it('reports fixed, disabled, readonly and filtered editing without suppressing readonly navigation', async () => {
  const { fixture, component, proposals } = await createEditor();
  const move = { type: 'move' as const, key: 0, parent: 'empty', before: null };
  component.request({ owner: component.owner(), proposal: { ...move, key: 'root' } });
  expect(component.issue()).toBe('fixed');
  component.request({ owner: component.owner(), proposal: { ...move, key: 'saved' } });
  expect(component.issue()).toBe('blocked');
  fixture.componentRef.setInput('readonly', true);
  component.request({ owner: component.owner(), proposal: move });
  expect(component.issue()).toBe('blocked');
  component.select(editorNodes[0]!.children![1]!);
  expect(component.activeKey()).toBe('empty');
  fixture.componentRef.setInput('readonly', false);
  component.filter.set('Zero');
  component.request({ owner: component.owner(), proposal: move });
  expect(component.issue()).toBe('filtered');
  expect(proposals).toEqual([]);
  fixture.componentRef.setInput('disabled', true);
  component.select(editorNodes[0]!.children![2]!);
  expect(component.activeKey()).toBe('empty');
});
it('uses explicit containers and rejects invalid direct configuration with a visible diagnostic', async () => {
  const { fixture, component, proposals } = await createEditor();
  component.request({
    owner: component.owner(),
    proposal: { type: 'move', key: 0, parent: 'leaf', before: null },
  });
  expect(component.issue()).toBe('container');
  component.request({
    owner: component.owner(),
    proposal: { type: 'move', key: 0, parent: 'empty', before: null },
  });
  expect(proposals).toEqual([{ type: 'move', key: 0, parent: 'empty', before: null }]);
  fixture.componentRef.setInput('fixedKeys', ['missing']);
  await fixture.whenStable();
  expect(component.valid()).toBe(false);
  expect(
    (fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')?.textContent,
  ).toContain('configuration is invalid');
});
