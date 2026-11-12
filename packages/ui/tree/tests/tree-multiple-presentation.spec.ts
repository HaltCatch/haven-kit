import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatDialogHarness } from '@angular/material/dialog/testing';
import { MatButtonHarness } from '@angular/material/button/testing';
import { MatTreeHarness } from '@angular/material/tree/testing';
import { TranslocoService } from '@jsverse/transloco';
import { HavenThemeDirective } from '@haven/ui/theme';
import type { HavenTheme } from '@haven/schema';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { HavenTreeMultiselectField } from '../tree-multiselect';
import { setupTreeSelection, selectionNodes } from '../../../../tests/ui/tree-selection-support';
beforeEach(setupTreeSelection);
afterEach(() => TestBed.resetTestingModule());
@Component({
  imports: [HavenThemeDirective, HavenTreeMultiselectField],
  template: `<section [havenTheme]="theme()">
    <haven-tree-multiselect-field label="Categories" [nodes]="nodes" [(value)]="value" />
  </section>`,
})
class Host {
  readonly nodes = selectionNodes;
  readonly value = signal<(string | number)[]>([0]);
  readonly theme = signal<HavenTheme>({
    preset: 'material',
    mode: 'dark',
    density: 'comfortable',
    tokens: { primary: '#aabbcc' },
  });
}
it('keeps the dialog draft through locale/theme changes and scopes Glass to its owner', async () => {
  const f = TestBed.createComponent(Host),
    loader = TestbedHarnessEnvironment.loader(f),
    overlay = TestbedHarnessEnvironment.documentRootLoader(f);
  expect((f.nativeElement as HTMLElement).querySelector('[data-haven-glass]')).toBeNull();
  await (await loader.getHarness(MatButtonHarness.with({ text: 'Choose nodes' }))).click();
  const dialog = await overlay.getHarness(MatDialogHarness),
    tree = await dialog.getHarness(MatTreeHarness);
  await (await (await tree.getNodes({ text: 'String zero' }))[0]!.host()).click();
  const element = () => document.querySelector<HTMLElement>('haven-tree-multiple-picker')!;
  expect(element().style.getPropertyValue('--mat-sys-primary')).toBe('#aabbcc');
  expect(element().querySelector('[data-haven-glass]')).toBeNull();
  f.componentInstance.theme.update((t) => ({ ...t, preset: 'liquid-glass', density: 'compact' }));
  TestBed.inject(TranslocoService).setActiveLang('zh-CN');
  await f.whenStable();
  expect(element().querySelector('[data-haven-glass]')).not.toBeNull();
  expect((await tree.getNodes({ text: '零' })).length).toBe(1);
  expect(element().textContent).toContain('已选 2 项');
  expect(
    document
      .querySelector<HTMLElement>('.cdk-overlay-container')!
      .style.getPropertyValue('--mat-sys-primary'),
  ).toBe('');
  await (await dialog.getHarness(MatButtonHarness.with({ text: '应用选择' }))).click();
  await expect.poll(() => f.componentInstance.value()).toEqual([0, '0']);
});
it('keeps native dialog focus inside the field until one real departure', async () => {
  const f = TestBed.createComponent(HavenTreeMultiselectField);
  f.componentRef.setInput('nodes', selectionNodes);
  f.componentRef.setInput('label', 'Focus selection');
  let departures = 0;
  f.componentInstance.focusLeft.subscribe(() => departures++);
  const loader = TestbedHarnessEnvironment.loader(f),
    overlay = TestbedHarnessEnvironment.documentRootLoader(f);
  const opener = await loader.getHarness(MatButtonHarness.with({ text: 'Choose nodes' }));
  const trigger = (f.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-picker]',
    )!,
    outside = document.createElement('button');
  document.body.append(outside);
  try {
    trigger.focus();
    await f.whenStable();
    await opener.click();
    await expect
      .poll(() => document.querySelector('mat-dialog-container')?.contains(document.activeElement))
      .toBe(true);
    expect(departures).toBe(0);
    await (await overlay.getHarness(MatDialogHarness)).close();
    await expect.poll(() => overlay.hasHarness(MatDialogHarness)).toBe(false);
    expect(document.activeElement).toBe(trigger);
    expect(departures).toBe(0);
    outside.focus();
    await expect.poll(() => departures).toBe(1);
    outside.focus();
    await f.whenStable();
    expect(departures).toBe(1);
  } finally {
    outside.remove();
  }
});
it.each(['readonly', 'disabled'] as const)(
  'honors initial %s before first render and closes cleanly on destroy',
  async (mode) => {
    const f = TestBed.createComponent(HavenTreeMultiselectField);
    f.componentRef.setInput('label', 'Initial state');
    f.componentRef.setInput('nodes', selectionNodes);
    f.componentRef.setInput('value', [0]);
    f.componentRef.setInput(mode, true);
    const open = await TestbedHarnessEnvironment.loader(f).getHarness(
      MatButtonHarness.with({ text: 'Choose nodes' }),
    );
    expect(await open.isDisabled()).toBe(true);
    f.componentInstance.clear();
    expect(f.componentInstance.value()).toEqual([0]);
    f.componentRef.setInput(mode, false);
    await f.whenStable();
    await open.click();
    const overlay = TestbedHarnessEnvironment.documentRootLoader(f);
    await overlay.getHarness(MatDialogHarness);
    f.destroy();
    await expect.poll(() => document.querySelector('haven-tree-multiple-picker')).toBeNull();
  },
);
