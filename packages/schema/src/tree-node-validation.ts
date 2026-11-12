import { indexTree } from './tree.js';
import { resolveSchema } from './pointer.js';
import type { DataSchema, Diagnostic, UiNode } from './types.js';

export const remoteTreeKinds = [
  'tree',
  'field.tree-select',
  'field.tree-multiselect',
  'field.cascader',
];

/** Local data and remote ports share bindings, but never imply a partially loaded local hierarchy. */
export function validateTreeNode(
  node: UiNode,
  bound: DataSchema | undefined,
  root: DataSchema,
  path: string,
): Diagnostic[] {
  if (!remoteTreeKinds.includes(node.kind)) return [];
  const errors: Diagnostic[] = [];
  const add = (code: string, suffix: string, message: string) =>
    errors.push({ code, path: `${path}/${suffix}`, nodeId: node.id, message });
  const remote = node.props?.['resource'] !== undefined;
  const index = remote ? undefined : indexTree(node.props?.['nodes']);
  if (remote) {
    if (
      typeof node.props?.['resource'] !== 'string' ||
      !/^[a-zA-Z][a-zA-Z0-9_.-]{0,127}$/.test(node.props['resource'])
    )
      add('tree.resource', 'props/resource', 'Expected a named tree resource binding');
    if (node.props?.['nodes'] !== undefined)
      add('resource.conflict', 'props/nodes', 'Choose a complete local tree or a remote resource');
    if (node.props?.['cascade'] === true)
      add(
        'tree.cascadeRemote',
        'props/cascade',
        'Remote cascade requires complete atomic subtree resolution and is not implemented',
      );
  } else if (!index) {
    add('tree.nodes', 'props/nodes', 'Expected a finite, uniquely keyed local tree');
  }
  if (bound && node.kind !== 'tree') {
    const multiple = node.kind === 'field.tree-multiselect';
    const item = multiple && bound.items ? resolveSchema(bound.items, root) : undefined;
    if (multiple && (bound.type !== 'array' || !['string', 'number'].includes(item?.type ?? '')))
      add(
        'tree.binding',
        'bind',
        'Multiple tree selection requires an array of string or number keys',
      );
    const keyType = multiple ? item?.type : bound.type;
    const leafOnly = node.kind === 'field.cascader' || node.props?.['leafOnly'] === true;
    if (
      index &&
      [...index.entries.values()].some(
        ({ node: entry, disabled }) =>
          !disabled && (!leafOnly || !entry.children?.length) && typeof entry.key !== keyType,
      )
    )
      add('tree.keyType', 'props/nodes', 'Selectable tree keys must match the bound value type');
  }
  return errors;
}
