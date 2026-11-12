/** Native JSON Schema; resolved node/data contracts are shared with the document schema. */
export function editingSchema(document) {
  const id = document.properties.id;
  const token = { type: 'string', minLength: 1, maxLength: 160 };
  const pointer = { type: 'string', maxLength: 2048, pattern: '^(?:/(?:[^~/]|~[01])*)*$' };
  const object = (properties, required = Object.keys(properties)) => ({
    type: 'object',
    properties,
    required,
    additionalProperties: false,
  });
  const patch = {
    type: 'array',
    minItems: 1,
    maxItems: 64,
    items: {
      oneOf: [
        object({
          op: { enum: ['add', 'replace', 'test'] },
          path: pointer,
          value: { $ref: '#/$defs/json' },
        }),
        object({ op: { const: 'remove' }, path: pointer }),
        object({ op: { enum: ['copy', 'move'] }, path: pointer, from: pointer }),
      ],
    },
  };
  const location = { parentId: id, beforeId: { anyOf: [id, { type: 'null' }] } };
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      protocolVersion: { const: '1.0' },
      operationId: token,
      expected: object({
        documentId: id,
        sessionId: token,
        editRevision: { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
      }),
      commands: {
        type: 'array',
        minItems: 1,
        maxItems: 128,
        items: {
          oneOf: [
            object(
              {
                type: { const: 'node.insert' },
                ...location,
                node: { $ref: '#/$defs/node' },
                defaults: object(
                  { schema: { $ref: '#/$defs/data' }, resources: document.properties.resources },
                  [],
                ),
              },
              ['type', 'parentId', 'beforeId', 'node'],
            ),
            object({ type: { const: 'node.move' }, nodeId: id, ...location }),
            object({ type: { const: 'node.remove' }, nodeId: id }),
            object({ type: { const: 'node.patch' }, nodeId: id, patch }),
            object({ type: { const: 'document.patch' }, patch }),
          ],
        },
      },
    },
    required: ['protocolVersion', 'operationId', 'expected', 'commands'],
    $defs: document.$defs,
  };
}
