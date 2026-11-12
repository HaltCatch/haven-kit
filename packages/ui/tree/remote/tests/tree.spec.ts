import { TestBed } from '@angular/core/testing';
import { TestKey } from '@angular/cdk/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatTreeHarness } from '@angular/material/tree/testing';
import { MatButtonHarness } from '@angular/material/button/testing';
import { provideTransloco, TranslocoService } from '@jsverse/transloco';
import { provideHavenTransloco } from '@haven/ui/i18n';
import type { RemoteTreeNode, TreeKey } from '@haven/schema';
import type { TreeDataAdapter } from '@haven/runtime';
import english from '@haven/ui/i18n/locales/en-US.json';
import chinese from '@haven/ui/i18n/locales/zh-CN.json';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HavenRemoteTree } from '../tree';

const branch: RemoteTreeNode = { key: 'branch', label: 'Branch', hasChildren: true };
const zero: RemoteTreeNode = {
  key: 0,
  label: { default: 'Zero', translations: { 'zh-CN': '零' } },
  hasChildren: false,
};
const stringZero: RemoteTreeNode = { key: '0', label: 'String zero', hasChildren: false };
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const adapter = (children: TreeDataAdapter['children']): TreeDataAdapter => ({
  children,
  resolve: async (keys) => ({ paths: [], unresolved: [...keys] }),
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

describe('lazy native tree', () => {
  it('fetches only expanded branches, uses native keyboard activation, and preserves typed keys', async () => {
    const calls: (TreeKey | null)[] = [];
    const fixture = TestBed.createComponent(HavenRemoteTree);
    fixture.componentRef.setInput('source', {
      identity: 'navigation',
      adapter: adapter(async (parent) => {
        calls.push(parent);
        return parent === null ? [branch] : [zero, stringZero];
      }),
    });
    fixture.componentRef.setInput('leafOnly', true);
    const tree = await TestbedHarnessEnvironment.loader(fixture).getHarness(MatTreeHarness);
    expect(calls).toEqual([null]);
    const root = (await tree.getNodes())[0]!;
    await (await root.host()).click();
    expect(fixture.componentInstance.activeKey()).toBeNull();
    await root.expand();
    expect(calls).toEqual([null, 'branch']);
    const leaf = (await tree.getNodes({ text: /^Zero$/ }))[0]!;
    await (await leaf.host()).focus();
    await (await leaf.host()).sendKeys(TestKey.ENTER);
    expect(fixture.componentInstance.activeKey()).toBe(0);
    await (await (await tree.getNodes({ text: /^String zero$/ }))[0]!.host()).click();
    expect(fixture.componentInstance.activeKey()).toBe('0');
    await root.collapse();
    await root.expand();
    expect(calls).toEqual([null, 'branch']);
  });

  it('retains an explicit child error until retry and cancels collapsed requests without accepting late data', async () => {
    const first = deferred<readonly RemoteTreeNode[]>();
    let reads = 0,
      signal: AbortSignal | undefined;
    const fixture = TestBed.createComponent(HavenRemoteTree);
    fixture.componentRef.setInput('source', {
      identity: 'navigation',
      adapter: adapter(async (parent, context) => {
        if (parent === null) return [branch];
        reads++;
        signal = context.signal;
        if (reads === 1) return first.promise;
        if (reads === 2) throw new Error('network');
        return [zero];
      }),
    });
    const loader = TestbedHarnessEnvironment.loader(fixture),
      tree = await loader.getHarness(MatTreeHarness);
    let root = (await tree.getNodes())[0]!;
    await root.expand();
    expect(reads).toBe(1);
    await root.collapse();
    expect(signal?.aborted).toBe(true);
    first.resolve([stringZero]);
    await fixture.whenStable();
    expect(await tree.getNodes()).toHaveLength(1);
    root = (await tree.getNodes())[0]!;
    await root.expand();
    expect(reads).toBe(2);
    expect(fixture.componentInstance.branch('branch')?.status).toBe('error');
    await fixture.whenStable();
    expect(reads).toBe(2);
    await (await loader.getHarness(MatButtonHarness.with({ text: 'Retry loading nodes' }))).click();
    expect(reads).toBe(3);
    expect(await tree.getNodes({ text: /^Zero$/ })).toHaveLength(1);
  });

  it('does not fetch matching descendants while filtering loaded nodes and blocks inherited disabled selection', async () => {
    const calls: (TreeKey | null)[] = [];
    const fixture = TestBed.createComponent(HavenRemoteTree);
    fixture.componentRef.setInput('source', {
      identity: 'navigation',
      adapter: adapter(async (parent) => {
        calls.push(parent);
        return parent === null
          ? [branch, { key: 'locked', label: 'Locked', hasChildren: false, disabled: true }]
          : [zero];
      }),
    });
    fixture.componentRef.setInput('filterable', true);
    const tree = await TestbedHarnessEnvironment.loader(fixture).getHarness(MatTreeHarness);
    fixture.componentInstance.filter.set('Zero');
    await fixture.whenStable();
    expect(await tree.getNodes()).toHaveLength(0);
    expect(calls).toEqual([null]);
    fixture.componentInstance.filter.set('');
    await fixture.whenStable();
    const locked = (await tree.getNodes({ text: /^Locked$/ }))[0]!;
    expect(await (await locked.host()).getAttribute('aria-disabled')).toBe('true');
    await (await locked.host()).click();
    expect(fixture.componentInstance.activeKey()).toBeNull();
  });

  it('keeps selected keys during reads, forbids readonly writes, and rejects an old source event in the same tick', async () => {
    const fixture = TestBed.createComponent(HavenRemoteTree);
    const first = adapter(async () => [zero, stringZero]);
    fixture.componentRef.setInput('source', { identity: 'first', adapter: first });
    fixture.componentRef.setInput('multiple', true);
    fixture.componentRef.setInput('selectedKeys', [0]);
    const tree = await TestbedHarnessEnvironment.loader(fixture).getHarness(MatTreeHarness);
    fixture.componentRef.setInput('readonly', true);
    await (await (await tree.getNodes({ text: /^String zero$/ }))[0]!.host()).click();
    expect(fixture.componentInstance.selectedKeys()).toEqual([0]);
    fixture.componentRef.setInput('readonly', false);
    const old = fixture.componentInstance.state().entries.get('0')!.node;
    fixture.componentRef.setInput('source', { identity: 'second', adapter: first });
    fixture.componentInstance.select(old);
    expect(fixture.componentInstance.selectedKeys()).toEqual([0]);
    await fixture.whenStable();
    const current = fixture.componentInstance.state().entries.get('0')!.node;
    fixture.componentRef.setInput('disabled', true);
    fixture.componentInstance.select(current);
    expect(fixture.componentInstance.selectedKeys()).toEqual([0]);
  });

  it('keeps sibling branches independent and rechecks live permissions', async () => {
    const first = deferred<readonly RemoteTreeNode[]>(),
      second = deferred<readonly RemoteTreeNode[]>();
    const signals = new Map<TreeKey, AbortSignal>();
    let enabled = true;
    const fixture = TestBed.createComponent(HavenRemoteTree);
    fixture.componentRef.setInput('active', () => enabled);
    fixture.componentRef.setInput('source', {
      identity: 'parallel',
      adapter: adapter(async (parent, context) => {
        if (parent === null) return [branch, { key: 'second', label: 'Second', hasChildren: true }];
        signals.set(parent, context.signal);
        return parent === 'branch' ? first.promise : second.promise;
      }),
    });
    const tree = await TestbedHarnessEnvironment.loader(fixture).getHarness(MatTreeHarness);
    const firstRoot = (await tree.getNodes({ text: /^Branch$/ }))[0]!;
    const secondRoot = (await tree.getNodes({ text: /^Second$/ }))[0]!;
    await firstRoot.expand();
    await secondRoot.expand();
    await firstRoot.collapse();
    expect(signals.get('branch')?.aborted).toBe(true);
    expect(signals.get('second')?.aborted).toBe(false);
    second.resolve([stringZero]);
    await expect.poll(() => fixture.componentInstance.branch('second')?.status).toBe('ready');
    await fixture.whenStable();
    expect(await tree.getNodes({ text: /^String zero$/ })).toHaveLength(1);
    first.resolve([zero]);
    await fixture.whenStable();
    expect(await tree.getNodes({ text: /^Zero$/ })).toHaveLength(0);
    const old = fixture.componentInstance.state().entries.get('0')!.node;
    enabled = false;
    fixture.componentInstance.select(old);
    expect(fixture.componentInstance.activeKey()).toBeNull();
  });

  it('re-reads localized data on locale changes while preserving the current selection value', async () => {
    const locales: string[] = [];
    const fixture = TestBed.createComponent(HavenRemoteTree);
    fixture.componentRef.setInput('source', {
      identity: 'localized',
      adapter: adapter(async (_, context) => {
        locales.push(context.locale);
        return [zero];
      }),
    });
    fixture.componentRef.setInput('activeKey', 0);
    const tree = await TestbedHarnessEnvironment.loader(fixture).getHarness(MatTreeHarness);
    expect(await tree.getNodes({ text: /^Zero$/ })).toHaveLength(1);
    TestBed.inject(TranslocoService).setActiveLang('zh-CN');
    await fixture.whenStable();
    expect(locales).toEqual(['en-US', 'zh-CN']);
    expect(await tree.getNodes({ text: /^零$/ })).toHaveLength(1);
    expect(fixture.componentInstance.activeKey()).toBe(0);
  });
});
