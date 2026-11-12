import { escapePointer } from '../pointer.js';
import type { Diagnostic, UiNode } from '../types.js';
import { tableVirtualizationIssue } from './contract.js';

export function validateTableVirtualization(node: UiNode, path: string): Diagnostic[] {
  if (node.kind !== 'table' || node.props?.['virtualization'] === undefined) return [];
  const issue = tableVirtualizationIssue(node.props['virtualization']);
  return issue
    ? [
        {
          code: 'table.virtualization',
          nodeId: node.id,
          path: `${path}/props/virtualization${issue.property === null ? '' : '/' + escapePointer(issue.property)}`,
          message: issue.message,
        },
      ]
    : [];
}
