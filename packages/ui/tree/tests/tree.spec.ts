import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TestKey } from '@angular/cdk/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatTreeHarness } from '@angular/material/tree/testing';
import { MatDialogHarness } from '@angular/material/dialog/testing';
import { MatButtonHarness } from '@angular/material/button/testing';
import { MatSelectHarness } from '@angular/material/select/testing';
import { provideTransloco, TranslocoService } from '@jsverse/transloco';
import { provideHavenTransloco } from '@haven/ui/i18n';
import { HavenThemeDirective } from '@haven/ui/theme';
import type { HavenTheme, TreeNode } from '@haven/schema';
import english from '@haven/ui/i18n/locales/en-US.json';
import chinese from '@haven/ui/i18n/locales/zh-CN.json';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HavenTree } from '../tree';
import { HavenTreeEditor } from '../tree-editor';
import { HavenTreeSelectField } from '../tree-select';
import { HavenCascaderField } from '../cascader';

const nodes: TreeNode[] = [
  {
    key: 'group',
    label: 'Group',
    children: [
      { key: 0, label: { default: 'Zero', translations: { 'zh-CN': '零' } } },
      { key: '0', label: 'String zero' },
    ],
  },
  {
    key: 'blocked',
    label: 'Blocked',
    disabled: true,
    children: [{ key: 'child', label: 'Locked child' }],
  },
];
beforeEach(() => {
  TestBed.configureTestingModule({
    providers: [
      provideTransloco({
        config: { defaultLang: 'en-US', availableLangs: ['en-US', 'zh-CN'], prodMode: true },
      }),
      provideHavenTransloco(),
    ],
  });
  const transloco = TestBed.inject(TranslocoService);
  transloco.setTranslation({ haven: english }, 'en-US');
  transloco.setTranslation({ haven: chinese }, 'zh-CN');
});
afterEach(() => TestBed.resetTestingModule());

@Component({
  imports: [HavenThemeDirective, HavenTreeSelectField, HavenCascaderField],
  template: `<section [havenTheme]="theme()">
    <haven-tree-select-field label="Tree" [nodes]="nodes" /><haven-cascader-field
      label="Cascade"
      [nodes]="nodes"
    />
  </section>`,
})
class ThemeHost {
  readonly nodes = nodes;
  readonly theme = signal<HavenTheme>({
    preset: 'liquid-glass',
    mode: 'dark',
    density: 'compact',
    tokens: { primary: '#aabbcc' },
  });
}

