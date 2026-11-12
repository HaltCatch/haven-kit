import type { HavenRenderer } from './renderer';
import { isTableRendererParams } from '@haven/schema';

export function tableFilterAdapter(renderer: HavenRenderer, id: string) {
  const resource = renderer.states().get(id)?.node.props?.['resource'];
  const binding =
    typeof resource === 'string' ? renderer.document().resources[resource] : undefined;
  return binding?.type === 'query' ? renderer.host().tables?.get(binding.adapter) : undefined;
}

/** Read current root state directly; Angular child inputs may still describe the previous model. */
export function tableFilterOwner(renderer: HavenRenderer, id: string): string {
  const node = renderer.states().get(id)?.node;
  const resource = node?.props?.['resource'];
  const columns = node?.props?.['columns'];
  const support = tableFilterAdapter(renderer, id)?.supportedColumnFilters ?? [];
  return JSON.stringify([
    renderer.documentIdentity(),
    renderer.instances().contexts.get(id)?.source.bind,
    node?.kind,
    resource,
    typeof resource === 'string' ? renderer.document().resources[resource] : undefined,
    node?.props?.['rowKey'],
    node?.props?.['columnFilters'],
    isTableRendererParams({ support }) ? support : 'invalid',
    Array.isArray(columns)
      ? columns.map((column) =>
          column && typeof column === 'object' && !Array.isArray(column)
            ? [column['id'], column['path'], column['filter']]
            : column,
        )
      : columns,
  ]);
}
