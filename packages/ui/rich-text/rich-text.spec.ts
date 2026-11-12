import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { afterEach, beforeEach, expect, it } from 'vitest';
import Quill from 'quill/core.js';
import { createRichText, setupRichTextTests } from '../../../tests/ui/rich-text-support';

beforeEach(setupRichTextTests);
afterEach(() => TestBed.resetTestingModule());
it('loads a real Quill editor, emits semantic HTML and clears explicitly', async () => {
  const f = await createRichText('<p>Hello</p>');
  const control = f.componentInstance;
  const quill = Quill.find(f.nativeElement.querySelector('.ql-container')) as Quill;
  expect(quill.getText()).toBe('Hello\n');
  quill.insertText(5, ' world', 'user');
  expect(control.value()).toBe('<p>Hello&nbsp;world</p>');
  expect(control.contentState()).toEqual({ valid: true, empty: false, textLength: 11 });
  quill.setSelection(0, 5, 'silent');
  control.format({ name: 'bold', value: true });
  expect(control.value()).toContain('<strong>Hello</strong>');
  control.command('undo');
  expect(control.value()).not.toContain('<strong>');
  control.clear();
  await f.whenStable();
  expect(control.value()).toBe('');
  expect(quill.getText()).toBe('\n');
  expect(control.contentState().empty).toBe(true);
});
it.each(['readonly', 'disabled'])(
  'honors initial and changing %s while preserving values',
  async (key) => {
    const f = await createRichText('<p>Saved</p>', { [key]: true });
    const quill = Quill.find(f.nativeElement.querySelector('.ql-container')) as Quill;
    expect(quill.isEnabled()).toBe(false);
    quill.insertText(0, 'Bad', 'user');
    f.componentInstance.clear();
    expect(f.componentInstance.value()).toBe('<p>Saved</p>');
    f.componentRef.setInput(key, false);
    await f.whenStable();
    expect(quill.isEnabled()).toBe(true);
    quill.insertText(0, 'Good ', 'user');
    expect(f.componentInstance.value()).toContain('Good&nbsp;Saved');
  },
);
it('sanitizes pasted HTML and keeps unsafe external values unchanged with an invalid state', async () => {
  const raw =
    '<p onclick="alert(1)">Safe<script>alert(1)</script><img src="https://tracker.test"></p>';
  const f = await createRichText(raw);
  expect(f.componentInstance.value()).toBe(raw);
  expect(f.componentInstance.contentState().valid).toBe(false);
  const root: HTMLElement = f.nativeElement.querySelector('.ql-editor');
  expect(root.innerHTML).not.toMatch(/script|onclick|tracker/);
  const paste = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(paste, 'clipboardData', {
    value: {
      files: [],
      getData: (type: string) =>
        type === 'text/html'
          ? '<p><strong>Paste</strong><img src="x" onerror="alert(1)"><a href="javascript:alert(1)">link</a></p>'
          : 'Paste',
    },
  });
  root.dispatchEvent(paste);
  expect(f.componentInstance.value()).toContain('<strong>Paste</strong>');
  expect(f.componentInstance.value()).not.toMatch(/script|onerror|src=/);
  expect(f.componentInstance.contentState().valid).toBe(true);
});
it('applies external changes without echo, preserves content on locale changes, and isolates a replaced owner', async () => {
  const f = await createRichText('<p>One</p>', { identity: 'a' });
  const old = Quill.find(f.nativeElement.querySelector('.ql-container')) as Quill;
  let changes = 0;
  f.componentInstance.value.subscribe(() => changes++);
  f.componentRef.setInput('value', '<p>Two</p>');
  await f.whenStable();
  expect(old.getText()).toBe('Two\n');
  expect(changes).toBe(0);
  TestBed.inject(TranslocoService).setActiveLang('zh-CN');
  await f.whenStable();
  expect(old.root.lang).toBe('zh-CN');
  expect(f.componentInstance.value()).toBe('<p>Two</p>');
  f.componentRef.setInput('identity', 'b');
  old.insertText(0, 'stale', 'user');
  expect(f.componentInstance.value()).toBe('<p>Two</p>');
  await f.whenStable();
  await expect.poll(() => f.componentInstance.ready()).toBe(true);
  await f.whenStable();
  expect(old.isEnabled()).toBe(false);
  expect(f.nativeElement.querySelectorAll('.ql-editor')).toHaveLength(1);
  f.destroy();
  expect(f.nativeElement.querySelectorAll('.ql-editor')).toHaveLength(0);
});
it('roundtrips supported lists, headings and links through real editor history', async () => {
  const f = await createRichText('<p>One</p><p>Two</p>');
  const quill = Quill.find(f.nativeElement.querySelector('.ql-container')) as Quill;
  quill.setSelection(0, 3, 'silent');
  f.componentInstance.format({ name: 'header', value: 2 });
  expect(f.componentInstance.value()).toContain('<h2>One</h2>');
  f.componentInstance.format({ name: 'header', value: 2 });
  f.componentInstance.format({ name: 'list', value: 'bullet' });
  expect(f.componentInstance.value()).toContain('<ul>');
  f.componentInstance.format({ name: 'link', value: 'https://example.test/path' });
  expect(f.componentInstance.value()).toContain('href="https://example.test/path"');
  expect(f.componentInstance.value()).toContain('rel="noopener noreferrer"');
  const saved = f.componentInstance.value();
  f.componentRef.setInput('value', '');
  await f.whenStable();
  f.componentRef.setInput('value', saved);
  await f.whenStable();
  expect(quill.getText()).toBe('One\nTwo\n');
  expect(f.componentInstance.contentState().valid).toBe(true);
});
it('rejects old editor writes before external input refresh and preserves malformed values', async () => {
  const f = await createRichText('<p>One</p>');
  const quill = Quill.find(f.nativeElement.querySelector('.ql-container')) as Quill;
  f.componentRef.setInput('value', '<p>Replacement</p>');
  quill.insertText(0, 'stale', 'user');
  expect(f.componentInstance.value()).toBe('<p>Replacement</p>');
  await f.whenStable();
  expect(quill.getText()).toBe('Replacement\n');
  f.componentRef.setInput('value', null);
  await f.whenStable();
  expect(f.componentInstance.value()).toBeNull();
  expect(f.componentInstance.contentState().valid).toBe(false);
  expect(quill.getText()).toBe('\n');
  expect(quill.isEnabled()).toBe(false);
  f.componentInstance.clear();
  await f.whenStable();
  expect(f.componentInstance.value()).toBe('');
  expect(quill.isEnabled()).toBe(true);
});
