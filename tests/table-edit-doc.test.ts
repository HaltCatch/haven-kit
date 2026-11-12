import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { validateDocument } from '../packages/schema/src/index.js';
it('the documented table edit model is a complete valid Haven document', () => {
  const markdown = readFileSync(new URL('../docs/table-editing.md', import.meta.url), 'utf8');
  const json = /```json\n([\s\S]*?)\n```/.exec(markdown)?.[1];
  expect(json).toBeTruthy();
  expect(validateDocument(JSON.parse(json!))).toMatchObject({ valid: true, diagnostics: [] });
});
