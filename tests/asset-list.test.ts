import { expect, it } from 'vitest';
import { isAssetListValue, isAssetListLimit, validateDocument } from '@haven/schema';
import type { HavenDocument, DataSchema } from '@haven/schema';
const reference = (id: string) => ({ id, name: `${id}.txt`, mediaType: 'text/plain', size: 1 });
function document(): HavenDocument {
  const item: DataSchema = {
    type: 'object',
    properties: {
      id: { type: 'string' },
      name: { type: 'string' },
      mediaType: { type: 'string' },
      size: { type: 'number' },
    },
  };
  return {
    schemaVersion: '1.0',
    id: 'files',
    title: 'Files',
    theme: { preset: 'material', mode: 'dark', density: 'comfortable' },
    actions: {},
    resources: { files: { type: 'upload', adapter: 'host.files' } },
    ui: {
      id: 'files',
      kind: 'field.files',
      version: 1,
      bind: '/files',
      props: { resource: 'files', accept: '.txt', concurrency: 2, maxBytes: 100 },
    },
    dataSchema: {
      type: 'object',
      properties: { files: { type: 'array', minItems: 1, maxItems: 10, items: item } },
    },
  };
}
it('validates explicit bounded multi-file schemas and retains arbitrary valid existing references', () => {
  expect(validateDocument(document()).diagnostics).toEqual([]);
  expect(isAssetListValue([reference('unknown'), reference('zero')])).toBe(true);
  expect(isAssetListValue([reference('x'), reference('x')])).toBe(false);
  expect(isAssetListValue([{ ...reference('x'), url: 'private' }])).toBe(false);
  const sparse = new Array<unknown>(2);
  sparse[1] = reference('x');
  expect(isAssetListValue(sparse)).toBe(false);
});
it('requires a bounded positive integer maxItems and bounded integral concurrency', () => {
  for (const maximum of [undefined, 0, 1.5, 1001]) {
    const model = document();
    const schema = model.dataSchema.properties!['files']!;
    if (maximum === undefined) delete schema.maxItems;
    else schema.maxItems = maximum;
    expect(validateDocument(model).valid).toBe(false);
  }
  for (const concurrency of [0, 1.5, 5]) {
    const model = document();
    model.ui.props!['concurrency'] = concurrency;
    expect(validateDocument(model).valid).toBe(false);
  }
  expect(isAssetListLimit(1)).toBe(true);
  expect(isAssetListLimit(1000)).toBe(true);
  expect(isAssetListLimit(Infinity)).toBe(false);
});
it('still requires metadata shape and upload resources and keeps the single-file contract separate', () => {
  const model = document();
  model.resources['files'] = { type: 'options', adapter: 'host.options' };
  expect(validateDocument(model).valid).toBe(false);
  const single = document();
  single.ui.kind = 'field.file';
  delete single.ui.props!['concurrency'];
  expect(validateDocument(single).valid).toBe(false);
});
it.each(['field.file', 'field.files', 'field.image'])(
  'exposes opt-in boolean dropzone on %s without changing stored metadata',
  (kind) => {
    const model = document();
    model.ui.kind = kind;
    if (kind !== 'field.files') {
      delete model.ui.props!['concurrency'];
      model.dataSchema.properties!['files']!.maxItems = 1;
    }
    model.ui.props!['dropzone'] = true;
    expect(validateDocument(model).diagnostics).toEqual([]);
    model.ui.props!['dropzone'] = 'true';
    expect(validateDocument(model).valid).toBe(false);
  },
);
