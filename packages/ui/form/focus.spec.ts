import { TestBed } from '@angular/core/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatRadioGroupHarness } from '@angular/material/radio/testing';
import { MatAutocompleteHarness } from '@angular/material/autocomplete/testing';
import { ActionRegistry } from '@haven/runtime';
import { fieldAt } from '@haven/ui/form-state';
import { MatSelectHarness } from '@angular/material/select/testing';
import { provideTransloco, TranslocoService } from '@jsverse/transloco';
import { HavenRenderer } from '@haven/ui/renderer';
import type { HavenDocument } from '@haven/schema';
import { provideHavenTransloco } from '@haven/ui/i18n';
import english from '@haven/ui/i18n/locales/en-US.json';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let outside: HTMLButtonElement;
beforeEach(() => {
  outside = globalThis.document.createElement('button');
  outside.textContent = 'Outside';
  globalThis.document.body.append(outside);
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
afterEach(() => {
  TestBed.resetTestingModule();
  outside.remove();
});

function createDocument(kind: string, remote = false): HavenDocument {
  const multiple = kind === 'field.multiselect';
  const choice = ['field.radio', 'field.select', 'field.multiselect'].includes(kind);
  return {
    schemaVersion: '1.0',
    id: 'focus-contract',
    title: 'Fields',
    dataSchema: {
      type: 'object',
      properties: {
        choice: multiple
          ? { type: 'array', items: { type: 'string' } }
          : {
              type:
                kind === 'field.number'
                  ? 'number'
                  : ['field.checkbox', 'field.switch'].includes(kind)
                    ? 'boolean'
                    : 'string',
            },
      },
    },
    ui: {
      id: 'root',
      kind: 'form',
      version: 1,
      children: [
        {
          id: 'choice',
          kind,
          version: 1,
          bind: '/choice',
          events: { blur: ['onBlur'] },
          props: {
            label: 'Choice',
            ...(remote
              ? { resource: 'choices' }
              : choice
                ? {
                    options: [
                      { value: 'a', label: 'Alpha' },
                      { value: 'b', label: 'Beta' },
                    ],
                  }
                : {}),
          },
        },
      ],
    },
    theme: { preset: 'material', mode: 'dark', density: 'comfortable' },
    actions: { onBlur: { handler: 'host.blur' } },
    resources: remote ? { choices: { type: 'options', adapter: 'host.choices' } } : {},
  };
}

function rendered(kind: string, remote = false) {
  const fixture = TestBed.createComponent(HavenRenderer);
  fixture.componentRef.setInput('document', createDocument(kind, remote));
  const registry = new ActionRegistry();
  const blur = vi.fn(async () => ({ status: 'success' as const }));
  registry.register({ id: 'host.blur', execute: blur });
  fixture.componentRef.setInput('host', {
    actions: registry,
    options: new Map([
      [
        'host.choices',
        {
          search: async () => ({
            items: [
              { key: 'a', label: 'Alpha' },
              { key: 'b', label: 'Beta' },
            ],
          }),
          resolve: async () => [],
        },
      ],
    ]),
  });
  const events: string[] = [];
  fixture.componentInstance.uiEvent.subscribe((event) => events.push(event.event));
  const touched = () => fieldAt(fixture.componentInstance.fields()!, '/choice')!().touched();
  return { fixture, events, blur, touched };
}

describe('field blur actions represent leaving focus, not touched state', () => {
  it('does not dispatch blur when a radio changes within its group', async () => {
    const { fixture, events, touched, blur } = rendered('field.radio');
    const group = await TestbedHarnessEnvironment.loader(fixture).getHarness(MatRadioGroupHarness);
    await group.checkRadioButton({ label: 'Alpha' });
    expect(events).toContain('change');
    expect(events.filter((event) => event === 'blur')).toHaveLength(0);
    expect(touched()).toBe(true);
    const radios = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLInputElement>(
      'input',
    );
    radios[0]!.focus();
    radios[1]!.focus();
    await fixture.whenStable();
    expect(blur).not.toHaveBeenCalled();
    outside.focus();
    await expect.poll(() => blur.mock.calls.length).toBe(1);
    expect(events.filter((event) => event === 'blur')).toHaveLength(1);
  });
  it('does not dispatch blur when selecting from a Material overlay and returning to the trigger', async () => {
    const { fixture, events } = rendered('field.select');
    const select = await TestbedHarnessEnvironment.loader(fixture).getHarness(MatSelectHarness);
    await select.open();
    await select.clickOptions({ text: 'Alpha' });
    expect(await select.isFocused()).toBe(true);
    expect(events).toContain('change');
    expect(events.filter((event) => event === 'blur')).toHaveLength(0);
  });

  it.each([
    ['field.text', 'input'],
    ['field.password', 'input'],
    ['field.textarea', 'textarea'],
    ['field.number', 'input'],
    ['field.date', 'input'],
    ['field.time', 'input'],
    ['field.datetime', 'input'],
    ['field.checkbox', 'input'],
    ['field.switch', 'button'],
  ])('dispatches one blur action per actual focus departure for %s', async (kind, selector) => {
    const { fixture, events, blur, touched } = rendered(kind);
    await fixture.whenStable();
    expect(fixture.componentInstance.validation().diagnostics).toEqual([]);
    const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(selector)!;
    expect(input).not.toBeNull();
    input.focus();
    await fixture.whenStable();
    expect(blur).not.toHaveBeenCalled();
    outside.focus();
    await expect.poll(() => blur.mock.calls.length).toBe(1);
    expect(touched()).toBe(true);
    expect(events.filter((event) => event === 'blur')).toHaveLength(1);
    outside.blur();
    await fixture.whenStable();
    expect(blur).toHaveBeenCalledTimes(1);
    input.focus();
    outside.focus();
    await expect.poll(() => blur.mock.calls.length).toBe(2);
  });

  it.each(['field.select', 'field.multiselect'])(
    'treats the %s panel as part of its focus boundary',
    async (kind) => {
      const { fixture, events, blur, touched } = rendered(kind);
      const select = await TestbedHarnessEnvironment.loader(fixture).getHarness(MatSelectHarness);
      await select.focus();
      await select.open();
      const panel = globalThis.document.querySelector<HTMLElement>('[role="listbox"]')!;
      panel.focus();
      await fixture.whenStable();
      expect(globalThis.document.activeElement).toBe(panel);
      expect(blur).not.toHaveBeenCalled();
      await select.clickOptions({ text: 'Alpha' });
      await select.focus();
      await select.close();
      expect(touched()).toBe(true);
      expect(events.filter((event) => event === 'blur')).toHaveLength(0);
      outside.focus();
      await expect.poll(() => blur.mock.calls.length).toBe(1);
      expect(events.filter((event) => event === 'blur')).toHaveLength(1);
      await select.focus();
      await select.open();
      globalThis.document.querySelector<HTMLElement>('[role="listbox"]')!.focus();
      outside.focus();
      await expect.poll(() => blur.mock.calls.length).toBe(2);
      await select.close();
      expect(events.filter((event) => event === 'blur')).toHaveLength(2);
    },
  );

  it.each(['field.select', 'field.multiselect'])(
    'retains touch without blur during remote %s choose/remove/clear',
    async (kind) => {
      const { fixture, events, blur, touched } = rendered(kind, true);
      const autocomplete =
        await TestbedHarnessEnvironment.loader(fixture).getHarness(MatAutocompleteHarness);
      await autocomplete.focus();
      await expect.poll(async () => (await autocomplete.getOptions()).length).toBe(2);
      await autocomplete.selectOption({ text: 'Alpha' });
      expect(touched()).toBe(true);
      expect(blur).not.toHaveBeenCalled();
      const root = fixture.nativeElement as HTMLElement;
      if (kind === 'field.multiselect') {
        const remove = root.querySelector<HTMLButtonElement>('li button')!;
        remove.focus();
        await fixture.whenStable();
        expect(blur).not.toHaveBeenCalled();
        remove.click();
        await fixture.whenStable();
        expect(root.querySelector('input')).toBe(globalThis.document.activeElement);
        await expect.poll(async () => (await autocomplete.getOptions()).length).toBe(2);
        await autocomplete.selectOption({ text: 'Beta' });
      }
      const clear = root.querySelector<HTMLButtonElement>('button[matIconSuffix]')!;
      clear.focus();
      await fixture.whenStable();
      expect(blur).not.toHaveBeenCalled();
      clear.click();
      await fixture.whenStable();
      expect(root.querySelector('input')).toBe(globalThis.document.activeElement);
      expect(events.filter((event) => event === 'blur')).toHaveLength(0);
      outside.focus();
      await expect.poll(() => blur.mock.calls.length).toBe(1);
      expect(events.filter((event) => event === 'blur')).toHaveLength(1);
    },
  );

  it('does not emit queued focus departures after destroying the renderer', async () => {
    const { fixture, events, blur } = rendered('field.text');
    await fixture.whenStable();
    (fixture.nativeElement as HTMLElement).querySelector('input')!.focus();
    outside.focus();
    fixture.destroy();
    await Promise.resolve();
    expect(blur).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });

  it('keeps independent fields focus ownership separate', async () => {
    const first = rendered('field.text');
    const second = rendered('field.text');
    await first.fixture.whenStable();
    await second.fixture.whenStable();
    // TestBed removes the previous root when creating a second fixture. Both must
    // be connected for this to exercise real browser focus rather than detached DOM.
    globalThis.document.body.append(first.fixture.nativeElement as HTMLElement);
    (first.fixture.nativeElement as HTMLElement).querySelector('input')!.focus();
    (second.fixture.nativeElement as HTMLElement).querySelector('input')!.focus();
    await expect.poll(() => first.blur.mock.calls.length).toBe(1);
    expect(second.blur).not.toHaveBeenCalled();
    outside.focus();
    await expect.poll(() => second.blur.mock.calls.length).toBe(1);
    expect(first.blur).toHaveBeenCalledTimes(1);
  });
});
