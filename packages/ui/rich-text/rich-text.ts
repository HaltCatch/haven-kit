import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  ViewEncapsulation,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import type { FormValueControl } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RichTextImageField } from './image-upload';
import { HavenGlassSurface } from '@haven/ui/glass';
import { isRichTextConstraints } from '@haven/schema';
import type { RichTextContentState } from '@haven/schema';
import type { FileReference } from '@haven/runtime';
import type { RichTextEngine } from './engine';
import { RichTextToolbar } from './toolbar';

export interface HavenRichTextState extends RichTextContentState {
  value: unknown;
  identity: string;
  ready: boolean;
}
@Component({
  selector: 'haven-rich-text-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [HavenGlassSurface, MatButtonModule, MatProgressBarModule, RichTextToolbar],
  templateUrl: './rich-text.html',
  styleUrl: './rich-text.scss',
})
export class HavenRichTextField extends RichTextImageField implements FormValueControl<string> {
  readonly placeholder = input('');
  readonly textMinLength = input<number>();
  readonly textMaxLength = input<number>();
  readonly contentStateChange = output<HavenRichTextState>();
  readonly loading = signal(true);
  readonly contentState = signal<RichTextContentState>({
    valid: false,
    empty: true,
    textLength: 0,
  });
  readonly ready = signal(false);
  readonly blocked = computed(
    () =>
      this.disabled() ||
      this.readonly() ||
      !this.ready() ||
      !this.validConfiguration() ||
      typeof this.value() !== 'string',
  );
  readonly validConfiguration = computed(() =>
    isRichTextConstraints({
      ...(this.textMinLength() !== undefined ? { minTextLength: this.textMinLength()! } : {}),
      ...(this.textMaxLength() !== undefined ? { maxTextLength: this.textMaxLength()! } : {}),
      ...(this.maxImageBytes() !== undefined ? { maxImageBytes: this.maxImageBytes()! } : {}),
    }),
  );
  readonly surface = viewChild<ElementRef<HTMLElement>>('editor');
  readonly picker = viewChild<ElementRef<HTMLInputElement>>('picker');
  readonly #destroy = inject(DestroyRef);
  #engine: RichTextEngine | undefined;
  #lastValue: unknown = Symbol();
  #generation = 0;
  constructor() {
    super();
    this.focusLeft.subscribe(() => this.touch.emit());
    effect((cleanup) => {
      const element = this.surface()?.nativeElement;
      const identity = this.identity();
      if (!element) return;
      const generation = ++this.#generation;
      untracked(() => {
        this.loading.set(true);
        this.ready.set(false);
        this.failure.set(null);
        this.cancel();
      });
      void import('./engine')
        .then(({ RichTextEngine }) => {
          if (this.#destroy.destroyed || generation !== this.#generation) return;
          this.#engine = new RichTextEngine(element, {
            change: (value, state) => {
              if (
                this.blocked() ||
                this.identity() !== identity ||
                this.#lastValue !== this.value()
              )
                return;
              this.cancel();
              this.#lastValue = value;
              this.value.set(value);
              this.contentState.set(state);
            },
            file: (file) => {
              void this.choose(file);
            },
            imageError: () => this.failure.set('richText.imageError'),
          });
          this.#lastValue = Symbol();
          this.ready.set(true);
          this.loading.set(false);
        })
        .catch(() => {
          if (!this.#destroy.destroyed && generation === this.#generation) {
            this.failure.set('richText.loadError');
            this.loading.set(false);
          }
        });
      cleanup(() => {
        ++this.#generation;
        this.cancel();
        this.#engine?.dispose();
        this.#engine = undefined;
      });
    });
    effect(() => {
      if (!this.ready() || !this.#engine) return;
      const value = this.value();
      this.#engine.configure(
        this.blocked(),
        this.label(),
        this.placeholder(),
        this.localization.locale(),
        this.disabled() ? undefined : this.adapter(),
      );
      this.#engine.quill.root.setAttribute('aria-disabled', String(this.disabled()));
      this.#engine.quill.root.setAttribute('aria-required', String(this.required()));
      this.#engine.quill.root.setAttribute('aria-invalid', String(this.invalid()));
      if (this.#lastValue !== value) {
        this.#lastValue = value;
        untracked(() => {
          this.cancel();
          const state = this.#engine!.setValue(typeof value === 'string' ? value : '');
          this.contentState.set(
            typeof value === 'string' ? state : { valid: false, empty: true, textLength: 0 },
          );
        });
      }
    });
    effect(() =>
      this.contentStateChange.emit({
        ...this.contentState(),
        value: this.value(),
        identity: this.identity(),
        ready: this.ready() && this.validConfiguration(),
      }),
    );
  }
  format(event: { name: string; value: string | number | boolean }): void {
    if (!this.blocked()) this.#engine?.format(event.name, event.value);
  }
  command(name: 'undo' | 'redo' | 'clearFormat'): void {
    if (!this.blocked()) this.#engine?.command(name);
  }
  clear(): void {
    if (!this.disabled() && !this.readonly()) {
      this.cancel();
      this.value.set('');
      this.touch.emit();
    }
  }
  focus(): void {
    this.#engine?.focus();
  }
  protected insertImage(file: FileReference): void {
    this.#engine?.insertImage(file);
  }
}
