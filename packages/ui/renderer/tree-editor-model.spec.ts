import { TestBed } from '@angular/core/testing';
import type { TreeEditProposal } from '@haven/schema';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { setupTreeSelection } from '../../../tests/ui/tree-selection-support';
import { renderTreeEditorModel as create } from '../../../tests/ui/tree-editor-model-support';

beforeEach(setupTreeSelection);
afterEach(() => TestBed.resetTestingModule());
const move: TreeEditProposal = { type: 'move', key: '0', parent: 'root', before: 0 };
it('emits typed pure proposals through the same model actions without mutating the source tree', async () => {
  const { f, doc, control, events } = await create(),
    baseline = structuredClone(doc);
  control.request({ owner: control.owner(), proposal: move });
  await expect.poll(() => events.length).toBe(1);
  expect(events[0]).toEqual({ type: 'proposal', value: move });
  expect(doc).toEqual(baseline);
  expect(f.componentInstance.value()).toEqual({});
});

it.each(['revision', 'nodes', 'readonly', 'movable'] as const)(
  'rejects a previous control output on a same-tick %s replacement',
  async (reason) => {
    const { f, doc, control, actions, events } = await create();
    if (reason === 'revision') f.componentRef.setInput('host', { actions, revision: 'two' });
    else {
      const changed = structuredClone(doc);
      if (reason !== 'nodes') changed.ui.props!['nodes'] = doc.ui.props!['nodes']!;
      if (reason === 'readonly') changed.ui.props!['readonly'] = true;
      if (reason === 'movable') changed.ui.props!['movable'] = false;
      f.componentRef.setInput('document', changed);
    }
    // Simulates an already queued component output before Angular propagates new inputs.
    control.proposal.emit(move);
    await f.whenStable();
    expect(events).toEqual([]);
  },
);

it('does not leak old control view state into a new renderer revision before input propagation', async () => {
  const { f, control, actions } = await create();
  f.componentRef.setInput('host', { actions, revision: 'two' });
  control.activeKey.set(0);
  control.filter.set('old filter');
  control.expandedKeys.set([0]);
  await f.whenStable();
  expect(control.activeKey()).toBeNull();
  expect(control.filter()).toBe('');
  expect(control.expandedKeys()).toEqual([]);
});
