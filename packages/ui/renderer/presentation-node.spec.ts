import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatExpansionPanelHarness } from '@angular/material/expansion/testing';
import { provideTransloco, TranslocoService } from '@jsverse/transloco';
import { provideHavenTransloco } from '@haven/ui/i18n';
import type { JsonValue, UiNode } from '@haven/schema';
import english from '@haven/ui/i18n/locales/en-US.json';
import chinese from '@haven/ui/i18n/locales/zh-CN.json';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HavenPresentationNode } from './presentation-node';

const children: UiNode[] = [
  { id: 'first', kind: 'layout.card', version: 1, props: { title: 'First' } },
  { id: 'second', kind: 'layout.card', version: 1, props: { title: 'Second' } },
];
@Component({
  imports: [HavenPresentationNode],
  template: `<ng-template #child let-node
      ><p [attr.data-child]="node.id">{{ node.id }} content</p></ng-template
    >
    <haven-presentation-node
      [node]="node()"
      [identity]="identity()"
      [boundValue]="value()"
      [disabled]="disabled()"
      [readonly]="readonly()"
      [visibleChildren]="visible()"
      [childTemplate]="child"
      (event)="events.push($event)"
    />`,
})
class Host {
  readonly node = signal<UiNode>({
    id: 'presentation',
    kind: 'layout.accordion',
    version: 1,
    props: { expandedIds: ['first'] },
    children,
  });
  readonly identity = signal('document-a');
  readonly value = signal<JsonValue | undefined>(undefined);
  readonly disabled = signal(false);
  readonly readonly = signal(false);
  readonly visible = signal(children);
  readonly events: { event: string; value?: JsonValue }[] = [];
}
beforeEach(() => {
  TestBed.configureTestingModule({
    providers: [
      provideTransloco({
        config: {
          defaultLang: 'en-US',
          availableLangs: ['en-US', 'zh-CN', 'de-DE'],
          prodMode: true,
        },
      }),
      provideHavenTransloco(),
    ],
  });
  const localization = TestBed.inject(TranslocoService);
  localization.setTranslation({ haven: english }, 'en-US');
  localization.setTranslation({ haven: english }, 'de-DE');
  localization.setTranslation({ haven: chinese }, 'zh-CN');
});
afterEach(() => TestBed.resetTestingModule());

describe('private presentation model adapter', () => {
  it('projects only visible card children through the supplied recursion template', async () => {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.node.update((node) => ({
      ...node,
      kind: 'layout.card',
      props: { title: 'Summary' },
    }));
    fixture.componentInstance.visible.set(children.slice(0, 1));
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('mat-card-title')?.textContent).toBe('Summary');
    expect(element.querySelectorAll('[data-child]')).toHaveLength(1);
    expect(element.querySelector('[data-child="first"]')).not.toBeNull();
  });
  it('retains user expansion through appearance/locale updates but resets for explicit presets and document identity', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const panels =
      await TestbedHarnessEnvironment.loader(fixture).getAllHarnesses(MatExpansionPanelHarness);
    await panels[1]!.expand();
    expect(fixture.componentInstance.events.at(-1)).toEqual({
      event: 'expandedChange',
      value: ['second'],
    });
    fixture.componentInstance.node.update((node) => ({
      ...node,
      props: { ...node.props, title: 'Renamed' },
    }));
    TestBed.inject(TranslocoService).setActiveLang('zh-CN');
    await fixture.whenStable();
    expect(await panels[1]!.isExpanded()).toBe(true);
    fixture.componentInstance.identity.set('document-b');
    await fixture.whenStable();
    expect(await panels[0]!.isExpanded()).toBe(true);
    fixture.componentInstance.node.update((node) => ({
      ...node,
      props: { expandedIds: ['second'] },
    }));
    await fixture.whenStable();
    expect(await panels[1]!.isExpanded()).toBe(true);
  });
  it('keeps hidden panel state without invalid controls and restores it when the panel returns', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    fixture.componentInstance.visible.set(children.slice(1));
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')).toBeNull();
    fixture.componentInstance.visible.set(children);
    await fixture.whenStable();
    const panels =
      await TestbedHarnessEnvironment.loader(fixture).getAllHarnesses(MatExpansionPanelHarness);
    expect(await panels[0]!.isExpanded()).toBe(true);
    expect(fixture.componentInstance.events).toEqual([]);
  });
  it('formats bound badges with locale numbers/booleans and distinguishes bound null from a static fallback', async () => {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.node.set({
      id: 'status',
      kind: 'view.badge',
      version: 1,
      bind: '/value',
      props: { text: 'fallback' },
    });
    fixture.componentInstance.value.set(65535);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('65,535');
    TestBed.inject(TranslocoService).setActiveLang('de-DE');
    await fixture.whenStable();
    expect(element.textContent).toContain('65.535');
    fixture.componentInstance.value.set(true);
    TestBed.inject(TranslocoService).setActiveLang('zh-CN');
    await fixture.whenStable();
    expect(element.textContent?.trim()).toBe('是');
    fixture.componentInstance.value.set(null);
    await fixture.whenStable();
    expect(element.textContent?.trim()).toBe('');
  });
  it('drives static and bound progress without coercing invalid strings or replacing null with static data', async () => {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.node.set({
      id: 'progress',
      kind: 'view.progress',
      version: 1,
      props: { value: 30 },
    });
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('30');
    fixture.componentInstance.node.update((node) => ({ ...node, bind: '/value' }));
    fixture.componentInstance.value.set(null);
    await fixture.whenStable();
    expect(element.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBeNull();
    fixture.componentInstance.value.set('40');
    await fixture.whenStable();
    expect(element.querySelector('[role="alert"]')).not.toBeNull();
    fixture.componentInstance.value.set(40);
    await fixture.whenStable();
    expect(element.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('40');
  });
  it('forwards dismiss as a host event, honors readonly and leaves alert visibility with the host', async () => {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.node.set({
      id: 'message',
      kind: 'view.alert',
      version: 1,
      props: { message: 'Saved', dismissible: true },
    });
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    element.querySelector<HTMLButtonElement>('button')!.click();
    await fixture.whenStable();
    expect(fixture.componentInstance.events).toEqual([{ event: 'dismiss' }]);
    expect(element.querySelector('[role="alert"]')).not.toBeNull();
    fixture.componentInstance.readonly.set(true);
    await fixture.whenStable();
    expect(element.querySelector<HTMLButtonElement>('button')!.disabled).toBe(true);
    element.querySelector<HTMLButtonElement>('button')!.click();
    expect(fixture.componentInstance.events).toHaveLength(1);
  });
  it('passes divider orientation and inset properties to the native separator', async () => {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.node.set({
      id: 'divider',
      kind: 'view.divider',
      version: 1,
      props: { vertical: true, inset: true },
    });
    await fixture.whenStable();
    const separator = (fixture.nativeElement as HTMLElement).querySelector('[role="separator"]');
    expect(separator?.getAttribute('aria-orientation')).toBe('vertical');
    expect(separator?.classList.contains('mat-divider-inset')).toBe(true);
  });
});
