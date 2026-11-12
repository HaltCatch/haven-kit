import { pointerSegments } from '@haven/schema';
export { projectHavenTableRows as projectTableRows } from '@haven/ui/table';

/** Native form identity is not transport data. Copy string data properties only, without
 * inspecting symbol metadata or invoking accessors. The native array remains the CAS owner. */
export function tableBindingValue(source: unknown, pointer: string): unknown {
  try {
    for (const segment of pointerSegments(pointer)) {
      if (!source || typeof source !== 'object') return undefined;
      const descriptor = Object.getOwnPropertyDescriptor(source, segment);
      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) return undefined;
      source = descriptor.value;
    }
    return source;
  } catch {
    return undefined;
  }
}
