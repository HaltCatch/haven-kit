import { bindValidationLifetime } from './validation-lifetime';
import {
  Component,
  resource,
  signal,
  createEnvironmentInjector,
  EnvironmentInjector,
  inject,
  DestroyRef,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  applyEach,
  form,
  readonly,
  disabled,
  hidden,
  submit,
  validate,
  validateAsync,
} from '@angular/forms/signals';
import { afterEach, expect, it } from 'vitest';
@Component({
  selector: 'haven-validation-lifecycle-test',
  template: `{{ fields().pending() }}:{{ fields().valid() }}`,
})
class Probe {
  readonly owner = createEnvironmentInjector([], inject(EnvironmentInjector));
  constructor() {
    inject(DestroyRef).onDestroy(() => this.owner.destroy());
  }
  readonly value = signal({
    name: 'old',
    rows: [
      { left: 1, right: 2 },
      { left: 2, right: 1 },
    ],
  });
  readonly locked = signal(false);
  readonly blocked = signal(false);
  readonly concealed = signal(false);
  readonly calls: { value: string; signal: AbortSignal; resolve: (value: boolean) => void }[] = [];
  readonly fields = form(
    this.value,
    (p) => {
      readonly(p.name, { when: () => this.locked() });
      disabled(p.name, { when: () => this.blocked() });
      hidden(p.name, () => this.concealed());
      validateAsync(p.name, {
        params: ({ value }) => value(),
        debounce: 5,
        factory: (params) => {
          const result = resource({
            params,
            loader: ({ params, abortSignal }) =>
              new Promise<boolean>((resolve) =>
                this.calls.push({ value: params, signal: abortSignal, resolve }),
              ),
          });
          bindValidationLifetime(result, this.owner.get(DestroyRef));
          return result;
        },
        onSuccess: (valid) => (valid ? null : { kind: 'rejected' }),
        onError: () => ({ kind: 'unavailable' }),
      });
      applyEach(p.rows, (item) =>
        validate(item.right, ({ value, valueOf }) =>
          value() >= valueOf(item.left) ? null : { kind: 'order' },
        ),
      );
    },
    { injector: this.owner },
  );
}
afterEach(() => TestBed.resetTestingModule());
it('public ResourceRef lifecycle aborts readonly while native submit strict gating stays unchanged', async () => {
  const fixture = TestBed.createComponent(Probe);
  fixture.detectChanges();
  TestBed.tick();
  const c = fixture.componentInstance;
  await expect.poll(() => c.calls.length).toBe(1);
  expect(c.fields.name().pending()).toBe(true);
  // Use subfield to avoid independent cross-field error deliberately present in rows.
  let invoked = 0;
  expect(
    await submit(c.fields.name, {
      ignoreValidators: 'none',
      action: async () => {
        invoked++;
      },
    }),
  ).toBe(false);
  expect(invoked).toBe(0);
  expect(
    await submit(c.fields.name, {
      action: async () => {
        invoked++;
      },
    }),
  ).toBe(true);
  expect(invoked).toBe(1);
  c.locked.set(true);
  TestBed.tick();
  await new Promise((r) => setTimeout(r, 30));
  TestBed.tick();
  expect(c.calls[0]!.signal.aborted).toBe(true);
  expect(c.fields.name().pending()).toBe(false);
  expect(c.fields.name().valid()).toBe(true);
  c.calls[0]!.resolve(false);
  await fixture.whenStable();
  expect(c.fields.name().errors()).toEqual([]);
});
it('native resource owns latest-only results without a second async scheduler', async () => {
  const fixture = TestBed.createComponent(Probe);
  fixture.detectChanges();
  TestBed.tick();
  const c = fixture.componentInstance;
  await expect.poll(() => c.calls.length).toBe(1);
  c.value.update((v) => ({ ...v, name: 'new' }));
  TestBed.tick();
  await expect.poll(() => c.calls.length).toBe(2);
  expect(c.calls[0]!.signal.aborted).toBe(true);
  c.calls[1]!.resolve(true);
  await fixture.whenStable();
  c.calls[0]!.resolve(false);
  await fixture.whenStable();
  expect(c.fields.name().valid()).toBe(true);
  expect(c.fields.name().errors()).toEqual([]);
});
it('public owner destroy aborts child resource while applyEach cross-field reorder stays native', async () => {
  const fixture = TestBed.createComponent(Probe);
  fixture.detectChanges();
  TestBed.tick();
  const c = fixture.componentInstance;
  expect(c.fields.rows[0]!.right().valid()).toBe(true);
  expect(c.fields.rows[1]!.right().errors()[0]?.kind).toBe('order');
  c.value.update((v) => ({ ...v, rows: [v.rows[1]!, v.rows[0]!] }));
  TestBed.tick();
  expect(c.fields.rows[0]!.right().errors()[0]?.kind).toBe('order');
  expect(c.fields.rows[1]!.right().valid()).toBe(true);
  fixture.destroy();
  await new Promise((r) => setTimeout(r, 30));
  expect(c.calls[0]!.signal.aborted).toBe(true);
  c.calls[0]!.resolve(true);
});

for (const mode of ['blocked', 'concealed', 'locked'] as const) {
  it(`public lifecycle cancels ${mode}, restarts on activation and never loads after owner destruction`, async () => {
    const fixture = TestBed.createComponent(Probe);
    fixture.detectChanges();
    TestBed.tick();
    const c = fixture.componentInstance;
    await expect.poll(() => c.calls.length).toBe(1);
    c[mode].set(true);
    TestBed.tick();
    await expect.poll(() => c.calls[0]!.signal.aborted).toBe(true);
    expect(c.fields.name().pending()).toBe(false);
    expect(c.fields.name().valid()).toBe(true);
    c.calls[0]!.resolve(false);
    await fixture.whenStable();
    expect(c.fields.name().errors()).toEqual([]);
    c.value.update((v) => ({ ...v, name: 'inactive-new' }));
    TestBed.tick();
    await new Promise((r) => setTimeout(r, 30));
    expect(c.calls).toHaveLength(1);
    c[mode].set(false);
    TestBed.tick();
    await expect.poll(() => c.calls.length).toBe(2);
    expect(c.calls[1]!.value).toBe('inactive-new');
    expect(c.fields.name().pending()).toBe(true);
    fixture.destroy();
    expect(c.calls[1]!.signal.aborted).toBe(true);
    c.value.update((v) => ({ ...v, name: 'after-destroy' }));
    TestBed.tick();
    await new Promise((r) => setTimeout(r, 30));
    expect(c.calls).toHaveLength(2);
    c.calls[1]!.resolve(false);
  });
}
