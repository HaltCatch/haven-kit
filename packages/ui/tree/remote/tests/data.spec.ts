import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatTreeHarness } from '@angular/material/tree/testing';
import { provideTransloco, TranslocoService } from '@jsverse/transloco';
import { provideHavenTransloco } from '@haven/ui/i18n';
import { HavenThemeDirective } from '@haven/ui/theme';
import type { HavenTheme, RemoteTreeNode } from '@haven/schema';
import type { TreeDataAdapter, TreeDataSource } from '@haven/runtime';
import english from '@haven/ui/i18n/locales/en-US.json';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { injectTreeData } from '../data';
import { HavenRemoteTree } from '../tree';

const node: RemoteTreeNode = { key: 0, label: 'Zero', hasChildren: false };
@Component({ template: '' })
class DataHost {
  readonly source = signal<TreeDataSource | undefined>(undefined);
  readonly enabled = signal(true);
  readonly data = injectTreeData(this.source, this.enabled);
}
@Component({
  imports: [HavenRemoteTree, HavenThemeDirective],
  template: `<section [havenTheme]="theme()">
    <haven-remote-tree [source]="source" [activeKey]="0" />
  </section>`,
})
class ThemeHost {
  readonly theme = signal<HavenTheme>({ preset: 'material', mode: 'dark', density: 'comfortable' });
  reads = 0;
  readonly source = {
    identity: 'theme',
    adapter: {
      children: async () => {
        this.reads++;
        return [node];
      },
      resolve: async () => ({ paths: [[node]], unresolved: [] }),
    } satisfies TreeDataAdapter,
  };
}
beforeEach(() => {
  TestBed.configureTestingModule({
    providers: [
      provideTransloco({
        config: { defaultLang: 'en-US', availableLangs: ['en-US'], prodMode: true },
      }),
      provideHavenTransloco(),
    ],
  });
  TestBed.inject(TranslocoService).setTranslation({ haven: english }, 'en-US');
});
afterEach(() => TestBed.resetTestingModule());

describe('shared lazy tree ownership', () => {
  it('resolves a closed picker without fetching children and hides stale metadata synchronously', async () => {
    const fixture = TestBed.createComponent(DataHost),
      host = fixture.componentInstance;
    let reads = 0;
    const adapter: TreeDataAdapter = {
      children: async () => {
        reads++;
        return [node];
      },
      resolve: async () => ({ paths: [[node]], unresolved: [] }),
    };
    host.source.set({ identity: 'first', adapter });
    await fixture.whenStable();
    await host.data.loader.resolve([0]);
    expect(host.data.state().entries.get(0)?.node.label).toBe('Zero');
    expect(reads).toBe(0);
    host.source.set({ identity: 'second', adapter });
    expect(host.data.current()).toBe(false);
    expect(host.data.state().entries.size).toBe(0);
    await fixture.whenStable();
    expect(host.data.current()).toBe(true);
    expect(host.data.state().entries.size).toBe(0);
    await host.data.loader.resolve([0]);
    host.enabled.set(false);
    expect(host.data.current()).toBe(false);
    expect(host.data.state().entries.size).toBe(0);
  });

  it('keeps loaded nodes and selection across Material and Glass presentation changes without rereading', async () => {
    const fixture = TestBed.createComponent(ThemeHost);
    await fixture.whenStable();
    const tree = await TestbedHarnessEnvironment.loader(fixture).getHarness(MatTreeHarness);
    expect(await tree.getNodes()).toHaveLength(1);
    const element = fixture.nativeElement as HTMLElement;
    expect(fixture.componentInstance.reads).toBe(1);
    expect(element.querySelector('section')?.getAttribute('data-haven-preset')).toBe('material');
    expect(element.querySelector('mat-tree-node')?.getAttribute('aria-selected')).toBe('true');
    fixture.componentInstance.theme.set({
      preset: 'liquid-glass',
      mode: 'dark',
      density: 'compact',
    });
    await fixture.whenStable();
    expect(fixture.componentInstance.reads).toBe(1);
    expect(element.querySelector('section')?.getAttribute('data-haven-preset')).toBe(
      'liquid-glass',
    );
    expect(element.querySelector('mat-tree-node')?.getAttribute('aria-selected')).toBe('true');
  });
});
