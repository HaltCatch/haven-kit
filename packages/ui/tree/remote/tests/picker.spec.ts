import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatTreeHarness } from '@angular/material/tree/testing';
import { MatDialogHarness } from '@angular/material/dialog/testing';
import { MatButtonHarness } from '@angular/material/button/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideTransloco, TranslocoService } from '@jsverse/transloco';
import { provideHavenTransloco } from '@haven/ui/i18n';
import { HavenThemeDirective } from '@haven/ui/theme';
import type { HavenTheme, RemoteTreeNode, TreeKey } from '@haven/schema';
import type { TreeDataAdapter, TreeDataSource } from '@haven/runtime';
import english from '@haven/ui/i18n/locales/en-US.json';
import chinese from '@haven/ui/i18n/locales/zh-CN.json';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HavenRemoteTreeSelectField, HavenRemoteTreeMultiselectField } from '../select';
import { HavenRemoteTreePicker } from '../picker';

const root: RemoteTreeNode = { key: 'group', label: 'Group', hasChildren: true };
const zero: RemoteTreeNode = {
  key: 0,
  label: { default: 'Zero', translations: { 'zh-CN': '零' } },
  hasChildren: false,
};
const textZero: RemoteTreeNode = { key: '0', label: 'String zero', hasChildren: false };
const adapter = (): TreeDataAdapter => ({
  children: async (parent) => (parent === null ? [root] : [zero, textZero]),
  resolve: async (keys) => ({
    paths: keys.flatMap((key) =>
      key === 0 ? [[root, zero]] : key === '0' ? [[root, textZero]] : [],
    ),
    unresolved: keys.filter((key) => key !== 0 && key !== '0'),
  }),
});
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
async function settle() {
  TestBed.tick();
  await Promise.resolve();
  TestBed.tick();
}

@Component({
  imports: [HavenRemoteTreeMultiselectField, HavenThemeDirective],
  template: `<section [havenTheme]="theme()">
    <haven-remote-tree-multiselect-field
      label="Selection"
      [source]="source"
      [value]="value()"
      (valueChange)="value.set($event)"
    />
  </section>`,
})
class ThemeHost {
  readonly value = signal<TreeKey[]>([0]);
  readonly source: TreeDataSource = { identity: 'theme', adapter: adapter() };
  readonly theme = signal<HavenTheme>({ preset: 'material', mode: 'dark', density: 'comfortable' });
}

