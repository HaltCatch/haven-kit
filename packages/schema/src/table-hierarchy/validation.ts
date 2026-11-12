import { resolveSchema, schemaAtPointer } from '../pointer.js';
import { isTableColumns, isTablePointer } from '../table.js';
import type { DataSchema, Diagnostic, UiNode } from '../types.js';
import { isTableExpandedRowKeys, isTableHierarchy } from './contract.js';
import { tableHierarchyEditPathsValid } from './edit-paths.js';

/** Model checks do not invent missing parents or reinterpret the caller's root marker. */
export function validateTableHierarchy(
  node: UiNode,
  bound: DataSchema | undefined,
  root: DataSchema,
  path: string,
): Diagnostic[] {
  if (node.kind !== 'table') return [];
  const errors: Diagnostic[] = [];
  const add = (code: string, property: string, message: string) =>
    errors.push({ code, path: `${path}/props/${property}`, nodeId: node.id, message });
  const hierarchy = node.props?.['hierarchy'],
    expanded = node.props?.['expandedRowKeys'];
  if (hierarchy === undefined) {
    if (expanded !== undefined && (!isTableExpandedRowKeys(expanded) || expanded.length))
      add(
        'table.expandedRowKeys',
        'expandedRowKeys',
        'Expanded row keys require a configured local hierarchy',
      );
    return errors;
  }
  if (node.props?.['resource'] !== undefined)
    add(
      'table.hierarchyResource',
      'resource',
      'Hierarchy requires a complete local collection, not a remote page',
    );
  if (!isTableHierarchy(hierarchy)) {
    add(
      'table.hierarchy',
      'hierarchy',
      'Expected a bounded parent pointer, explicit typed root marker and supported hierarchy modes',
    );
    return errors;
  }
  const item = bound?.items && resolveSchema(bound.items, root),
    rowKey = node.props?.['rowKey'];
  const keyType =
    item && isTablePointer(rowKey) ? schemaAtPointer(item, rowKey, root)?.type : undefined;
  if (item) {
    const parentType = schemaAtPointer(item, hierarchy.parentPath, root)?.type;
    if (
      !parentType ||
      !['string', 'number', 'null'].includes(parentType) ||
      (parentType !== 'null' && parentType !== keyType)
    )
      add(
        'table.hierarchyParent',
        'hierarchy/parentPath',
        'Parent paths must resolve to row keys of the same scalar type, or explicit null-only roots',
      );
    // Number fields already preserve null as their native empty value; string fields normalize it to ''.
    const marker = hierarchy.rootValue;
    if (
      (parentType === 'string' && typeof marker !== 'string') ||
      (parentType === 'number' && marker !== null && typeof marker !== 'number') ||
      (parentType === 'null' && marker !== null)
    )
      add(
        'table.hierarchyRoot',
        'hierarchy/rootValue',
        'The root marker must be preserved by the declared parent field type',
      );
  }
  const columns = node.props?.['columns'];
  if (
    isTableColumns(columns) &&
    isTablePointer(rowKey) &&
    !tableHierarchyEditPathsValid(columns, rowKey, hierarchy)
  )
    add(
      'table.hierarchyPaths',
      'hierarchy/parentPath',
      'Parent paths cannot overlap the row key or any ordinary cell editor',
    );
  if (
    expanded !== undefined &&
    (!isTableExpandedRowKeys(expanded) ||
      expanded.some((key) => typeof key !== keyType || key === hierarchy.rootValue))
  )
    add(
      'table.expandedRowKeys',
      'expandedRowKeys',
      'Expected unique bounded typed row keys; the root marker is not a row',
    );
  return errors;
}
