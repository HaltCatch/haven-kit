import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Component, signal } from '@angular/core';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatSelectHarness } from '@angular/material/select/testing';
import { TranslocoService } from '@jsverse/transloco';
import type { HavenTheme, RemoteTreeNode, TreeKey } from '@haven/schema';
import { HavenThemeDirective } from '@haven/ui/theme';
import type { TreeDataAdapter, TreeDataSource, TreeResolution } from '@haven/runtime';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { setupTreeSelection } from '../../../../../tests/ui/tree-selection-support';
import { HavenRemoteCascaderField } from '../cascader';

const roots: RemoteTreeNode[] = [
  { key: 'a', label: 'Group A', hasChildren: true },
  { key: 'b', label: 'Group B', hasChildren: true },
  { key: 'locked', label: 'Locked', hasChildren: true, disabled: true },
];
const leaves: RemoteTreeNode[] = [
  { key: 0, label: { default: 'Zero', translations: { 'zh-CN': '零' } }, hasChildren: false },
  { key: '0', label: 'String zero', hasChildren: false },
];
const tick = async () => {
  TestBed.tick();
  await Promise.resolve();
  TestBed.tick();
};
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
function adapter(overrides: Partial<TreeDataAdapter> = {}): TreeDataAdapter {
  return {
    children: vi.fn(async (key: TreeKey | null) =>
      key === null ? roots : key === 'a' ? leaves : [],
    ),
    resolve: vi.fn(async (keys: readonly TreeKey[]) => ({
      paths: keys.flatMap((key) => {
        const leaf = leaves.find((entry) => entry.key === key);
        return leaf ? [[roots[0]!, leaf]] : [];
      }),
      unresolved: keys.filter((key) => !leaves.some((leaf) => leaf.key === key)),
    })),
    ...overrides,
  };
}
function fixture(port = adapter(), value: TreeKey | null = null) {
  const f = TestBed.createComponent(HavenRemoteCascaderField);
  f.componentRef.setInput('label', 'Location');
  f.componentRef.setInput('source', {
    identity: 'example',
    adapter: port,
  } satisfies TreeDataSource);
  f.componentRef.setInput('value', value);
  return f;
}
beforeEach(setupTreeSelection);
afterEach(() => TestBed.resetTestingModule());

it('loads levels through native selects and commits only explicit leaves including typed zero keys', async () => {
  const port = adapter(),
    f = fixture(port),
    field = f.componentInstance;
  await f.whenStable();
  const loader = TestbedHarnessEnvironment.loader(f);
  const initial = await loader.getAllHarnesses(MatSelectHarness);
  expect(initial.length).toBe(1);
  await initial[0]!.clickOptions({ text: 'Group A' });
  await f.whenStable();
  expect(field.value()).toBeNull();
  expect(field.path()).toEqual(['a']);
  const levels = await loader.getAllHarnesses(MatSelectHarness);
  expect(levels.length).toBe(2);
  await levels[1]!.clickOptions({ text: 'Zero' });
  await f.whenStable();
  expect(field.value()).toBe(0);
  expect(field.membership.accepted()).toBe(true);
  expect(field.display()).toBe('Group A / Zero');
  await levels[1]!.clickOptions({ text: 'String zero' });
  await f.whenStable();
  expect(field.value()).toBe('0');
  expect(port.children).toHaveBeenCalledTimes(2);
  expect(port.children).toHaveBeenCalledWith('a', expect.objectContaining({ locale: 'en-US' }));
});

it('keeps unknown initial values and resolves ancestry without claiming a complete sibling list', async () => {
  const selection = deferred<TreeResolution>(),
    branch = deferred<readonly RemoteTreeNode[]>();
  const port = adapter({
    resolve: vi.fn(() => selection.promise),
    children: vi.fn(async (parent) => (parent === null ? roots : branch.promise)),
  });
  const f = fixture(port, 0),
    field = f.componentInstance;
  await tick();
  expect(field.value()).toBe(0);
  expect(field.display()).toBe('0');
  expect(field.membership.accepted()).toBe(false);
  selection.resolve({ paths: [[roots[0]!, leaves[0]!]], unresolved: [] });
  await expect
    .poll(() => {
      TestBed.tick();
      return field.path();
    })
    .toEqual(['a', 0]);
  expect(field.value()).toBe(0);
  expect(field.levels()[1]!.options).toEqual([]);
  expect(field.levels()[1]!.branch?.status).toBe('loading');
  branch.resolve(leaves);
  await expect
    .poll(() => {
      TestBed.tick();
      return field.levels()[1]?.options.length;
    })
    .toBe(2);
  expect(field.levels()[1]!.options.length).toBe(2);
  expect(field.membership.accepted()).toBe(true);
});

