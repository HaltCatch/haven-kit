import { computed, effect, untracked } from '@angular/core';
import type { TreeKey } from '@haven/schema';
import type { HavenOptionResolution } from '@haven/ui/form';
import type { HavenTreeData } from './data';
import type { TreeDataSource, TreeDataAdapter } from '@haven/runtime';

export interface HavenTreeResolution extends HavenOptionResolution {
  readonly identity: string;
  readonly locale: string;
  readonly adapter: TreeDataAdapter | undefined;
}

/** Selected membership is independent of the currently loaded browsing branches. */
export function remoteTreeFieldState(
  data: HavenTreeData,
  keys: () => readonly TreeKey[],
  valid: () => boolean,
  leafOnly: () => boolean,
  label: (value: unknown) => string,
  source: () => TreeDataSource | undefined,
  locale: () => string,
) {
  effect(() => {
    const selected = keys();
    if (data.current() && valid()) untracked(() => void data.loader.resolve(selected));
  });
  const resolution = computed<HavenTreeResolution>(() => {
    const state = data.state();
    return {
      identity: source()?.identity ?? '',
      locale: locale(),
      adapter: source()?.adapter,
      keys: state.keys,
      options: state.keys.flatMap((key) => {
        const entry = state.entries.get(key);
        return entry && !state.unresolved.includes(key) && (!leafOnly() || !entry.node.hasChildren)
          ? [{ key, label: label(entry.node.label), disabled: entry.disabled }]
          : [];
      }),
      pending: state.resolving || !data.current(),
      ready: data.current() && valid() && state.resolveReady,
      failed: !valid() || !!state.resolveError,
    };
  });
  const accepted = computed(() => {
    const current = resolution(),
      selected = keys();
    return (
      current.ready &&
      !current.failed &&
      !current.pending &&
      current.keys.length === selected.length &&
      selected.every(
        (key, at) =>
          current.keys[at] === key && current.options.some((option) => option.key === key),
      )
    );
  });
  return { resolution, accepted };
}
