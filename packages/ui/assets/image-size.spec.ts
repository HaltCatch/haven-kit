import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { beforeEach, expect, it, vi } from 'vitest';
import { HavenImageField } from './upload';
import { checkImageSize, imageSizeIssue } from './image-size';
import { deferred, revoke, setupAssetTests, source } from '../../../tests/ui/asset-support';
import {
  document as assetDocument,
  render as renderDocument,
} from '../../../tests/ui/asset-support';
import type { FileReference } from '@haven/runtime';

setupAssetTests();
class NativeImage {
  static instances: NativeImage[] = [];
  naturalWidth = 0;
  naturalHeight = 0;
  src = '';
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() {
    NativeImage.instances.push(this);
  }
  removeAttribute(name: string) {
    if (name === 'src') this.src = '';
  }
  load(width: number, height: number) {
    this.naturalWidth = width;
    this.naturalHeight = height;
    this.onload?.();
  }
}
beforeEach(() => {
  NativeImage.instances = [];
  vi.stubGlobal('Image', NativeImage);
});
const file = () => new File(['image'], 'art.png', { type: 'image/png' });
const previous: FileReference = { id: 'old', name: 'old.png', mediaType: 'image/png', size: 3 };
async function create() {
  const fixture = TestBed.createComponent(HavenImageField);
  fixture.componentRef.setInput('label', 'Artwork');
  const upload = vi.fn(source().upload);
  fixture.componentRef.setInput('adapter', source({ upload }));
  fixture.componentRef.setInput('minWidth', 100);
  fixture.componentRef.setInput('maxWidth', 300);
  fixture.componentRef.setInput('minHeight', 50);
  fixture.componentRef.setInput('maxHeight', 200);
  fixture.componentRef.setInput('value', [previous]);
  await fixture.whenStable();
  return { fixture, field: fixture.componentInstance, upload };
}
it('checks inclusive native dimensions and rejects zero or malformed decoded dimensions', () => {
  const bounds = { minWidth: 100, maxWidth: 300, minHeight: 50, maxHeight: 200 };
  expect(imageSizeIssue(100, 50, bounds)).toBe(false);
  expect(imageSizeIssue(300, 200, bounds)).toBe(false);
  for (const [width, height] of [
    [99, 50],
    [301, 50],
    [100, 49],
    [100, 201],
    [0, 50],
    [NaN, 50],
  ])
    expect(imageSizeIssue(width!, height!, bounds)).toBe(true);
});
it('owns upload pending during decoding, uploads only after valid decode and revokes its URL', async () => {
  const { fixture, field, upload } = await create();
  const pending = field.choose(file());
  expect(field.uploading()).toBe(true);
  expect(upload).not.toHaveBeenCalled();
  expect(field.value()).toEqual([previous]);
  const image = NativeImage.instances[0]!;
  image.load(100, 50);
  await pending;
  expect(upload).toHaveBeenCalledOnce();
  expect(field.value()[0]?.id).toBe('uploaded');
  expect(field.uploading()).toBe(false);
  expect(image.onload).toBeNull();
  expect(image.src).toBe('');
  expect(revoke).toHaveBeenCalledWith('blob:renderer-local');
  fixture.destroy();
});
it('keeps previous metadata and never uploads for dimensions or decode failures', async () => {
  const { field, upload } = await create();
  const first = field.choose(file());
  NativeImage.instances[0]!.load(301, 100);
  await first;
  expect(field.error()).toBe('dimensions');
  expect(field.value()).toEqual([previous]);
  const second = field.choose(file());
  NativeImage.instances[1]!.onerror?.();
  await second;
  expect(field.error()).toBe('decode');
  expect(upload).not.toHaveBeenCalled();
  expect(revoke).toHaveBeenCalledTimes(2);
});
it.each(['readonly', 'disabled', 'identity', 'maxWidth'] as const)(
  'cancels decode on %s change and cannot upload late results',
  async (property) => {
    const { fixture, field, upload } = await create();
    const pending = field.choose(file());
    const image = NativeImage.instances[0]!;
    fixture.componentRef.setInput(
      property,
      property === 'identity' ? 'next' : property === 'maxWidth' ? 250 : true,
    );
    await fixture.whenStable();
    await pending;
    image.load(100, 50);
    expect(upload).not.toHaveBeenCalled();
    expect(field.value()).toEqual([previous]);
    expect(field.error()).toBeNull();
    expect(image.src).toBe('');
    expect(revoke).toHaveBeenCalledOnce();
  },
);
it('cancels replaced decode jobs and destroys native handlers without touching the newer job', async () => {
  const { fixture, field, upload } = await create();
  const first = field.choose(file());
  const old = NativeImage.instances[0]!;
  const second = field.choose(file());
  await first;
  old.load(100, 50);
  expect(upload).not.toHaveBeenCalled();
  expect(field.uploading()).toBe(true);
  fixture.destroy();
  await second;
  expect(NativeImage.instances[1]!.onload).toBeNull();
  expect(upload).not.toHaveBeenCalled();
  expect(revoke).toHaveBeenCalledTimes(2);
});
it('cancels a transport started after decoding and diagnoses invalid direct-call configuration', async () => {
  const { fixture, field } = await create();
  const work = deferred<FileReference>();
  let signal!: AbortSignal;
  fixture.componentRef.setInput(
    'adapter',
    source({
      upload: (_f, _n, options) => {
        signal = options.signal;
        return work.promise;
      },
    }),
  );
  await fixture.whenStable();
  const pending = field.choose(file());
  NativeImage.instances[0]!.load(100, 50);
  await Promise.resolve();
  field.cancel();
  expect(signal.aborted).toBe(true);
  work.resolve({ ...previous, id: 'late' });
  await pending;
  expect(field.value()).toEqual([previous]);
  fixture.componentRef.setInput('minWidth', 400);
  await fixture.whenStable();
  await field.choose(file());
  expect(field.error()).toBe('config');
  expect(NativeImage.instances).toHaveLength(1);
});
it('rejects an already aborted decode without installing handlers', async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(
    checkImageSize('blob:owned', { maxWidth: 100 }, controller.signal),
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(NativeImage.instances[0]!.onload).toBeNull();
});

