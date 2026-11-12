import { TestBed } from '@angular/core/testing';
import { expect, it } from 'vitest';
import { HavenImageField } from './upload';
import { deferred, setupAssetTests, source } from '../../../tests/ui/asset-support';
import type { FileReference } from '@haven/runtime';
setupAssetTests();
it('does not clear a new upload started synchronously by the old adapter AbortSignal callback', async () => {
  const fixture = TestBed.createComponent(HavenImageField);
  fixture.componentRef.setInput('label', 'Image');
  const field = fixture.componentInstance;
  const first = deferred<FileReference>(),
    second = deferred<FileReference>();
  let count = 0;
  let replacement: Promise<void> | undefined;
  fixture.componentRef.setInput(
    'adapter',
    source({
      upload: (_file, _name, options) => {
        if (++count === 1) {
          options.signal.addEventListener(
            'abort',
            () => {
              replacement = field.choose(new File(['b'], 'second.png', { type: 'image/png' }));
            },
            { once: true },
          );
          return first.promise;
        }
        return second.promise;
      },
    }),
  );
  await fixture.whenStable();
  const initial = field.choose(new File(['a'], 'first.png', { type: 'image/png' }));
  field.cancel();
  try {
    expect(count).toBe(2);
    expect(field.uploadName()).toBe('second.png');
    expect(field.uploading()).toBe(true);
    expect(field.localPreview()).not.toBeNull();
  } finally {
    first.resolve({ id: 'first', name: 'first.png', mediaType: 'image/png', size: 1 });
    second.resolve({ id: 'second', name: 'second.png', mediaType: 'image/png', size: 1 });
    await initial;
    await replacement;
  }
});
