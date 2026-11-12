import { DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import type { Signal } from '@angular/core';
import { HavenLocalization } from '@haven/ui';
import { TreeDataLoader } from '@haven/runtime';
import type { TreeDataSource, TreeDataState } from '@haven/runtime';

export interface HavenTreeData {
  readonly state: Signal<TreeDataState>;
  readonly loader: TreeDataLoader;
  current(): boolean;
}

/** One field owns one cache, including while its optional selection dialog is closed. */
export function injectTreeData(
  source: () => TreeDataSource | undefined,
  active: () => boolean,
): HavenTreeData {
  const localization = inject(HavenLocalization),
    destroy = inject(DestroyRef);
  const state = signal(TreeDataLoader.initialState());
  const owner = signal<{ source: TreeDataSource; locale: string } | undefined>(undefined);
  const loader = new TreeDataLoader((value) => state.set(value));
  const current = () => {
    const expected = owner(),
      actual = source();
    return (
      !destroy.destroyed &&
      active() &&
      !!expected &&
      expected.source.identity === actual?.identity &&
      expected.source.adapter === actual.adapter &&
      expected.locale === localization.locale()
    );
  };
  effect(() => {
    const next = source(),
      locale = localization.locale(),
      enabled = active();
    untracked(() => {
      owner.set(next && enabled ? { source: next, locale } : undefined);
      loader.setSource(enabled ? next : undefined, locale);
    });
  });
  destroy.onDestroy(() => loader.dispose());
  return {
    state: computed(() => (current() ? state() : TreeDataLoader.initialState())),
    loader,
    current,
  };
}
