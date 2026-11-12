import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatButtonHarness } from '@angular/material/button/testing';
import { MatDialogHarness } from '@angular/material/dialog/testing';
import { MatTreeHarness } from '@angular/material/tree/testing';
import { TranslocoService } from '@jsverse/transloco';
import { HavenThemeDirective } from '@haven/ui/theme';
import { indexTree } from '@haven/schema';
import type { HavenTheme, TreeNode } from '@haven/schema';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { toggleTreeCascade } from '../cascade-selection';
import { HavenTreeMultiselectField } from '../tree-multiselect';
import { selectionNodes, setupTreeSelection } from '../../../../tests/ui/tree-selection-support';

beforeEach(setupTreeSelection);
afterEach(() => TestBed.resetTestingModule());

it('reconciles every ancestor in typed-key chains without changing locked-only siblings', () => {
  const nodes: TreeNode[] = [
    {
      key: 0,
      label: 'Root',
      children: [
        { key: '0', label: 'Branch', children: [{ key: 'leaf', label: 'Leaf' }] },
        {
          key: 'locked',
          label: 'Locked',
          disabled: true,
          children: [{ key: 'saved', label: 'Saved' }],
        },
      ],
    },
  ];
  const index = indexTree(nodes)!;
  const next = toggleTreeCascade(index, ['saved'], 'leaf', false)!;
  expect(next).toEqual(['saved', 'leaf', '0', 0]);
  expect(toggleTreeCascade(index, next, '0', false)).toEqual(['saved']);
});

it('handles a branch with only disabled descendants without unlocking or selecting them', () => {
  const nodes: TreeNode[] = [
    {
      key: 'root',
      label: 'Root',
      children: [
        {
          key: 'locked',
          label: 'Locked',
          disabled: true,
          children: [{ key: 'saved', label: 'Saved' }],
        },
      ],
    },
  ];
  const index = indexTree(nodes)!;
  expect(toggleTreeCascade(index, ['saved'], 'root', false)).toEqual(['saved', 'root']);
  expect(toggleTreeCascade(index, ['saved', 'root'], 'root', false)).toEqual(['saved']);
  expect(toggleTreeCascade(index, ['saved'], 'root', true)).toBeUndefined();
});

@Component({
  imports: [HavenThemeDirective, HavenTreeMultiselectField],
  template: `<section [havenTheme]="theme()">
    <haven-tree-multiselect-field
      label="Categories"
      [nodes]="nodes"
      [cascade]="true"
      [leafOnly]="true"
      [(value)]="value"
    />
  </section>`,
})
class ThemeHost {
  readonly nodes = selectionNodes;
  readonly value = signal<(string | number)[]>([0]);
  readonly theme = signal<HavenTheme>({
    preset: 'material',
    mode: 'dark',
    density: 'comfortable',
    tokens: { primary: '#aabbcc' },
  });
}

it('preserves a cascade transaction and mixed state through locale and scoped theme changes', async () => {
  const f = TestBed.createComponent(ThemeHost);
  const loader = TestbedHarnessEnvironment.loader(f);
  const overlay = TestbedHarnessEnvironment.documentRootLoader(f);
  await (await loader.getHarness(MatButtonHarness.with({ text: 'Choose nodes' }))).click();
  const dialog = await overlay.getHarness(MatDialogHarness);
  const tree = await dialog.getHarness(MatTreeHarness);
  const group = (await tree.getNodes({ text: 'Group' }))[0]!;
  expect(await (await group.host()).getAttribute('aria-checked')).toBe('mixed');
  await (await group.host()).click();
  expect(f.componentInstance.value()).toEqual([0]);
  f.componentInstance.theme.update((theme) => ({
    ...theme,
    preset: 'liquid-glass',
    density: 'compact',
  }));
  TestBed.inject(TranslocoService).setActiveLang('zh-CN');
  await f.whenStable();
  const picker = document.querySelector<HTMLElement>('haven-tree-multiple-picker')!;
  expect(picker.textContent).toContain('已选 2 项');
  expect(picker.querySelector('[data-haven-glass]')).not.toBeNull();
  expect(picker.style.getPropertyValue('--mat-sys-primary')).toBe('#aabbcc');
  expect(
    document
      .querySelector<HTMLElement>('.cdk-overlay-container')!
      .style.getPropertyValue('--mat-sys-primary'),
  ).toBe('');
  expect(
    await (await (await tree.getNodes({ text: 'Group' }))[0]!.host()).getAttribute('aria-checked'),
  ).toBe('true');
  await (await dialog.getHarness(MatButtonHarness.with({ text: '应用选择' }))).click();
  await expect.poll(() => f.componentInstance.value()).toEqual([0, '0']);
});
