import { Component, signal } from '@angular/core';
import { TestKey } from '@angular/cdk/testing';
import { HavenThemeDirective } from '@haven/ui/theme';
import type { HavenTheme } from '@haven/schema';
import { TestBed } from '@angular/core/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatAutocompleteHarness } from '@angular/material/autocomplete/testing';
import { provideTransloco, TranslocoService } from '@jsverse/transloco';
import { HavenRemoteSelectField, HavenRemoteMultiselectField } from '@haven/ui/form';
import { provideHavenTransloco } from '@haven/ui/i18n';
import type { Option, OptionsAdapter } from '@haven/runtime';
import english from '@haven/ui/i18n/locales/en-US.json';
import chinese from '@haven/ui/i18n/locales/zh-CN.json';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function adapter(overrides: Partial<OptionsAdapter> = {}): OptionsAdapter {
  return { search: async () => ({ items: [] }), resolve: async () => [], ...overrides };
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
  const transloco = TestBed.inject(TranslocoService);
  transloco.setTranslation({ haven: english }, 'en-US');
  transloco.setTranslation({ haven: chinese }, 'zh-CN');
});
afterEach(() => TestBed.resetTestingModule());

@Component({
  imports: [HavenRemoteSelectField, HavenThemeDirective],
  template: `<section id="first" [havenTheme]="first()">
      <haven-remote-select-field label="First" [adapter]="source" [debounceMs]="0" />
    </section>
    <section id="second" [havenTheme]="second()">
      <haven-remote-select-field label="Second" [adapter]="source" [debounceMs]="0" />
    </section>`,
})
class ThemedFields {
  readonly source = adapter({ search: async () => ({ items: [{ key: 0, label: 'Zero' }] }) });
  readonly first = signal<HavenTheme>({
    preset: 'liquid-glass',
    mode: 'light',
    density: 'comfortable',
    tokens: { primary: '#d12e44' },
  });
  readonly second = signal<HavenTheme>({
    preset: 'material',
    mode: 'dark',
    density: 'compact',
    tokens: { primary: '#315dd1' },
  });
}

