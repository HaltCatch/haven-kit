import { describe, expect, it } from 'vitest';
import { validateDocument } from '@haven/schema';
import { document } from './fixtures.js';

describe('glass model theme contract', () => {
  it('accepts glass tokens and legacy presets while rejecting executable CSS sources', () => {
    const model = document();
    expect(validateDocument(model).valid).toBe(true);
    model.theme.preset = 'liquid-glass';
    model.theme.tokens = {
      glassTint: 'rgba(255,255,255,0.4)',
      glassBlur: '8px',
      glassRadius: '20px',
    };
    expect(validateDocument(model).valid).toBe(true);
    model.theme.tokens['glassTint'] = 'url(https://example.invalid/image)';
    expect(validateDocument(model).diagnostics).toContainEqual(
      expect.objectContaining({ code: 'theme.token' }),
    );
  });
});
