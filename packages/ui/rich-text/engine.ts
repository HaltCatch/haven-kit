import ListItem, { ListContainer } from 'quill/formats/list.js';
import Bold from 'quill/formats/bold.js';
import Italic from 'quill/formats/italic.js';
import Underline from 'quill/formats/underline.js';
import Strike from 'quill/formats/strike.js';
import Header from 'quill/formats/header.js';
import Blockquote from 'quill/formats/blockquote.js';
import Link from 'quill/formats/link.js';
import Quill, { Delta, Parchment } from 'quill/core.js';
import type { UploadAdapter, FileReference } from '@haven/runtime';
import type { RichTextContentState } from '@haven/schema';
import { HavenImageBlot } from './image-blot';
import { ImagePreviews } from './image-previews';
import { RichTextContent, readAsset, safeLink } from './content';

export interface RichTextEngineOptions {
  change: (value: string, state: RichTextContentState) => void;
  file: (file: File) => void;
  imageError: () => void;
}
export class RichTextEngine {
  readonly quill: Quill;
  readonly content: RichTextContent;
  readonly #previews = new ImagePreviews();
  #adapter: UploadAdapter | undefined;
  #disposed = false;
  readonly #change = (_delta: unknown, _old: unknown, source: string) => {
    if (source !== 'user' || this.#disposed || !this.quill.isEnabled()) return;
    const parsed = this.content.parse(this.quill.getSemanticHTML(), true);
    this.options.change(parsed.html, this.state(parsed.state));
    this.refreshImages();
  };
  readonly #paste = (event: ClipboardEvent) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!this.quill.isEnabled()) return;
    const file = event.clipboardData?.files[0];
    if (file) {
      this.options.file(file);
      return;
    }
    const html = this.content.parse(event.clipboardData?.getData('text/html') ?? '').html;
    const text = event.clipboardData?.getData('text/plain') ?? '';
    const range = this.quill.getSelection(true) ?? { index: this.quill.getLength() - 1, length: 0 };
    const delta = this.quill.clipboard.convert({ html, text });
    this.quill.updateContents(
      new Delta().retain(range.index).delete(range.length).concat(delta),
      'user',
    );
    this.quill.setSelection(range.index + delta.length(), 0, 'silent');
  };
  readonly #drop = (event: DragEvent) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (this.quill.isEnabled() && event.dataTransfer?.files[0])
      this.options.file(event.dataTransfer.files[0]);
  };
  constructor(
    readonly element: HTMLElement,
    readonly options: RichTextEngineOptions,
  ) {
    this.content = new RichTextContent(element.ownerDocument);
    const registry = new Parchment.Registry();
    for (const name of [
      'blots/scroll',
      'blots/block',
      'blots/break',
      'blots/container',
      'blots/cursor',
      'blots/inline',
      'blots/text',
    ]) {
      registry.register(Quill.import(name) as Parchment.BlotConstructor);
    }
    registry.register(
      Bold,
      Italic,
      Underline,
      Strike,
      Header,
      ListItem,
      ListContainer,
      Blockquote,
      Link,
      HavenImageBlot,
    );
    this.quill = new Quill(element, {
      registry,
      theme: '',
      modules: {
        toolbar: false,
        history: { userOnly: true },
        uploader: { handler: () => undefined },
      },
    });
    this.quill.clipboard.addMatcher('IMG', (node) => {
      const ref = readAsset(node as Element);
      return ref ? new Delta().insert({ havenImage: ref }) : new Delta();
    });
    this.quill.on('text-change', this.#change);
    this.quill.root.addEventListener('paste', this.#paste, true);
    this.quill.root.addEventListener('drop', this.#drop, true);
  }
  state(parsed: RichTextContentState): RichTextContentState {
    const text = this.quill.getText().replace(/\n$/, '');
    return {
      ...parsed,
      textLength: Array.from(text).length,
      empty: !text.trim() && !this.quill.root.querySelector('img'),
    };
  }
  setValue(value: string): RichTextContentState {
    const parsed = this.content.parse(value);
    const selection = this.quill.getSelection();
    this.quill.setContents(this.quill.clipboard.convert({ html: parsed.html }), 'silent');
    this.quill.history.clear();
    if (selection)
      this.quill.setSelection(
        Math.min(selection.index, Math.max(0, this.quill.getLength() - 1)),
        0,
        'silent',
      );
    this.#previews.reset();
    this.refreshImages();
    return this.state(parsed.state);
  }
  configure(
    disabled: boolean,
    label: string,
    placeholder: string,
    locale: string,
    adapter: UploadAdapter | undefined,
  ): void {
    this.quill.enable(!disabled);
    this.quill.root.setAttribute('role', 'textbox');
    this.quill.root.setAttribute('aria-multiline', 'true');
    this.quill.root.setAttribute('aria-label', label);
    this.quill.root.setAttribute('aria-readonly', String(disabled));
    this.quill.root.setAttribute('data-placeholder', placeholder);
    this.quill.root.setAttribute('lang', locale);
    if (this.#adapter !== adapter) {
      this.#adapter = adapter;
      this.#previews.reset();
      this.refreshImages();
    }
  }
  refreshImages(): void {
    this.#previews.refresh(this.quill.root, this.#adapter, this.options.imageError);
  }
  format(name: string, value: string | number | boolean): void {
    if (
      !this.quill.isEnabled() ||
      (name === 'link' && typeof value === 'string' && !safeLink(value))
    )
      return;
    this.quill.focus();
    this.quill.format(name, this.quill.getFormat()[name] === value ? false : value, 'user');
  }
  insertImage(file: FileReference): void {
    if (!this.quill.isEnabled()) return;
    const index = this.quill.getSelection()?.index ?? this.quill.getLength() - 1;
    this.quill.insertEmbed(index, 'havenImage', file, 'user');
    this.quill.setSelection(index + 1, 0, 'silent');
  }
  command(name: 'undo' | 'redo' | 'clearFormat'): void {
    if (!this.quill.isEnabled()) return;
    this.quill.focus();
    if (name === 'clearFormat') {
      const range = this.quill.getSelection();
      if (range) this.quill.removeFormat(range.index, range.length, 'user');
    } else this.quill.history[name]();
  }
  focus(): void {
    this.quill.focus();
  }
  dispose(): void {
    this.#disposed = true;
    this.#previews.dispose();
    this.quill.off('text-change', this.#change);
    this.quill.root.removeEventListener('paste', this.#paste, true);
    this.quill.root.removeEventListener('drop', this.#drop, true);
    this.quill.disable();
    this.quill.scroll.detach();
    this.element.replaceChildren();
  }
}
