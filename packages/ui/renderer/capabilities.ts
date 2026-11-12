import { validateDocument } from '@haven/schema';
import type { HavenDocument, UiNode, ValidationOptions } from '@haven/schema';
export const rendererCapabilities = [
  'form',
  'form.repeat',
  'layout.stack',
  'layout.toolbar',
  'layout.grid',
  'layout.section',
  'layout.tabs',
  'layout.stepper',
  'layout.card',
  'layout.accordion',
  'view.badge',
  'view.progress',
  'view.alert',
  'view.divider',
  'tree',
  'tree.editor',
  'field.tree-select',
  'field.tree-multiselect',
  'field.cascader',
  'field.multilingual',
  'field.file',
  'field.files',
  'field.rich-text',
  'field.image',
  'field.text',
  'field.password',
  'field.textarea',
  'field.number',
  'field.checkbox',
  'field.switch',
  'field.select',
  'field.radio',
  'field.multiselect',
  'field.date',
  'field.time',
  'field.datetime',
  'table',
  'view.text',
  'action.button',
].map((kind) => `${kind}@1`);

/** Schema contracts can precede a renderer implementation; never accept a silent event binding. */
function implementedEvents(kind: string): readonly string[] {
  if (kind === 'form.repeat') return ['add', 'remove', 'reorder'];
  if (kind.startsWith('field.')) return ['change', 'blur'];
  if (kind === 'layout.accordion') return ['expandedChange'];
  if (kind === 'view.alert') return ['dismiss'];
  if (kind === 'tree') return ['activate', 'expandedChange', 'filterChange'];
  if (kind === 'tree.editor') return ['activate', 'expandedChange', 'filterChange', 'proposal'];
  if (kind === 'action.button') return ['click'];
  if (kind === 'table')
    return [
      'selectionChange',
      'filterChange',
      'columnFiltersChange',
      'viewChange',
      'queryChange',
      'expandedChange',
      'editCommitted',
      'rowAction',
    ];
  return [];
}

export function validateRendererDocument(
  value: unknown,
  options: Pick<ValidationOptions, 'limits'> = {},
) {
  const result = validateDocument(value, {
    limits: options.limits ?? {},
    supportedCapabilities: rendererCapabilities,
  });
  if (!result.structural) return result;
  const diagnostics = [...result.diagnostics];
  const visit = (node: UiNode, path: string) => {
    for (const event of Object.keys(node.events ?? {})) {
      const eventPath = `${path}/events/${event.replaceAll('~', '~0').replaceAll('/', '~1')}`;
      if (
        !implementedEvents(node.kind).includes(event) &&
        !diagnostics.some((diagnostic) => diagnostic.path === eventPath)
      )
        diagnostics.push({
          code: 'event.unavailable',
          path: eventPath,
          nodeId: node.id,
          message: 'This renderer does not yet implement this component event',
        });
    }
    if (
      node.props?.['resource'] !== undefined &&
      ![
        'tree',
        'field.tree-select',
        'field.tree-multiselect',
        'field.cascader',
        'field.select',
        'field.multiselect',
        'field.file',
        'field.files',
        'field.image',
        'table',
      ].includes(node.kind)
    )
      diagnostics.push({
        code: 'resource.unavailable',
        path: `${path}/props/resource`,
        nodeId: node.id,
        message: 'This renderer does not yet have a resource adapter for this component',
      });
    for (const [index, child] of (node.children ?? []).entries())
      visit(child, `${path}/children/${index}`);
  };
  visit((value as HavenDocument).ui, '/ui');
  return { ...result, diagnostics, valid: diagnostics.length === 0 };
}
