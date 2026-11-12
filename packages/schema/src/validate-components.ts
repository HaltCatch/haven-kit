import { isTableColumnFilters } from './table-filters.js';
import { validateTableEditing } from './table-edit-validation.js';
import { validateAdvancedField } from './validate-fields.js';
import { validateTreeEditorNode } from './tree-editor-manifest.js';
import { validatePresentation } from './presentation-validate.js';
import { resolveSchema, schemaAtPointer } from './pointer.js';
import { isTableView } from './table-view.js';
import { isTableColumns, isTablePointer } from './table.js';
import { isTableHeaderLayout } from './table-headers.js';
import { validateTableHierarchy } from './table-hierarchy/validation.js';
import { validateTableVirtualization } from './table-virtualization/validation.js';
import { isTemporalBounds } from './temporal.js';
import type { TemporalKind } from './temporal.js';
import type { DataSchema, Diagnostic, UiNode } from './types.js';

/** Component-specific persisted contracts; runtime input values are checked by the renderer. */
export function validateComponent(
  node: UiNode,
  bound: DataSchema | undefined,
  root: DataSchema,
  path: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [
    ...validatePresentation(node, path),
    ...validateAdvancedField(node, bound, root, path),
    ...validateTreeEditorNode(node, path),
    ...validateTableHierarchy(node, bound, root, path),
    ...validateTableVirtualization(node, path),
  ];
  const add = (code: string, property: string, message: string) =>
    diagnostics.push({ code, path: `${path}/${property}`, nodeId: node.id, message });
  if (
    node.kind === 'table' &&
    node.props?.['columnFilters'] !== undefined &&
    !isTableColumnFilters(
      node.props['columnFilters'],
      isTableColumns(node.props['columns']) ? node.props['columns'] : [],
    )
  )
    add(
      'table.columnFilters',
      'props/columnFilters',
      'Expected unique bounded column filters matching the declared columns',
    );
  if (
    node.kind === 'form.repeat' &&
    (!bound?.items || resolveSchema(bound.items, root)?.type !== 'object')
  )
    add('repeat.items', 'bind', 'Repeat groups require explicitly declared object items');
  if (
    node.props?.['resource'] !== undefined &&
    Array.isArray(node.props?.['options']) &&
    node.props['options'].length
  )
    add('resource.conflict', 'props/options', 'Choose inline options or a resource, not both');
  if (node.kind === 'field.multiselect') {
    const type = bound?.items && resolveSchema(bound.items, root)?.type;
    if (type !== 'string' && type !== 'number')
      add('binding.items', 'bind', 'Multiple selection requires string or number items');
  }
  if (['field.date', 'field.time', 'field.datetime'].includes(node.kind)) {
    const min = node.props?.['min'],
      max = node.props?.['max'];
    if (
      !isTemporalBounds(node.kind.slice(6) as TemporalKind, {
        ...(typeof min === 'string' ? { min } : {}),
        ...(typeof max === 'string' ? { max } : {}),
      })
    )
      add('temporal.bounds', 'props', 'Invalid local temporal bounds');
  }
  if (node.kind !== 'table') return diagnostics;
  const columns = node.props?.['columns'],
    rowKey = node.props?.['rowKey'];
  const item = bound?.items && resolveSchema(bound.items, root);
  if (!item || item.type !== 'object')
    add('table.binding', 'bind', 'A table requires an array of objects');
  if (!isTableColumns(columns))
    add('table.columns', 'props/columns', 'Invalid table column definitions');
  const headerGroups = node.props?.['headerGroups'];
  if (headerGroups !== undefined && !isTableHeaderLayout(headerGroups, columns))
    add(
      'table.headerGroups',
      'props/headerGroups',
      'Header groups must reference every column exactly once within bounded presentation groups',
    );
  if (!isTablePointer(rowKey))
    add('table.rowKey', 'props/rowKey', 'A table requires a row key pointer');
  else if (item) {
    const keyType = schemaAtPointer(item, rowKey, root)?.type;
    if (keyType !== 'string' && keyType !== 'number')
      add('table.rowKey', 'props/rowKey', 'Row key must resolve to a string or number');
  }
  if (item && isTableColumns(columns)) {
    for (const column of columns) {
      const type = schemaAtPointer(item, column.path, root)?.type;
      if (
        !type ||
        !(
          column.renderer && !column.type
            ? ['string', 'number', 'boolean', 'null', 'object', 'array']
            : ['string', 'number', 'boolean', 'null']
        ).includes(type) ||
        (column.type && type !== (column.type === 'text' ? 'string' : column.type))
      )
        add('table.columnType', 'props/columns', `Invalid scalar column path: ${column.id}`);
    }
  }
  diagnostics.push(...validateTableEditing(node, item, root, path));
  const view = node.props?.['view'];
  if (view !== undefined && !isTableView(view, isTableColumns(columns) ? columns : undefined))
    add('table.view', 'props/view', 'Invalid table view');
  const pageSize = node.props?.['pageSize'];
  if (pageSize !== undefined && !Number.isInteger(pageSize))
    add('table.pageSize', 'props/pageSize', 'Page size must be an integer');
  return diagnostics;
}
