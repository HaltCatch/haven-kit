import { TestBed } from '@angular/core/testing';
import { afterEach, expect, it, vi } from 'vitest';
import type { TableDataAdapter } from '@haven/runtime';
import { create, document } from './support';

afterEach(() => TestBed.resetTestingModule());

it('switches the model-driven table to one native collection without resetting ownership or mutating form values', async () => {
  const t = create();
  await t.fixture.whenStable();
  const table = t.table(),
    owner = table.owner(),
    handler = table.editHandler(),
    query = table.query(),
    value = t.renderer.value();
  expect(table.table.getRowModel().rows).toHaveLength(2);
  const next = structuredClone(t.model);
  next.ui.props!['virtualization'] = { viewportHeight: 240, estimateRowHeight: 48, overscan: 2 };
  t.fixture.componentRef.setInput('document', next);
  await t.fixture.whenStable();
  expect(t.renderer.validation().diagnostics).toEqual([]);
  expect(t.table()).toBe(table);
  expect(table.owner()).toBe(owner);
  expect(table.editHandler()).toBe(handler);
  expect(table.query()).toBe(query);
  expect(table.table.getRowModel().rows).toHaveLength(50);
  expect(table.exportContext().pagination).toBe('none');
  expect(t.renderer.value()).toBe(value);
  const restored = structuredClone(next);
  delete restored.ui.props!['virtualization'];
  t.fixture.componentRef.setInput('document', restored);
  await t.fixture.whenStable();
  expect(table.table.getRowModel().rows).toHaveLength(2);
  expect(table.exportContext().pagination).toBe('pages');
  expect(t.renderer.value()).toBe(value);
});

it('keeps a remote loaded page and query port unchanged when the viewport or rendering mode changes', async () => {
  const model = document();
  model.ui.props!['resource'] = 'records';
  delete model.ui.props!['editMode'];
  model.resources = { records: { type: 'query', adapter: 'host.records' } };
  const t = create(model),
    load = vi.fn(async () => ({
      rows: [
        { id: 0, name: 'Loaded row' },
        { id: 1, name: 'Second loaded row' },
      ],
      total: 500,
    }));
  const adapter: TableDataAdapter = { load };
  t.fixture.componentRef.setInput('host', { tables: new Map([['host.records', adapter]]) });
  t.fixture.componentRef.setInput('value', { rows: [] });
  await t.fixture.whenStable();
  const table = t.table(),
    owner = table.owner(),
    query = table.query();
  expect(load).toHaveBeenCalledTimes(1);
  expect(table.dataState().status).toBe('ready');
  for (const config of [{}, { viewportHeight: 320, overscan: 8 }, undefined]) {
    const next = structuredClone(model);
    if (config === undefined) delete next.ui.props!['virtualization'];
    else next.ui.props!['virtualization'] = config;
    t.fixture.componentRef.setInput('document', next);
    await t.fixture.whenStable();
    expect(t.renderer.validation().diagnostics).toEqual([]);
    expect(table.owner()).toBe(owner);
    expect(table.query()).toBe(query);
    expect(table.table.getRowModel().rows).toHaveLength(2);
    expect(table.exportContext()).toMatchObject({ pagination: 'pages', total: 500 });
    expect(load).toHaveBeenCalledTimes(1);
    expect(t.renderer.value()).toEqual({ rows: [] });
  }
});
