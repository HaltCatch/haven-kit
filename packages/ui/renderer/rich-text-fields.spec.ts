import { DeferBlockBehavior, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Quill from 'quill';
import type { HavenDocument } from '@haven/schema';
import { HavenRenderer } from './renderer';
import { setupRichTextTests } from '../../../tests/ui/rich-text-support';

beforeEach(() => {
  TestBed.configureTestingModule({ deferBlockBehavior: DeferBlockBehavior.Playthrough });
  setupRichTextTests();
});
afterEach(() => TestBed.resetTestingModule());
const document = (): HavenDocument => ({
  schemaVersion: '1.0',
  id: 'rich-page',
  title: 'Description',
  actions: {},
  resources: {},
  theme: { preset: 'material', mode: 'dark', density: 'comfortable' },
  dataSchema: { type: 'object', properties: { html: { type: 'string' } }, required: ['html'] },
  ui: {
    id: 'root',
    kind: 'form',
    version: 1,
    children: [
      {
        id: 'body',
        kind: 'field.rich-text',
        version: 1,
        bind: '/html',
        props: { label: 'Body', maxTextLength: 20 },
      },
    ],
  },
});
async function create(html: string) {
  const fixture = TestBed.createComponent(HavenRenderer);
  const model = document();
  fixture.componentRef.setInput('document', model);
  fixture.componentRef.setInput('value', { html });
  await fixture.whenStable();
  await expect
    .poll(async () => {
      await fixture.whenStable();
      return (fixture.nativeElement as HTMLElement).querySelector('.ql-editor');
    })
    .not.toBeNull();
  await fixture.whenStable();
  const editor = () => Quill.find(fixture.nativeElement.querySelector('.ql-container')) as Quill;
  return { fixture, renderer: fixture.componentInstance, model, editor };
}
it('uses semantic empty/length rules with real deferred Quill and strict native submission', async () => {
  const t = await create('<p><br></p>');
  expect(t.renderer.validation().diagnostics).toEqual([]);
  await expect.poll(() => t.renderer.fields()?.().valid()).toBe(false);
  expect(
    t.renderer
      .fields()?.()
      .errorSummary()
      .some((e) => e.kind === 'required'),
  ).toBe(true);
  const save = vi.fn();
  expect(await t.renderer.submit({ action: save })).toBe(false);
  t.editor().insertText(0, 'Hello', 'user');
  await t.fixture.whenStable();
  await expect.poll(() => t.renderer.fields()?.().valid()).toBe(true);
  expect(t.renderer.value()['html']).toContain('Hello');
  expect(await t.renderer.submit({ action: save })).toBe(true);
  expect(save).toHaveBeenCalledOnce();
  const stricter = structuredClone(t.model);
  stricter.ui.children![0]!.props!['maxTextLength'] = 2;
  t.fixture.componentRef.setInput('document', stricter);
  await t.fixture.whenStable();
  expect(await t.renderer.submit({ action: save })).toBe(false);
  expect(save).toHaveBeenCalledOnce();
});
it('keeps unsafe external HTML intact in data while refusing it as valid form content', async () => {
  const raw = '<p onclick="alert(1)">Keep<script>alert(1)</script></p>';
  const t = await create(raw);
  expect(t.renderer.value()['html']).toBe(raw);
  expect(t.fixture.nativeElement.querySelector('.ql-editor').innerHTML).not.toMatch(
    /onclick|script/,
  );
  expect(await t.renderer.submit({ action: vi.fn() })).toBe(false);
});
it('reports one required error after clearing the editor to the native empty string', async () => {
  const t = await create('');
  expect(await t.renderer.submit({ action: vi.fn() })).toBe(false);
  expect(
    t.renderer
      .fields()?.()
      .errorSummary()
      .filter((e) => e.kind === 'required'),
  ).toHaveLength(1);
});
it('rejects stale parser state on same-tick value or owner changes and preserves cosmetic edits', async () => {
  const t = await create('<p>Saved</p>');
  await expect.poll(() => t.renderer.fields()?.().valid()).toBe(true);
  const editor = t.editor();
  const cosmetic = structuredClone(t.model);
  cosmetic.title = 'Renamed';
  cosmetic.ui.children![0]!.props!['label'] = 'Translated label';
  t.fixture.componentRef.setInput('document', cosmetic);
  await t.fixture.whenStable();
  expect(t.editor()).toBe(editor);
  expect(t.renderer.fields()?.().valid()).toBe(true);
  const save = vi.fn();
  t.renderer.value.set({ html: '<p onclick="bad()">Changed</p>' });
  expect(await t.renderer.submit({ action: save })).toBe(false);
  expect(save).not.toHaveBeenCalled();
  await t.fixture.whenStable();
  t.fixture.componentRef.setInput('host', { revision: 'another-owner' });
  expect(await t.renderer.submit({ action: save })).toBe(false);
  expect(save).not.toHaveBeenCalled();
});
