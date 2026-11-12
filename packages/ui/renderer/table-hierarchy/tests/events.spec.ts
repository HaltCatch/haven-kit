import { TestBed } from '@angular/core/testing';
import { ActionRegistry } from '@haven/runtime';
import type { ActionContext } from '@haven/runtime';
import type { JsonObject } from '@haven/schema';
import { afterEach, expect, it } from 'vitest';
import { renderHierarchy } from './support';

afterEach(() => TestBed.resetTestingModule());

it('runs declared expansion actions with typed keys in the current host and rejects queued or mounted old-owner events', async () => {
  const t = await renderHierarchy();
  const previous: { input: JsonObject; context: ActionContext }[] = [],
    current: { input: JsonObject; context: ActionContext }[] = [];
  const registry = (target: typeof previous) => {
    const actions = new ActionRegistry();
    actions.register({
      id: 'test.expanded',
      execute: async (input, context) => {
        target.push({ input, context });
        return { status: 'success' };
      },
    });
    return actions;
  };
  const model = structuredClone(t.document);
  model.ui.props!['expandedRowKeys'] = [];
  model.ui.events = { expandedChange: ['expanded'] };
  model.actions = {
    expanded: {
      handler: 'test.expanded',
      input: { keys: { scope: 'event', path: '/value' } },
    },
  };
  t.fixture.componentRef.setInput('document', model);
  t.fixture.componentRef.setInput('host', { actions: registry(previous), revision: 'numeric' });
  await t.fixture.whenStable();
  expect(t.renderer.validation().diagnostics).toEqual([]);
  const events: unknown[] = [];
  t.renderer.uiEvent.subscribe((event) => events.push(event));
  const toggle = () => t.element.querySelector<HTMLButtonElement>('tbody button[aria-expanded]')!;
  const oldToggle = toggle();
  oldToggle.click();
  await expect.poll(() => previous.length).toBe(1);
  expect(previous[0]!.input).toEqual({ keys: [0] });
  expect(previous[0]!.context.event).toEqual({ type: 'expandedChange', value: [0] });
  expect(previous[0]!.context.revision).toBe('numeric');
  expect(previous[0]!.context.nodeId).toBe('records');
  expect(Object.isFrozen(previous[0]!.context.event)).toBe(true);
  expect(Object.isFrozen((previous[0]!.context.event as JsonObject)['value'])).toBe(true);
  await t.fixture.whenStable();

  // This real collapse queues an action; replacing its owner in the same tick must cancel it.
  oldToggle.click();
  expect(events).toEqual([
    { nodeId: 'records', event: 'expandedChange', value: [0] },
    { nodeId: 'records', event: 'expandedChange', value: [] },
  ]);
  const replacement = structuredClone(model);
  replacement.id = 'string-hierarchy';
  replacement.ui.props!['hierarchy'] = { parentPath: '/parent', rootValue: '' };
  const properties = replacement.dataSchema.properties!['rows']!.items!.properties!;
  properties['id'] = { type: 'string' };
  properties['parent'] = { type: 'string' };
  t.fixture.componentRef.setInput('document', replacement);
  t.fixture.componentRef.setInput('value', {
    rows: [
      { id: '0', parent: '', name: 'String root', note: 'Root' },
      { id: '1', parent: '0', name: 'String child', note: 'Child' },
    ],
  });
  t.fixture.componentRef.setInput('host', { actions: registry(current), revision: 'string' });
  // A mounted control can emit before Angular propagates the replacement inputs.
  oldToggle.click();
  expect(events).toHaveLength(2);
  await t.fixture.whenStable();
  expect(previous).toHaveLength(1);
  expect(current).toEqual([]);
  expect(t.renderer.validation().diagnostics).toEqual([]);
  expect(toggle()).not.toBe(oldToggle);
  expect(toggle().getAttribute('aria-expanded')).toBe('false');
  toggle().click();
  await expect.poll(() => current.length).toBe(1);
  expect(current[0]!.input).toEqual({ keys: ['0'] });
  expect(current[0]!.context.event).toEqual({ type: 'expandedChange', value: ['0'] });
  expect(current[0]!.context.documentId).toBe('string-hierarchy');
  expect(current[0]!.context.revision).toBe('string');
  expect(current[0]!.context.data).toEqual({
    rows: [
      { id: '0', parent: '', name: 'String root', note: 'Root' },
      { id: '1', parent: '0', name: 'String child', note: 'Child' },
    ],
  });
  expect(previous).toHaveLength(1);
  expect(model.ui.props!['expandedRowKeys']).toEqual([]);
  expect(replacement.ui.props!['expandedRowKeys']).toEqual([]);
});
