import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TranslocoService } from '@jsverse/transloco';
import { HavenRemoteSelectField } from '@haven/ui/form';
import { fieldAt } from '@haven/ui/form-state';
import type { Option, OptionsAdapter } from '@haven/runtime';
import type { HavenDocument } from '@haven/schema';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { setupTreeSelection } from '../../../../../tests/ui/tree-selection-support';
import { HavenRenderer } from '../../renderer';

const document = (): HavenDocument => ({
  schemaVersion: '1.0',
  id: 'remote-ownership',
  title: 'Remote ownership',
  dataSchema: { type: 'object', properties: { choice: { type: 'number' } } },
  ui: {
    id: 'choice',
    kind: 'field.select',
    version: 1,
    bind: '/choice',
    props: { label: 'Choice', resource: 'source' },
  },
  theme: { preset: 'material', mode: 'dark', density: 'compact' },
  actions: {},
  resources: { source: { type: 'options', adapter: 'lookup' } },
});
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const host = (adapter: OptionsAdapter) => ({ options: new Map([['lookup', adapter]]) });
async function create(adapter: OptionsAdapter) {
  const fixture = TestBed.createComponent(HavenRenderer);
  fixture.componentRef.setInput('document', document());
  fixture.componentRef.setInput('host', host(adapter));
  fixture.componentRef.setInput('value', { choice: 0 });
  await fixture.whenStable();
  const renderer = fixture.componentInstance;
  const field = fieldAt(renderer.fields()!, '/choice')!;
  const remote = () =>
    fixture.debugElement.query(By.directive(HavenRemoteSelectField))
      .componentInstance as HavenRemoteSelectField;
  return { fixture, renderer, field, remote };
}
beforeEach(setupTreeSelection);
afterEach(() => TestBed.resetTestingModule());

it('invalidates settled option membership synchronously on locale change and rejects the old producer proof', async () => {
  const translated = deferred<Option[]>();
  const adapter: OptionsAdapter = {
    search: async () => ({ items: [] }),
    resolve: async (_keys, _signal, context) =>
      context?.locale === 'zh-CN' ? translated.promise : [{ key: 0, label: 'Zero' }],
  };
  const { fixture, renderer, field, remote } = await create(adapter);
  await expect.poll(() => field().valid()).toBe(true);
  const control = remote(),
    old = control.resolutionState();
  TestBed.inject(TranslocoService).setActiveLang('zh-CN');
  // There has been no Angular effect turn to cancel/restart the transport.
  control.resolution.emit(old);
  expect(field().valid()).toBe(false);
  expect(control.resolutionState()).toMatchObject({ locale: 'en-US', ready: false, pending: true });
  expect(renderer.value()['choice']).toBe(0);
  await fixture.whenStable();
  translated.resolve([{ key: 0, label: '零' }]);
  await expect.poll(() => field().valid()).toBe(true);
  expect(remote()).toBe(control);
  expect(control.resolutionState()).toMatchObject({ adapter, locale: 'zh-CN', ready: true });
});

it('does not relabel an old option proof with a replacement adapter while its own resolution is pending', async () => {
  const adapter: OptionsAdapter = {
    search: async () => ({ items: [] }),
    resolve: async () => [{ key: 0, label: 'Old membership' }],
  };
  const next = deferred<Option[]>(),
    replacement: OptionsAdapter = {
      search: async () => ({ items: [] }),
      resolve: () => next.promise,
    };
  const { fixture, renderer, field, remote } = await create(adapter);
  await expect.poll(() => field().valid()).toBe(true);
  const producer = remote(),
    old = producer.resolutionState();
  fixture.componentRef.setInput('host', host(replacement));
  await fixture.whenStable();
  expect(remote()).toBe(producer);
  expect(producer.adapter()).toBe(replacement);
  expect(field().valid()).toBe(false);
  // The rendered listener now captures replacement, but this output belongs to the old request.
  producer.resolution.emit(old);
  expect(field().valid()).toBe(false);
  expect(renderer.value()['choice']).toBe(0);
  next.resolve([]);
  await expect.poll(() => producer.state().resolveReady).toBe(true);
  expect(field().valid()).toBe(false);
});

