import { reconcileData } from '@haven/runtime';
import { resolveSchema } from '@haven/schema';
import type { DataSchema, JsonValue } from '@haven/schema';
/** Materialize missing native fields without erasing unknown keys or correcting existing invalid data. */
export function tableFormValue(
  schema: DataSchema,
  value: JsonValue | undefined,
  root = schema,
): JsonValue {
  if (value === undefined) return reconcileData(schema, undefined, root);
  const definition = resolveSchema(schema, root);
  if (
    definition?.type === 'object' &&
    value &&
    typeof value === 'object' &&
    !Array.isArray(value)
  ) {
    return {
      ...value,
      ...Object.fromEntries(
        Object.entries(definition.properties ?? {}).map(([key, child]) => [
          key,
          tableFormValue(child, value[key], root),
        ]),
      ),
    };
  }
  if (definition?.type === 'array' && definition.items && Array.isArray(value))
    return value.map((item) => tableFormValue(definition.items!, item, root));
  return value;
}