it('cancels obsolete branch reads and ignores late results when exploring another parent', async () => {
  const first = deferred<readonly RemoteTreeNode[]>(),
    second = deferred<readonly RemoteTreeNode[]>();
  let firstSignal: AbortSignal | undefined;
  const port = adapter({
    children: vi.fn(async (parent, context) => {
      if (parent === null) return roots;
      if (parent === 'a') {
        firstSignal = context.signal;
        return first.promise;
      }
      return second.promise;
    }),
  });
  const f = fixture(port),
    field = f.componentInstance;
  await f.whenStable();
  field.select(field.levels()[0]!, 'a');
  await tick();
  expect(firstSignal?.aborted).toBe(false);
  field.select(field.levels()[0]!, 'b');
  await tick();
  expect(firstSignal?.aborted).toBe(true);
  expect(field.path()).toEqual(['b']);
  first.resolve(leaves);
  second.resolve([{ key: 'other', label: 'Other leaf', hasChildren: false }]);
  await expect
    .poll(() => {
      TestBed.tick();
      return field.data.state().branches.get('b')?.status;
    })
    .toBe('ready');
  expect(field.data.state().entries.has(0)).toBe(false);
  expect(field.levels()[1]!.options.map((node) => node.key)).toEqual(['other']);
  expect(field.value()).toBeNull();
});

it('retains the value and supports separate branch and membership retries', async () => {
  let rootFail = true,
    branchFail = true,
    resolveFail = true;
  const port = adapter({
    children: vi.fn(async (parent) => {
      if (parent === null) {
        if (rootFail) throw new Error('root');
        return roots;
      }
      if (branchFail) throw new Error('children');
      return leaves;
    }),
    resolve: vi.fn(async () => {
      if (resolveFail) throw new Error('selection');
      return { paths: [[roots[0]!, leaves[0]!]], unresolved: [] };
    }),
  });
  const f = fixture(port, 0),
    field = f.componentInstance;
  await f.whenStable();
  expect(field.value()).toBe(0);
  expect(field.levels()[0]!.branch?.status).toBe('error');
  expect(field.membership.resolution().failed).toBe(true);
  rootFail = false;
  field.retryBranch(field.levels()[0]!);
  resolveFail = false;
  field.retry();
  await f.whenStable();
  expect(field.levels()[1]!.branch?.status).toBe('error');
  branchFail = false;
  field.retryBranch(field.levels()[1]!);
  await f.whenStable();
  expect(field.levels()[1]!.branch?.status).toBe('ready');
  expect(field.membership.accepted()).toBe(true);
  expect(field.value()).toBe(0);
});

it('preserves exploration through locale/cache changes and filters only loaded choices', async () => {
  const f = fixture(),
    field = f.componentInstance;
  await f.whenStable();
  field.select(field.levels()[0]!, 'a');
  await f.whenStable();
  expect(field.path()).toEqual(['a']);
  field.filterChanged('String');
  expect(field.options(field.levels()[0]!).map((node) => node.key)).toEqual(['a']);
  expect(field.options(field.levels()[1]!).map((node) => node.key)).toEqual(['0']);
  field.filterChanged('');
  TestBed.inject(TranslocoService).setActiveLang('zh-CN');
  await expect
    .poll(() => {
      TestBed.tick();
      return field.data.state().branches.get('a')?.status;
    })
    .toBe('ready');
  expect(field.path()).toEqual(['a']);
  expect(
    field.options(field.levels()[1]!).map((node) => field.localization.text(node.label)),
  ).toEqual(['零', 'String zero']);
  expect(field.value()).toBeNull();
});

it.each(['readonly', 'disabled'] as const)(
  'blocks stale events and clearing immediately on %s changes',
  async (mode) => {
    const f = fixture(),
      field = f.componentInstance;
    await f.whenStable();
    const level = field.levels()[0]!;
    f.componentRef.setInput(mode, true);
    field.select(level, 'a');
    field.clear();
    expect(field.path()).toEqual([]);
    expect(field.value()).toBeNull();
    await f.whenStable();
  },
);

