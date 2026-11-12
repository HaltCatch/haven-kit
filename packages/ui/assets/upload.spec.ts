import { TestBed } from '@angular/core/testing';
import { provideTransloco, TranslocoService } from '@jsverse/transloco';
import { provideHavenTransloco } from '@haven/ui/i18n';
import english from '@haven/ui/i18n/locales/en-US.json';
import type { FileReference, UploadAdapter } from '@haven/runtime';
import { assetFileIssue, isAssetValue } from '@haven/schema';
import { HavenFileField, HavenImageField } from './upload';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';

const saved: FileReference = { id: 'old', name: 'old.txt', size: 4, mediaType: 'text/plain' };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function adapter(overrides: Partial<UploadAdapter> = {}): UploadAdapter {
  return {
    upload: async (file, name) => ({ id: 'new', name, mediaType: file.type, size: file.size }),
    url: async () => 'https://example.test/asset',
    ...overrides,
  };
}
const revoke = vi.fn();
let serial = 0;
beforeEach(() => {
  const OriginalURL = URL;
  vi.stubGlobal(
    'URL',
    class extends OriginalURL {
      static override createObjectURL() {
        return `blob:local-${++serial}`;
      }
      static override revokeObjectURL(url: string) {
        revoke(url);
      }
    },
  );
  revoke.mockClear();
  TestBed.configureTestingModule({
    providers: [
      provideTransloco({
        config: { defaultLang: 'en-US', availableLangs: ['en-US'], prodMode: true },
      }),
      provideHavenTransloco(),
    ],
  });
  TestBed.inject(TranslocoService).setTranslation({ haven: english }, 'en-US');
});
afterEach(() => {
  TestBed.resetTestingModule();
  vi.unstubAllGlobals();
});
function create(image = false, source = adapter()) {
  const fixture = TestBed.createComponent(image ? HavenImageField : HavenFileField);
  fixture.componentRef.setInput('label', 'Attachment');
  fixture.componentRef.setInput('adapter', source);
  return fixture;
}
it('selects a native file, reports bounded progress and replaces metadata only after success', async () => {
  const upload = deferred<FileReference>();
  let options!: Parameters<UploadAdapter['upload']>[2];
  const fixture = create(
    false,
    adapter({
      upload: (_file, _name, request) => {
        options = request;
        return upload.promise;
      },
    }),
  );
  fixture.componentRef.setInput('value', [saved]);
  await fixture.whenStable();
  const file = new File(['hello'], 'note.txt', { type: 'text/plain' });
  const input = (fixture.nativeElement as HTMLElement).querySelector('input')!;
  Object.defineProperty(input, 'files', { value: [file] });
  input.dispatchEvent(new Event('change', { bubbles: true }));
  expect(fixture.componentInstance.value()).toEqual([saved]);
  expect(fixture.componentInstance.uploading()).toBe(true);
  options.progress(3, 5);
  expect(fixture.componentInstance.progress()).toBe(60);
  options.progress(99, 5);
  expect(fixture.componentInstance.progress()).toBe(100);
  options.progress(NaN, 0);
  expect(fixture.componentInstance.progress()).toBeNull();
  upload.resolve({ id: 'new', name: file.name, size: file.size, mediaType: file.type });
  await expect.poll(() => fixture.componentInstance.uploading()).toBe(false);
  expect(fixture.componentInstance.value()).toEqual([
    { id: 'new', name: 'note.txt', size: 5, mediaType: 'text/plain' },
  ]);
  expect(input.value).toBe('');
});
it('ignores late success/progress after replacement or cancellation even if an adapter ignores abort', async () => {
  const first = deferred<FileReference>(),
    second = deferred<FileReference>();
  const requests: Parameters<UploadAdapter['upload']>[2][] = [];
  const fixture = create(
    false,
    adapter({
      upload: (_file, _name, request) => {
        requests.push(request);
        return requests.length === 1 ? first.promise : second.promise;
      },
    }),
  );
  await fixture.whenStable();
  const file = new File(['x'], 'file.txt', { type: 'text/plain' });
  const one = fixture.componentInstance.choose(file),
    two = fixture.componentInstance.choose(file);
  expect(requests[0]!.signal.aborted).toBe(true);
  requests[0]!.progress(1, 1);
  expect(fixture.componentInstance.progress()).toBeNull();
  first.resolve(saved);
  await one;
  expect(fixture.componentInstance.uploading()).toBe(true);
  fixture.componentInstance.cancel();
  expect(requests[1]!.signal.aborted).toBe(true);
  second.resolve(saved);
  await two;
  expect(fixture.componentInstance.value()).toEqual([]);
});
it('enforces selection hints and immutable readonly/disabled boundaries without server calls', async () => {
  const upload = vi.fn<UploadAdapter['upload']>(adapter().upload);
  const fixture = create(false, adapter({ upload }));
  fixture.componentRef.setInput('accept', '.txt,text/plain');
  fixture.componentRef.setInput('maxBytes', 2);
  await fixture.whenStable();
  await fixture.componentInstance.choose(new File(['123'], 'large.txt', { type: 'text/plain' }));
  expect(fixture.componentInstance.error()).toBe('size');
  await fixture.componentInstance.choose(new File(['1'], 'wrong.png', { type: 'image/png' }));
  expect(fixture.componentInstance.error()).toBe('type');
  fixture.componentRef.setInput('value', [saved]);
  fixture.componentRef.setInput('readonly', true);
  await fixture.whenStable();
  await fixture.componentInstance.choose(new File(['1'], 'okay.txt'));
  fixture.componentInstance.clear();
  expect(fixture.componentInstance.value()).toEqual([saved]);
  expect(upload).not.toHaveBeenCalled();
  fixture.componentRef.setInput('readonly', false);
  fixture.componentRef.setInput('disabled', true);
  await fixture.whenStable();
  await fixture.componentInstance.choose(new File(['1'], 'okay.txt'));
  expect(upload).not.toHaveBeenCalled();
  expect(assetFileIssue({ name: 'a.PNG', type: 'image/png', size: 0 }, '.png', 2, true)).toBeNull();
  expect(assetFileIssue({ name: 'a.txt', type: 'text/plain', size: 1 }, '*', 2)).toBe('config');
});
it('aborts in-flight changes on readonly, host adapter or bound value replacement', async () => {
  const jobs: {
    request: Parameters<UploadAdapter['upload']>[2];
    work: ReturnType<typeof deferred<FileReference>>;
  }[] = [];
  const source = adapter({
    upload: (_file, _name, request) => {
      const work = deferred<FileReference>();
      jobs.push({ request, work });
      return work.promise;
    },
  });
  const fixture = create(false, source);
  await fixture.whenStable();
  const file = new File(['x'], 'a.txt');
  const first = fixture.componentInstance.choose(file);
  fixture.componentRef.setInput('readonly', true);
  await fixture.whenStable();
  expect(jobs[0]!.request.signal.aborted).toBe(true);
  jobs[0]!.work.resolve(saved);
  await first;
  expect(fixture.componentInstance.value()).toEqual([]);
  fixture.componentRef.setInput('readonly', false);
  await fixture.whenStable();
  const second = fixture.componentInstance.choose(file);
  fixture.componentRef.setInput('value', [saved]);
  await fixture.whenStable();
  expect(jobs[1]!.request.signal.aborted).toBe(true);
  jobs[1]!.work.reject(new Error('late'));
  await second;
  const third = fixture.componentInstance.choose(file);
  fixture.componentRef.setInput('adapter', adapter());
  await fixture.whenStable();
  expect(jobs[2]!.request.signal.aborted).toBe(true);
  jobs[2]!.work.resolve({ ...saved, id: 'stale' });
  await third;
  expect(fixture.componentInstance.value()).toEqual([saved]);
});
it('shows generic errors and retains the previous value on transport or reference errors', async () => {
  const fixture = create(
    false,
    adapter({
      upload: async () => {
        throw new Error('PRIVATE TOKEN');
      },
    }),
  );
  fixture.componentRef.setInput('value', [saved]);
  await fixture.whenStable();
  await fixture.componentInstance.choose(new File(['x'], 'a.txt'));
  await fixture.whenStable();
  expect(fixture.componentInstance.error()).toBe('upload');
  expect(fixture.componentInstance.value()).toEqual([saved]);
  expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('PRIVATE TOKEN');
  fixture.componentRef.setInput(
    'adapter',
    adapter({ upload: async () => ({ ...saved, size: NaN }) }),
  );
  await fixture.whenStable();
  await fixture.componentInstance.choose(new File(['x'], 'a.txt'));
  expect(fixture.componentInstance.error()).toBe('reference');
  expect(fixture.componentInstance.value()).toEqual([saved]);
});
it('releases only owned image ObjectURLs on success, cancel and destruction', async () => {
  const work = deferred<FileReference>();
  const fixture = create(true, adapter({ upload: () => work.promise }));
  await fixture.whenStable();
  const file = new File(['image'], 'image.png', { type: 'image/png' });
  const pending = fixture.componentInstance.choose(file),
    local = fixture.componentInstance.localPreview();
  expect(local).toMatch(/^blob:local-/);
  work.resolve({ id: 'image', name: file.name, mediaType: file.type, size: file.size });
  await pending;
  expect(revoke).toHaveBeenCalledWith(local);
  expect(fixture.componentInstance.localPreview()).toBeNull();
  const late = deferred<FileReference>();
  fixture.componentRef.setInput('adapter', adapter({ upload: () => late.promise }));
  await fixture.whenStable();
  const abandoned = fixture.componentInstance.choose(file),
    abandonedUrl = fixture.componentInstance.localPreview();
  fixture.destroy();
  expect(revoke).toHaveBeenCalledWith(abandonedUrl);
  late.resolve({ id: 'late', name: file.name, mediaType: file.type, size: file.size });
  await abandoned;
  expect(fixture.componentInstance.value()[0]?.id).toBe('image');
});
it('resolves readonly previews with cancellation, rejects unsafe URLs and retries without rewriting values', async () => {
  const old = deferred<string>();
  const requests: AbortSignal[] = [];
  const fixture = create(
    true,
    adapter({
      url: (_file, signal) => {
        requests.push(signal);
        return old.promise;
      },
    }),
  );
  const image = { ...saved, mediaType: 'image/png', name: 'image.png' };
  fixture.componentRef.setInput('value', [image]);
  fixture.componentRef.setInput('readonly', true);
  await fixture.whenStable();
  fixture.componentRef.setInput('adapter', adapter({ url: async () => 'javascript:alert(1)' }));
  await fixture.whenStable();
  expect(requests[0]!.aborted).toBe(true);
  old.resolve('https://example.test/stale');
  await expect.poll(() => fixture.componentInstance.previewError()).toBe(true);
  expect(fixture.componentInstance.preview()).toBeNull();
  expect(fixture.componentInstance.value()).toEqual([image]);
  fixture.componentRef.setInput('adapter', adapter());
  await fixture.whenStable();
  await expect.poll(() => fixture.componentInstance.preview()).toBe('https://example.test/asset');
  fixture.componentRef.setInput('disabled', true);
  await fixture.whenStable();
  expect(fixture.componentInstance.preview()).toBeNull();
});
it('preserves invalid saved arrays and diagnoses them rather than silently truncating', async () => {
  const fixture = create();
  fixture.componentRef.setInput('value', [saved, saved]);
  await fixture.whenStable();
  expect(fixture.componentInstance.validValue()).toBe(false);
  expect(fixture.componentInstance.value()).toHaveLength(2);
  expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')).not.toBeNull();
  expect(isAssetValue([])).toBe(true);
  expect(isAssetValue(null)).toBe(false);
  expect(isAssetValue([{ ...saved, url: 'secret' }])).toBe(false);
});

