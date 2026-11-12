import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Quill from 'quill/core.js';
import type { FileReference, UploadAdapter } from '@haven/runtime';
import { createRichText, setupRichTextTests } from '../../../tests/ui/rich-text-support';

beforeEach(setupRichTextTests);
afterEach(() => TestBed.resetTestingModule());
const image: FileReference = { id: 'asset-1', name: 'photo.png', mediaType: 'image/png', size: 3 };
const file = () => new File(['png'], 'photo.png', { type: 'image/png' });
it('uses the host upload and URL ports, reports pending/progress and persists no URL', async () => {
  const adapter: UploadAdapter = {
    upload: vi.fn(async (_file, _name, options) => {
      options.progress(1, 2);
      return image;
    }),
    url: vi.fn(async () => 'https://host.test/signed?secret=transient'),
  };
  const f = await createRichText('', { adapter, maxImageBytes: 5 });
  const states: boolean[] = [];
  f.componentInstance.uploadingChange.subscribe((value) => states.push(value));
  const promise = f.componentInstance.choose(file());
  expect(f.componentInstance.uploading()).toBe(true);
  expect(f.componentInstance.progress()).toBe(50);
  await promise;
  await f.whenStable();
  expect(states).toEqual([true, false]);
  expect(adapter.upload).toHaveBeenCalledOnce();
  expect(f.componentInstance.value()).toContain('data-haven-asset-id="asset-1"');
  expect(f.componentInstance.value()).not.toMatch(/src=|signed|secret|blob:|https:/);
  expect(f.componentInstance.contentState()).toEqual({ valid: true, empty: false, textLength: 0 });
  await expect
    .poll(() => f.nativeElement.querySelector('img')?.getAttribute('src'))
    .toBe('https://host.test/signed?secret=transient');
  expect(f.componentInstance.value()).not.toContain('transient');
});
it.each(['cancel', 'readonly', 'disabled', 'identity', 'value', 'adapter', 'destroy'] as const)(
  'ignores a late upload result after %s',
  async (change) => {
    let resolve!: (value: FileReference) => void;
    let signal!: AbortSignal;
    const adapter: UploadAdapter = {
      upload: (_file, _name, options) => {
        signal = options.signal;
        return new Promise((r) => (resolve = r));
      },
      url: vi.fn(async () => 'https://host.test/image'),
    };
    const f = await createRichText('<p>Initial</p>', { adapter, identity: 'first' });
    const uploading = f.componentInstance.choose(file());
    if (change === 'cancel') f.componentInstance.cancel();
    else if (change === 'destroy') f.destroy();
    else
      f.componentRef.setInput(
        change,
        change === 'identity'
          ? 'second'
          : change === 'value'
            ? '<p>Replacement</p>'
            : change === 'adapter'
              ? { ...adapter }
              : true,
      );
    if (change !== 'destroy') await f.whenStable();
    expect(signal.aborted).toBe(true);
    resolve(image);
    await uploading;
    expect(f.componentInstance.value()).toBe(
      change === 'value' ? '<p>Replacement</p>' : '<p>Initial</p>',
    );
    expect(adapter.url).not.toHaveBeenCalled();
    expect(f.componentInstance.uploading()).toBe(false);
  },
);
it('rejects invalid files and host responses, surfaces failures, and allows retry', async () => {
  const adapter: UploadAdapter = {
    upload: vi.fn(async () => image),
    url: vi.fn(async () => 'javascript:alert(1)'),
  };
  const f = await createRichText('', { adapter, maxImageBytes: 2 });
  await f.componentInstance.choose(file());
  expect(adapter.upload).not.toHaveBeenCalled();
  expect(f.componentInstance.failure()).toBe('richText.imageInvalid');
  f.componentRef.setInput('maxImageBytes', 10);
  await f.whenStable();
  vi.mocked(adapter.upload).mockResolvedValueOnce({ ...image, mediaType: 'image/svg+xml' });
  await f.componentInstance.choose(file());
  expect(f.componentInstance.value()).toBe('');
  expect(f.componentInstance.failure()).toBe('richText.uploadError');
  await f.componentInstance.choose(file());
  await f.whenStable();
  await expect.poll(() => f.componentInstance.failure()).toBe('richText.imageError');
  expect(f.nativeElement.querySelector('img')?.hasAttribute('src')).toBe(false);
});
it('isolates simultaneous instances and cancels stale preview URLs on adapter replacement', async () => {
  let resolve!: (url: string) => void;
  let signal!: AbortSignal;
  const first: UploadAdapter = {
    upload: async () => image,
    url: (_file, s) => {
      signal = s;
      return new Promise((r) => (resolve = r));
    },
  };
  const second: UploadAdapter = {
    upload: async () => ({ ...image, id: 'second' }),
    url: async () => 'https://second.test/image',
  };
  const a = await createRichText('', { adapter: first });
  const b = await createRichText('', { adapter: second });
  await a.componentInstance.choose(file());
  await b.componentInstance.choose(file());
  await a.whenStable();
  await b.whenStable();
  a.componentRef.setInput('adapter', second);
  await a.whenStable();
  expect(signal.aborted).toBe(true);
  resolve('https://old.test/image');
  await expect
    .poll(() => a.nativeElement.querySelector('img')?.getAttribute('src'))
    .toBe('https://second.test/image');
  expect(b.componentInstance.value()).toContain('data-haven-asset-id="second"');
  expect(a.componentInstance.value()).toContain('data-haven-asset-id="asset-1"');
  const editor = Quill.find(a.nativeElement.querySelector('.ql-container')) as Quill;
  editor.insertText(0, 'Text', 'user');
  expect(b.componentInstance.value()).not.toContain('Text');
});
it('does not silently pretend images can upload without a host adapter', async () => {
  const f = await createRichText();
  await f.componentInstance.choose(file());
  expect(f.componentInstance.failure()).toBe('richText.uploadUnavailable');
  expect(f.componentInstance.value()).toBe('');
});
