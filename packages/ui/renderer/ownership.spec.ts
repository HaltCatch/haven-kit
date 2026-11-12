import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideTransloco, TranslocoService } from '@jsverse/transloco';
import { provideHavenTransloco } from '@haven/ui/i18n';
import { HavenRemoteSelectField } from '@haven/ui/form';
import type { Option, OptionsAdapter } from '@haven/runtime';
import type { HavenDocument } from '@haven/schema';
import english from '@haven/ui/i18n/locales/en-US.json';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HavenRenderer } from './renderer';
import { fieldAt } from '@haven/ui/form-state';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
function document(): HavenDocument {
  return {
    schemaVersion: '1.0',
    id: 'first',
    title: 'Ownership',
    dataSchema: {
      type: 'object',
      properties: { choice: { type: 'number' }, name: { type: 'string' } },
    },
    ui: {
      id: 'root',
      kind: 'form',
      version: 1,
      children: [
        {
          id: 'choice',
          kind: 'field.select',
          version: 1,
          bind: '/choice',
          props: { label: 'Choice', resource: 'source' },
        },
        { id: 'name', kind: 'field.text', version: 1, bind: '/name', props: { label: 'Name' } },
      ],
    },
    theme: { preset: 'material', mode: 'light', density: 'comfortable' },
    actions: {},
    resources: { source: { type: 'options', adapter: 'test.options' } },
  };
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

async function setup(source: OptionsAdapter) {
  const fixture = TestBed.createComponent(HavenRenderer);
  const model = document();
  const host = { options: new Map([['test.options', source]]), revision: 'version:1' };
  fixture.componentRef.setInput('document', model);
  fixture.componentRef.setInput('host', host);
  fixture.componentRef.setInput('value', { choice: 0, name: 'Initial' });
  await fixture.whenStable();
  const remote = () =>
    fixture.debugElement.query(By.directive(HavenRemoteSelectField))
      .componentInstance as HavenRemoteSelectField;
  const name = () =>
    (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
      '[data-node-id="name"] input',
    )!;
  return { fixture, model, host, remote, name };
}

describe('renderer document ownership', () => {
  it.each(['document', 'revision'] as const)(
    'cancels old searches and resolutions on %s switch even with the same adapter and selected key',
    async (reason) => {
      const resolutions: { signal: AbortSignal; gate: ReturnType<typeof deferred<Option[]>> }[] =
        [];
      const oldSearch = deferred<{ items: Option[] }>();
      let searchSignal: AbortSignal | undefined;
      const source: OptionsAdapter = {
        resolve: (_keys, signal) => {
          const gate = deferred<Option[]>();
          resolutions.push({ signal, gate });
          return gate.promise;
        },
        search: ({ signal }) => {
          searchSignal = signal;
          return oldSearch.promise;
        },
      };
      const { fixture, model, host, remote } = await setup(source);
      const oldControl = remote();
      oldControl.query('old query');
      await fixture.whenStable();
      await expect.poll(() => searchSignal).toBeDefined();
      expect(resolutions).toHaveLength(1);
      if (reason === 'document')
        fixture.componentRef.setInput('document', { ...model, id: 'second' });
      else fixture.componentRef.setInput('host', { ...host, revision: 'version:2' });
      await fixture.whenStable();
      expect(resolutions[0]!.signal.aborted).toBe(true);
      expect(searchSignal!.aborted).toBe(true);
      expect(remote()).not.toBe(oldControl);
      expect(remote().queryText()).toBe('');
      expect(resolutions).toHaveLength(2);
      resolutions[0]!.gate.resolve([{ key: 0, label: 'Old resolved label' }]);
      oldSearch.resolve({ items: [{ key: 1, label: 'Old search result' }] });
      await fixture.whenStable();
      expect(remote().state().resolved).toEqual([]);
      expect(remote().state().items).toEqual([]);
      expect(fixture.componentInstance.fields()!().valid()).toBe(false);
      expect(fixture.componentInstance.value()).toEqual({ choice: 0, name: 'Initial' });
      resolutions[1]!.gate.resolve([{ key: 0, label: 'New resolved label' }]);
      await expect.poll(() => fixture.componentInstance.fields()!().valid()).toBe(true);
      expect(remote().selected()[0]!.label).toBe('New resolved label');
    },
  );

  it.each(['document', 'revision'] as const)(
    'starts a fresh interaction state on %s switch without clearing model data',
    async (reason) => {
      const source: OptionsAdapter = {
        search: async () => ({ items: [] }),
        resolve: async () => [{ key: 0, label: 'Zero' }],
      };
      const { fixture, model, host, name } = await setup(source);
      const originalInput = name();
      originalInput.value = 'Edited';
      originalInput.dispatchEvent(new Event('input', { bubbles: true }));
      originalInput.dispatchEvent(new Event('blur'));
      await fixture.whenStable();
      const oldField = fieldAt(fixture.componentInstance.fields()!, '/name')!;
      expect(oldField().dirty()).toBe(true);
      expect(oldField().touched()).toBe(true);
      if (reason === 'document')
        fixture.componentRef.setInput('document', { ...model, id: 'second' });
      else fixture.componentRef.setInput('host', { ...host, revision: 'version:2' });
      await fixture.whenStable();
      const nextField = fieldAt(fixture.componentInstance.fields()!, '/name')!;
      expect(nextField).not.toBe(oldField);
      expect(nextField().dirty()).toBe(false);
      expect(nextField().touched()).toBe(false);
      expect(name()).not.toBe(originalInput);
      expect(name().value).toBe('Edited');
      expect(fixture.componentInstance.value()).toEqual({ choice: 0, name: 'Edited' });
    },
  );

  it('invalidates cached resolution immediately when document identity changes', async () => {
    const next = deferred<Option[]>();
    let calls = 0;
    const source: OptionsAdapter = {
      search: async () => ({ items: [] }),
      resolve: async () =>
        ++calls === 1 ? [{ key: 0, label: 'Previous document' }] : next.promise,
    };
    const { fixture, model } = await setup(source);
    await expect.poll(() => fixture.componentInstance.fields()!().valid()).toBe(true);
    fixture.componentRef.setInput('document', { ...model, id: 'second' });
    // Validation must not use the old ready cache even before the new view is created.
    expect(fixture.componentInstance.policy('/choice').remote).toEqual([
      { keys: [], options: [], pending: true, ready: false, failed: false },
    ]);
    await fixture.whenStable();
    expect(fixture.componentInstance.fields()!().valid()).toBe(false);
    next.resolve([]);
    await fixture.whenStable();
    await expect
      .poll(() => fixture.componentInstance.policy('/choice').remote?.[0]?.ready)
      .toBe(true);
    expect(fixture.componentInstance.fields()!().valid()).toBe(false);
    expect(fixture.componentInstance.value()['choice']).toBe(0);
  });

  it('preserves controls, in-flight work and interaction state for same-document label/theme edits', async () => {
    const gate = deferred<Option[]>();
    let signal: AbortSignal | undefined;
    const source: OptionsAdapter = {
      search: async () => ({ items: [] }),
      resolve: (_keys, current) => {
        signal = current;
        return gate.promise;
      },
    };
    const { fixture, model, remote, name } = await setup(source);
    const originalInput = name(),
      originalControl = remote();
    originalInput.value = 'Edited';
    originalInput.dispatchEvent(new Event('input', { bubbles: true }));
    originalInput.dispatchEvent(new Event('blur'));
    originalControl.query('Keep search');
    await fixture.whenStable();
    const field = fieldAt(fixture.componentInstance.fields()!, '/name')!;
    const edited = structuredClone(model);
    edited.ui.children![1]!.props!['label'] = 'New label';
    edited.theme.mode = 'dark';
    fixture.componentRef.setInput('document', edited);
    await fixture.whenStable();
    expect(remote()).toBe(originalControl);
    expect(name()).toBe(originalInput);
    expect(fieldAt(fixture.componentInstance.fields()!, '/name')).toBe(field);
    expect(field().dirty()).toBe(true);
    expect(field().touched()).toBe(true);
    expect(signal!.aborted).toBe(false);
    expect(remote().queryText()).toBe('Keep search');
    expect(name().value).toBe('Edited');
    gate.resolve([{ key: 0, label: 'Current result' }]);
    await expect.poll(() => fixture.componentInstance.fields()!().valid()).toBe(true);
  });
});
