import { Component, signal, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormField, form, required, validate, disabled } from '@angular/forms/signals';
import type { HavenTheme } from '@haven/schema';
import { HavenThemeDirective } from '@haven/ui/theme';
import { HavenRichTextField } from './rich-text';
import type { HavenRichTextState } from './rich-text';
import { afterEach, beforeEach, expect, it } from 'vitest';
import Quill from 'quill/core.js';
import { setupRichTextTests } from '../../../tests/ui/rich-text-support';

@Component({
  imports: [HavenRichTextField, FormField, HavenThemeDirective],
  template: `<section [havenTheme]="theme()">
      <haven-rich-text-field
        label="Body"
        [formField]="fields.body"
        (contentStateChange)="state.set($event)"
      />
    </section>
    <button type="button" data-outside>Outside</button>`,
})
class Host {
  readonly theme = signal<HavenTheme>({ preset: 'material', mode: 'dark', density: 'comfortable' });
  readonly value = signal({ body: '' });
  readonly state = signal<HavenRichTextState | undefined>(undefined);
  readonly locked = signal(false);
  readonly fields = form(this.value, (p) => {
    required(p.body);
    disabled(p.body, { when: () => this.locked() });
    validate(p.body, ({ value }) => {
      const state = this.state();
      if (!state?.ready || state.value !== value()) return { kind: 'richText' };
      if (!state.valid) return { kind: 'richText' };
      if (state.empty) return { kind: 'required' };
      return undefined;
    });
  });
  readonly field = viewChild.required(HavenRichTextField);
}
beforeEach(setupRichTextTests);
afterEach(() => TestBed.resetTestingModule());
it('is a native FormValueControl and applies semantic validation through native validate', async () => {
  const f = TestBed.createComponent(Host);
  await f.whenStable();
  await expect.poll(() => f.componentInstance.field().ready()).toBe(true);
  await f.whenStable();
  const host = f.componentInstance;
  expect(host.fields.body().invalid()).toBe(true);
  const quill = Quill.find(f.nativeElement.querySelector('.ql-container')) as Quill;
  quill.insertText(0, 'Content', 'user');
  await f.whenStable();
  expect(host.value().body).toBe('<p>Content</p>');
  expect(host.fields.body().valid()).toBe(true);
  host.value.set({ body: '<p><br></p>' });
  await f.whenStable();
  expect(
    host.fields
      .body()
      .errors()
      .some((e) => e.kind === 'required'),
  ).toBe(true);
  host.locked.set(true);
  await f.whenStable();
  expect(quill.isEnabled()).toBe(false);
  expect(quill.root.getAttribute('aria-disabled')).toBe('true');
});
it('preserves editor and selection across Material/Glass/RTL changes and emits one composite blur', async () => {
  const f = TestBed.createComponent(Host);
  await f.whenStable();
  await expect.poll(() => f.componentInstance.field().ready()).toBe(true);
  await f.whenStable();
  const control = f.componentInstance.field();
  const quill = Quill.find(f.nativeElement.querySelector('.ql-container')) as Quill;
  quill.insertText(0, 'ABC', 'user');
  quill.setSelection(1, 0, 'silent');
  expect(f.nativeElement.querySelector('[data-haven-glass]')).toBeNull();
  f.componentInstance.theme.set({ preset: 'liquid-glass', mode: 'dark', density: 'compact' });
  f.nativeElement.setAttribute('dir', 'rtl');
  await f.whenStable();
  expect(f.nativeElement.querySelector('[data-haven-glass]')).not.toBeNull();
  expect(Quill.find(f.nativeElement.querySelector('.ql-container'))).toBe(quill);
  expect(quill.getText()).toBe('ABC\n');
  expect(quill.getSelection()?.index).toBe(1);
  const departures: number[] = [];
  control.focusLeft.subscribe(() => departures.push(1));
  control.focus();
  await f.whenStable();
  f.nativeElement.querySelector('haven-rich-text-toolbar button').focus();
  await f.whenStable();
  expect(departures).toHaveLength(0);
  f.nativeElement.querySelector('[data-outside]').focus();
  await f.whenStable();
  expect(departures).toHaveLength(1);
  expect(f.componentInstance.fields.body().touched()).toBe(true);
});
it('discards a pending lazy editor when destroyed before module resolution', async () => {
  const f = TestBed.createComponent(HavenRichTextField);
  f.componentRef.setInput('label', 'Loading');
  const states: HavenRichTextState[] = [];
  f.componentInstance.contentStateChange.subscribe((s) => states.push(s));
  f.detectChanges();
  f.destroy();
  await import('./engine');
  await Promise.resolve();
  expect(f.componentInstance.ready()).toBe(false);
  expect(f.nativeElement.querySelector('.ql-editor')).toBeNull();
  expect(states.every((s) => !s.ready)).toBe(true);
});
