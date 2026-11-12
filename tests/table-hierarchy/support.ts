import type { JsonObject } from '@haven/schema';
import { buildTableHierarchy } from '../../packages/runtime/src/table/hierarchy/index.js';

export const hierarchy = { parentPath: '/parent', rootValue: null };
export const row = (
  id: string | number,
  parent: string | number | null,
  extra: JsonObject = {},
): JsonObject => ({ id, parent, ...extra });
export function ready(rows: JsonObject[]) {
  const result = buildTableHierarchy(rows, '/id', hierarchy);
  if (result.status !== 'ready') throw new Error(`Unexpected ${result.issue.code}`);
  return result.index;
}
