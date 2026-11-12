import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatExpansionPanelHarness } from '@angular/material/expansion/testing';
import { provideTransloco, TranslocoService } from '@jsverse/transloco';
import { provideHavenTransloco } from '@haven/ui/i18n';
import { HavenAccordion } from '@haven/ui/display';
import { ActionRegistry } from '@haven/runtime';
import type { ActionContext } from '@haven/runtime';
import type { HavenDocument, JsonObject } from '@haven/schema';
import english from '@haven/ui/i18n/locales/en-US.json';
import chinese from '@haven/ui/i18n/locales/zh-CN.json';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HavenRenderer } from './renderer';
import type { HavenUiEvent } from './renderer';

function document(id = 'presentation-a'): HavenDocument {
  return {
    schemaVersion: '1.0',
    id,
    title: 'Presentation integration',
    dataSchema: {
      type: 'object',
      properties: {
        draft: { type: 'string' },
        count: { type: 'number' },
        progress: { type: 'number' },
        message: { type: 'string' },
        showDetails: { type: 'boolean' },
      },
    },
    ui: {
      id: 'root',
      kind: 'layout.card',
      version: 1,
      props: { title: 'Overview' },
      children: [
        {
          id: 'sections',
          kind: 'layout.accordion',
          version: 1,
          props: { title: 'Sections', expandedIds: ['details'] },
          events: { expandedChange: ['expanded'] },
          children: [
            {
              id: 'details',
              kind: 'layout.card',
              version: 1,
              props: { title: { default: 'Details', translations: { 'zh-CN': '详情' } } },
              rules: {
                visible: { op: 'eq', left: { path: '/showDetails' }, right: { literal: true } },
              },
              children: [
                {
                  id: 'draft',
                  kind: 'field.text',
                  version: 1,
                  bind: '/draft',
                  props: { label: 'Draft' },
                },
                {
                  id: 'count',
                  kind: 'view.badge',
                  version: 1,
                  bind: '/count',
                  props: { text: 'Fallback', tone: 'neutral' },
                },
                {
                  id: 'progress',
                  kind: 'view.progress',
                  version: 1,
                  bind: '/progress',
                  props: { label: 'Progress', value: 99 },
                },
                {
                  id: 'notice',
                  kind: 'view.alert',
                  version: 1,
                  bind: '/message',
                  props: { title: 'Notice', dismissible: true },
                  events: { dismiss: ['dismissed'] },
                },
                {
                  id: 'separator',
                  kind: 'view.divider',
                  version: 1,
                  props: { label: 'End of details' },
                },
              ],
            },
            {
              id: 'other',
              kind: 'layout.card',
              version: 1,
              props: { title: 'Other' },
              children: [
                {
                  id: 'other-text',
                  kind: 'view.text',
                  version: 1,
                  props: { text: 'Other content' },
                },
              ],
            },
          ],
        },
      ],
    },
    actions: {
      expanded: {
        handler: 'host.capture',
        input: { expanded: { scope: 'event', path: '/value' } },
      },
      dismissed: { handler: 'host.capture', input: { message: { path: '/message' } } },
    },
    resources: {},
    theme: { preset: 'material', mode: 'dark', density: 'comfortable' },
  };
}
const initialValue = (): JsonObject => ({
  draft: 'Unsaved',
  count: 0,
  progress: 0,
  message: 'Ready to review',
  showDetails: true,
});
beforeEach(() => {
  TestBed.configureTestingModule({
    providers: [
      provideTransloco({
        config: { defaultLang: 'en-US', availableLangs: ['en-US', 'zh-CN'], prodMode: true },
      }),
      provideHavenTransloco(),
    ],
  });
  const localization = TestBed.inject(TranslocoService);
  localization.setTranslation({ haven: english }, 'en-US');
  localization.setTranslation({ haven: chinese }, 'zh-CN');
});
afterEach(() => TestBed.resetTestingModule());
async function create(model = document()) {
  const calls: { input: JsonObject; context: ActionContext }[] = [],
    actions = new ActionRegistry();
  actions.register({
    id: 'host.capture',
    execute: async (input, context) => {
      calls.push({ input, context });
      return { status: 'success' };
    },
  });
  const fixture = TestBed.createComponent(HavenRenderer);
  fixture.componentRef.setInput('document', model);
  fixture.componentRef.setInput('host', { actions, revision: 'draft-1' });
  fixture.componentRef.setInput('value', initialValue());
  const events: HavenUiEvent[] = [];
  fixture.componentInstance.uiEvent.subscribe((event) => events.push(event));
  await fixture.whenStable();
  expect(fixture.componentInstance.validation().diagnostics).toEqual([]);
  const element = fixture.nativeElement as HTMLElement;
  return { fixture, element, calls, events, actions };
}

