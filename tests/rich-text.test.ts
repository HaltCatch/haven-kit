import { expect, it } from 'vitest';
import { richTextManifest, isRichTextConstraints, validateDocument } from '@haven/schema';
import type { HavenDocument } from '@haven/schema';
it('accepts precise semantic length and file size limits and rejects inconsistent bounds', () => {
  expect(isRichTextConstraints({})).toBe(true);
  expect(isRichTextConstraints({ minTextLength: 0, maxTextLength: 100, maxImageBytes: 1 })).toBe(
    true,
  );
  for (const value of [
    { minTextLength: -1 },
    { maxTextLength: 1.5 },
    { maxImageBytes: 0 },
    { maxImageBytes: Infinity },
    { minTextLength: 5, maxTextLength: 4 },
  ])
    expect(isRichTextConstraints(value)).toBe(false);
});
it('registers a string field with optional named host image resources and rejects malformed configuration', () => {
  expect(richTextManifest.dataTypes).toEqual(['string']);
  const document: HavenDocument = {
    schemaVersion: '1.0',
    id: 'rich',
    title: 'Rich',
    theme: { preset: 'material', mode: 'dark', density: 'comfortable' },
    resources: { images: { type: 'upload', adapter: 'images' } },
    actions: {},
    dataSchema: { type: 'object', properties: { body: { type: 'string' } } },
    ui: {
      id: 'body',
      kind: 'field.rich-text',
      version: 1,
      bind: '/body',
      props: { label: 'Body', upload: 'images', minTextLength: 1, maxTextLength: 30 },
    },
  };
  expect(validateDocument(document).diagnostics).toEqual([]);
  const invalid = structuredClone(document);
  invalid.ui.props!['minTextLength'] = 40;
  expect(validateDocument(invalid).valid).toBe(false);
  const resource = structuredClone(document);
  resource.resources['images']!.type = 'query';
  expect(validateDocument(resource).valid).toBe(false);
  const type = structuredClone(document);
  type.dataSchema.properties!['body']!.type = 'object';
  expect(validateDocument(type).valid).toBe(false);
});
