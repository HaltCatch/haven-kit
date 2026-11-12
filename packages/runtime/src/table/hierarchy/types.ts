import type { JsonObject, TableRowKey } from '@haven/schema';

export type TableHierarchyIssueCode =
  | 'configuration'
  | 'rows'
  | 'json'
  | 'rowKey'
  | 'parentKey'
  | 'duplicateKey'
  | 'rootCollision'
  | 'orphan'
  | 'cycle'
  | 'depth'
  | 'limit';
export interface TableHierarchyIssue {
  readonly code: TableHierarchyIssueCode;
  /** Original position in the complete flat input, never a filtered or visible row index. */
  readonly row?: number;
  readonly key?: TableRowKey;
  readonly path?: string;
}
export interface TableHierarchyEntry {
  readonly row: JsonObject;
  readonly index: number;
  /** Root marker values normalize to null here, but input records are never modified. */
  readonly parentKey: TableRowKey | null;
  /** Roots are depth zero; at most 32 levels are accepted. */
  readonly depth: number;
}
export interface TableHierarchyIndex {
  /** Owned containers are immutable; row references remain the caller's original JSON records. */
  readonly rows: readonly JsonObject[];
  readonly roots: readonly JsonObject[];
  readonly entries: ReadonlyMap<TableRowKey, TableHierarchyEntry>;
  readonly children: ReadonlyMap<TableRowKey, readonly JsonObject[]>;
}
export type TableHierarchyResult =
  | { readonly status: 'ready'; readonly index: TableHierarchyIndex }
  | { readonly status: 'error'; readonly issue: TableHierarchyIssue };
