import stringify from 'fast-json-stable-stringify';
import { captureDocument } from '@haven/schema/editing';
import type { ValidationOptions } from '@haven/schema';

/** Versioned stable JSON + SHA-256, not RFC 8785. Preserves Haven's existing JSON string domain. */
export async function documentFingerprint(
  value: unknown,
  options: ValidationOptions = {},
): Promise<string> {
  const captured = captureDocument(value, options);
  if (!captured.ok) throw new TypeError('editing.invalidDocument');
  const bytes = new TextEncoder().encode(stringify(captured.document));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return (
    'haven-json-v1:sha256:' +
    [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  );
}
