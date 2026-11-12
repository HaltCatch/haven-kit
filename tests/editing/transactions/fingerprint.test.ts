import { describe, expect, it, vi } from 'vitest';
import { documentFingerprint } from '@haven/runtime/editing';
import { frozen, group } from '../primitives/support.js';
import { state } from './support.js';

describe('versioned document fingerprints', () => {
  it('ignores object property insertion order while distinguishing actual nested values and array order', async () => {
    const document = state().document;
    document.dataSchema.properties = { alpha: { type: 'string' }, beta: { type: 'number' } };
    document.ui.children = [group('a'), group('b')];
    const reordered = structuredClone(document);
    reordered.dataSchema.properties = { beta: { type: 'number' }, alpha: { type: 'string' } };
    const reverse = {
      resources: reordered.resources,
      actions: reordered.actions,
      theme: reordered.theme,
      ui: reordered.ui,
      dataSchema: reordered.dataSchema,
      title: reordered.title,
      id: reordered.id,
      schemaVersion: reordered.schemaVersion,
    };
    frozen(document);
    frozen(reverse);
    const fingerprint = await documentFingerprint(document);
    expect(fingerprint).toMatch(/^haven-json-v1:sha256:[a-f0-9]{64}$/);
    expect(await documentFingerprint(reverse)).toBe(fingerprint);
    const changed = structuredClone(document);
    changed.dataSchema.properties!['alpha']!.maxLength = 20;
    expect(await documentFingerprint(changed)).not.toBe(fingerprint);
    const moved = structuredClone(document);
    moved.ui.children!.reverse();
    expect(await documentFingerprint(moved)).not.toBe(fingerprint);
  });

  it('preserves legal isolated surrogate strings without replacing them by U+FFFD or conflating distinct code units', async () => {
    const document = state().document;
    const values = ['\ud800', '\ud801', '\udfff', '\ufffd', '\ud800\udc00'];
    const fingerprints = await Promise.all(
      values.map((title) => documentFingerprint({ ...document, title })),
    );
    expect(new Set(fingerprints).size).toBe(values.length);
    expect(await documentFingerprint({ ...document, title: JSON.parse('"\\ud800"') })).toBe(
      fingerprints[0],
    );
  });

  it('rejects non-JSON snapshots without evaluating accessors or exposing proxy exception text', async () => {
    const getter = vi.fn(() => {
      throw new Error('private details');
    });
    const document = state().document;
    Object.defineProperty(document, 'title', { enumerable: true, get: getter });
    await expect(documentFingerprint(document)).rejects.toThrow('editing.invalidDocument');
    await expect(
      documentFingerprint(
        new Proxy(
          {},
          {
            ownKeys: () => {
              throw new Error('private details');
            },
          },
        ),
      ),
    ).rejects.toThrow('editing.invalidDocument');
    expect(getter).not.toHaveBeenCalled();
  });
});
