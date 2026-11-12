import { applyEach } from '@angular/forms/signals';
import type { SchemaPath } from '@angular/forms/signals';
import { pointerSegments, resolveSchema } from '@haven/schema';
import type { DataSchema } from '@haven/schema';
type Indices = ReadonlyMap<number, string>;
/** Native array rules belong to applyEach, even when the UI binds a concrete item index. */
export function applyValidationTarget(
  scope: SchemaPath<unknown>,
  pointer: string,
  definition: DataSchema | undefined,
  rootSchema: DataSchema | undefined,
  depth: number,
  inherited: Indices,
  register: (path: SchemaPath<unknown>, schema: DataSchema | undefined, indices: Indices) => void,
): void {
  const segments = pointerSegments(pointer);
  const visit = (
    path: SchemaPath<unknown>,
    schema: DataSchema | undefined,
    offset: number,
    indices: Indices,
  ) => {
    const node = schema && rootSchema ? resolveSchema(schema, rootSchema) : schema;
    if (offset === segments.length) return register(path, node, indices);
    const segment = segments[offset]!;
    if (node?.type === 'array') {
      const next = new Map(indices).set(depth + offset, segment);
      applyEach(path as SchemaPath<unknown[]>, (child) =>
        visit(child as SchemaPath<unknown>, node.items, offset + 1, next),
      );
    } else {
      visit(
        (path as unknown as Record<string, SchemaPath<unknown>>)[segment]!,
        node?.properties?.[segment],
        offset + 1,
        indices,
      );
    }
  };
  visit(scope, definition, 0, inherited);
}
