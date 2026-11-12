import { describe, expect, it } from 'vitest';
import { validateDocument } from '@haven/schema';
import type { HavenDocument, UiNode } from '@haven/schema';
import { validateRendererDocument } from './capabilities';

function document(node: UiNode): HavenDocument {
  if (node.kind === 'table')
    node = {
      ...node,
      bind: '/rows',
      props: {
        rowKey: '/name',
        columns: [{ id: 'name', header: 'Name', path: '/name', type: 'text' }],
      },
    };
  return {
    schemaVersion: '1.0',
    id: 'event-capabilities',
    title: 'Event capabilities',
    dataSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        rows: {
          type: 'array',
          items: { type: 'object', properties: { name: { type: 'string' } } },
        },
      },
    },
    ui: { id: 'root', kind: 'layout.stack', version: 1, children: [node] },
    actions: { test: { handler: 'host.test' } },
    resources: {},
    theme: { preset: 'material', mode: 'dark', density: 'comfortable' },
  };
}

describe('renderer event capability boundary', () => {
  it.each([
    ['form', 'submit'],
    ['form', 'reset'],
    ['table', 'rowClick'],
    ['table', 'edit'],
  ])('diagnoses the schema-valid but unimplemented %s.%s event at its node path', (kind, event) => {
    const model = document({
      id: 'target',
      kind,
      version: 1,
      events: { [event]: ['test'] },
    });
    expect(validateDocument(model).valid).toBe(true);
    const result = validateRendererDocument(model);
    expect(result.valid).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'event.unavailable',
        nodeId: 'target',
        path: `/ui/children/0/events/${event}`,
      }),
    );
  });

  it.each(['selectionChange', 'filterChange', 'viewChange', 'expandedChange'])(
    'accepts the implemented table %s event',
    (event) => {
      const model = document({
        id: 'target',
        kind: 'table',
        version: 1,
        events: { [event]: ['test'] },
      });
      expect(validateDocument(model).valid).toBe(true);
      const result = validateRendererDocument(model);
      expect(result.diagnostics).toEqual([]);
      expect(result.valid).toBe(true);
    },
  );

  it('accepts wired field and button events without requiring unused host actions', () => {
    for (const node of [
      {
        id: 'target',
        kind: 'field.text',
        version: 1,
        bind: '/name',
        events: { change: ['test'], blur: ['test'] },
      },
      { id: 'target', kind: 'action.button', version: 1, events: { click: ['test'] } },
      { id: 'target', kind: 'form', version: 1 },
    ] satisfies UiNode[])
      expect(validateRendererDocument(document(node)).valid).toBe(true);
  });
});
