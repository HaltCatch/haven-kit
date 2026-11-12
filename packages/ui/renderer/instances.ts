import { readPointer } from '@haven/schema';
import type { JsonObject, UiNode } from '@haven/schema';
import type { FieldTree } from '@angular/forms/signals';
import { fieldAt } from '@haven/ui/form-state';

export interface RenderContext {
  source: UiNode;
  scope: string;
  repeated: boolean;
}
export interface RepeatRow {
  key: string;
  value: JsonObject;
  node: UiNode;
}
export interface RenderInstances {
  root: UiNode;
  contexts: ReadonlyMap<string, RenderContext>;
  rows: ReadonlyMap<string, readonly RepeatRow[]>;
  invalidRepeats: ReadonlySet<string>;
  exceeded: boolean;
}
/** FieldTree identity is provided by Angular; no persisted synthetic keys or index tracking. */
export class RenderInstanceBuilder {
  readonly #keys = new WeakMap<object, string>();
  #sequence = 0;
  build(
    root: UiNode,
    data: JsonObject,
    fields: FieldTree<Record<string, unknown>> | undefined,
    maxNodes = 10000,
  ): RenderInstances {
    const contexts = new Map<string, RenderContext>();
    const rows = new Map<string, readonly RepeatRow[]>();
    const invalidRepeats = new Set<string>();
    let count = 0;
    const visit = (source: UiNode, scope: string, lineage: readonly string[]): UiNode => {
      // Bound materialization as well as persisted model size; nested arrays can multiply nodes.
      if (!Number.isSafeInteger(maxNodes) || maxNodes < 1 || ++count > maxNodes)
        throw new RangeError('render.limit');
      const id = lineage.length ? JSON.stringify([source.id, ...lineage]) : source.id;
      const node: UiNode = {
        ...source,
        id,
        ...(source.bind === undefined ? {} : { bind: scope + source.bind }),
      };
      contexts.set(id, { source, scope, repeated: lineage.length > 0 });
      if (source.kind !== 'form.repeat') {
        if (source.children)
          node.children = source.children.map((child) => visit(child, scope, lineage));
        return node;
      }
      const value = readPointer(data, node.bind ?? '');
      const entries: RepeatRow[] = [];
      const used = new Set<string>();
      if (
        !Array.isArray(value) ||
        value.some((item) => !item || typeof item !== 'object' || Array.isArray(item))
      ) {
        invalidRepeats.add(id);
      } else if (fields) {
        for (const [index, item] of value.entries()) {
          const pointer = `${node.bind}/${index}`;
          const field = fieldAt(fields, pointer);
          if (!field) {
            invalidRepeats.add(id);
            break;
          }
          let key = this.#keys.get(field);
          if (!key) {
            key = `row-${++this.#sequence}`;
            this.#keys.set(field, key);
          }
          if (used.has(key)) {
            invalidRepeats.add(id);
            break;
          }
          used.add(key);
          const row = visit(
            {
              id: `${source.id}:row`,
              kind: 'layout.stack',
              version: 1,
              children: source.children ?? [],
            },
            pointer,
            [...lineage, key],
          );
          entries.push({ key, value: item as JsonObject, node: row });
        }
      }
      const accepted = invalidRepeats.has(id) ? [] : entries;
      rows.set(id, accepted);
      node.children = accepted.map((row) => row.node);
      return node;
    };
    try {
      return { root: visit(root, '', []), contexts, rows, invalidRepeats, exceeded: false };
    } catch (error) {
      if (!(error instanceof RangeError) || error.message !== 'render.limit') throw error;
      return {
        root: { ...root, children: [] },
        contexts: new Map(),
        rows: new Map(),
        invalidRepeats: new Set(),
        exceeded: true,
      };
    }
  }
}
