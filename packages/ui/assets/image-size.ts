import type { ImageSizeConstraints } from '@haven/schema';

/** Browser-decoded intrinsic CSS dimensions, not a trusted file-format or server policy check. */
export function imageSizeIssue(
  width: number,
  height: number,
  bounds: ImageSizeConstraints,
): boolean {
  return (
    !Number.isSafeInteger(width) ||
    width < 1 ||
    !Number.isSafeInteger(height) ||
    height < 1 ||
    (bounds.minWidth !== undefined && width < bounds.minWidth) ||
    (bounds.maxWidth !== undefined && width > bounds.maxWidth) ||
    (bounds.minHeight !== undefined && height < bounds.minHeight) ||
    (bounds.maxHeight !== undefined && height > bounds.maxHeight)
  );
}

/** Resolves once and drops native event handlers on every terminal path, including abort. */
export function checkImageSize(
  url: string,
  bounds: ImageSizeConstraints,
  signal: AbortSignal,
): Promise<'dimensions' | 'decode' | null> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    let settled = false;
    const finish = (issue: 'dimensions' | 'decode' | null, abort = false) => {
      if (settled) return;
      settled = true;
      image.onload = null;
      image.onerror = null;
      signal.removeEventListener('abort', onAbort);
      image.removeAttribute('src');
      if (abort) reject(new DOMException('Image check cancelled', 'AbortError'));
      else resolve(issue);
    };
    const onAbort = () => finish(null, true);
    if (signal.aborted) return onAbort();
    signal.addEventListener('abort', onAbort, { once: true });
    image.onload = () =>
      finish(imageSizeIssue(image.naturalWidth, image.naturalHeight, bounds) ? 'dimensions' : null);
    image.onerror = () => finish('decode');
    try {
      image.src = url;
    } catch {
      finish('decode');
    }
  });
}