it('revokes a pending local preview on explicit cancellation and on failed image upload', async () => {
  const first = deferred<FileReference>();
  const fixture = create(true, adapter({ upload: () => first.promise }));
  await fixture.whenStable();
  const file = new File(['x'], 'image.png', { type: 'image/png' });
  const pending = fixture.componentInstance.choose(file),
    firstUrl = fixture.componentInstance.localPreview();
  fixture.componentInstance.cancel();
  expect(revoke).toHaveBeenCalledWith(firstUrl);
  first.reject(new Error('ignored late failure'));
  await pending;
  expect(fixture.componentInstance.error()).toBeNull();
  fixture.componentRef.setInput(
    'adapter',
    adapter({
      upload: async () => {
        throw new Error('private');
      },
    }),
  );
  await fixture.whenStable();
  const failed = fixture.componentInstance.choose(file),
    failedUrl = fixture.componentInstance.localPreview();
  await failed;
  expect(revoke).toHaveBeenCalledWith(failedUrl);
  expect(fixture.componentInstance.error()).toBe('upload');
  expect(fixture.componentInstance.value()).toEqual([]);
});

it('reports upload lifecycle changes and stops emitting after destruction', async () => {
  const work = deferred<FileReference>();
  const fixture = create(false, adapter({ upload: () => work.promise }));
  await fixture.whenStable();
  const changes: boolean[] = [];
  fixture.componentInstance.uploadingChange.subscribe((value) => changes.push(value));
  const pending = fixture.componentInstance.choose(
    new File(['x'], 'file.txt', { type: 'text/plain' }),
  );
  expect(changes).toEqual([true]);
  fixture.componentInstance.cancel();
  expect(changes).toEqual([true, false]);
  work.resolve(saved);
  await pending;
  expect(changes).toEqual([true, false]);
  const next = deferred<FileReference>();
  fixture.componentRef.setInput('adapter', adapter({ upload: () => next.promise }));
  await fixture.whenStable();
  const abandoned = fixture.componentInstance.choose(new File(['x'], 'next.txt'));
  fixture.destroy();
  const count = changes.length;
  next.resolve(saved);
  await abandoned;
  expect(changes).toHaveLength(count);
});
