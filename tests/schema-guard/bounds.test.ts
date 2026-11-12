import { describe, expect, it } from 'vitest';
import { defaultLimits, validateDocument } from '@haven/schema';
import { guardDocumentJson } from '../../packages/schema/src/validation/document-guard.js';
import { model } from './model.js';

describe('existing document limits and valid JSON semantics', () => {
  it('preserves frozen default budgets and the exact serialized UTF-8 byte boundary', () => {
    expect(defaultLimits).toEqual({
      maxBytes: 1_048_576,
      maxNodes: 2000,
      maxDepth: 48,
      maxRuleNodes: 5000,
    });
    expect(Object.isFrozen(defaultLimits)).toBe(true);
    const value = model();
    value.title = '你好 "quoted"\\path\nnext';
    const bytes = new TextEncoder().encode(JSON.stringify(value)).byteLength;
    expect(validateDocument(value, { limits: { maxBytes: bytes } }).valid).toBe(true);
    expect(validateDocument(value, { limits: { maxBytes: bytes - 1 } }).diagnostics).toEqual([
      { code: 'limit.bytes', path: '', message: 'Document is too large' },
    ]);
  });

  it('counts the root at depth zero and checks the physical JSON depth on every shared occurrence', () => {
    const shared = { value: 1 },
      value = { deep: { inside: shared }, shallow: shared };
    const accepted = guardDocumentJson(value, { ...defaultLimits, maxDepth: 3 });
    expect(accepted.ok).toBe(true);
    if (accepted.ok) {
      const snapshot = accepted.value as typeof value;
      expect(snapshot.deep.inside).toBe(snapshot.shallow);
      expect(snapshot.shallow).not.toBe(shared);
    }
    expect(guardDocumentJson(value, { ...defaultLimits, maxDepth: 2 })).toEqual({
      ok: false,
      diagnostic: {
        code: 'limit.complexity',
        path: '',
        message: 'Document exceeds structural limits',
      },
    });
    expect(guardDocumentJson(0, { ...defaultLimits, maxDepth: 0 })).toEqual({ ok: true, value: 0 });
  });

  it('retains maxNodes times 100 physical-value accounting, including shared object occurrences', () => {
    const limits = { ...defaultLimits, maxNodes: 1 };
    expect(
      guardDocumentJson(
        Array.from({ length: 99 }, () => null),
        limits,
      ).ok,
    ).toBe(true);
    expect(
      guardDocumentJson(
        Array.from({ length: 100 }, () => null),
        limits,
      ),
    ).toMatchObject({ ok: false, diagnostic: { code: 'limit.complexity' } });
    const shared = { value: 1 };
    expect(
      guardDocumentJson(
        Array.from({ length: 49 }, () => shared),
        limits,
      ).ok,
    ).toBe(true);
    expect(
      guardDocumentJson(
        Array.from({ length: 50 }, () => shared),
        limits,
      ),
    ).toMatchObject({ ok: false, diagnostic: { code: 'limit.complexity' } });
  });

  it('preserves ordinary model results and the UI node limit independently of JSON guard budgets', () => {
    const value = model();
    value.ui.children = [{ id: 'child', kind: 'view.text', version: 1, props: { text: 'Child' } }];
    const before = structuredClone(value);
    expect(validateDocument(value).diagnostics).toEqual([]);
    expect(validateDocument(value)).toEqual(validateDocument(JSON.parse(JSON.stringify(value))));
    expect(validateDocument(value, { limits: { maxNodes: 1 } }).diagnostics).toContainEqual({
      code: 'limit.nodes',
      path: '/ui',
      message: 'Too many UI nodes',
    });
    expect(value).toEqual(before);
  });
});
