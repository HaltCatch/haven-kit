/** Local civil values only. These contracts deliberately do not represent UTC instants. */
export type TemporalKind = 'date' | 'time' | 'datetime';
export interface TemporalBounds {
  min?: string;
  max?: string;
}
export type TemporalIssue = 'format' | 'min' | 'max' | 'bounds';

function validDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]),
    month = Number(match[2]),
    day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1]!;
}
function validTime(value: string): boolean {
  return /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value);
}
/** Accepts four-digit Gregorian years and whole seconds; rejects offsets, zones and fractions. */
export function isTemporalValue(kind: TemporalKind, value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (kind === 'date') return validDate(value);
  if (kind === 'time') return validTime(value);
  return (
    value.length >= 16 &&
    value[10] === 'T' &&
    validDate(value.slice(0, 10)) &&
    validTime(value.slice(11))
  );
}
function comparisonKey(kind: TemporalKind, value: string): string {
  if (kind === 'date') return value;
  return value.length === (kind === 'time' ? 5 : 16) ? `${value}:00` : value;
}
/** Returns undefined for malformed values; no parsing through Date or system timezone occurs. */
export function compareTemporalValues(
  kind: TemporalKind,
  left: unknown,
  right: unknown,
): -1 | 0 | 1 | undefined {
  if (!isTemporalValue(kind, left) || !isTemporalValue(kind, right)) return undefined;
  const a = comparisonKey(kind, left),
    b = comparisonKey(kind, right);
  return a < b ? -1 : a > b ? 1 : 0;
}
/** Reversed time bounds do not imply an overnight range; represent that as an explicit rule. */
export function isTemporalBounds(kind: TemporalKind, bounds: TemporalBounds): boolean {
  if (bounds.min !== undefined && !isTemporalValue(kind, bounds.min)) return false;
  if (bounds.max !== undefined && !isTemporalValue(kind, bounds.max)) return false;
  return (
    bounds.min === undefined ||
    bounds.max === undefined ||
    compareTemporalValues(kind, bounds.min, bounds.max) !== 1
  );
}
/** Empty values are left to required validation. Invalid bounds are never silently ignored. */
export function validateTemporalValue(
  kind: TemporalKind,
  value: unknown,
  bounds: TemporalBounds = {},
): TemporalIssue | undefined {
  if (!isTemporalBounds(kind, bounds)) return 'bounds';
  if (value === null || value === '') return undefined;
  if (!isTemporalValue(kind, value)) return 'format';
  if (bounds.min !== undefined && compareTemporalValues(kind, value, bounds.min) === -1)
    return 'min';
  if (bounds.max !== undefined && compareTemporalValues(kind, value, bounds.max) === 1)
    return 'max';
  return undefined;
}
