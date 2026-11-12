import { describe, expect, it } from 'vitest';
import {
  compareTemporalValues,
  isTemporalBounds,
  isTemporalValue,
  validateTemporalValue,
} from '../packages/schema/src/temporal.js';

describe('local temporal values', () => {
  it('validates actual Gregorian dates without rollover or year-zero coercion', () => {
    for (const value of ['0001-01-01', '2024-02-29', '2000-02-29', '9999-12-31'])
      expect(isTemporalValue('date', value)).toBe(true);
    for (const value of [
      '0000-01-01',
      '1900-02-29',
      '2023-02-29',
      '2024-04-31',
      '2024-13-01',
      '2024-01-00',
      '2024-1-01',
      '2024-01-01Z',
      '10000-01-01',
      null,
    ])
      expect(isTemporalValue('date', value)).toBe(false);
  });
  it('accepts whole minute/second local times, rejecting instants and rollover', () => {
    for (const value of ['00:00', '23:59', '23:59:59'])
      expect(isTemporalValue('time', value)).toBe(true);
    for (const value of [
      '24:00',
      '23:60',
      '23:59:60',
      '1:00',
      '12:00:00.001',
      '12:00Z',
      '12:00+08:00',
    ])
      expect(isTemporalValue('time', value)).toBe(false);
    expect(compareTemporalValues('time', '12:00', '12:00:00')).toBe(0);
    expect(compareTemporalValues('time', '12:00', '12:00:01')).toBe(-1);
  });
  it('represents civil datetime independently of daylight-saving gaps and local timezone', () => {
    // Valid civil values even where a specific zone would not have that instant.
    expect(isTemporalValue('datetime', '2026-03-08T02:30')).toBe(true);
    expect(isTemporalValue('datetime', '2024-02-29T23:59:59')).toBe(true);
    for (const value of [
      '2023-02-29T12:00',
      '2024-02-29 12:00',
      '2024-02-29T24:00',
      '2024-02-29T12:00Z',
      '2024-02-29T12:00+08:00',
    ])
      expect(isTemporalValue('datetime', value)).toBe(false);
    expect(compareTemporalValues('datetime', '2024-12-31T23:59:59', '2025-01-01T00:00')).toBe(-1);
    expect(compareTemporalValues('date', '2024-04-31', '2024-05-01')).toBeUndefined();
  });
  it('enforces inclusive bounds and rejects malformed or reversed configuration', () => {
    const bounds = { min: '2024-02-28', max: '2024-02-29' };
    expect(validateTemporalValue('date', '2024-02-28', bounds)).toBeUndefined();
    expect(validateTemporalValue('date', '2024-02-29', bounds)).toBeUndefined();
    expect(validateTemporalValue('date', '2024-02-27', bounds)).toBe('min');
    expect(validateTemporalValue('date', '2024-03-01', bounds)).toBe('max');
    expect(validateTemporalValue('date', 'not-a-date', bounds)).toBe('format');
    expect(isTemporalBounds('time', { min: '22:00', max: '02:00' })).toBe(false);
    expect(isTemporalBounds('date', { min: '2024-02-30' })).toBe(false);
    expect(isTemporalBounds('date', { max: '2024-02-30' })).toBe(false);
    expect(isTemporalBounds('time', { min: '12:00:00', max: '12:00' })).toBe(true);
    expect(validateTemporalValue('time', null, { min: '22:00', max: '02:00' })).toBe('bounds');
  });
  it('leaves optional emptiness to required validation, without accepting arbitrary types', () => {
    expect(validateTemporalValue('date', null)).toBeUndefined();
    expect(validateTemporalValue('date', '')).toBeUndefined();
    expect(validateTemporalValue('date', undefined)).toBe('format');
    expect(validateTemporalValue('date', 0)).toBe('format');
    expect(validateTemporalValue('date', '2024-01-01', { min: '2024-01-01' })).toBeUndefined();
    expect(validateTemporalValue('date', '2024-01-01', { max: '2024-01-01' })).toBeUndefined();
  });
});
