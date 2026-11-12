import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { HavenTreeEditor } from '@haven/ui/tree';
import { ActionRegistry } from '@haven/runtime';
import type { HavenDocument, JsonObject } from '@haven/schema';
import { expect } from 'vitest';
import { HavenRenderer } from '../../packages/ui/renderer/renderer';

export function treeEditorDocument(props: JsonObject = {}): HavenDocument {
  return {
    schemaVersion: '1.0',
    id: 'tree-editor-model',
    title: 'Controlled tree',
    dataSchema: { type: 'object', properties: {} },
    theme: { preset: 'material', mode: 'dark', density: 'comfortable' },
    resources: {},
    actions: { proposed: { handler: 'test.proposal' } },
    ui: {
      id: 'tree',
      kind: 'tree.editor',
      version: 1,
      props: {
        title: 'Editable tree',
        fixedKeys: ['root'],
        nodes: [
          {
            key: 'root',
            label: 'Root',
            children: [
              { key: 0, label: 'Numeric zero' },
              { key: '0', label: 'String zero' },
            ],
          },
        ],
        ...props,
      },
      events: {
        proposal: ['proposed'],
        activate: ['proposed'],
        expandedChange: ['proposed'],
        filterChange: ['proposed'],
      },
    },
  };
}

export async function renderTreeEditorModel(props: JsonObject = {}) {
  const f = TestBed.createComponent(HavenRenderer),
    doc = treeEditorDocument(props);
  const actions = new ActionRegistry(),
    events: unknown[] = [];
  actions.register({
    id: 'test.proposal',
    execute: async (_input, context) => {
      events.push(context.event);
      return { status: 'success' };
    },
  });
  f.componentRef.setInput('document', doc);
  f.componentRef.setInput('host', { actions, revision: 'one' });
  await f.whenStable();
  expect(f.componentInstance.validation().diagnostics).toEqual([]);
  const control = f.debugElement.query(By.directive(HavenTreeEditor))
    .componentInstance as HavenTreeEditor;
  return { f, doc, control, actions, events };
}