it('rejects old source/level events, live permission changes, and disabled ancestors', async () => {
  const f = fixture(),
    field = f.componentInstance;
  let allowed = true;
  f.componentRef.setInput('active', () => allowed);
  await f.whenStable();
  const stale = field.levels()[0]!;
  field.select(stale, 'locked');
  expect(field.path()).toEqual([]);
  allowed = false;
  field.select(stale, 'a');
  expect(field.path()).toEqual([]);
  allowed = true;
  f.componentRef.setInput('source', { identity: 'replacement', adapter: adapter() });
  field.select(stale, 'a');
  expect(field.path()).toEqual([]);
  await f.whenStable();
  field.select(stale, 'a');
  expect(field.path()).toEqual([]);
  field.select(field.levels()[0]!, 'a');
  await f.whenStable();
  expect(field.path()).toEqual(['a']);
});

it('rechecks live permission after abort callbacks synchronously revoke editing', async () => {
  const pending = deferred<readonly RemoteTreeNode[]>();
  let revoke = () => {};
  const port = adapter({
    children: vi.fn(async (parent, context) => {
      if (parent === null) return roots;
      context.signal.addEventListener('abort', () => revoke());
      return pending.promise;
    }),
  });
  const f = fixture(port),
    field = f.componentInstance;
  await f.whenStable();
  field.select(field.levels()[0]!, 'a');
  await tick();
  revoke = () => f.componentRef.setInput('readonly', true);
  field.select(field.levels()[0]!, 'b');
  expect(field.path()).toEqual(['a']);
  expect(field.value()).toBeNull();
  pending.resolve([]);
  await f.whenStable();
});

@Component({
  imports: [HavenThemeDirective, HavenRemoteCascaderField],
  template: `<section [havenTheme]="theme()">
    <haven-remote-cascader-field label="Location" [source]="source" />
  </section>`,
})
class ThemeHost {
  readonly source = { identity: 'theme-example', adapter: adapter() };
  readonly theme = signal<HavenTheme>({
    preset: 'material',
    mode: 'dark',
    density: 'compact',
    tokens: { primary: '#abcdef' },
  });
}
it('uses native scoped overlays and preserves exploration across theme and language changes', async () => {
  const f = TestBed.createComponent(ThemeHost),
    loader = TestbedHarnessEnvironment.loader(f);
  await f.whenStable();
  const first = await loader.getHarness(MatSelectHarness);
  await first.clickOptions({ text: 'Group A' });
  await f.whenStable();
  const levels = await loader.getAllHarnesses(MatSelectHarness);
  await levels[1]!.open();
  const instance = f.debugElement.query(By.directive(HavenRemoteCascaderField))
    .componentInstance as HavenRemoteCascaderField;
  const panel = () =>
    instance.controls().find((control) => control.panelOpen)?.panel?.nativeElement as
      HTMLElement | undefined;
  expect(panel()!.style.getPropertyValue('--mat-sys-primary')).toBe('#abcdef');
  f.componentInstance.theme.update((theme) => ({
    ...theme,
    preset: 'liquid-glass',
    tokens: { primary: '#fedcba' },
  }));
  await expect
    .poll(() => {
      TestBed.tick();
      return panel()?.style.getPropertyValue('--mat-sys-primary');
    })
    .toBe('#fedcba');
  expect(panel()!.getAttribute('data-haven-preset')).toBe('liquid-glass');
  expect(
    document
      .querySelector<HTMLElement>('.cdk-overlay-container')!
      .style.getPropertyValue('--mat-sys-primary'),
  ).toBe('');
  await levels[1]!.close();
  TestBed.inject(TranslocoService).setActiveLang('zh-CN');
  await expect
    .poll(() => {
      TestBed.tick();
      return instance.levels()[1]?.options.length;
    })
    .toBe(2);
  expect(instance.path()).toEqual(['a']);
  const translated = await loader.getAllHarnesses(MatSelectHarness);
  await translated[1]!.clickOptions({ text: '零' });
  await f.whenStable();
  expect(await translated[1]!.getValueText()).toBe('零');
});
