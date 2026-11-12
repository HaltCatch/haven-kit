import { describe, expect, it, vi } from 'vitest';
import { captureDocument, captureEditingBatch } from '@haven/schema/editing';
import { applyEditingBatch } from '@haven/runtime/editing';
import { batch, state } from './support.js';

describe('untrusted editing snapshots', () => {
  it('never evaluates batch or document getters, including the document ID before capture', () => {
    const getter = vi.fn(() => {
      throw new Error('must not execute');
    });
    const input = batch([{ type: 'node.remove', nodeId: 'missing' }]);
    Object.defineProperty(input, 'commands', { enumerable: true, get: getter });
    expect(captureEditingBatch(input).ok).toBe(false);
    expect(applyEditingBatch(state(), input).ok).toBe(false);
    const source = state();
    const command = batch(
      [{ type: 'document.patch', patch: [{ op: 'test', path: '/title', value: 'Editing' }] }],
      source,
    );
    Object.defineProperty(source.document, 'id', { enumerable: true, get: getter });
    expect(captureDocument(source.document).ok).toBe(false);
    expect(applyEditingBatch(source, command).ok).toBe(false);
    expect(getter).not.toHaveBeenCalled();
  });

  it('fails closed on throwing proxy reflection, cycles, symbols and sparse command arrays', () => {
    const proxy = new Proxy(
      {},
      {
        getPrototypeOf: () => {
          throw new Error('private details');
        },
      },
    );
    expect(captureEditingBatch(proxy)).toMatchObject({ ok: false });
    expect(captureDocument(proxy)).toMatchObject({ ok: false });
    expect(applyEditingBatch(state(), proxy)).toMatchObject({ ok: false });
    const cyclic: { nested?: unknown } = {};
    cyclic.nested = cyclic;
    expect(captureEditingBatch(cyclic).ok).toBe(false);
    expect(captureEditingBatch({ ...batch([]), [Symbol('hidden')]: true }).ok).toBe(false);
    expect(captureEditingBatch({ ...batch([]), commands: new Array(2) }).ok).toBe(false);
  });

  it('captures private copies so later producer mutation cannot alter the accepted envelope or document', () => {
    const source = state(),
      input = batch([
        { type: 'document.patch', patch: [{ op: 'replace', path: '/title', value: 'Captured' }] },
      ]);
    const capturedBatch = captureEditingBatch(input),
      capturedDocument = captureDocument(source.document);
    expect(capturedBatch.ok && capturedDocument.ok).toBe(true);
    if (!capturedBatch.ok || !capturedDocument.ok) throw new Error('Capture failed');
    input.expected.sessionId = 'changed';
    input.commands.length = 0;
    source.document.title = 'Changed';
    expect(capturedBatch.batch.expected.sessionId).toBe('session-1');
    expect(capturedBatch.batch.commands).toHaveLength(1);
    expect(capturedDocument.document.title).toBe('Editing');
  });

  it('keeps the document depth budget independent of the editing envelope', () => {
    const source = state();
    // An incomplete draft can still contain bounded nested schema properties.
    let schema = source.document.dataSchema;
    for (let index = 0; index < 17; index++) {
      schema.properties = { nested: { type: 'object', properties: {} } };
      schema = schema.properties['nested']!;
    }
    expect(captureDocument(source.document).ok).toBe(true);
    const result = applyEditingBatch(
      source,
      batch(
        [
          {
            type: 'document.patch',
            patch: [{ op: 'replace', path: '/title', value: 'Deep draft' }],
          },
        ],
        source,
      ),
    );
    expect(result.ok).toBe(true);
  });
});
