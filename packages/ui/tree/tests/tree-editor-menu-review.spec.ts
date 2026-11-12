import { EventEmitter, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Directionality } from '@angular/cdk/bidi';
import { By } from '@angular/platform-browser';
import { MatTreeNode } from '@angular/material/tree';
import { HAVEN_THEME_CONTEXT } from '@haven/ui/theme';
import type { HavenTheme, TreeKey } from '@haven/schema';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { setupTreeSelection } from '../../../../tests/ui/tree-selection-support';
import { createEditor } from '../../../../tests/ui/tree-editor-support';

const theme = signal<HavenTheme>({
  preset: 'material',
  mode: 'dark',
  density: 'comfortable',
  tokens: { primary: '#123456' },
});
beforeEach(() => {
  theme.set({
    preset: 'material',
    mode: 'dark',
    density: 'comfortable',
    tokens: { primary: '#123456' },
  });
  TestBed.configureTestingModule({
    providers: [
      { provide: HAVEN_THEME_CONTEXT, useValue: theme },
      { provide: Directionality, useValue: { value: 'rtl', change: new EventEmitter() } },
    ],
  });
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(100);
  setupTreeSelection();
});
afterEach(() => {
  TestBed.resetTestingModule();
  vi.restoreAllMocks();
});

it('themes the owned native menu live and restores tree focus after its trigger closes it', async () => {
  const { fixture, component } = await createEditor();
  const row = component.rows().find((row) => row.node().key === 0)!;
  row.openMenu();
  await fixture.whenStable();
  const menu = document.querySelector<HTMLElement>('[role="menu"]')!;
  expect(menu.getAttribute('data-haven-preset')).toBe('material');
  expect(menu.style.getPropertyValue('--mat-sys-primary')).toBe('#123456');
  theme.set({
    preset: 'liquid-glass',
    mode: 'light',
    density: 'compact',
    tokens: { primary: '#654321' },
  });
  await fixture.whenStable();
  expect(menu.getAttribute('data-haven-preset')).toBe('liquid-glass');
  expect(menu.getAttribute('data-haven-density')).toBe('compact');
  expect(menu.style.getPropertyValue('--mat-sys-primary')).toBe('#654321');
  row.menuTrigger()!.closeMenu();
  await fixture.whenStable();
  await expect.poll(() => document.querySelector('[role="menu"]')).toBeNull();
  expect(document.activeElement?.tagName).toBe('MAT-TREE-NODE');
});

it('rejects a retained menu action on same-tick owner replacement and preserves typed valid action keys', async () => {
  const { fixture, component, proposals } = await createEditor();
  const row = component.rows().find((row) => row.node().key === 0)!;
  row.openMenu();
  await fixture.whenStable();
  fixture.componentRef.setInput('identity', 'replacement');
  row.runAction('host.inspect');
  expect(proposals).toEqual([]);
  await fixture.whenStable();
  row.openMenu();
  await fixture.whenStable();
  row.runAction('host.inspect');
  expect(proposals).toEqual([{ type: 'action', key: 0, action: 'host.inspect' }]);
});

it('uses logical RTL indent/outdent keyboard moves without altering the controlled tree', async () => {
  const { fixture, component, proposals } = await createEditor();
  const row = (key: TreeKey) =>
    fixture.debugElement
      .queryAll(By.directive(MatTreeNode))
      .find((row) => (row.injector.get(MatTreeNode).data as { key: TreeKey }).key === key)!
      .nativeElement as HTMLElement;
  row('empty').dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'ArrowLeft',
      altKey: true,
      bubbles: true,
      cancelable: true,
    }),
  );
  row(0).dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      altKey: true,
      bubbles: true,
      cancelable: true,
    }),
  );
  expect(proposals).toEqual([
    { type: 'move', key: 'empty', parent: 'group', before: null },
    { type: 'move', key: 0, parent: 'root', before: 'empty' },
  ]);
  expect(component.index()!.entries.get(0)!.path).toEqual(['root', 'group', 0]);
});