it('receives model bounds in the real renderer and retains the bound value when decoding fails', async () => {
  const document = assetDocument('image');
  document.ui.children![0]!.props!['minWidth'] = 100;
  document.ui.children![0]!.props!['maxHeight'] = 200;
  const upload = vi.fn(source().upload);
  const fixture = await renderDocument(document, source({ upload }));
  const field = fixture.debugElement.query(By.directive(HavenImageField))
    .componentInstance as HavenImageField;
  expect(field.minWidth()).toBe(100);
  expect(field.maxHeight()).toBe(200);
  const pending = field.choose(file());
  expect(field.uploading()).toBe(true);
  NativeImage.instances[0]!.load(99, 100);
  await pending;
  expect(field.error()).toBe('dimensions');
  expect(upload).not.toHaveBeenCalled();
  expect(fixture.componentInstance.value()).toEqual({ asset: [] });
});

it.each(['uploading', 'touch'] as const)(
  'does not start a cancelled unbounded upload after synchronous %s output',
  async (event) => {
    const { fixture, field, upload } = await create();
    for (const property of ['minWidth', 'maxWidth', 'minHeight', 'maxHeight'])
      fixture.componentRef.setInput(property, undefined);
    await fixture.whenStable();
    if (event === 'uploading')
      field.uploadingChange.subscribe((value) => {
        if (value) field.cancel();
      });
    else field.touch.subscribe(() => field.cancel());
    await field.choose(file());
    expect(upload).not.toHaveBeenCalled();
    expect(field.localPreview()).toBeNull();
    expect(field.uploading()).toBe(false);
    expect(NativeImage.instances).toHaveLength(0);
    expect(revoke).toHaveBeenCalledOnce();
  },
);
it('does not let a reentrant replacement get cleared or renamed by the superseded choose', async () => {
  const { field, upload } = await create();
  let replacement: Promise<void> | undefined;
  let replaced = false;
  field.uploadingChange.subscribe((value) => {
    if (value && !replaced) {
      replaced = true;
      replacement = field.choose(new File(['new'], 'new.png', { type: 'image/png' }));
    }
  });
  await field.choose(file());
  expect(field.uploadName()).toBe('new.png');
  expect(field.uploading()).toBe(true);
  expect(field.localPreview()).not.toBeNull();
  expect(NativeImage.instances).toHaveLength(1);
  expect(revoke).toHaveBeenCalledOnce();
  NativeImage.instances[0]!.load(100, 50);
  await replacement;
  expect(upload).toHaveBeenCalledOnce();
  expect(upload.mock.calls[0]![1]).toBe('new.png');
  expect(field.value()[0]?.name).toBe('new.png');
  expect(revoke).toHaveBeenCalledTimes(2);
});
it('finishes releasing an old job before publishing false so a listener can start a fresh job', async () => {
  const { field } = await create();
  let next: Promise<void> | undefined;
  let restarted = false;
  field.uploadingChange.subscribe((value) => {
    if (!value && !restarted) {
      restarted = true;
      next = field.choose(new File(['new'], 'next.png', { type: 'image/png' }));
    }
  });
  const first = field.choose(file());
  NativeImage.instances[0]!.load(100, 50);
  await first;
  expect(field.uploading()).toBe(true);
  expect(field.uploadName()).toBe('next.png');
  expect(field.localPreview()).not.toBeNull();
  expect(revoke).toHaveBeenCalledOnce();
  field.cancel();
  await next;
  expect(revoke).toHaveBeenCalledTimes(2);
});
it('gives a newer choose triggered by cancellation priority over the outer replacement', async () => {
  const { field, upload } = await create();
  const first = field.choose(file());
  let next: Promise<void> | undefined;
  let restarted = false;
  field.uploadingChange.subscribe((value) => {
    if (!value && !restarted) {
      restarted = true;
      next = field.choose(new File(['new'], 'latest.png', { type: 'image/png' }));
    }
  });
  await field.choose(new File(['outer'], 'outer.png', { type: 'image/png' }));
  await first;
  expect(field.uploadName()).toBe('latest.png');
  expect(NativeImage.instances).toHaveLength(2);
  NativeImage.instances[1]!.load(100, 50);
  await next;
  expect(upload).toHaveBeenCalledOnce();
  expect(upload.mock.calls[0]![1]).toBe('latest.png');
});
