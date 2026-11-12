import { Component, signal, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatButtonHarness } from '@angular/material/button/testing';
import { provideTransloco, TranslocoService } from '@jsverse/transloco';
import { provideHavenTransloco } from '@haven/ui/i18n';
import english from '@haven/ui/i18n/locales/en-US.json';
import chinese from '@haven/ui/i18n/locales/zh-CN.json';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HavenRepeat } from './repeat';
import type { HavenRepeatItem, HavenRepeatMove, HavenRepeatRemove } from './repeat';

@Component({
  imports: [HavenRepeat],
  template: `<haven-repeat
      [items]="items()"
      [rowTemplate]="row"
      [disabled]="disabled()"
      [readonly]="readonly()"
      [minItems]="minimum()"
      [maxItems]="maximum()"
      [title]="title"
      (insert)="insert($event)"
      (remove)="remove($event)"
      (move)="move($event)"
    />
    <ng-template #row let-value let-index="index" let-key="key">
      <input [attr.aria-label]="'Value ' + index" [value]="value.name" [readOnly]="readonly()" />
      <span data-row-key>{{ typeof key }}:{{ key }}</span>
    </ng-template>
    <button id="elsewhere" type="button">Elsewhere</button>`,
})
class Host {
  readonly repeat = viewChild.required(HavenRepeat);
  readonly items = signal<readonly HavenRepeatItem[]>([
    { key: 0, value: { name: 'Numeric' } },
    { key: '0', value: { name: 'String' } },
    { key: 'last', value: { name: 'Last' } },
  ]);
  readonly disabled = signal(false);
  readonly readonly = signal(false);
  readonly minimum = signal(0);
  readonly maximum = signal<number | undefined>(undefined);
  readonly title = { default: 'Entries', translations: { 'zh-CN': '条目列表' } };
  accept = false;
  readonly operations: unknown[] = [];
  insert(event: { index: number }): void {
    this.operations.push({ insert: event });
    if (this.accept)
      this.items.update((items) =>
        items.toSpliced(event.index, 0, { key: 'new', value: { name: 'New' } }),
      );
  }
  remove(event: HavenRepeatRemove): void {
    this.operations.push({ remove: event });
    if (this.accept) this.items.update((items) => items.filter((item) => item.key !== event.key));
  }
  move(event: HavenRepeatMove): void {
    this.operations.push({ move: event });
    if (this.accept)
      this.items.update((items) => {
        const next = [...items];
        next.splice(event.to, 0, next.splice(event.from, 1)[0]!);
        return next;
      });
  }
}
beforeEach(() => {
  TestBed.configureTestingModule({
    providers: [
      provideTransloco({
        config: { defaultLang: 'en-US', availableLangs: ['en-US', 'zh-CN'], prodMode: true },
      }),
      provideHavenTransloco(),
    ],
  });
  const translations = TestBed.inject(TranslocoService);
  translations.setTranslation({ haven: english }, 'en-US');
  translations.setTranslation({ haven: chinese }, 'zh-CN');
});
afterEach(() => TestBed.resetTestingModule());
async function setup() {
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  const root = fixture.nativeElement as HTMLElement;
  return {
    fixture,
    root,
    host: fixture.componentInstance,
    control: fixture.componentInstance.repeat(),
    loader: TestbedHarnessEnvironment.loader(fixture),
  };
}

