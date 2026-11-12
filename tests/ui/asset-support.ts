import { TestBed } from '@angular/core/testing';
import { provideTransloco, TranslocoService } from '@jsverse/transloco';
import { provideHavenTransloco } from '@haven/ui/i18n';
import type { UploadAdapter } from '@haven/runtime';
import type { DataSchema, HavenDocument } from '@haven/schema';
import english from '@haven/ui/i18n/locales/en-US.json';
import chinese from '@haven/ui/i18n/locales/zh-CN.json';
import { beforeEach, afterEach, expect, vi } from 'vitest';
import { HavenRenderer } from '../../packages/ui/renderer/renderer';

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
export function assetSchema(): DataSchema {
  return {
    type: 'array',
    maxItems: 1,
    items: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        mediaType: { type: 'string' },
        size: { type: 'number' },
      },
    },
  };
}
export function document(kind: 'file' | 'image' = 'file', readonly = false): HavenDocument {
  return {
    schemaVersion: '1.0',
    id: 'assets-first',
    title: 'Assets',
    dataSchema: { type: 'object', properties: { asset: assetSchema() }, required: ['asset'] },
    ui: {
      id: 'root',
      kind: 'form',
      version: 1,
      children: [
        {
          id: 'asset',
          kind: `field.${kind}`,
          version: 1,
          bind: '/asset',
          props: {
            label: 'Attachment',
            resource: 'files',
            readonly,
            accept: kind === 'image' ? 'image/png' : 'text/plain',
            maxBytes: 16,
          },
        },
      ],
    },
    theme: { preset: 'material', mode: 'dark', density: 'comfortable' },
    actions: {},
    resources: { files: { type: 'upload', adapter: 'test.files' } },
  };
}
export function source(overrides: Partial<UploadAdapter> = {}): UploadAdapter {
  return {
    upload: async (file, name) => ({ id: 'uploaded', name, mediaType: file.type, size: file.size }),
    url: async () => 'https://assets.example.test/image.png',
    ...overrides,
  };
}
export const revoke = vi.fn();
/** Register per spec file; shared modules may be cached across test-file execution. */
export function setupAssetTests(): void {
  beforeEach(() => {
    const OriginalURL = URL;
    vi.stubGlobal(
      'URL',
      class extends OriginalURL {
        static override createObjectURL() {
          return 'blob:renderer-local';
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
          config: { defaultLang: 'en-US', availableLangs: ['en-US', 'zh-CN'], prodMode: true },
        }),
        provideHavenTransloco(),
      ],
    });
    const translations = TestBed.inject(TranslocoService);
    translations.setTranslation({ haven: english }, 'en-US');
    translations.setTranslation({ haven: chinese }, 'zh-CN');
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });
}
export async function render(model: HavenDocument, adapter = source()) {
  const fixture = TestBed.createComponent(HavenRenderer);
  fixture.componentRef.setInput('document', model);
  fixture.componentRef.setInput('host', { uploads: new Map([['test.files', adapter]]) });
  await fixture.whenStable();
  expect(fixture.componentInstance.validation().diagnostics).toEqual([]);
  return fixture;
}
export function fileInput(root: HTMLElement): HTMLInputElement {
  return root.querySelector<HTMLInputElement>('input[type="file"]')!;
}
export function choose(input: HTMLInputElement, file: File): void {
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  input.dispatchEvent(new Event('change', { bubbles: true }));
}
