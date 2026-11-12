import { isTreeSelection } from '@haven/schema';
import type { TreeKey } from '@haven/schema';
import { LatestRequest } from '../adapters.js';
import { mergeTreeBranch, mergeTreePaths } from './cache.js';
import { copyTreeNodes, copyTreeResolution, InvalidTreeResponse } from './response.js';
import type { TreeBranchState, TreeDataSource, TreeDataState } from './types.js';
export type * from './types.js';

interface Owner {
  identity: string;
  adapter: TreeDataSource['adapter'];
  locale: string;
}
const empty = Object.freeze([]);

/** Per-parent request lanes and one independent selection lane; no Angular or business transport. */
export class TreeDataLoader {
  static initialState(): TreeDataState {
    return Object.freeze({
      branches: new Map(),
      entries: new Map(),
      keys: empty,
      resolving: false,
      resolveReady: false,
      resolveError: null,
      unresolved: empty,
    });
  }
  #state = TreeDataLoader.initialState();
  #owner: Owner | undefined;
  #disposed = false;
  #generation = 0;
  readonly #lanes = new Map<TreeKey | null, LatestRequest<ReturnType<typeof copyTreeNodes>>>();
  readonly #tokens = new Map<TreeKey | null, object>();
  readonly #resolve = new LatestRequest<ReturnType<typeof copyTreeResolution>>();
  #selection: object | undefined;
  constructor(private readonly changed: (state: TreeDataState) => void = () => {}) {}
  get state(): TreeDataState {
    return this.#state;
  }
  #update(patch: Partial<TreeDataState>): void {
    if (this.#disposed) return;
    this.#state = Object.freeze({ ...this.#state, ...patch });
    this.changed(this.#state);
  }
  setSource(source: TreeDataSource | undefined, locale: string): void {
    if (this.#disposed) return;
    if (
      source &&
      this.#owner?.identity === source.identity &&
      this.#owner.adapter === source.adapter &&
      this.#owner.locale === locale
    )
      return;
    const generation = ++this.#generation;
    this.#owner = undefined;
    this.#abort();
    if (this.#disposed || generation !== this.#generation) return;
    this.#owner = source
      ? { identity: source.identity, adapter: source.adapter, locale }
      : undefined;
    this.#state = TreeDataLoader.initialState();
    this.changed(this.#state);
  }
  #active(owner: Owner, parent: TreeKey | null, token: object): boolean {
    return !this.#disposed && this.#owner === owner && this.#tokens.get(parent) === token;
  }
  async load(parent: TreeKey | null): Promise<void> {
    const owner = this.#owner;
    if (!owner || this.#disposed) return;
    const branch = this.#state.branches.get(parent);
    if (branch?.status === 'ready' || branch?.status === 'loading') return;
    if (parent !== null && !this.#state.entries.get(parent)?.node.hasChildren) return;
    const token = {},
      lane = new LatestRequest<ReturnType<typeof copyTreeNodes>>();
    this.#lanes.get(parent)?.dispose();
    this.#lanes.set(parent, lane);
    this.#tokens.set(parent, token);
    this.#branch(parent, { status: 'loading', nodes: empty });
    if (!this.#active(owner, parent, token)) return;
    try {
      const result = await lane.run(async (signal) =>
        copyTreeNodes(await owner.adapter.children(parent, { locale: owner.locale, signal })),
      );
      if (!result.current || !this.#active(owner, parent, token)) return;
      const entries = mergeTreeBranch(
        parent,
        result.value,
        this.#state.entries,
        this.#state.branches,
      );
      this.#tokens.delete(parent);
      this.#lanes.delete(parent);
      this.#branch(
        parent,
        {
          status: 'ready',
          nodes: Object.freeze(result.value.map((node) => entries.get(node.key)!.node)),
        },
        entries,
      );
    } catch (error) {
      if (!this.#active(owner, parent, token)) return;
      this.#tokens.delete(parent);
      this.#lanes.delete(parent);
      this.#branch(parent, {
        status: 'error',
        nodes: empty,
        error: error instanceof InvalidTreeResponse ? 'response' : 'adapter',
      });
    }
  }
  #branch(parent: TreeKey | null, branch: TreeBranchState, entries = this.#state.entries): void {
    this.#update({
      branches: new Map(this.#state.branches).set(parent, Object.freeze(branch)),
      entries,
    });
  }
  cancel(parent: TreeKey | null, descendants = true): void {
    if (this.#disposed) return;
    const branches = new Map(this.#state.branches);
    const cancelled: LatestRequest<ReturnType<typeof copyTreeNodes>>[] = [];
    for (const [key, lane] of this.#lanes) {
      const nested =
        descendants &&
        (parent === null || (key !== null && this.#state.entries.get(key)?.path.includes(parent)));
      if (key !== parent && !nested) continue;
      this.#lanes.delete(key);
      this.#tokens.delete(key);
      cancelled.push(lane);
      if (branches.get(key)?.status === 'loading') branches.delete(key);
    }
    this.#update({ branches });
    for (const lane of cancelled) lane.dispose();
  }
  async resolve(keys: readonly TreeKey[]): Promise<void> {
    const owner = this.#owner;
    if (!owner || this.#disposed) return;
    const token = {};
    this.#selection = token;
    const active = () => !this.#disposed && this.#owner === owner && this.#selection === token;
    this.#resolve.dispose();
    // Abort handlers may synchronously replace the owner or start a newer selection request.
    if (!active()) return;
    if (!isTreeSelection(keys)) {
      this.#update({
        keys: empty,
        resolving: false,
        resolveReady: false,
        resolveError: 'response',
        unresolved: empty,
      });
      return;
    }
    const requested = Object.freeze([...keys]);
    this.#update({
      keys: requested,
      resolving: true,
      resolveReady: false,
      resolveError: null,
      unresolved: empty,
    });
    if (!active()) return;
    try {
      const result = await this.#resolve.run(async (signal) =>
        copyTreeResolution(
          requested.length
            ? await owner.adapter.resolve(requested, { locale: owner.locale, signal })
            : { paths: [], unresolved: [] },
          requested,
        ),
      );
      if (!result.current || !active()) return;
      const entries = mergeTreePaths(this.#state.entries, this.#state.branches, result.value.paths);
      this.#update({
        entries,
        resolving: false,
        resolveReady: true,
        resolveError: null,
        unresolved: result.value.unresolved,
      });
    } catch (error) {
      if (!active()) return;
      this.#update({
        resolving: false,
        resolveReady: false,
        resolveError: error instanceof InvalidTreeResponse ? 'response' : 'adapter',
      });
    }
  }
  retryResolve(): Promise<void> {
    return this.resolve(this.#state.keys);
  }
  #abort(): void {
    const lanes = [...this.#lanes.values()];
    this.#lanes.clear();
    this.#tokens.clear();
    this.#selection = undefined;
    this.#resolve.dispose();
    for (const lane of lanes) lane.dispose();
  }
  dispose(): void {
    this.#disposed = true;
    this.#owner = undefined;
    this.#abort();
  }
}
