import { isTableColumns, resolveSchema, schemaAtPointer } from '@haven/schema';
import type { TableEditHandler } from '@haven/runtime';
import type { HavenRenderer } from './renderer';
import { tableFilterAdapter } from './table-filter-owner';

function registeredHandler(renderer: HavenRenderer, id: string): TableEditHandler | undefined {
  const name = renderer.states().get(id)?.node.props?.['editHandler'];
  return typeof name === 'string' ? renderer.host().tableEdits?.get(name) : undefined;
}

/** Read current root state, not child inputs left over from an earlier render tick. */
function editOwner(renderer: HavenRenderer, id: string): string {
  const node = renderer.states().get(id)?.node;
  const resource = node?.props?.['resource'];
  const columns = node?.props?.['columns'];
  const root = renderer.document().dataSchema;
  const item = node?.bind ? schemaAtPointer(root, node.bind)?.items : undefined;
  return JSON.stringify([
    renderer.documentIdentity(),
    node?.kind,
    renderer.instances().contexts.get(id)?.source.bind,
    resource,
    typeof resource === 'string' ? renderer.document().resources[resource] : undefined,
    node?.props?.['rowKey'],
    node?.props?.['hierarchy'],
    node?.props?.['pageSize'],
    node?.props?.['columnFilters'],
    node?.props?.['editMode'],
    node?.props?.['editHandler'],
    item ? resolveSchema(item, root) : undefined,
    root.$defs,
    isTableColumns(columns) ? columns.map((c) => [c.id, c.path, c.editor]) : columns,
  ]);
}

/** A named write port is separate from query access and must enforce actual host authorization/CAS. */
export function captureTableEditPort(renderer: HavenRenderer, id: string) {
  const key = editOwner(renderer, id);
  const handler = registeredHandler(renderer, id);
  const reader = tableFilterAdapter(renderer, id);
  const active = () => {
    const state = renderer.states().get(id);
    return (
      key === editOwner(renderer, id) &&
      handler === registeredHandler(renderer, id) &&
      reader === tableFilterAdapter(renderer, id) &&
      !!state?.visible &&
      !state.disabled &&
      !state.readonly &&
      renderer.validation().valid
    );
  };
  const remoteHandler: TableEditHandler | undefined = handler
    ? {
        commit: (request, signal) =>
          signal.aborted || !active()
            ? Promise.resolve({ status: 'error', code: 'cancelled' })
            : handler.commit(request, signal),
      }
    : undefined;
  return { key, handler, reader, active, remoteHandler };
}
