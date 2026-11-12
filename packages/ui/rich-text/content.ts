import createDOMPurify from 'dompurify';
import { isAssetReference } from '@haven/schema';
import type { AssetReference, RichTextContentState } from '@haven/schema';

const assetAttributes = [
  'data-haven-asset-id',
  'data-haven-asset-name',
  'data-haven-asset-type',
  'data-haven-asset-size',
];
const tags = [
  'body',
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'strike',
  'h1',
  'h2',
  'h3',
  'blockquote',
  'ol',
  'ul',
  'li',
  'a',
  'img',
  'span',
];

export function readAsset(node: Element): AssetReference | undefined {
  const size = node.getAttribute(assetAttributes[3]!);
  const ref = {
    id: node.getAttribute(assetAttributes[0]!),
    name: node.getAttribute(assetAttributes[1]!),
    mediaType: node.getAttribute(assetAttributes[2]!),
    size: size === null ? NaN : Number(size),
  };
  return isAssetReference(ref) && /^image\/(png|jpeg|gif|webp|avif)$/i.test(ref.mediaType)
    ? ref
    : undefined;
}
export function writeAsset(node: Element, ref: AssetReference): void {
  [ref.id, ref.name, ref.mediaType, String(ref.size)].forEach((value, i) =>
    node.setAttribute(assetAttributes[i]!, value),
  );
}
/** This parser is browser-only and intentionally is not exported by schema/runtime. */
export class RichTextContent {
  readonly #purifier: ReturnType<typeof createDOMPurify>;
  constructor(readonly document: Document) {
    this.#purifier = createDOMPurify(document.defaultView!);
  }
  parse(value: string, editorOutput = false): { html: string; state: RichTextContentState } {
    const fragment = this.#purifier.sanitize(value, {
      ALLOWED_TAGS: tags,
      ALLOWED_ATTR: ['href', 'target', 'rel', 'alt', 'data-list', ...assetAttributes],
      ALLOW_DATA_ATTR: false,
      ALLOW_ARIA_ATTR: false,
      RETURN_DOM_FRAGMENT: true,
    });
    let removed = this.#purifier.removed.length > 0;
    fragment.querySelectorAll('a').forEach((link) => {
      const href = link.getAttribute('href');
      if (!href || !safeLink(href)) {
        if (href) removed = true;
        link.removeAttribute('href');
      } else {
        link.setAttribute('target', '_blank');
        link.setAttribute('rel', 'noopener noreferrer');
      }
    });
    fragment.querySelectorAll('img').forEach((image) => {
      const ref = readAsset(image);
      if (!ref) {
        removed = true;
        image.remove();
      } else {
        image.setAttribute('alt', ref.name);
        writeAsset(image, ref);
      }
    });
    const holder = this.document.createElement('div');
    holder.append(fragment);
    const text = holder.textContent ?? '';
    const empty = !text.trim() && !holder.querySelector('img');
    return {
      html: empty ? '' : holder.innerHTML,
      state: { valid: editorOutput || !removed, empty, textLength: Array.from(text).length },
    };
  }
}
export function safeLink(value: string): boolean {
  try {
    return ['https:', 'http:', 'mailto:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}
export function safeImageUrl(value: string, base?: string): boolean {
  try {
    return (
      value.trim().length > 0 &&
      ['https:', 'http:', 'blob:'].includes(new URL(value, base).protocol)
    );
  } catch {
    return false;
  }
}