describe('native local hierarchy components', () => {
  it.each([HavenTree, HavenTreeEditor])(
    'restores initial expansion after native initialization for %s',
    async (component) => {
      const fixture = TestBed.createComponent<HavenTree | HavenTreeEditor>(component);
      fixture.componentRef.setInput('nodes', nodes);
      fixture.componentRef.setInput('expandedKeys', ['group']);
      const tree = await TestbedHarnessEnvironment.loader(fixture).getHarness(MatTreeHarness);
      await expect.poll(async () => (await tree.getNodes({ text: /Zero$/ })).length).toBe(1);
    },
  );

  it('uses Material tree expansion and keyboard activation with typed keys', async () => {
    const fixture = TestBed.createComponent(HavenTree);
    fixture.componentRef.setInput('nodes', nodes);
    fixture.componentRef.setInput('title', 'Navigation');
    const tree = await TestbedHarnessEnvironment.loader(fixture).getHarness(MatTreeHarness);
    const root = (await tree.getNodes({ text: /Group/ }))[0]!;
    await root.expand();
    expect(fixture.componentInstance.expandedKeys()).toEqual(['group']);
    const zero = (await tree.getNodes({ text: /^Zero$/ }))[0]!;
    const target = await zero.host();
    await target.focus();
    await target.sendKeys(TestKey.ENTER);
    expect(fixture.componentInstance.activeKey()).toBe(0);
    await (await (await tree.getNodes({ text: 'String zero' }))[0]!.host()).click();
    expect(fixture.componentInstance.activeKey()).toBe('0');
    await root.collapse();
    expect(fixture.componentInstance.expandedKeys()).toEqual([]);
  });
  it('filters through ancestors, restores expansion, and blocks readonly or inherited-disabled choices', async () => {
    const fixture = TestBed.createComponent(HavenTree);
    fixture.componentRef.setInput('nodes', nodes);
    fixture.componentRef.setInput('filterable', true);
    const tree = await TestbedHarnessEnvironment.loader(fixture).getHarness(MatTreeHarness);
    fixture.componentInstance.filter.set('String zero');
    await fixture.whenStable();
    expect((await tree.getNodes()).length).toBe(2);
    expect(fixture.componentInstance.expandedKeys()).toEqual([]);
    const child = (await tree.getNodes({ text: 'String zero' }))[0]!;
    fixture.componentRef.setInput('readonly', true);
    await (await child.host()).click();
    expect(fixture.componentInstance.activeKey()).toBeNull();
    fixture.componentInstance.filter.set('');
    await fixture.whenStable();
    expect((await tree.getNodes()).length).toBe(2);
    fixture.componentRef.setInput('readonly', false);
    fixture.componentInstance.filter.set('Locked child');
    await fixture.whenStable();
    const locked = (await tree.getNodes({ text: 'Locked child' }))[0]!;
    expect(await (await locked.host()).getAttribute('aria-disabled')).toBe('true');
    await (await locked.host()).click();
    expect(fixture.componentInstance.activeKey()).toBeNull();
  });
  it('fails visibly on invalid cyclic trees instead of recursively rendering them', async () => {
    const fixture = TestBed.createComponent(HavenTree);
    const cyclic: TreeNode = { key: 1, label: 'Cycle' };
    cyclic.children = [cyclic];
    fixture.componentRef.setInput('nodes', [cyclic]);
    await fixture.whenStable();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')?.textContent,
    ).toContain('Invalid tree');
    expect((fixture.nativeElement as HTMLElement).querySelector('mat-tree')).toBeNull();
  });
  it('offers a dialog tree picker, preserves unknown saved values on cancel and selects numeric zero', async () => {
    const fixture = TestBed.createComponent(HavenTreeSelectField);
    fixture.componentRef.setInput('nodes', nodes);
    fixture.componentRef.setInput('label', 'Selection');
    fixture.componentRef.setInput('value', 'legacy');
    const loader = TestbedHarnessEnvironment.loader(fixture);
    const overlay = TestbedHarnessEnvironment.documentRootLoader(fixture);
    const open = await loader.getHarness(MatButtonHarness.with({ text: 'Choose a node' }));
    await open.click();
    await (await overlay.getHarness(MatDialogHarness)).close();
    await expect.poll(() => overlay.hasHarness(MatDialogHarness)).toBe(false);
    expect(fixture.componentInstance.value()).toBe('legacy');
    await open.click();
    const tree = await overlay.getHarness(MatTreeHarness);
    await (await tree.getNodes({ text: /Group/ }))[0]!.expand();
    await (await (await tree.getNodes({ text: /Zero$/ }))[0]!.host()).click();
    await fixture.whenStable();
    await expect.poll(() => fixture.componentInstance.value()).toBe(0);
    await expect.poll(() => overlay.hasHarness(MatDialogHarness)).toBe(false);
    await (await loader.getHarness(MatButtonHarness.with({ text: 'Clear selection' }))).click();
    expect(fixture.componentInstance.value()).toBeNull();
  });
  it('prevents stale dialog commits after data changes and disallows readonly selection', async () => {
    const fixture = TestBed.createComponent(HavenTreeSelectField);
    fixture.componentRef.setInput('nodes', nodes);
    fixture.componentRef.setInput('label', 'Selection');
    fixture.componentRef.setInput('value', 0);
    const loader = TestbedHarnessEnvironment.loader(fixture);
    const overlay = TestbedHarnessEnvironment.documentRootLoader(fixture);
    const open = await loader.getHarness(MatButtonHarness.with({ text: 'Choose a node' }));
    await open.click();
    fixture.componentRef.setInput('nodes', []);
    await fixture.whenStable();
    await expect.poll(() => overlay.hasHarness(MatDialogHarness)).toBe(false);
    expect(fixture.componentInstance.value()).toBe(0);
    fixture.componentRef.setInput('readonly', true);
    expect(await open.isDisabled()).toBe(true);
    const display = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
      '[data-display]',
    )!;
    expect(display.readOnly).toBe(true);
    expect(display.value).toBe('0');
    fixture.componentInstance.focus();
    expect(document.activeElement).toBe(display);
  });
  it.each(['cancel', 'select'] as const)(
    'keeps dialog focus inside the composite field through %s and emits one real departure',
    async (completion) => {
      const fixture = TestBed.createComponent(HavenTreeSelectField);
      fixture.componentRef.setInput('nodes', nodes);
      fixture.componentRef.setInput('label', 'Focus field');
      let departures = 0;
      fixture.componentInstance.focusLeft.subscribe(() => departures++);
      const loader = TestbedHarnessEnvironment.loader(fixture);
      const overlay = TestbedHarnessEnvironment.documentRootLoader(fixture);
      const opener = await loader.getHarness(MatButtonHarness.with({ text: 'Choose a node' }));
      const trigger = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
        '[data-picker]',
      )!;
      const outside = document.createElement('button');
      document.body.append(outside);
      try {
        trigger.focus();
        await fixture.whenStable();
        await opener.click();
        await expect
          .poll(() =>
            document.querySelector('mat-dialog-container')?.contains(document.activeElement),
          )
          .toBe(true);
        expect(departures).toBe(0);
        if (completion === 'cancel') await (await overlay.getHarness(MatDialogHarness)).close();
        else {
          const tree = await overlay.getHarness(MatTreeHarness);
          await (await (await tree.getNodes({ text: /Group/ }))[0]!.host()).click();
        }
        await expect.poll(() => overlay.hasHarness(MatDialogHarness)).toBe(false);
        expect(document.activeElement).toBe(trigger);
        expect(departures).toBe(0);
        outside.focus();
        await fixture.whenStable();
        await expect.poll(() => departures).toBe(1);
        outside.focus();
        await fixture.whenStable();
        expect(departures).toBe(1);
      } finally {
        outside.remove();
      }
    },
  );

  it('keeps non-leaf nodes navigable but does not commit them in leaf-only pickers', async () => {
    const fixture = TestBed.createComponent(HavenTreeSelectField);
    fixture.componentRef.setInput('nodes', nodes);
    fixture.componentRef.setInput('label', 'Leaf');
    fixture.componentRef.setInput('leafOnly', true);
    fixture.componentRef.setInput('value', 'legacy');
    const loader = TestbedHarnessEnvironment.loader(fixture);
    const overlay = TestbedHarnessEnvironment.documentRootLoader(fixture);
    await (await loader.getHarness(MatButtonHarness.with({ text: 'Choose a node' }))).click();
    const tree = await overlay.getHarness(MatTreeHarness);
    const group = (await tree.getNodes({ text: /Group/ }))[0]!;
    await (await group.host()).click();
    expect(fixture.componentInstance.value()).toBe('legacy');
    expect(await overlay.hasHarness(MatDialogHarness)).toBe(true);
    await group.expand();
    await (await (await tree.getNodes({ text: /String zero/ }))[0]!.host()).click();
    await expect.poll(() => fixture.componentInstance.value()).toBe('0');
  });

  it('navigates cascade levels without committing branches and preserves scalar leaf keys', async () => {
    const fixture = TestBed.createComponent(HavenCascaderField);
    fixture.componentRef.setInput('nodes', nodes);
    fixture.componentRef.setInput('label', 'Location');
    fixture.componentRef.setInput('value', 'legacy');
    const loader = TestbedHarnessEnvironment.loader(fixture);
    let levels = await loader.getAllHarnesses(MatSelectHarness);
    expect(levels).toHaveLength(1);
    await levels[0]!.clickOptions({ text: 'Group' });
    expect(fixture.componentInstance.value()).toBe('legacy');
    levels = await loader.getAllHarnesses(MatSelectHarness);
    expect(levels).toHaveLength(2);
    await levels[1]!.clickOptions({ text: 'Zero' });
    expect(fixture.componentInstance.value()).toBe(0);
    expect(fixture.componentInstance.display()).toBe('Group / Zero');
    TestBed.inject(TranslocoService).setActiveLang('zh-CN');
    await fixture.whenStable();
    expect(fixture.componentInstance.display()).toBe('Group / 零');
    fixture.componentRef.setInput('readonly', true);
    expect(await levels[1]!.isDisabled()).toBe(true);
    fixture.componentInstance.select(1, '0');
    expect(fixture.componentInstance.value()).toBe(0);
  });
  it('keeps missing cascader values and shows the exact typed path after data replacement', async () => {
    const fixture = TestBed.createComponent(HavenCascaderField);
    fixture.componentRef.setInput('nodes', nodes);
    fixture.componentRef.setInput('label', 'Path');
    fixture.componentRef.setInput('value', '0');
    await fixture.whenStable();
    expect(fixture.componentInstance.path()).toEqual(['group', '0']);
    fixture.componentRef.setInput('nodes', []);
    await fixture.whenStable();
    expect(fixture.componentInstance.value()).toBe('0');
    expect(fixture.componentInstance.unknown()).toBe(true);
    expect(fixture.componentInstance.path()).toEqual([]);
  });
  it('scopes dialog and cascader overlay theme to their owning field', async () => {
    const fixture = TestBed.createComponent(ThemeHost);
    const loader = TestbedHarnessEnvironment.loader(fixture);
    const overlay = TestbedHarnessEnvironment.documentRootLoader(fixture);
    await (await loader.getHarness(MatButtonHarness.with({ text: 'Choose a node' }))).click();
    expect(
      document
        .querySelector<HTMLElement>('haven-tree-picker')
        ?.style.getPropertyValue('--mat-sys-primary'),
    ).toBe('#aabbcc');
    await (await overlay.getHarness(MatDialogHarness)).close();
    await (await loader.getHarness(MatSelectHarness)).open();
    expect(
      document
        .querySelector<HTMLElement>('[role="listbox"]')
        ?.style.getPropertyValue('--mat-sys-primary'),
    ).toBe('#aabbcc');
    expect(
      document
        .querySelector<HTMLElement>('.cdk-overlay-container')
        ?.style.getPropertyValue('--mat-sys-primary'),
    ).toBe('');
  });
});
