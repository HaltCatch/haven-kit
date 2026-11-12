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
import { applyEach, form, validateAsync } from '@angular/forms/signals';
import { afterEach, expect, it } from 'vitest';
import { bindValidationLifetime } from './validation-lifetime';
afterEach(() => TestBed.resetTestingModule());
@Component({ selector: 'haven-validation-row-test', template: `{{ fields().pending() }}` })
class RowsProbe {
  readonly owner = createEnvironmentInjector([], inject(EnvironmentInjector));
  constructor() {
    inject(DestroyRef).onDestroy(() => this.owner.destroy());
  }
  readonly value = signal({ rows: [{ name: 'A' }, { name: 'B' }] });
  readonly calls: { name: string; signal: AbortSignal; resolve: (value: boolean) => void }[] = [];
  readonly fields = form(
    this.value,
    (p) =>
      applyEach(p.rows, (item) =>
        validateAsync(item.name, {
          params: ({ value }) => value(),
          factory: (params) => {
            const result = resource({
              params,
              loader: ({ params, abortSignal }) =>
                new Promise<boolean>((resolve) =>
                  this.calls.push({ name: params, signal: abortSignal, resolve }),
                ),
            });
            bindValidationLifetime(result, this.owner.get(DestroyRef));
            return result;
          },
          onSuccess: (valid) => (valid ? null : { kind: 'rejected' }),
          onError: () => ({ kind: 'unavailable' }),
        }),
      ),
    { injector: this.owner },
  );
}
it('native repeated field removal aborts only removed transport, while reordered/replacement ownership isolates late results', async () => {
  const fixture = TestBed.createComponent(RowsProbe);
  fixture.detectChanges();
  TestBed.tick();
  const c = fixture.componentInstance;
  await expect.poll(() => c.calls.length).toBe(2);
  const a = c.calls.find((v) => v.name === 'A')!,
    b = c.calls.find((v) => v.name === 'B')!;
  c.value.update((v) => ({ rows: [v.rows[1]!, v.rows[0]!] }));
  TestBed.tick();
  expect(c.calls).toHaveLength(2);
  expect(a.signal.aborted).toBe(false);
  expect(b.signal.aborted).toBe(false);
  c.value.update((v) => ({ rows: [v.rows[0]!] }));
  TestBed.tick();
  await expect.poll(() => a.signal.aborted).toBe(true);
  expect(b.signal.aborted).toBe(false);
  c.value.update(() => ({ rows: [{ name: 'C' }] }));
  TestBed.tick();
  await expect.poll(() => c.calls.length).toBe(3);
  expect(b.signal.aborted).toBe(true);
  const current = c.calls[2]!;
  expect(current.name).toBe('C');
  current.resolve(true);
  await fixture.whenStable();
  a.resolve(false);
  b.resolve(false);
  await fixture.whenStable();
  expect(c.fields.rows[0]!.name().valid()).toBe(true);
  expect(c.fields.rows[0]!.name().errors()).toEqual([]);
  const count = c.calls.length;
  fixture.destroy();
  c.value.set({ rows: [{ name: 'After' }] });
  TestBed.tick();
  await new Promise((r) => setTimeout(r, 20));
  expect(c.calls).toHaveLength(count);
});