describe('remote picker transactions', () => {
  it('preserves unknown saved values on native cancel and commits numeric zero from a loaded leaf', async () => {
    const fixture = TestBed.createComponent(HavenRemoteTreeSelectField),
      field = fixture.componentInstance;
    fixture.componentRef.setInput('label', 'Selection');
    fixture.componentRef.setInput('source', { identity: 'single', adapter: adapter() });
    fixture.componentRef.setInput('value', 'legacy');
    fixture.componentRef.setInput('label', 'Selection');
    await expect
      .poll(async () => {
        await settle();
        return field.membership.resolution().ready;
      })
      .toBe(true);
    const loader = TestbedHarnessEnvironment.loader(fixture),
      overlay = TestbedHarnessEnvironment.documentRootLoader(fixture);
    const open = await loader.getHarness(MatButtonHarness.with({ text: 'Choose a node' }));
    await open.click();
    await (await overlay.getHarness(MatDialogHarness)).close();
    await expect.poll(() => overlay.hasHarness(MatDialogHarness)).toBe(false);
    expect(field.value()).toBe('legacy');
    await open.click();
    const tree = await overlay.getHarness(MatTreeHarness);
    await expect
      .poll(async () => {
        await settle();
        return (await tree.getNodes({ text: /Group$/ })).length;
      })
      .toBe(1);
    await (await tree.getNodes({ text: /Group$/ }))[0]!.expand();
    await expect.poll(async () => (await tree.getNodes({ text: /Zero$/ })).length).toBe(1);
    await (await (await tree.getNodes({ text: /Zero$/ }))[0]!.host()).click();
    await expect.poll(() => field.value()).toBe(0);
    await expect.poll(() => overlay.hasHarness(MatDialogHarness)).toBe(false);
    await expect
      .poll(async () => {
        await settle();
        return field.membership.accepted();
      })
      .toBe(true);
    expect(field.display()).toBe('Zero');
  });

  it('keeps multi-selection as a draft across branch cache updates and applies only explicitly', async () => {
    const fixture = TestBed.createComponent(HavenRemoteTreeMultiselectField),
      field = fixture.componentInstance;
    fixture.componentRef.setInput('label', 'Selection');
    fixture.componentRef.setInput('source', { identity: 'multiple', adapter: adapter() });
    fixture.componentRef.setInput('value', [0]);
    await expect
      .poll(async () => {
        await settle();
        return field.membership.accepted();
      })
      .toBe(true);
    const loader = TestbedHarnessEnvironment.loader(fixture),
      overlay = TestbedHarnessEnvironment.documentRootLoader(fixture);
    await (await loader.getHarness(MatButtonHarness.with({ text: 'Choose a node' }))).click();
    const tree = await overlay.getHarness(MatTreeHarness);
    await expect.poll(async () => (await tree.getNodes({ text: /^String zero$/ })).length).toBe(1);
    await (await (await tree.getNodes({ text: /^String zero$/ }))[0]!.host()).click();
    expect(field.value()).toEqual([0]);
    expect(await overlay.hasHarness(MatDialogHarness)).toBe(true);
    await (await overlay.getHarness(MatButtonHarness.with({ text: 'Apply selection' }))).click();
    await expect.poll(() => field.value()).toEqual([0, '0']);
    await expect.poll(() => overlay.hasHarness(MatDialogHarness)).toBe(false);
    await expect
      .poll(async () => {
        await settle();
        return field.membership.accepted();
      })
      .toBe(true);
  });

  it('reopens a multi-picker with already cached branches and restores every selected ancestor expansion', async () => {
    const fixture = TestBed.createComponent(HavenRemoteTreeMultiselectField),
      field = fixture.componentInstance;
    const otherRoot: RemoteTreeNode = { key: 'media', label: 'Media', hasChildren: true };
    const otherLeaf: RemoteTreeNode = { key: 2, label: 'Other leaf', hasChildren: false };
    fixture.componentRef.setInput('label', 'Selection');
    fixture.componentRef.setInput('source', {
      identity: 'cached',
      adapter: {
        children: async (parent: TreeKey | null) =>
          parent === null
            ? [root, otherRoot]
            : parent === root.key
              ? [zero, textZero]
              : [otherLeaf],
        resolve: async () => ({
          paths: [
            [root, zero],
            [otherRoot, otherLeaf],
          ],
          unresolved: [],
        }),
      } satisfies TreeDataAdapter,
    });
    fixture.componentRef.setInput('value', [0, 2]);
    await expect
      .poll(async () => {
        await settle();
        return field.membership.accepted();
      })
      .toBe(true);
    const loader = TestbedHarnessEnvironment.loader(fixture),
      overlay = TestbedHarnessEnvironment.documentRootLoader(fixture);
    const open = await loader.getHarness(MatButtonHarness.with({ text: 'Choose a node' }));
    await open.click();
    let tree = await overlay.getHarness(MatTreeHarness);
    await expect.poll(async () => (await tree.getNodes({ text: /Zero$/ })).length).toBe(1);
    await expect.poll(async () => (await tree.getNodes({ text: /^Other leaf$/ })).length).toBe(1);
    await (await overlay.getHarness(MatDialogHarness)).close();
    await expect.poll(() => overlay.hasHarness(MatDialogHarness)).toBe(false);
    expect(field.data.state().branches.get('group')?.status).toBe('ready');
    expect(field.data.state().branches.get('media')?.status).toBe('ready');
    await open.click();
    tree = await overlay.getHarness(MatTreeHarness);
    await expect.poll(async () => (await tree.getNodes({ text: /Zero$/ })).length).toBe(1);
    await expect.poll(async () => (await tree.getNodes({ text: /^Other leaf$/ })).length).toBe(1);
    expect(field.value()).toEqual([0, 2]);
  });

  it('allows explicit removal of an unresolved baseline key without silently clearing it', async () => {
    const fixture = TestBed.createComponent(HavenRemoteTreeMultiselectField),
      field = fixture.componentInstance;
    fixture.componentRef.setInput('label', 'Selection');
    fixture.componentRef.setInput('source', { identity: 'unresolved', adapter: adapter() });
    fixture.componentRef.setInput('value', ['legacy']);
    await expect
      .poll(async () => {
        await settle();
        return field.membership.resolution().ready;
      })
      .toBe(true);
    expect(field.value()).toEqual(['legacy']);
    expect(field.membership.accepted()).toBe(false);
    const loader = TestbedHarnessEnvironment.loader(fixture),
      overlay = TestbedHarnessEnvironment.documentRootLoader(fixture);
    await (await loader.getHarness(MatButtonHarness.with({ text: 'Choose a node' }))).click();
    const apply = await overlay.getHarness(MatButtonHarness.with({ text: 'Apply selection' }));
    expect(await apply.isDisabled()).toBe(true);
    await (await overlay.getHarness(MatButtonHarness.with({ text: /legacy.*Remove/ }))).click();
    expect(field.value()).toEqual(['legacy']);
    expect(await apply.isDisabled()).toBe(false);
    await apply.click();
    await expect.poll(() => field.value()).toEqual([]);
    await expect
      .poll(async () => {
        await settle();
        return field.membership.accepted();
      })
      .toBe(true);
  });

  it.each(['source', 'readonly'] as const)(
    'rejects queued picker output after a same-tick %s change',
    async (change) => {
      const fixture = TestBed.createComponent(HavenRemoteTreeSelectField),
        field = fixture.componentInstance;
      fixture.componentRef.setInput('label', 'Selection');
      const source = { identity: 'original', adapter: adapter() };
      fixture.componentRef.setInput('source', source);
      fixture.componentRef.setInput('value', 0);
      await expect
        .poll(async () => {
          await settle();
          return field.membership.accepted();
        })
        .toBe(true);
      field.open();
      await fixture.whenStable();
      const ref = TestBed.inject(MatDialog).openDialogs[0]!;
      if (change === 'source')
        fixture.componentRef.setInput('source', { ...source, identity: 'replaced' });
      else fixture.componentRef.setInput('readonly', true);
      (ref.componentInstance as HavenRemoteTreePicker).activate('0');
      ref.close(['0']);
      await expect.poll(() => TestBed.inject(MatDialog).openDialogs.length).toBe(0);
      expect(field.value()).toBe(0);
    },
  );

  it('preserves an open multi-selection draft through theme and locale changes', async () => {
    const fixture = TestBed.createComponent(ThemeHost);
    const loader = TestbedHarnessEnvironment.loader(fixture),
      overlay = TestbedHarnessEnvironment.documentRootLoader(fixture);
    await (await loader.getHarness(MatButtonHarness.with({ text: 'Choose a node' }))).click();
    const tree = await overlay.getHarness(MatTreeHarness);
    await expect.poll(async () => (await tree.getNodes({ text: /^String zero$/ })).length).toBe(1);
    await (await (await tree.getNodes({ text: /^String zero$/ }))[0]!.host()).click();
    fixture.componentInstance.theme.set({
      preset: 'liquid-glass',
      mode: 'dark',
      density: 'compact',
    });
    TestBed.inject(TranslocoService).setActiveLang('zh-CN');
    await expect
      .poll(async () => {
        await settle();
        return (await tree.getNodes({ text: /^零$/ })).length;
      })
      .toBe(1);
    expect(await overlay.hasHarness(MatDialogHarness)).toBe(true);
    const picker = TestBed.inject(MatDialog).openDialogs[0]!
      .componentInstance as HavenRemoteTreePicker;
    expect(picker.selected()).toEqual([0, '0']);
    expect(
      (document.querySelector('haven-remote-tree-picker') as HTMLElement).getAttribute(
        'data-haven-preset',
      ),
    ).toBe('liquid-glass');
    picker.apply();
    await expect.poll(() => fixture.componentInstance.value()).toEqual([0, '0']);
  });
});
