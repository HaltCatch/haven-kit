/** Optional presentation configuration. An empty object uses theme and native defaults.
 * Local mode scrolls all filtered/sorted/expanded rows without local pagination.
 * Remote mode scrolls only the loaded page and retains server pagination.
 * These values never change query or write ownership.
 */
export interface TableVirtualization {
  /** Viewport height in CSS pixels, 64..4096. */
  readonly viewportHeight?: number;
  /** Initial estimate in CSS pixels, 16..512; actual variable row heights must still be measured. */
  readonly estimateRowHeight?: number;
  /** Extra rows outside the viewport, an integer from 0 through 50. */
  readonly overscan?: number;
}

interface Issue {
  readonly property: string | null;
  readonly message: string;
}
const limits = {
  viewportHeight: { min: 64, max: 4096 },
  estimateRowHeight: { min: 16, max: 512 },
  overscan: { min: 0, max: 50 },
} as const;

/** Internal diagnostic detail shared with model validation; never inspect accessor values. */
export function tableVirtualizationIssue(value: unknown): Issue | null {
  const objectIssue = {
    property: null,
    message: 'Expected a plain JSON virtualization configuration',
  };
  try {
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    )
      return objectIssue;
    // At most three known properties exist. A fourth key must be unsupported; no values are read.
    const keys = Reflect.ownKeys(value);
    for (const key of keys.slice(0, 4)) {
      if (typeof key !== 'string') return objectIssue;
      if (!Object.hasOwn(limits, key))
        return { property: key, message: 'Unknown virtualization property' };
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !('value' in descriptor))
        return {
          property: key,
          message: 'Virtualization properties must be enumerable JSON numbers',
        };
      const number: unknown = descriptor.value;
      const { min, max } = limits[key as keyof typeof limits];
      if (
        typeof number !== 'number' ||
        !Number.isFinite(number) ||
        number < min ||
        number > max ||
        (key === 'overscan' && !Number.isInteger(number))
      )
        return {
          property: key,
          message:
            key === 'overscan'
              ? 'Overscan must be an integer from 0 through 50'
              : key === 'viewportHeight'
                ? 'Viewport height must be a finite number from 64 through 4096 CSS pixels'
                : 'Row height estimate must be a finite number from 16 through 512 CSS pixels',
        };
    }
    return null;
  } catch {
    return objectIssue;
  }
}

/** Shape and bounds only: validation never fills defaults or mutates the caller's settings. */
export function isTableVirtualization(value: unknown): value is TableVirtualization {
  return tableVirtualizationIssue(value) === null;
}
