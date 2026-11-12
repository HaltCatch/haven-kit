import type { RemoteTreeNode, TreeKey } from '@haven/schema';

export interface TreeDataContext {
  readonly locale: string;
  readonly signal: AbortSignal;
}
export interface TreeResolution {
  /** Each path starts at a root and ends at exactly one requested key. */
  readonly paths: readonly (readonly RemoteTreeNode[])[];
  readonly unresolved: readonly TreeKey[];
}
export interface TreeDataAdapter {
  /** Complete direct children. An absent cache entry is never an empty leaf. */
  children(parent: TreeKey | null, context: TreeDataContext): Promise<readonly RemoteTreeNode[]>;
  resolve(keys: readonly TreeKey[], context: TreeDataContext): Promise<TreeResolution>;
}
/** Trusted registration. Include the host data revision in identity when records change. */
export interface TreeDataSource {
  readonly identity: string;
  readonly adapter: TreeDataAdapter;
}
export type TreeDataFailure = 'adapter' | 'response';
export interface TreeBranchState {
  readonly status: 'loading' | 'ready' | 'error';
  readonly nodes: readonly RemoteTreeNode[];
  readonly error?: TreeDataFailure;
}
export interface TreeDataEntry {
  readonly node: RemoteTreeNode;
  readonly path: readonly TreeKey[];
  readonly disabled: boolean;
}
export interface TreeDataState {
  /** Only complete children reads produce ready branches; resolved paths do not. */
  readonly branches: ReadonlyMap<TreeKey | null, TreeBranchState>;
  readonly entries: ReadonlyMap<TreeKey, TreeDataEntry>;
  readonly keys: readonly TreeKey[];
  readonly resolving: boolean;
  readonly resolveReady: boolean;
  readonly resolveError: TreeDataFailure | null;
  readonly unresolved: readonly TreeKey[];
}
