import { BlockEmbed } from 'quill/blots/block.js';
import type { AssetReference } from '@haven/schema';
import { isAssetReference } from '@haven/schema';
import { readAsset, writeAsset } from './content';

/** Registry-local format; only persisted identity is held in Delta, never host URLs. */
export class HavenImageBlot extends BlockEmbed {
  static override blotName = 'havenImage';
  static override tagName = 'IMG';
  static override create(value: unknown): HTMLElement {
    const node = super.create() as HTMLElement;
    if (isAssetReference(value)) {
      writeAsset(node, value);
      node.setAttribute('alt', value.name);
    }
    return node;
  }
  static override value(node: Element): AssetReference | undefined {
    return readAsset(node);
  }
}