describe('remote Material selection lifecycle', () => {
  it('retains typed zero keys, loads labels and clears using the host empty-value contract', async () => {
    const fixture = TestBed.createComponent(HavenRemoteSelectField);
    fixture.componentRef.setInput('label', 'Choice');
    fixture.componentRef.setInput('emptyValue', '');
    fixture.componentRef.setInput('value', 0);
    fixture.componentRef.setInput(
      'adapter',
      adapter({ resolve: async () => [{ key: 0, label: 'Zero' }] }),
    );
    await fixture.whenStable();
    await expect.poll(() => fixture.componentInstance.state().resolveReady).toBe(true);
    await fixture.whenStable();
    expect(fixture.componentInstance.value()).toBe(0);
    expect((fixture.nativeElement as HTMLElement).querySelector('input')?.value).toBe('Zero');
    const clear = (fixture.nativeElement as HTMLElement).querySelector('button')!;
    expect(clear.type).toBe('button');
    expect(clear.hasAttribute('matIconButton')).toBe(true);
    expect(clear.hasAttribute('matIconSuffix')).toBe(true);
    expect(clear.getAttribute('aria-label')).toBe('Clear selection: Choice');
    expect(clear.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(clear.textContent?.trim()).toBe('');
    clear.click();
    await fixture.whenStable();
    expect(fixture.componentInstance.value()).toBe('');
    expect(fixture.componentInstance.state().keys).toEqual([]);
  });
  it('supersedes locale and value resolutions and does not emit results after destruction', async () => {
    const fixture = TestBed.createComponent(HavenRemoteSelectField);
    const resolutions: Array<{
      keys: readonly (string | number)[];
      signal: AbortSignal;
      locale: string | undefined;
      work: ReturnType<typeof deferred<Option[]>>;
    }> = [];
    fixture.componentRef.setInput('label', 'Choice');
    fixture.componentRef.setInput('value', 0);
    fixture.componentRef.setInput(
      'adapter',
      adapter({
        resolve: (keys, signal, context) => {
          const work = deferred<Option[]>();
          resolutions.push({ keys, signal, locale: context?.locale, work });
          return work.promise;
        },
      }),
    );
    const emitted = vi.fn();
    fixture.componentInstance.resolution.subscribe(emitted);
    await fixture.whenStable();
    TestBed.inject(TranslocoService).setActiveLang('zh-CN');
    await fixture.whenStable();
    expect(resolutions[0]!.signal.aborted).toBe(true);
    expect(resolutions[1]!.locale).toBe('zh-CN');
    fixture.componentRef.setInput('value', '0');
    await fixture.whenStable();
    expect(resolutions[1]!.signal.aborted).toBe(true);
    resolutions[2]!.work.resolve([{ key: '0', label: '字符串零' }]);
    resolutions[0]!.work.resolve([{ key: 0, label: 'Stale' }]);
    await fixture.whenStable();
    await expect.poll(() => fixture.componentInstance.selected()[0]?.label).toBe('字符串零');
    fixture.componentRef.setInput('value', 'unresolved');
    await fixture.whenStable();
    fixture.destroy();
    const count = emitted.mock.calls.length;
    resolutions[3]!.work.resolve([{ key: 'unresolved', label: 'Too late' }]);
    resolutions[1]!.work.reject(new Error('Late failure'));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(resolutions[3]!.signal.aborted).toBe(true);
    expect(emitted).toHaveBeenCalledTimes(count);
  });
  it('uses native autocomplete selection and preserves unknown or disabled selected values', async () => {
    const fixture = TestBed.createComponent(HavenRemoteMultiselectField);
    fixture.componentRef.setInput('label', 'Choices');
    fixture.componentRef.setInput('value', ['unknown', 9]);
    fixture.componentRef.setInput('debounceMs', 0);
    fixture.componentRef.setInput(
      'adapter',
      adapter({
        resolve: async (keys) =>
          keys
            .filter((key) => key !== 'unknown')
            .map((key) => ({ key, label: String(key), disabled: key === 9 })),
        search: async () => ({
          items: [
            { key: 0, label: 'Zero' },
            { key: '0', label: 'String zero' },
          ],
        }),
      }),
    );
    const autocomplete =
      await TestbedHarnessEnvironment.loader(fixture).getHarness(MatAutocompleteHarness);
    await autocomplete.enterText('zero');
    await expect.poll(async () => (await autocomplete.getOptions()).length).toBe(2);
    await autocomplete.selectOption({ text: 'Zero' });
    expect(fixture.componentInstance.value()).toEqual(['unknown', 9, 0]);
    fixture.componentInstance.remove(9);
    expect(fixture.componentInstance.value()).toEqual(['unknown', 9, 0]);
    fixture.componentInstance.remove('unknown');
    expect(fixture.componentInstance.value()).toEqual([9, 0]);
    fixture.componentRef.setInput('readonly', true);
    await fixture.whenStable();
    fixture.componentInstance.clear(new Event('click'));
    expect(fixture.componentInstance.value()).toEqual([9, 0]);
  });
  it('keeps saved values on resolver failure, presents generic errors, and retries in the current locale', async () => {
    const fixture = TestBed.createComponent(HavenRemoteSelectField);
    const resolve = vi
      .fn<OptionsAdapter['resolve']>()
      .mockRejectedValueOnce(new Error('PRIVATE TRANSPORT DETAILS'))
      .mockResolvedValueOnce([{ key: 0, label: 'Zero' }]);
    fixture.componentRef.setInput('label', 'Choice');
    fixture.componentRef.setInput('value', 0);
    fixture.componentRef.setInput('adapter', adapter({ resolve }));
    await fixture.whenStable();
    await expect.poll(() => fixture.componentInstance.state().resolveError).toBe('adapter');
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(fixture.componentInstance.value()).toBe(0);
    expect(root.textContent).not.toContain('PRIVATE TRANSPORT DETAILS');
    const retry = [...root.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === english['remote.retry'],
    )!;
    expect(retry).toBeDefined();
    retry.click();
    await expect.poll(() => fixture.componentInstance.state().resolveReady).toBe(true);
    expect(fixture.componentInstance.value()).toBe(0);
    expect(fixture.componentInstance.selected()[0]?.label).toBe('Zero');
    expect(resolve.mock.calls[1]?.[2]).toEqual({ locale: 'en-US' });
  });
  it('aborts a pending search when disabled and ignores its late error', async () => {
    const fixture = TestBed.createComponent(HavenRemoteSelectField);
    const work = deferred<{ items: Option[] }>();
    let requestSignal: AbortSignal | undefined;
    fixture.componentRef.setInput('label', 'Choice');
    fixture.componentRef.setInput('debounceMs', 0);
    fixture.componentRef.setInput(
      'adapter',
      adapter({
        search: ({ signal }) => {
          requestSignal = signal;
          return work.promise;
        },
      }),
    );
    const autocomplete =
      await TestbedHarnessEnvironment.loader(fixture).getHarness(MatAutocompleteHarness);
    await autocomplete.enterText('waiting');
    await expect.poll(() => requestSignal).toBeDefined();
    fixture.componentRef.setInput('disabled', true);
    await fixture.whenStable();
    expect(requestSignal!.aborted).toBe(true);
    expect(await autocomplete.isOpen()).toBe(false);
    work.reject(new Error('Transport internal details'));
    await fixture.whenStable();
    expect(fixture.componentInstance.state().searchError).toBeNull();
    expect(fixture.componentInstance.state().searching).toBe(false);
    expect(fixture.componentInstance.debouncing()).toBe(false);
  });
  it('themes rendered autocomplete panels per instance and follows theme changes without global mutation', async () => {
    const fixture = TestBed.createComponent(ThemedFields);
    const loader = TestbedHarnessEnvironment.loader(fixture);
    const first = await loader.getHarness(
      MatAutocompleteHarness.with({ selector: '#first input' }),
    );
    const second = await loader.getHarness(
      MatAutocompleteHarness.with({ selector: '#second input' }),
    );
    const panel = async (harness: MatAutocompleteHarness) => {
      if (!(await harness.isOpen())) return null;
      const id = await (await harness.host()).getAttribute('aria-controls');
      return id ? document.getElementById(id) : null;
    };
    await first.focus();
    await expect
      .poll(async () => (await panel(first))?.style.getPropertyValue('--mat-sys-primary'))
      .toBe('#d12e44');
    expect((await panel(first))?.getAttribute('data-haven-preset')).toBe('liquid-glass');
    fixture.componentInstance.first.update((theme) => ({
      ...theme,
      tokens: { primary: '#0a8b51' },
    }));
    await expect
      .poll(async () => (await panel(first))?.style.getPropertyValue('--mat-sys-primary'))
      .toBe('#0a8b51');
    await (await first.host()).sendKeys(TestKey.ESCAPE);
    await second.focus();
    await expect
      .poll(async () => (await panel(second))?.style.getPropertyValue('--mat-sys-primary'))
      .toBe('#315dd1');
    expect((await panel(second))?.getAttribute('data-haven-preset')).toBe('material');
    expect((await panel(second))?.getAttribute('data-haven-density')).toBe('compact');
    expect(
      document
        .querySelector<HTMLElement>('.cdk-overlay-container')
        ?.style.getPropertyValue('--mat-sys-primary'),
    ).toBe('');
  });
});
