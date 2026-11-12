import type { ComponentManifest, DataSchema, HavenDocument, UiNode } from '@haven/schema';
import { HavenEditingError } from './errors.js';
import { insertScopeProperty } from './scope.js';
import { flattenTree, isContainer, updateNode } from './tree.js';

export interface NodeInsertionDefaults {
  /** Optional factory field schema, inserted under node.id in the parent's current data scope. */
  readonly schema?: DataSchema;
  readonly resources?: HavenDocument['resources'];
}
/** Inserts a resolved subtree; application factories own labels, defaults and host port selection. */
export function insertNode(
  document: HavenDocument,
  parentId: string,
  beforeId: string | null,
  node: UiNode,
  defaults: NodeInsertionDefaults = {},
  manifests?: ReadonlyMap<string, ComponentManifest>,
): HavenDocument {
  const entries = flattenTree(document.ui),
    ids = new Set(entries.map((entry) => entry.node.id));
  for (const entry of flattenTree(node)) {
    if (ids.has(entry.node.id)) throw new HavenEditingError('editing.duplicateNode');
    ids.add(entry.node.id);
  }
  const parent = entries.find((entry) => entry.node.id === parentId)?.node;
  if (!parent) throw new HavenEditingError('editing.moveTarget');
  if (!isContainer(parent, manifests)) throw new HavenEditingError('editing.notContainer');
  const position =
    beforeId === null
      ? (parent.children?.length ?? 0)
      : (parent.children ?? []).findIndex((child) => child.id === beforeId);
  if (position < 0) throw new HavenEditingError('editing.position');
  const dataSchema = defaults.schema
    ? insertScopeProperty(document, parentId, node.id, defaults.schema)
    : document.dataSchema;
  if (Object.keys(defaults.resources ?? {}).some((name) => Object.hasOwn(document.resources, name)))
    throw new HavenEditingError('editing.resourceCollision');
  const next = updateNode(document, parentId, (target) => {
    const children = [...(target.children ?? [])];
    children.splice(position, 0, node);
    return { ...target, children };
  });
  return {
    ...next,
    ...(defaults.schema ? { dataSchema } : {}),
    ...(defaults.resources ? { resources: { ...document.resources, ...defaults.resources } } : {}),
  };
}
