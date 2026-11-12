import { pointerSegments, resolveSchema } from '@haven/schema';
import type { DataSchema, HavenDocument, UiNode } from '@haven/schema';
import { HavenEditingError } from './errors.js';

/** Layouts retain their parent's data context; each repeat enters its array item. */
function repeatBindings(root: UiNode, parentId: string): string[] {
  function find(node: UiNode, ancestors: UiNode[]): UiNode[] | undefined {
    const path = [...ancestors, node];
    if (node.id === parentId) return path;
    for (const child of node.children ?? []) {
      const found = find(child, path);
      if (found) return found;
    }
    return undefined;
  }
  const path = find(root, []);
  if (!path) throw new HavenEditingError('editing.moveTarget');
  return path
    .filter((node) => node.kind === 'form.repeat')
    .map((node) => {
      if (typeof node.bind !== 'string') throw new HavenEditingError('editing.editScope');
      return node.bind;
    });
}
function segments(bind: string): string[] {
  try {
    return pointerSegments(bind);
  } catch {
    throw new HavenEditingError('editing.editScope');
  }
}
/** Compare data contexts, not editable UI IDs or shared schema object identities. */
export function sameDataScope(document: HavenDocument, left: string, right: string): boolean {
  return (
    JSON.stringify(repeatBindings(document.ui, left).map(segments)) ===
    JSON.stringify(repeatBindings(document.ui, right).map(segments))
  );
}

export function insertScopeProperty(
  document: HavenDocument,
  parentId: string,
  name: string,
  field: DataSchema,
): DataSchema {
  // Check new property names with the same pointer safety contract as existing bindings.
  segments(`/${name.replace(/~/g, '~0').replace(/\//g, '~1')}`);
  const bindings = repeatBindings(document.ui, parentId).map(segments);
  const root = document.dataSchema;
  function resolved(schema: DataSchema): DataSchema {
    if (
      schema.$ref &&
      Object.keys(schema).some((key) => key !== '$ref' && !(schema === root && key === '$defs'))
    )
      throw new HavenEditingError('editing.editScope');
    try {
      const value = resolveSchema(schema, root);
      if (value) return value;
    } catch {
      // Surface malformed intermediate references as a editing diagnostic.
    }
    throw new HavenEditingError('editing.editScope');
  }
  function atPath(
    schema: DataSchema,
    path: readonly string[],
    update: (schema: DataSchema) => DataSchema,
  ): DataSchema {
    const current = resolved(schema);
    if (!path.length) return update(current);
    const [key, ...rest] = path;
    if (current.type === 'array' && /^(0|[1-9][0-9]*)$/.test(key!) && current.items)
      return { ...current, items: atPath(current.items, rest, update) };
    if (current.type !== 'object' || !Object.hasOwn(current.properties ?? {}, key!))
      throw new HavenEditingError('editing.editScope');
    return {
      ...current,
      properties: {
        ...current.properties,
        [key!]: atPath(current.properties![key!]!, rest, update),
      },
    };
  }
  function enter(schema: DataSchema, depth: number): DataSchema {
    const current = resolved(schema);
    if (depth === bindings.length) {
      if (current.type !== 'object') throw new HavenEditingError('editing.editScope');
      if (Object.hasOwn(current.properties ?? {}, name))
        throw new HavenEditingError('editing.bindingCollision');
      return { ...current, properties: { ...current.properties, [name]: field } };
    }
    return atPath(current, bindings[depth]!, (array) => {
      if (array.type !== 'array' || !array.items) throw new HavenEditingError('editing.editScope');
      return { ...array, items: enter(array.items, depth + 1) };
    });
  }
  // Copy on write expands only references on the edited path. Shared definitions
  // and all other consumers retain their original schemas and bindings.
  const updated = enter(root, 0);
  return root.$defs ? { ...updated, $defs: root.$defs } : updated;
}
