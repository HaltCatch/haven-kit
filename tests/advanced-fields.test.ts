import { describe, expect, it } from 'vitest';
import { validateDocument, isAssetReference, assetFileIssue } from '@haven/schema';
import type { DataSchema, HavenDocument, UiNode } from '@haven/schema';

const asset: DataSchema = {
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
function document(node: UiNode, field: DataSchema): HavenDocument {
  return {
    schemaVersion: '1.0',
    id: 'advanced',
    title: 'Advanced',
    dataSchema: { type: 'object', properties: { value: field } },
    ui: node,
    resources: { files: { type: 'upload', adapter: 'test.files' } },
    actions: {},
    theme: { preset: 'material', mode: 'dark', density: 'comfortable' },
  };
}
const codes = (doc: HavenDocument) => validateDocument(doc).diagnostics.map((item) => item.code);
const file = (): UiNode => ({
  id: 'file',
  kind: 'field.file',
  version: 1,
  bind: '/value',
  props: { resource: 'files', accept: '.pdf,image/*', maxBytes: 100 },
});
describe('advanced field model contracts', () => {
  it('accepts only explicit asset metadata arrays and upload resources', () => {
    const doc = document(file(), asset);
    expect(codes(doc)).toEqual([]);
    doc.resources['files'] = { type: 'options', adapter: 'test.files' };
    expect(validateDocument(doc).valid).toBe(false);
    doc.resources['files'] = { type: 'upload', adapter: 'test.files' };
    doc.dataSchema.properties!['value'] = { ...asset, maxItems: 2 };
    expect(codes(doc)).toContain('asset.binding');
  });
  it('rejects executable/malformed accept values and fractional byte limits', () => {
    const node = file();
    node.props!['accept'] = 'javascript:alert(1)';
    node.props!['maxBytes'] = 1.5;
    expect(codes(document(node, asset))).toEqual(
      expect.arrayContaining(['asset.accept', 'asset.maxBytes']),
    );
  });
  it('requires configured locales to have explicit string schema properties', () => {
    const node: UiNode = {
      id: 'translation',
      kind: 'field.multilingual',
      version: 1,
      bind: '/value',
      props: { locales: ['en-US'] },
    };
    const doc = document(node, {
      type: 'object',
      properties: { 'en-US': { type: 'string' }, 'zh-CN': { type: 'string' } },
    });
    expect(codes(doc)).toEqual([]);
    node.props!['locales'] = ['fr-FR'];
    expect(codes(doc)).toContain('multilingual.binding');
    node.props!['locales'] = ['en-US', 'en-US'];
    expect(codes(doc)).toContain('multilingual.locales');
  });
  it('rejects inaccessible invalid or duplicate locale schema keys before rendering', () => {
    const node: UiNode = {
      id: 'translations',
      kind: 'field.multilingual',
      version: 1,
      bind: '/value',
      props: { locales: ['en-US'] },
    };
    for (const key of ['not_a_locale', 'en-us']) {
      expect(
        codes(
          document(node, {
            type: 'object',
            properties: { 'en-US': { type: 'string' }, [key]: { type: 'string' } },
          }),
        ),
      ).toContain('multilingual.binding');
    }
  });
  it('validates selectable tree keys while allowing differently typed non-selectable ancestors', () => {
    const node: UiNode = {
      id: 'tree',
      kind: 'field.cascader',
      version: 1,
      bind: '/value',
      props: { nodes: [{ key: 'group', label: 'Group', children: [{ key: 0, label: 'Zero' }] }] },
    };
    expect(codes(document(node, { type: 'number' }))).toEqual([]);
    expect(codes(document(node, { type: 'string' }))).toContain('tree.keyType');
    node.kind = 'field.tree-select';
    expect(codes(document(node, { type: 'number' }))).toContain('tree.keyType');
    node.props!['leafOnly'] = true;
    expect(codes(document(node, { type: 'number' }))).toEqual([]);
  });
  it('rejects malformed metadata and enforces saved-reference type and size constraints', () => {
    const ref = { id: 'id', name: 'file.png', mediaType: 'image/png', size: 20 };
    expect(isAssetReference(ref)).toBe(true);
    expect(isAssetReference({ ...ref, url: 'https://example.test/private' })).toBe(false);
    expect(isAssetReference({ ...ref, size: -1 })).toBe(false);
    const uploaded = { name: ref.name, type: ref.mediaType, size: ref.size };
    expect(assetFileIssue(uploaded, 'image/*', 20, true)).toBeNull();
    expect(assetFileIssue(uploaded, '.pdf', 20)).toBe('type');
    expect(assetFileIssue(uploaded, 'image/*', 19)).toBe('size');
  });
});
