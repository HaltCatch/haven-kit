import type { DataSchema, HavenDocument, JsonValue } from '@haven/schema';
import { updateNode } from './tree.js';

export function setProperty(
  document: HavenDocument,
  id: string,
  name: string,
  value: JsonValue,
): HavenDocument {
  return updateNode(document, id, (node) => ({ ...node, props: { ...node.props, [name]: value } }));
}
export function setRequired(document: HavenDocument, id: string, required: boolean): HavenDocument {
  return updateNode(document, id, (node) => ({
    ...node,
    rules: {
      ...node.rules,
      required: { op: 'eq', left: { literal: required }, right: { literal: true } },
    },
  }));
}
export function replaceDataSchema(document: HavenDocument, dataSchema: DataSchema): HavenDocument {
  return { ...document, dataSchema };
}
