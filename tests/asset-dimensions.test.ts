import { expect, it } from 'vitest';
import { isImageSizeConstraints, validateDocument } from '@haven/schema';
import type { HavenDocument, UiNode } from '@haven/schema';

function document(props: NonNullable<UiNode['props']>, kind = 'field.image'): HavenDocument {
  return {
    schemaVersion: '1.0',
    id: 'image-dimensions',
    title: 'Image',
    theme: { preset: 'material', mode: 'dark', density: 'comfortable' },
    actions: {},
    resources: { files: { type: 'upload', adapter: 'host.files' } },
    ui: { id: 'image', kind, version: 1, bind: '/image', props: { resource: 'files', ...props } },
    dataSchema: {
      type: 'object',
      properties: {
        image: {
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
        },
      },
    },
  };
}
it('accepts independent optional positive integer image constraints and inclusive equal limits', () => {
  for (const props of [
    {},
    { minWidth: 1 },
    { maxHeight: 100 },
    { minWidth: 100, maxWidth: 100, minHeight: 50, maxHeight: 50 },
  ]) {
    expect(isImageSizeConstraints(props)).toBe(true);
    expect(validateDocument(document(props)).diagnostics).toEqual([]);
  }
});
it('rejects malformed and inverted dimensions before a document can be published', () => {
  for (const props of [
    { minWidth: 0 },
    { maxWidth: -1 },
    { minHeight: 1.5 },
    { maxHeight: Number.MAX_SAFE_INTEGER + 1 },
    { minWidth: 101, maxWidth: 100 },
    { minHeight: 51, maxHeight: 50 },
  ])
    expect(validateDocument(document(props)).valid).toBe(false);
  expect(
    validateDocument(document({ minWidth: 101, maxWidth: 100 })).diagnostics.some(
      (d) => d.code === 'asset.dimensions',
    ),
  ).toBe(true);
  expect(validateDocument(document({ minWidth: '100' })).valid).toBe(false);
});
it('does not add image-only configuration to ordinary file fields', () => {
  expect(validateDocument(document({ maxWidth: 100 }, 'field.file')).valid).toBe(false);
  expect(validateDocument(document({}, 'field.file')).valid).toBe(true);
});
