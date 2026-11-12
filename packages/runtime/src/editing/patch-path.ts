import { pointerSegments } from '@haven/schema';

/** Reject inherited members and non-JSON array properties before an upstream operation traverses. */
export function checkPatchPath(target: unknown, path: string, mayAdd: boolean): unknown {
  const parts = pointerSegments(path);
  let value = target;
  for (const [index, part] of parts.entries()) {
    if (value === null || typeof value !== 'object') throw new Error('editing.patchPath');
    const last = index === parts.length - 1;
    if (Array.isArray(value)) {
      if (last && mayAdd && part === '-') return undefined;
      if (!/^(0|[1-9][0-9]*)$/.test(part)) throw new Error('editing.patchPath');
      const position = Number(part);
      if (
        !Number.isSafeInteger(position) ||
        position > value.length ||
        (position === value.length && !(last && mayAdd))
      )
        throw new Error('editing.patchPath');
    } else if (!Object.hasOwn(value, part)) {
      if (last && mayAdd) return undefined;
      throw new Error('editing.patchPath');
    }
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}
