import { expect, it } from 'vitest';
import { validateDocument } from '@haven/schema';
import { document } from './fixtures.js';
it.each(['__proto__', 'constructor', 'prototype'])(
  'reports unsafe %s reference as a diagnostic instead of throwing',
  (part) => {
    const doc = document();
    doc.ui.children![0]!.validators = [
      {
        id: 'check',
        type: 'compare',
        operator: 'eq',
        other: { scope: 'root', path: `/${part}` },
        message: 'No',
      },
    ];
    expect(() => validateDocument(doc)).not.toThrow();
    expect(validateDocument(doc).valid).toBe(false);
    expect(validateDocument(doc).diagnostics.some((d) => d.code === 'validation.binding')).toBe(
      true,
    );
  },
);
it('reports an unsafe asynchronous dependency without throwing', () => {
  const doc = document();
  doc.resources['check'] = { type: 'validation', adapter: 'test.check' };
  doc.ui.children![0]!.validators = [
    {
      id: 'check',
      type: 'async',
      resource: 'check',
      dependencies: { value: { scope: 'root', path: '/constructor' } },
      message: 'No',
    },
  ];
  expect(() => validateDocument(doc)).not.toThrow();
  expect(validateDocument(doc).valid).toBe(false);
  expect(validateDocument(doc).diagnostics.some((d) => d.code === 'validation.binding')).toBe(true);
});