it('starts a fresh request on host revision changes and rejects a captured proof from the old owner', async () => {
  const next = deferred<Option[]>();
  let calls = 0;
  const adapter: OptionsAdapter = {
    search: async () => ({ items: [] }),
    resolve: async () => (++calls === 1 ? [{ key: 0, label: 'Old revision' }] : next.promise),
  };
  const { fixture, renderer, field, remote } = await create(adapter);
  await expect.poll(() => field().valid()).toBe(true);
  const control = remote(),
    old = control.resolutionState();
  fixture.componentRef.setInput('host', { ...host(adapter), revision: 'new-revision' });
  expect(renderer.policy('/choice').remote?.[0]?.ready).toBe(false);
  await fixture.whenStable();
  expect(remote()).not.toBe(control);
  expect(calls).toBe(2);
  const currentField = fieldAt(renderer.fields()!, '/choice')!;
  expect(currentField().valid()).toBe(false);
  renderer.resolveOptions('choice', adapter, old);
  expect(currentField().valid()).toBe(false);
  next.resolve([{ key: 0, label: 'New revision' }]);
  await expect.poll(() => currentField().valid()).toBe(true);
  expect(renderer.value()['choice']).toBe(0);
});

it('restarts membership after resource binding changes even when the adapter instance and key are unchanged', async () => {
  const next = deferred<Option[]>();
  let calls = 0;
  const adapter: OptionsAdapter = {
    search: async () => ({ items: [] }),
    resolve: async () => (++calls === 1 ? [{ key: 0, label: 'Old binding' }] : next.promise),
  };
  const { fixture, renderer, field, remote } = await create(adapter);
  await expect.poll(() => field().valid()).toBe(true);
  const control = remote(),
    old = control.resolutionState(),
    model = document();
  fixture.componentRef.setInput('host', {
    options: new Map([
      ['lookup', adapter],
      ['replacement', adapter],
    ]),
  });
  fixture.componentRef.setInput('document', {
    ...model,
    resources: { source: { type: 'options', adapter: 'replacement' } },
  });
  await fixture.whenStable();
  expect(remote()).toBe(control);
  expect(control.adapter()).toBe(adapter);
  expect(calls).toBe(2);
  expect(field().valid()).toBe(false);
  control.resolution.emit(old);
  expect(field().valid()).toBe(false);
  next.resolve([{ key: 0, label: 'New binding' }]);
  await expect.poll(() => field().valid()).toBe(true);
  expect(renderer.value()['choice']).toBe(0);
});

it('keeps a settled replacement proof when an old root callback arrives with its old adapter', async () => {
  const adapter: OptionsAdapter = {
    search: async () => ({ items: [] }),
    resolve: async () => [{ key: 0, label: 'Old adapter' }],
  };
  const replacement: OptionsAdapter = {
    search: async () => ({ items: [] }),
    resolve: async () => [{ key: 0, label: 'Current adapter' }],
  };
  const { fixture, renderer, field, remote } = await create(adapter);
  await expect.poll(() => field().valid()).toBe(true);
  const old = remote().resolutionState();
  fixture.componentRef.setInput('host', host(replacement));
  await fixture.whenStable();
  await expect.poll(() => remote().resolutionState().ready).toBe(true);
  expect(remote().resolutionState().adapter).toBe(replacement);
  await expect.poll(() => field().valid()).toBe(true);
  // A delayed host callback must not evict the newer settled proof with an obsolete producer.
  renderer.resolveOptions('choice', adapter, old);
  expect(field().valid()).toBe(true);
  expect(renderer.policy('/choice').remote?.[0]?.options).toEqual([
    { key: 0, label: 'Current adapter' },
  ]);
  expect(renderer.value()['choice']).toBe(0);
});
