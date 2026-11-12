import type { UploadAdapter } from '@haven/runtime';
import { readAsset, safeImageUrl } from './content';

/** All requests are scoped to this editor revision, including transports that ignore abort. */
export class ImagePreviews {
  #controller = new AbortController();
  #seen = new WeakMap<HTMLImageElement, string>();
  reset(): void {
    this.#controller.abort();
    this.#controller = new AbortController();
    this.#seen = new WeakMap();
  }
  refresh(root: HTMLElement, adapter: UploadAdapter | undefined, failed: () => void): void {
    const signal = this.#controller.signal;
    root.querySelectorAll('img').forEach((image) => {
      const ref = readAsset(image);
      if (!ref || !adapter) {
        image.removeAttribute('src');
        return;
      }
      const key = JSON.stringify(ref);
      if (this.#seen.get(image) === key) return;
      this.#seen.set(image, key);
      image.removeAttribute('src');
      void Promise.resolve()
        .then(() => adapter.url(ref, signal))
        .then((url) => {
          if (signal.aborted || !root.contains(image) || this.#seen.get(image) !== key) return;
          if (!safeImageUrl(url, root.ownerDocument.baseURI)) throw new Error('Invalid image URL');
          image.src = url;
        })
        .catch(() => {
          if (!signal.aborted && root.contains(image)) failed();
        });
    });
  }
  dispose(): void {
    this.#controller.abort();
  }
}