describe('presentation family through the real root renderer', () => {
  it('recursively renders nested card/accordion children and shares live bound data with editable fields', async () => {
    const { fixture, element } = await create();
    expect(element.querySelectorAll('haven-card')).toHaveLength(3);
    expect(element.querySelectorAll('haven-accordion')).toHaveLength(1);
    expect(element.querySelector('haven-badge')?.textContent?.trim()).toBe('0');
    expect(element.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('0');
    expect(element.querySelector('haven-alert')?.textContent).toContain('Ready to review');
    expect(element.querySelector('[role="separator"]')?.getAttribute('aria-label')).toBe(
      'End of details',
    );
    const input = element.querySelector<HTMLInputElement>('input')!;
    expect(input.value).toBe('Unsaved');
    input.value = 'Edited in nested card';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
    expect(fixture.componentInstance.value()['draft']).toBe('Edited in nested card');
    fixture.componentRef.setInput('value', {
      ...fixture.componentInstance.value(),
      count: 12345,
      progress: 42,
      message: 'New message',
    });
    await fixture.whenStable();
    expect(element.querySelector('haven-badge')?.textContent?.trim()).toBe('12,345');
    expect(element.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('42');
    expect(element.querySelector('haven-alert')?.textContent).toContain('New message');
    TestBed.inject(TranslocoService).setActiveLang('zh-CN');
    await fixture.whenStable();
    expect(element.querySelector('mat-panel-title')?.textContent?.trim()).toBe('详情');
  });
  it('dispatches expanded/dismiss events to host actions with the correct node, document and bound snapshot', async () => {
    const { fixture, element, calls, events } = await create();
    const panels =
      await TestbedHarnessEnvironment.loader(fixture).getAllHarnesses(MatExpansionPanelHarness);
    await panels[1]!.expand();
    await expect.poll(() => calls.length).toBe(1);
    expect(events[0]).toEqual({ nodeId: 'sections', event: 'expandedChange', value: ['other'] });
    expect(calls[0]!.input).toEqual({ expanded: ['other'] });
    expect(calls[0]!.context).toMatchObject({
      documentId: 'presentation-a',
      revision: 'draft-1',
      nodeId: 'sections',
      event: { type: 'expandedChange', value: ['other'] },
    });
    expect(Object.isFrozen(calls[0]!.context.event)).toBe(true);
    await panels[0]!.expand();
    await expect.poll(() => calls.length).toBe(2);
    element.querySelector<HTMLButtonElement>('haven-alert button')!.click();
    await expect.poll(() => calls.length).toBe(3);
    expect(events.at(-1)).toEqual({ nodeId: 'notice', event: 'dismiss' });
    expect(calls[2]!.input).toEqual({ message: 'Ready to review' });
    expect(calls[2]!.context.nodeId).toBe('notice');
    expect(element.querySelector('haven-alert')).not.toBeNull();
    fixture.componentRef.setInput('value', { ...initialValue(), message: 'Changed after event' });
    await fixture.whenStable();
    expect(calls[2]!.context.data['message']).toBe('Ready to review');
  });
  it('preserves expansion for cosmetic changes but recreates controls across document and revision switches', async () => {
    const { fixture, actions } = await create();
    const original = fixture.debugElement.query(By.directive(HavenAccordion)).componentInstance;
    let panels =
      await TestbedHarnessEnvironment.loader(fixture).getAllHarnesses(MatExpansionPanelHarness);
    await panels[1]!.expand();
    const cosmetic = document();
    cosmetic.title = 'Renamed document';
    cosmetic.ui.props = { title: 'Renamed card' };
    fixture.componentRef.setInput('document', cosmetic);
    await fixture.whenStable();
    expect(fixture.debugElement.query(By.directive(HavenAccordion)).componentInstance).toBe(
      original,
    );
    expect(await panels[1]!.isExpanded()).toBe(true);
    fixture.componentRef.setInput('document', document('presentation-b'));
    await fixture.whenStable();
    const switched = fixture.debugElement.query(By.directive(HavenAccordion)).componentInstance;
    expect(switched).not.toBe(original);
    panels =
      await TestbedHarnessEnvironment.loader(fixture).getAllHarnesses(MatExpansionPanelHarness);
    expect(await panels[0]!.isExpanded()).toBe(true);
    await panels[1]!.expand();
    fixture.componentRef.setInput('host', { actions, revision: 'published-2' });
    await fixture.whenStable();
    expect(fixture.debugElement.query(By.directive(HavenAccordion)).componentInstance).not.toBe(
      switched,
    );
    panels =
      await TestbedHarnessEnvironment.loader(fixture).getAllHarnesses(MatExpansionPanelHarness);
    expect(await panels[0]!.isExpanded()).toBe(true);
  });
  it('filters rule-hidden panels without invalidating saved expansion or losing their bound data', async () => {
    const { fixture, element, events } = await create();
    fixture.componentRef.setInput('value', { ...initialValue(), showDetails: false });
    await fixture.whenStable();
    expect(element.querySelectorAll('mat-expansion-panel')).toHaveLength(1);
    expect(element.querySelector('haven-badge')).toBeNull();
    expect(element.querySelector('[role="alert"]')).toBeNull();
    expect(fixture.componentInstance.value()['draft']).toBe('Unsaved');
    fixture.componentRef.setInput('value', initialValue());
    await fixture.whenStable();
    const panels =
      await TestbedHarnessEnvironment.loader(fixture).getAllHarnesses(MatExpansionPanelHarness);
    expect(await panels[0]!.isExpanded()).toBe(true);
    expect(events).toEqual([]);
  });
  it('inherits readonly/disabled restrictions into nested controls without disabling presentation data', async () => {
    const model = document();
    model.ui.children![0]!.props!['readonly'] = true;
    const { fixture, element, events } = await create(model);
    const input = element.querySelector<HTMLInputElement>('input')!;
    expect(input.readOnly).toBe(true);
    expect(element.querySelector<HTMLButtonElement>('haven-alert button')!.disabled).toBe(true);
    expect(element.querySelector('haven-badge')?.textContent?.trim()).toBe('0');
    const disabled = document();
    disabled.ui.rules = {
      disabled: { op: 'eq', left: { literal: true }, right: { literal: true } },
    };
    fixture.componentRef.setInput('document', disabled);
    await fixture.whenStable();
    expect(element.querySelector<HTMLInputElement>('input')!.disabled).toBe(true);
    element.querySelector<HTMLButtonElement>('haven-alert button')!.click();
    expect(events).toEqual([]);
    expect(fixture.componentInstance.value()['draft']).toBe('Unsaved');
  });
});
