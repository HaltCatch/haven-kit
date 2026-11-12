import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideTransloco, TranslocoService } from '@jsverse/transloco';
import { provideHavenTransloco } from '@haven/ui/i18n';
import english from '@haven/ui/i18n/locales/en-US.json';
import { HavenRepeat } from '@haven/ui/repeat';
import { ActionRegistry } from '@haven/runtime';
import type { ActionContext, ActionResult } from '@haven/runtime';
import type { HavenDocument, JsonObject } from '@haven/schema';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HavenRenderer } from './renderer';
import type { HavenUiEvent } from './renderer';
import type { HavenRendererHost } from './host';
import { fieldAt } from '@haven/ui/form-state';
import type { HavenActionOutcome } from './action-dispatcher';

function document(): HavenDocument {
  return {
    schemaVersion: '1.0',
    id: 'repeat-model',
    title: 'Repeated fields',
    dataSchema: {
      type: 'object',
      properties: {
        rows: {
          type: 'array',
          maxItems: 4,
          items: {
            type: 'object',
            required: ['name'],
            properties: { id: { type: 'string' }, name: { type: 'string' } },
          },
        },
      },
    },
    ui: {
      id: 'rows',
      kind: 'form.repeat',
      version: 1,
      bind: '/rows',
      props: { title: 'Rows' },
      children: [
        { id: 'id', kind: 'field.text', version: 1, bind: '/id', props: { label: 'ID' } },
        { id: 'name', kind: 'field.text', version: 1, bind: '/name', props: { label: 'Name' } },
      ],
    },
    theme: { preset: 'material', mode: 'dark', density: 'comfortable' },
    actions: {},
    resources: {},
  };
}
const initial = (): JsonObject => ({
  rows: [
    { id: 'same', name: 'First' },
    { id: 'same', name: 'Second' },
  ],
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
beforeEach(() => {
  TestBed.configureTestingModule({
    providers: [
      provideTransloco({
        config: { defaultLang: 'en-US', availableLangs: ['en-US'], prodMode: true },
      }),
      provideHavenTransloco(),
    ],
  });
  TestBed.inject(TranslocoService).setTranslation({ haven: english }, 'en-US');
});
afterEach(() => TestBed.resetTestingModule());
async function render(model = document(), value = initial(), host: HavenRendererHost = {}) {
  const fixture = TestBed.createComponent(HavenRenderer);
  fixture.componentRef.setInput('document', model);
  fixture.componentRef.setInput('value', value);
  fixture.componentRef.setInput('host', host);
  await fixture.whenStable();
  expect(fixture.componentInstance.validation().diagnostics).toEqual([]);
  return fixture;
}
function repeats(fixture: ComponentFixture<HavenRenderer>): HavenRepeat[] {
  return fixture.debugElement
    .queryAll(By.directive(HavenRepeat))
    .map((entry) => entry.componentInstance as HavenRepeat);
}
function inputs(fixture: ComponentFixture<HavenRenderer>): HTMLInputElement[] {
  return [
    ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLInputElement>(
      'haven-text-field input',
    ),
  ];
}
function input(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('blur'));
}

describe('model-driven native Signal Forms repeated objects', () => {
  it('commits middle insertion, removal and reorder without persisted synthetic keys', async () => {
    const fixture = await render(),
      renderer = fixture.componentInstance;
    const events: HavenUiEvent[] = [];
    renderer.uiEvent.subscribe((event) => events.push(event));
    const repeat = repeats(fixture)[0]!;
    const originalKeys = repeat.items().map((row) => row.key);
    expect(new Set(originalKeys).size).toBe(2);
    repeat.requestInsert(1);
    await fixture.whenStable();
    expect(structuredClone(renderer.value()['rows'])).toEqual([
      { id: 'same', name: 'First' },
      { id: '', name: '' },
      { id: 'same', name: 'Second' },
    ]);
    expect(repeat.items()[0]!.key).toBe(originalKeys[0]);
    expect(repeat.items()[2]!.key).toBe(originalKeys[1]);
    expect(fieldAt(renderer.fields()!, '/rows')!().dirty()).toBe(true);
    expect(fieldAt(renderer.fields()!, '/rows')!().touched()).toBe(true);
    repeat.requestMove(originalKeys[1]!, 0);
    await fixture.whenStable();
    expect((renderer.value()['rows'] as JsonObject[]).map((row) => row['name'])).toEqual([
      'Second',
      'First',
      '',
    ]);
    repeat.requestRemove(repeat.items()[2]!.key);
    await fixture.whenStable();
    expect(structuredClone(renderer.value()['rows'])).toEqual([
      { id: 'same', name: 'Second' },
      { id: 'same', name: 'First' },
    ]);
    expect(events.map((event) => event.event)).toEqual(['add', 'reorder', 'remove']);
    expect(events[0]!.value).toEqual({ index: 1, item: { id: '', name: '' } });
    expect(Object.keys((renderer.value()['rows'] as JsonObject[])[0]!)).toEqual(['id', 'name']);
  });
  it('keeps field tree, native input and dirty/touched identity while editing IDs and moving rows', async () => {
    const fixture = await render(),
      renderer = fixture.componentInstance,
      repeat = repeats(fixture)[0]!;
    const originalField = fieldAt(renderer.fields()!, '/rows/1/name')!;
    const originalInput = inputs(fixture)[3]!;
    const key = repeat.items()[1]!.key;
    input(originalInput, 'Edited');
    input(inputs(fixture)[2]!, 'id-is-editable');
    await fixture.whenStable();
    expect(repeat.items()[1]!.key).toBe(key);
    expect(originalField().dirty()).toBe(true);
    expect(originalField().touched()).toBe(true);
    repeat.requestMove(key, 0);
    await fixture.whenStable();
    expect(fieldAt(renderer.fields()!, '/rows/0/name')).toBe(originalField);
    expect(inputs(fixture)[1]).toBe(originalInput);
    expect(originalInput.value).toBe('Edited');
    expect(originalField().dirty()).toBe(true);
    expect(originalField().touched()).toBe(true);
    expect(structuredClone((renderer.value()['rows'] as JsonObject[])[0])).toEqual({
      id: 'id-is-editable',
      name: 'Edited',
    });
    repeat.requestInsert(0);
    await fixture.whenStable();
    expect(fieldAt(renderer.fields()!, '/rows/1/name')).toBe(originalField);
    expect(inputs(fixture)[3]).toBe(originalInput);
  });
  it('validates array bounds and required children through native applyEach', async () => {
    const model = document();
    model.dataSchema.properties!['rows']!.minItems = 1;
    model.dataSchema.properties!['rows']!.maxItems = 2;
    model.ui.rules = { required: { op: 'eq', left: { literal: true }, right: { literal: true } } };
    const fixture = await render(model, { rows: [] }),
      renderer = fixture.componentInstance;
    const repeat = repeats(fixture)[0]!;
    expect(fieldAt(renderer.fields()!, '/rows')!().valid()).toBe(false);
    repeat.requestInsert();
    await fixture.whenStable();
    expect(fieldAt(renderer.fields()!, '/rows/0/name')!().valid()).toBe(false);
    expect(repeat.canRemove()).toBe(false);
    input(inputs(fixture)[1]!, 'Required value');
    await fixture.whenStable();
    expect(renderer.fields()!().valid()).toBe(true);
    repeat.requestInsert();
    await fixture.whenStable();
    expect(repeat.canInsert()).toBe(false);
    repeat.requestInsert();
    expect(renderer.value()['rows'] as JsonObject[]).toHaveLength(2);
    expect(renderer.fields()!().valid()).toBe(false);
    repeat.requestRemove(repeat.items()[1]!.key);
    await fixture.whenStable();
    expect(renderer.fields()!().valid()).toBe(true);
  });
  it('inherits readonly and disabled for proposals and projected fields', async () => {
    const model = document();
    model.ui.props!['readonly'] = true;
    const fixture = await render(model),
      renderer = fixture.componentInstance;
    const repeat = repeats(fixture)[0]!;
    const original = structuredClone(renderer.value());
    expect(inputs(fixture).every((control) => control.readOnly)).toBe(true);
    repeat.requestInsert();
    repeat.requestRemove(repeat.items()[0]!.key);
    repeat.requestMove(repeat.items()[0]!.key, 1);
    expect(structuredClone(renderer.value())).toEqual(original);
    const disabled = structuredClone(model);
    disabled.ui.props!['readonly'] = false;
    disabled.ui.rules = {
      disabled: { op: 'eq', left: { literal: true }, right: { literal: true } },
    };
    fixture.componentRef.setInput('document', disabled);
    await fixture.whenStable();
    expect(inputs(fixture).every((control) => control.disabled)).toBe(true);
    repeat.requestInsert();
    repeat.requestRemove(repeat.items()[0]!.key);
    expect(structuredClone(renderer.value())).toEqual(original);
  });
  it('scopes nested repeats and their native validation to the containing item', async () => {
    const model = document();
    model.dataSchema.properties!['rows']!.items!.properties!['details'] = {
      type: 'array',
      items: { type: 'object', required: ['label'], properties: { label: { type: 'string' } } },
    };
    model.ui.children!.push({
      id: 'details',
      kind: 'form.repeat',
      version: 1,
      bind: '/details',
      props: { title: 'Details' },
      children: [
        {
          id: 'detail-label',
          kind: 'field.text',
          version: 1,
          bind: '/label',
          props: { label: 'Detail' },
        },
      ],
    });
    const fixture = await render(model, {
        rows: [
          { id: 'a', name: 'A', details: [{ label: 'A detail' }] },
          { id: 'b', name: 'B', details: [{ label: 'B detail' }] },
        ],
      }),
      renderer = fixture.componentInstance;
    const [outer, firstDetails, secondDetails] = repeats(fixture);
    firstDetails!.requestInsert();
    await fixture.whenStable();
    expect(fieldAt(renderer.fields()!, '/rows/0/details/1/label')!().valid()).toBe(false);
    expect(fieldAt(renderer.fields()!, '/rows/1/details/0/label')!().valid()).toBe(true);
    const stable = fieldAt(renderer.fields()!, '/rows/1/details/0/label')!;
    outer!.requestMove(outer!.items()[1]!.key, 0);
    await fixture.whenStable();
    expect(fieldAt(renderer.fields()!, '/rows/0/details/0/label')).toBe(stable);
    expect(repeats(fixture)[1]).toBe(secondDetails);
    expect(structuredClone((renderer.value()['rows'] as JsonObject[])[0]!['details'])).toEqual([
      { label: 'B detail' },
    ]);
    expect(fieldAt(renderer.fields()!, '/rows/1/details/1/label')!().valid()).toBe(false);
  });
  it('evaluates row item and root rules independently after reordering', async () => {
    const model = document();
    model.dataSchema.properties!['locked'] = { type: 'boolean' };
    model.dataSchema.properties!['rows']!.items!.properties!['show'] = { type: 'boolean' };
    model.ui.children![1]!.rules = {
      visible: { op: 'eq', left: { path: '/show', scope: 'item' }, right: { literal: true } },
      disabled: { op: 'eq', left: { path: '/locked', scope: 'root' }, right: { literal: true } },
    };
    const fixture = await render(model, {
        locked: false,
        rows: [
          { id: 'a', name: 'A', show: true },
          { id: 'b', name: '', show: false },
        ],
      }),
      renderer = fixture.componentInstance,
      repeat = repeats(fixture)[0]!;
    expect(inputs(fixture)).toHaveLength(3);
    expect(fieldAt(renderer.fields()!, '/rows/1/name')!().hidden()).toBe(true);
    expect(renderer.fields()!().valid()).toBe(true);
    repeat.requestMove(repeat.items()[1]!.key, 0);
    await fixture.whenStable();
    expect(fieldAt(renderer.fields()!, '/rows/0/name')!().hidden()).toBe(true);
    expect(fieldAt(renderer.fields()!, '/rows/1/name')!().hidden()).toBe(false);
    renderer.value.update((value) => ({ ...value, locked: true }));
    await fixture.whenStable();
    expect(fieldAt(renderer.fields()!, '/rows/1/name')!().disabled()).toBe(true);
  });
  it('reports unsupported item schemas and item-relative missing bindings without rendering fields', async () => {
    const model = document();
    model.dataSchema.properties!['rows']!.items = { type: 'string' };
    const fixture = TestBed.createComponent(HavenRenderer);
    fixture.componentRef.setInput('document', model);
    await fixture.whenStable();
    expect(fixture.componentInstance.validation().diagnostics.map((error) => error.code)).toContain(
      'repeat.items',
    );
    expect(repeats(fixture)).toHaveLength(0);
    const missing = document();
    missing.ui.children![1]!.bind = '/missing';
    fixture.componentRef.setInput('document', missing);
    await fixture.whenStable();
    expect(fixture.componentInstance.validation().diagnostics.map((error) => error.code)).toContain(
      'binding.path',
    );
    expect(inputs(fixture)).toHaveLength(0);
  });
  it('reports the host expansion limit without truncating values and recovers when the limit increases', async () => {
    const value = initial();
    const baseline = structuredClone(value);
    const fixture = await render(document(), value, { maxRenderedNodes: 3 });
    const renderer = fixture.componentInstance;
    expect(renderer.instances().exceeded).toBe(true);
    expect(renderer.fields()!().valid()).toBe(false);
    expect(
      renderer.fields()!()
        .errors()
        .map((error) => error.kind),
    ).toContain('renderLimit');
    expect(inputs(fixture)).toHaveLength(0);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')?.textContent,
    ).toContain(english['renderer.limit']);
    expect(structuredClone(renderer.value())).toEqual(baseline);
    fixture.componentRef.setInput('host', { maxRenderedNodes: 100 });
    await fixture.whenStable();
    expect(renderer.instances().exceeded).toBe(false);
    expect(inputs(fixture)).toHaveLength(4);
    expect(structuredClone(renderer.value())).toEqual(baseline);
    expect(renderer.fields()!().valid()).toBe(true);
  });
  it('runs actions in different row instances concurrently and cancels only the removed row', async () => {
    const model = document();
    model.ui.children!.push({
      id: 'run',
      kind: 'action.button',
      version: 1,
      props: { label: 'Run' },
      events: { click: ['work'] },
    });
    model.actions['work'] = {
      handler: 'test.row',
      input: { name: { path: '/name', scope: 'item' } },
    };
    const calls: {
      context: ActionContext;
      gate: ReturnType<typeof deferred<ActionResult>>;
      input: JsonObject;
    }[] = [];
    const actions = new ActionRegistry();
    actions.register({
      id: 'test.row',
      execute: (input, context) => {
        const gate = deferred<ActionResult>();
        calls.push({ input, context, gate });
        return gate.promise;
      },
    });
    const fixture = await render(model, initial(), { actions, revision: 'revision:1' }),
      renderer = fixture.componentInstance;
    const outcomes: HavenActionOutcome[] = [];
    renderer.actionResult.subscribe((outcome) => outcomes.push(outcome));
    const buttons = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'),
    ].filter((button) => button.textContent?.trim() === 'Run');
    buttons[0]!.click();
    buttons[1]!.click();
    await expect.poll(() => calls.length).toBe(2);
    expect(calls.map((call) => call.input['name'])).toEqual(['First', 'Second']);
    expect(calls.map((call) => call.context.nodeId)).toEqual(['run', 'run']);
    expect(new Set(calls.map((call) => call.context.instanceId)).size).toBe(2);
    expect(calls[0]!.context.item).toEqual({ id: 'same', name: 'First' });
    expect(Object.isFrozen(calls[0]!.context.item)).toBe(true);
    await fixture.whenStable();
    expect(buttons.every((button) => button.disabled)).toBe(true);
    const repeat = repeats(fixture)[0]!;
    repeat.requestRemove(repeat.items()[0]!.key);
    await fixture.whenStable();
    expect(calls[0]!.context.signal.aborted).toBe(true);
    expect(calls[1]!.context.signal.aborted).toBe(false);
    calls[0]!.gate.resolve({ status: 'error', code: 'stale', message: 'Removed row' });
    calls[1]!.gate.resolve({ status: 'success', value: 'kept' });
    await expect.poll(() => outcomes.length).toBe(1);
    expect(outcomes[0]!.result).toEqual({ status: 'success', value: 'kept' });
    expect(outcomes[0]!.instanceId).toBe(calls[1]!.context.instanceId);
    expect(renderer.actionDispatcher.failure()).toBeNull();
  });
});
