import { TestBed } from '@angular/core/testing';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import type { FileReference, UploadAdapter } from '@haven/runtime';
import { createRichText, setupRichTextTests } from '../../../tests/ui/rich-text-support';

beforeEach(async () => {
  setupRichTextTests();
  // Await a used export so sideEffects:false cannot remove this upload-test precondition.
  const engine = await import('./engine');
  expect(engine.RichTextEngine).toBeTypeOf('function');
});
afterEach(() => TestBed.resetTestingModule());
const file = (name = 'image.png') => new File(['png'], name, { type: 'image/png' });
const ref = (name = 'image.png'): FileReference => ({
  id: name,
  name,
  mediaType: 'image/png',
  size: 3,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}
it('does not call upload after a pending listener synchronously cancels', async () => {
  const upload = vi.fn<UploadAdapter['upload']>(async () => ref());
  const f = await createRichText('<p>Saved</p>', { adapter: { upload, url: async () => '' } });
  f.componentInstance.uploadingChange.subscribe((value) => {
    if (value) f.componentInstance.cancel();
  });
  await f.componentInstance.choose(file());
  expect(upload).not.toHaveBeenCalled();
  expect(f.componentInstance.uploading()).toBe(false);
  expect(f.componentInstance.value()).toBe('<p>Saved</p>');
});
it('preserves a newer upload started synchronously by an old adapter abort listener', async () => {
  const first = deferred<FileReference>(),
    second = deferred<FileReference>();
  let count = 0,
    replacement: Promise<void> | undefined;
  const adapter: UploadAdapter = {
    upload: (_file, _name, options) => {
      if (++count === 1) {
        options.signal.addEventListener(
          'abort',
          () => {
            replacement = f.componentInstance.choose(file('second.png'));
          },
          { once: true },
        );
        return first.promise;
      }
      return second.promise;
    },
    url: async () => '',
  };
  const f = await createRichText('<p>Saved</p>', { adapter });
  const initial = f.componentInstance.choose(file());
  f.componentInstance.cancel();
  try {
    expect(count).toBe(2);
    expect(f.componentInstance.uploading()).toBe(true);
  } finally {
    first.resolve(ref('first.png'));
    second.resolve(ref('second.png'));
    await initial;
    await replacement;
  }
  expect(f.componentInstance.value()).toContain('second.png');
  expect(f.componentInstance.value()).not.toContain('first.png');
});
