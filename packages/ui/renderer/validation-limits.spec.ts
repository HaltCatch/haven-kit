import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActionRegistry } from '@haven/runtime';
import { HavenTreeEditor } from '@haven/ui/tree';
import { fieldAt } from '@haven/ui/form-state';
import { defaultLimits, validateDocument } from '@haven/schema';
import type { ComponentManifest, ValidationOptions } from '@haven/schema';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { setupValidationTests } from '../../../tests/ui/validation-support';
import {
  deepProjection,
  largeDocument,
  limitDocument,
} from '../../../tests/ui/renderer-limit-support';
import { validateRendererDocument } from './capabilities';
import { HavenRenderer } from './renderer';

beforeEach(setupValidationTests);
afterEach(() => TestBed.resetTestingModule());
const extended = { maxDepth: defaultLimits.maxDepth + 8, maxBytes: defaultLimits.maxBytes * 2 };

it('keeps source/API defaults while a trusted embedding may budget for projection wrappers', () => {
  const { source, projected } = deepProjection();
  expect(validateDocument(source).diagnostics).toEqual([]);
  expect(validateRendererDocument(projected).diagnostics.map((error) => error.code)).toContain(
    'limit.complexity',
  );
  expect(validateRendererDocument(projected, { limits: extended }).diagnostics).toEqual([]);
  expect(validateDocument(projected).valid).toBe(false);
  expect(defaultLimits.maxDepth).toBe(48);
  expect(defaultLimits.maxBytes).toBe(1_048_576);
});

it('does not relax byte budgets unless the host explicitly changes that particular bound', () => {
  const model = largeDocument();
  expect(validateRendererDocument(model).diagnostics.map((error) => error.code)).toContain(
    'limit.bytes',
  );
  expect(validateRendererDocument(model, { limits: { maxDepth: extended.maxDepth } }).valid).toBe(
    false,
  );
  expect(validateRendererDocument(model, { limits: extended }).diagnostics).toEqual([]);
});

it('keeps fixed renderer capability/event checks and the remaining native resource bounds', () => {
  const manifest: ComponentManifest = {
    kind: 'custom.host',
    version: 1,
    title: 'Unimplemented',
    container: false,
    binding: 'none',
    dataTypes: [],
    events: [],
    properties: {},
  };
  const forged: ValidationOptions = {
    limits: extended,
    supportedCapabilities: ['custom.host@1'],
    manifests: new Map([['custom.host@1', manifest]]),
  };
  expect(
    validateRendererDocument(
      limitDocument({ id: 'custom', kind: 'custom.host', version: 1 }),
      forged,
    ).diagnostics.map((error) => error.code),
  ).toEqual(expect.arrayContaining(['component.unknown', 'component.unsupported']));
  const event = limitDocument({
    id: 'form',
    kind: 'form',
    version: 1,
    events: { submit: ['test'] },
  });
  event.actions = { test: { handler: 'host.test' } };
  expect(validateDocument(event).valid).toBe(true);
  expect(
    validateRendererDocument(event, { limits: extended }).diagnostics.map((error) => error.code),
  ).toContain('event.unavailable');
  const { source } = deepProjection();
  expect(
    validateRendererDocument(source, { limits: { ...extended, maxNodes: 2 } }).diagnostics.map(
      (error) => error.code,
    ),
  ).toContain('limit.nodes');
  event.ui.rules = {
    visible: {
      op: 'and',
      conditions: [
        { op: 'eq', left: { literal: true }, right: { literal: true } },
        { op: 'eq', left: { literal: true }, right: { literal: true } },
      ],
    },
  };
  expect(
    validateRendererDocument(event, { limits: { ...extended, maxRuleNodes: 1 } }).diagnostics.map(
      (error) => error.code,
    ),
  ).toContain('limit.rules');
});

it('rejects budget configuration inside JSON component props', () => {
  const model = limitDocument({
    id: 'tree',
    kind: 'tree.editor',
    version: 1,
    props: { nodes: [], validationLimits: extended },
  });
  expect(validateRendererDocument(model, { limits: extended }).diagnostics).toContainEqual(
    expect.objectContaining({ code: 'property.unknown', path: '/ui/props/validationLimits' }),
  );
});

