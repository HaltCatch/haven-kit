import type { Diagnostic, UiNode } from './types.js';

/** Validate IDs against direct children, without exposing Angular panel or UI runtime types. */
export function validatePresentation(node: UiNode, path: string): Diagnostic[] {
  if (node.kind !== 'layout.accordion') return [];
  const expanded = node.props?.['expandedIds'];
  if (expanded === undefined) return [];
  const children = new Set(node.children?.map((child) => child.id));
  if (
    Array.isArray(expanded) &&
    expanded.every((id) => typeof id === 'string' && children.has(id)) &&
    new Set(expanded).size === expanded.length &&
    (node.props?.['multi'] === true || expanded.length <= 1)
  )
    return [];
  return [
    {
      code: 'accordion.expanded',
      path: `${path}/props/expandedIds`,
      nodeId: node.id,
      message: 'Expanded IDs must uniquely identify direct panels; single mode allows at most one',
    },
  ];
}
