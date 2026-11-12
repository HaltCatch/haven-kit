import { TestBed } from '@angular/core/testing';
import { expect, it, vi } from 'vitest';
import { HavenImageField } from './upload';
import { revoke, setupAssetTests, source } from '../../../tests/ui/asset-support';
setupAssetTests();
it('cleans previews when a public uploadingChange listener synchronously cancels decoding', async () => {
  vi.stubGlobal(
    'Image',
    class {
      src = '';
      onload = null;
      onerror = null;
      removeAttribute() {
        this.src = '';
      }
    },
  );
  const fixture = TestBed.createComponent(HavenImageField);
  fixture.componentRef.setInput('label', 'Artwork');
  fixture.componentRef.setInput('minWidth', 1);
  const upload = vi.fn(source().upload);
  fixture.componentRef.setInput('adapter', source({ upload }));
  await fixture.whenStable();
  const field = fixture.componentInstance;
  field.uploadingChange.subscribe((uploading) => {
    if (uploading) field.cancel();
  });
  await field.choose(new File(['bytes'], 'image.png', { type: 'image/png' }));
  expect(upload).not.toHaveBeenCalled();
  expect(field.uploading()).toBe(false);
  expect(field.value()).toEqual([]);
  expect(field.localPreview()).toBeNull();
  expect(revoke).toHaveBeenCalledOnce();
});