it('renders the real deep tree only when explicitly embedded with an appropriate trusted budget', async () => {
  const { projected } = deepProjection(),
    fixture = TestBed.createComponent(HavenRenderer);
  fixture.componentRef.setInput('document', projected);
  await fixture.whenStable();
  expect(fixture.componentInstance.validation().valid).toBe(false);
  expect((fixture.nativeElement as HTMLElement).querySelector('haven-tree-editor')).toBeNull();
  fixture.componentRef.setInput('validationLimits', extended);
  await fixture.whenStable();
  expect(fixture.componentInstance.validation().diagnostics).toEqual([]);
  const tree = fixture.debugElement.query(By.directive(HavenTreeEditor))
    .componentInstance as HavenTreeEditor;
  tree.expandedKeys.set(Array.from({ length: 22 }, (_, level) => `level-${level}`));
  await fixture.whenStable();
  expect((fixture.nativeElement as HTMLElement).querySelectorAll('mat-tree-node')).toHaveLength(23);
  expect((fixture.nativeElement as HTMLElement).textContent).toContain('Deep leaf');
});

it('rejects same-tick submission and queued actions when the host shrinks an otherwise unchanged model budget', async () => {
  const button = { id: 'button', kind: 'action.button', version: 1, events: { click: ['test'] } };
  const model = limitDocument({
      id: 'form',
      kind: 'form',
      version: 1,
      children: [
        button,
        { id: 'name', kind: 'field.text', version: 1, bind: '/name', props: { label: 'Name' } },
      ],
    }),
    fixture = TestBed.createComponent(HavenRenderer);
  model.dataSchema.properties = { name: { type: 'string' } };
  const execute = vi.fn(async () => ({ status: 'success' as const })),
    actions = new ActionRegistry();
  actions.register({ id: 'host.test', execute });
  model.actions = { test: { handler: 'host.test' } };
  fixture.componentRef.setInput('document', model);
  fixture.componentRef.setInput('value', { name: 'Typed value' });
  fixture.componentRef.setInput('host', { actions });
  await fixture.whenStable();
  expect(fixture.componentInstance.fields()).toBeDefined();
  expect(fieldAt(fixture.componentInstance.fields()!, '/name')!().value()).toBe('Typed value');
  fixture.componentInstance.dispatch(button, 'click');
  fixture.componentRef.setInput('validationLimits', { maxBytes: 1 });
  const save = vi.fn(async () => undefined);
  expect(await fixture.componentInstance.submit({ action: save })).toBe(false);
  await fixture.whenStable();
  expect(save).not.toHaveBeenCalled();
  expect(execute).not.toHaveBeenCalled();
});

it('does not replace native form interaction state when a changed host budget still accepts the model', async () => {
  const model = limitDocument({
    id: 'name',
    kind: 'field.text',
    version: 1,
    bind: '/name',
    props: { label: 'Name' },
  });
  model.dataSchema.properties = { name: { type: 'string' } };
  const fixture = TestBed.createComponent(HavenRenderer);
  fixture.componentRef.setInput('document', model);
  fixture.componentRef.setInput('value', { name: 'Typed value' });
  await fixture.whenStable();
  const tree = fixture.componentInstance.fields()!,
    field = fieldAt(tree, '/name')!();
  field.markAsTouched();
  field.markAsDirty();
  fixture.componentRef.setInput('validationLimits', extended);
  await fixture.whenStable();
  expect(fixture.componentInstance.fields()).toBe(tree);
  expect(field.touched()).toBe(true);
  expect(field.dirty()).toBe(true);
  expect(field.value()).toBe('Typed value');
});

it('does not confirm an in-flight native submission after its host budget becomes invalid', async () => {
  const fixture = TestBed.createComponent(HavenRenderer);
  fixture.componentRef.setInput(
    'document',
    limitDocument({ id: 'form', kind: 'form', version: 1 }),
  );
  await fixture.whenStable();
  let finish: (() => void) | undefined;
  const submission = fixture.componentInstance.submit({
    action: () =>
      new Promise<undefined>((resolve) => {
        finish = () => resolve(undefined);
      }),
  });
  await expect.poll(() => typeof finish).toBe('function');
  fixture.componentRef.setInput('validationLimits', { maxBytes: 1 });
  finish!();
  expect(await submission).toBe(false);
  await fixture.whenStable();
  fixture.componentRef.setInput('validationLimits', {});
  await fixture.whenStable();
  expect(await fixture.componentInstance.submit({ action: async () => undefined })).toBe(true);
});