describe('host-controlled repeated item editing', () => {
  it('emits typed key operations without mutating host data and rejects stale or out-of-range operations', async () => {
    const { host, control, loader } = await setup();
    const original = host.items();
    await (await loader.getHarness(MatButtonHarness.with({ text: 'Add item' }))).click();
    control.requestRemove(0);
    control.requestMove('0', 0);
    expect(host.operations).toEqual([
      { insert: { index: 3 } },
      { remove: { key: 0, index: 0 } },
      { move: { key: '0', from: 1, to: 0 } },
    ]);
    expect(host.items()).toBe(original);
    control.requestRemove('missing');
    control.requestMove(0, -1);
    control.requestMove(0, 0);
    control.requestMove('missing', 1);
    control.requestInsert(4);
    control.requestInsert(Number.NaN);
    expect(host.operations).toHaveLength(3);
  });
  it('tracks typed keys so reordering preserves existing input identity and uncommitted input text', async () => {
    const { host, control, root, fixture } = await setup();
    host.accept = true;
    const original = root.querySelectorAll('input')[0]!;
    original.value = 'Unsaved input';
    control.requestMove(0, 2);
    await fixture.whenStable();
    expect(host.items().map((item) => item.key)).toEqual(['0', 'last', 0]);
    expect(root.querySelectorAll('input')[2]).toBe(original);
    expect(original.value).toBe('Unsaved input');
    expect(root.querySelectorAll('[data-row-key]')[2]!.textContent).toContain('number:0');
  });
  it('applies readonly, disabled and inclusive min/max operation limits while allowing recovery from invalid counts', async () => {
    const { host, control, root, fixture } = await setup();
    host.minimum.set(3);
    host.maximum.set(3);
    await fixture.whenStable();
    control.requestInsert();
    control.requestRemove(0);
    expect(host.operations).toEqual([]);
    expect(control.canInsert()).toBe(false);
    expect(control.canRemove()).toBe(false);
    host.minimum.set(4);
    host.maximum.set(5);
    await fixture.whenStable();
    expect(control.canInsert()).toBe(true);
    expect(control.canRemove()).toBe(false);
    expect(root.textContent).toContain('At least 4');
    host.minimum.set(0);
    host.maximum.set(2);
    await fixture.whenStable();
    expect(control.canInsert()).toBe(false);
    expect(control.canRemove()).toBe(true);
    expect(root.textContent).toContain('At most 2');
    host.readonly.set(true);
    await fixture.whenStable();
    control.requestRemove(0);
    control.requestMove(0, 1);
    expect(host.operations).toEqual([]);
    expect(root.querySelector('input')!.readOnly).toBe(true);
    host.readonly.set(false);
    host.disabled.set(true);
    await fixture.whenStable();
    control.requestRemove(0);
    control.requestMove(0, 1);
    expect(root.querySelector('fieldset')!.disabled).toBe(true);
    expect(host.operations).toEqual([]);
  });
  it.each([undefined, '', Number.NaN, Number.POSITIVE_INFINITY, 'duplicate'])(
    'rejects malformed or duplicate key %s without rendering misleading rows',
    async (key) => {
      const { host, control, root, fixture } = await setup();
      host.items.set([
        { key: 'duplicate', value: {} },
        { key, value: {} },
      ] as HavenRepeatItem[]);
      await fixture.whenStable();
      expect(control.invalid()).toBe(true);
      expect(root.querySelector('[role="alert"]')).not.toBeNull();
      expect(root.querySelectorAll('fieldset')).toHaveLength(0);
      control.requestInsert();
      control.requestRemove('duplicate');
      expect(host.operations).toEqual([]);
    },
  );
  it('rejects invalid bounds and recovers when the host corrects the configuration', async () => {
    const { host, control, root, fixture } = await setup();
    host.minimum.set(-1);
    await fixture.whenStable();
    expect(control.invalid()).toBe(true);
    host.minimum.set(3);
    host.maximum.set(2);
    await fixture.whenStable();
    expect(control.invalid()).toBe(true);
    host.maximum.set(3);
    await fixture.whenStable();
    expect(control.invalid()).toBe(false);
    expect(root.querySelectorAll('fieldset')).toHaveLength(3);
  });
  it('restores focus after accepted insertion, movement and removal, including the last row', async () => {
    const { host, root, fixture } = await setup();
    host.accept = true;
    const add = () => root.querySelector<HTMLButtonElement>('haven-repeat section > button')!;
    add().focus();
    add().click();
    await fixture.whenStable();
    expect(document.activeElement).toBe(root.querySelectorAll('fieldset')[3]);
    const up = root.querySelectorAll('fieldset')[3]!.querySelector<HTMLButtonElement>('button')!;
    up.focus();
    up.click();
    await fixture.whenStable();
    expect(document.activeElement).toBe(root.querySelectorAll('fieldset')[2]);
    const remove = root.querySelectorAll('fieldset')[2]!.querySelectorAll('button')[2]!;
    remove.focus();
    remove.click();
    await fixture.whenStable();
    expect(document.activeElement).toBe(root.querySelectorAll('fieldset')[2]);
    host.items.set([{ key: 'only', value: {} }]);
    await fixture.whenStable();
    const lastRemove = root.querySelector('fieldset')!.querySelectorAll('button')[2]!;
    lastRemove.focus();
    lastRemove.click();
    await fixture.whenStable();
    expect(document.activeElement).toBe(add());
    expect(root.textContent).toContain('No items');
  });
  it('does not steal focus when a deferred proposal is accepted after the user leaves', async () => {
    const { host, root, fixture } = await setup();
    const add = root.querySelector<HTMLButtonElement>('haven-repeat section > button')!;
    add.focus();
    add.click();
    const elsewhere = root.querySelector<HTMLButtonElement>('#elsewhere')!;
    elsewhere.focus();
    host.items.update((items) => [...items, { key: 'new', value: {} }]);
    await fixture.whenStable();
    expect(document.activeElement).toBe(elsewhere);
  });
  it('reacts to locale changes for titles, row labels and action accessibility labels', async () => {
    const { root, fixture } = await setup();
    expect(root.querySelector('h2')!.textContent).toContain('Entries');
    TestBed.inject(TranslocoService).setActiveLang('zh-CN');
    await fixture.whenStable();
    expect(root.querySelector('h2')!.textContent).toContain('条目列表');
    expect(root.querySelector('legend')!.textContent).toContain('1');
    expect(root.querySelector('fieldset button')!.getAttribute('aria-label')).toContain('上移');
    expect(root.textContent).toContain('添加');
  });
});
