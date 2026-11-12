import { isTableRowActions } from './table-editing.js';
import { isTableColumns, isTableRendererId } from './table.js';
import { isChoiceOptions } from './options.js';
import { schemaAtPointer } from './pointer.js';
import type { DataSchema, Diagnostic, UiNode } from './types.js';
export function validateTableEditing(
  node: UiNode,
  item: DataSchema | undefined,
  root: DataSchema,
  path: string,
): Diagnostic[] {
  const result: Diagnostic[] = [];
  const add = (message: string) =>
    result.push({ code: 'table.edit', path: `${path}/props`, nodeId: node.id, message });
  const actions = node.props?.['rowActions'];
  if (actions !== undefined && !isTableRowActions(actions)) add('Invalid table row actions');
  const mode = node.props?.['editMode'];
  if (mode !== undefined && mode !== 'cell' && mode !== 'row') add('Invalid table editing mode');
  const handler = node.props?.['editHandler'];
  if (handler !== undefined && !isTableRendererId(handler))
    add('A remote edit handler must be a stable registered identifier');
  if (mode && node.props?.['resource'] !== undefined && handler === undefined)
    add('Remote table editing requires an explicit registered commit handler');
  if (handler !== undefined && (!mode || node.props?.['resource'] === undefined))
    add('A remote edit handler requires a remote resource and an editing mode');
  const columns = node.props?.['columns'],
    key = node.props?.['rowKey'];
  if (!item || !isTableColumns(columns) || typeof key !== 'string') return result;
  const edited = columns.filter((column) => column.editor);
  const overlaps = (a: string, b: string) =>
    a === b || a.startsWith(b + '/') || b.startsWith(a + '/');
  const types: Readonly<Record<string, readonly string[]>> = {
    text: ['string'],
    textarea: ['string'],
    number: ['number'],
    checkbox: ['boolean'],
    switch: ['boolean'],
    date: ['string'],
    time: ['string'],
    datetime: ['string'],
    select: ['string', 'number'],
    radio: ['string', 'number'],
  };
  edited.forEach((column, index) => {
    if (
      overlaps(column.path, key) ||
      edited.slice(0, index).some((other) => overlaps(other.path, column.path))
    )
      add('Editable paths cannot overlap or modify the row key');
    const type = schemaAtPointer(item, column.path, root)?.type,
      editor = column.editor!,
      params = editor.params ?? {};
    if (
      !type ||
      !(
        Object.hasOwn(types, editor.id) ? types[editor.id]! : ['string', 'number', 'boolean']
      ).includes(type)
    )
      add(`Editor is incompatible with column ${column.id}`);
    if (editor.id === 'select' || editor.id === 'radio') {
      if (
        Object.keys(params).some((name) => name !== 'options') ||
        !isChoiceOptions(params['options']) ||
        params['options'].some((option) => typeof option.value !== type)
      )
        add(`Invalid editor options for ${column.id}`);
    } else if (Object.hasOwn(types, editor.id) && Object.keys(params).length)
      add(`Unsupported built-in editor params for ${column.id}`);
  });
  return result;
}
