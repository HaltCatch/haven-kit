import { describe, expect, it } from 'vitest';
import {
  coreManifests,
  createManifestRegistry,
  readPointer,
  validateDocument,
  writePointer,
} from '@haven/schema';
import { document } from './fixtures.js';
const codes = (value: unknown) => validateDocument(value).diagnostics.map((d) => d.code);
describe('UI document trust boundary', () => {
  it('derives capabilities from the tree without trusting a supplied requires list', () => {
    expect(validateDocument(document())).toEqual({
      structural: true,
      valid: true,
      diagnostics: [],
      capabilities: ['field.number@1', 'field.text@1', 'form@1'],
    });
  });
  it('rejects unknown keys without modifying the input', () => {
    const input = { ...document(), requires: [] };
    const before = structuredClone(input);
    expect(validateDocument(input).structural).toBe(false);
    expect(input).toEqual(before);
  });
  it('reports node identity and paths for broken bindings', () => {
    const input = document();
    input.ui.children![0]!.bind = '/missing';
    expect(validateDocument(input).diagnostics).toContainEqual({
      code: 'binding.path',
      path: '/ui/children/0/bind',
      nodeId: 'title',
      message: 'Binding does not resolve to a field',
    });
  });
  it('allows structurally valid incomplete drafts but rejects publication', () => {
    const input = document();
    input.ui.children![0]!.kind = 'field.unknown';
    const result = validateDocument(input);
    expect(result.structural).toBe(true);
    expect(result.valid).toBe(false);
  });
  it('rejects duplicate nodes, unsupported properties and wrong binding types', () => {
    const input = document();
    input.ui.children![1]!.id = 'title';
    input.ui.children![1]!.bind = '/title';
    input.ui.props = { unknown: true };
    expect(codes(input)).toEqual(
      expect.arrayContaining(['node.duplicate', 'binding.type', 'property.unknown']),
    );
  });
  it('resolves repeated items against their own item schema', () => {
    const input = document();
    input.ui.children!.push({
      id: 'repeat',
      kind: 'form.repeat',
      version: 1,
      bind: '/rows',
      children: [
        {
          id: 'value',
          kind: 'field.text',
          version: 1,
          bind: '/value',
          rules: { visible: { op: 'exists', value: { scope: 'item', path: '/value' } } },
        },
      ],
    });
    expect(validateDocument(input).valid).toBe(true);
  });
  it('validates event slots, action references, resource kinds and theme tokens', () => {
    const input = document();
    input.ui.events = { click: ['missing'] };
    input.ui.children![0]!.props = { resource: 'files' };
    input.resources['files'] = { adapter: 'host.upload', type: 'upload' };
    input.theme.tokens = { background: 'url(https://example.test)' };
    expect(codes(input)).toEqual(
      expect.arrayContaining(['event.unknown', 'action.missing', 'resource.type', 'theme.token']),
    );
  });
  it('checks capabilities against actual renderer support', () => {
    expect(
      validateDocument(document(), { supportedCapabilities: ['form@1'] }).diagnostics.filter(
        (d) => d.code === 'component.unsupported',
      ),
    ).toHaveLength(2);
  });
  it('rejects invalid data schema constraints and cyclic references', () => {
    const input = document();
    input.dataSchema.properties!['title'] = {
      type: 'string',
      minimum: 2,
      minLength: 4,
      maxLength: 2,
    };
    input.dataSchema.$defs = { A: { $ref: '#/$defs/B' }, B: { $ref: '#/$defs/A' } };
    expect(codes(input)).toEqual(
      expect.arrayContaining(['data.keyword', 'data.range', 'data.reference']),
    );
  });
  it('resolves local schema refs for field types', () => {
    const input = document();
    input.dataSchema.$defs = { Text: { type: 'string' } };
    input.dataSchema.properties!['title'] = { $ref: '#/$defs/Text' };
    expect(validateDocument(input).valid).toBe(true);
  });
  it('rejects NaN, cyclic objects, unsafe keys and excessive documents before schema recursion', () => {
    const input: Record<string, unknown> = document() as unknown as Record<string, unknown>;
    input['self'] = input;
    expect(codes(input)).toContain('structure.json');
    expect(codes({ number: NaN })).toContain('structure.json');
    expect(codes(JSON.parse('{"__proto__":{}}'))).toContain('structure.key');
    expect(validateDocument(document(), { limits: { maxBytes: 20 } }).diagnostics[0]?.code).toBe(
      'limit.bytes',
    );
    expect(validateDocument(document(), { limits: { maxNodes: 1 } }).valid).toBe(false);
  });
  it('rejects code strings as rules', () => {
    const input = document();
    input.ui.rules = { visible: 'return true' } as never;
    expect(validateDocument(input).structural).toBe(false);
  });
  it('rejects recursive object definitions and permits shared non-cyclic JS input', () => {
    const input = document();
    input.dataSchema.$defs = {
      Recursive: { type: 'object', properties: { next: { $ref: '#/$defs/Recursive' } } },
    };
    expect(codes(input)).toContain('data.reference');
    const shared = { type: 'string' as const };
    const valid = document();
    valid.dataSchema.properties!['a'] = shared;
    valid.dataSchema.properties!['b'] = shared;
    expect(validateDocument(valid).valid).toBe(true);
  });
  it('does not resolve inherited action or binding names', () => {
    const input = document();
    input.ui.events = { submit: ['toString'] };
    input.ui.children![0]!.bind = '/toString';
    expect(codes(input)).toEqual(expect.arrayContaining(['action.missing', 'binding.path']));
  });
  it('accepts event input only within actions, not persistent rules', () => {
    const input = document();
    input.ui.events = { submit: ['save'] };
    input.actions['save'] = {
      handler: 'host.save',
      input: { payload: { scope: 'event', path: '' } },
    };
    expect(validateDocument(input).valid).toBe(true);
    input.ui.rules = { visible: { op: 'exists', value: { scope: 'event', path: '' } } };
    expect(codes(input)).toContain('rule.scope');
  });
  it('never accepts a registry collision', () => {
    expect(() => createManifestRegistry([coreManifests[0]!, coreManifests[0]!])).toThrow(
      'Duplicate',
    );
  });
});
describe('JSON Pointer', () => {
  it('supports escaped keys and immutable array writes', () => {
    const input = { 'a/b': [{ '~': 1 }] };
    expect(readPointer(input, '/a~1b/0/~0')).toBe(1);
    expect(writePointer(input, '/a~1b/0/~0', 2)).toEqual({ 'a/b': [{ '~': 2 }] });
    expect(input['a/b'][0]?.['~']).toBe(1);
  });
  it('does not read inherited values, traverse unsafe paths, or create sparse arrays', () => {
    expect(readPointer({}, '/toString')).toBeUndefined();
    expect(() => readPointer({}, '/__proto__/x')).toThrow();
    expect(() => writePointer([], '/1', 1)).toThrow();
    expect(() => readPointer({}, '/bad~2')).toThrow();
  });
});
