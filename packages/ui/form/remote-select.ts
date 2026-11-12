import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Directive,
  ElementRef,
  computed,
  afterRenderEffect,
  effect,
  inject,
  input,
  model,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import type { Signal } from '@angular/core';
import type { FormValueControl } from '@angular/forms/signals';
import {
  MatAutocomplete,
  MatAutocompleteModule,
  MatAutocompleteTrigger,
} from '@angular/material/autocomplete';
import type { MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { timer } from 'rxjs';
import { OptionSearch } from '@haven/runtime';
import type { Option, OptionsAdapter, OptionSearchState } from '@haven/runtime';
import type { ChoiceValue } from '@haven/schema';
import { HavenGlassSurface } from '@haven/ui/glass';
import { HAVEN_THEME_CONTEXT, applyHavenTheme } from '@haven/ui/theme';
import { HavenFieldPresentation } from './fields';

export interface HavenOptionResolution {
  /** A settled membership proof belongs to the request's producer, never the current listener. */
  readonly identity?: string;
  readonly adapter?: object | undefined;
  readonly locale?: string;
  readonly keys: readonly ChoiceValue[];
  readonly options: readonly Option[];
  readonly pending: boolean;
  readonly ready: boolean;
  readonly failed: boolean;
}
const imports = [
  HavenGlassSurface,
  MatAutocompleteModule,
  MatFormFieldModule,
  MatInputModule,
  MatButtonModule,
];

/** Shared remote interaction state; domain fetching and authentication belong to the host adapter. */
@Directive()
abstract class RemoteField extends HavenFieldPresentation {
  abstract readonly selectedKeys: Signal<readonly ChoiceValue[]>;
  abstract readonly multiple: boolean;
  abstract commit(keys: readonly ChoiceValue[]): void;
  readonly adapter = input.required<OptionsAdapter>();
  readonly identity = input('standalone');
  readonly placeholder = input('');
  readonly debounceMs = input(250);
  readonly resolution = output<HavenOptionResolution>();
  readonly state = signal<OptionSearchState>(OptionSearch.initialState());
  readonly #requests = new OptionSearch((state) => this.state.set(state));
  readonly #destroyRef = inject(DestroyRef);
  readonly #resolutionContext = signal<
    { identity: string; adapter: OptionsAdapter; locale: string } | undefined
  >(undefined);
  #searchIdentity = 0;
  readonly #theme = inject(HAVEN_THEME_CONTEXT, { optional: true });
  readonly control = viewChild<ElementRef<HTMLInputElement>>('control');
  readonly autocomplete = viewChild(MatAutocomplete);
  readonly trigger = viewChild(MatAutocompleteTrigger);
  readonly opened = signal(false);
  readonly focused = signal(false);
  readonly started = signal(false);
  readonly queryText = signal('');
  readonly debouncing = signal(false);
  readonly blocked = computed(() => this.disabled() || this.readonly());
  readonly selected = computed(() => {
    const labels = new Map(
      [...this.state().items, ...this.state().resolved].map((option) => [option.key, option]),
    );
    return this.selectedKeys().map((key) => labels.get(key) ?? { key, label: String(key) });
  });
  readonly displayed = computed(() =>
    this.focused() || this.multiple ? this.queryText() : (this.selected()[0]?.label ?? ''),
  );
  readonly busy = computed(() => this.debouncing() || this.state().searching);
  readonly resolutionState = computed<HavenOptionResolution>(
    () => {
      const state = this.state(),
        context = this.#resolutionContext();
      const current =
        !!context &&
        !this.#destroyRef.destroyed &&
        context.identity === this.identity() &&
        context.adapter === this.adapter() &&
        context.locale === this.localization.locale();
      return {
        ...(context
          ? { identity: context.identity, adapter: context.adapter, locale: context.locale }
          : {}),
        keys: state.keys,
        options: state.resolved,
        pending: state.resolving || !current,
        ready: state.resolveReady && current,
        failed: state.resolveError !== null,
      };
    },
    {
      equal: (a, b) =>
        a.identity === b.identity &&
        a.adapter === b.adapter &&
        a.locale === b.locale &&
        a.keys === b.keys &&
        a.options === b.options &&
        a.pending === b.pending &&
        a.ready === b.ready &&
        a.failed === b.failed,
    },
  );
  readonly displayOption = (option: Option | string | null): string =>
    this.multiple ? '' : typeof option === 'string' ? option : (option?.label ?? '');
  protected override focusOverlay(): HTMLElement | undefined {
    return this.opened() ? this.autocomplete()?.panel?.nativeElement : undefined;
  }
  constructor() {
    super();
    this.#destroyRef.onDestroy(() => this.#requests.dispose());
    effect((cleanup) => {
      const adapter = this.adapter(),
        keys = this.selectedKeys(),
        locale = this.localization.locale(),
        identity = this.identity();
      untracked(() => {
        this.#resolutionContext.set({ identity, adapter, locale });
        void this.#requests.resolve(adapter, keys, locale);
      });
      cleanup(() => this.#requests.cancelResolve());
    });
    effect((cleanup) => {
      const adapter = this.adapter(),
        locale = this.localization.locale(),
        text = this.queryText();
      this.identity();
      const active = this.started() && !this.blocked();
      const configured = this.debounceMs();
      const delay = Number.isFinite(configured) ? Math.min(2000, Math.max(0, configured)) : 250;
      this.#searchIdentity++;
      untracked(() => this.#requests.cancelSearch());
      this.debouncing.set(active);
      if (!active) return;
      const subscription = timer(text ? delay : 0).subscribe(() => {
        this.debouncing.set(false);
        void this.#requests.search(adapter, text, locale);
      });
      cleanup(() => {
        subscription.unsubscribe();
        this.#requests.cancelSearch();
      });
    });
    effect(() => this.resolution.emit(this.resolutionState()));
    // MatAutocomplete's public panel ViewChild is populated during rendering,
    // after its opened event. Apply DOM styles only once that render has completed.
    afterRenderEffect({
      write: (cleanup) => {
        const theme = this.#theme?.();
        if (!theme || !this.opened()) return;
        const panel = this.autocomplete()?.panel?.nativeElement as HTMLElement | undefined;
        if (panel) cleanup(applyHavenTheme(panel, theme));
      },
    });
  }
  start(): void {
    if (this.blocked()) return;
    this.started.set(true);
    this.focused.set(true);
  }
  query(value: string): void {
    if (this.blocked()) return;
    this.start();
    this.queryText.set(value);
  }
  blur(): void {
    this.touch.emit();
    if (!this.trigger()?.panelOpen) this.focused.set(false);
  }
  closed(): void {
    this.opened.set(false);
    this.focused.set(false);
  }
  isSelected(key: ChoiceValue): boolean {
    return this.selectedKeys().includes(key);
  }
  choose(event: MatAutocompleteSelectedEvent): void {
    if (this.blocked()) return;
    const chosen: unknown = event.option.value;
    if (!chosen || typeof chosen !== 'object' || !('key' in chosen)) return;
    const option = this.state().items.find((item) => item.key === chosen.key && !item.disabled);
    if (!option) return;
    if (this.multiple) {
      this.commit([...new Set([...this.selectedKeys(), option.key])]);
      this.queryText.set('');
    } else this.commit([option.key]);
    this.focused.set(false);
    this.touch.emit();
  }
  remove(key: ChoiceValue): void {
    if (this.blocked() || this.selected().find((option) => option.key === key)?.disabled) return;
    this.commit(this.selectedKeys().filter((value) => value !== key));
    this.touch.emit();
    this.focus();
  }
  clear(event: Event): void {
    event.stopPropagation();
    if (this.blocked()) return;
    this.commit([]);
    this.queryText.set('');
    this.touch.emit();
    this.focus();
  }
  async more(): Promise<void> {
    if (this.blocked()) return;
    const identity = this.#searchIdentity;
    await this.#requests.more();
    if (this.#destroyRef.destroyed || this.blocked() || identity !== this.#searchIdentity) return;
    this.focus();
    this.trigger()?.openPanel();
  }
  retrySearch(): void {
    if (!this.blocked()) void this.#requests.retrySearch();
  }
  retryResolve(): void {
    if (!this.disabled()) void this.#requests.retryResolve();
  }
  focus(options?: FocusOptions): void {
    this.control()?.nativeElement.focus(options);
  }
}

@Component({
  selector: 'haven-remote-select-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports,
  templateUrl: './remote-select.html',
  styleUrl: './remote-select.scss',
})
export class HavenRemoteSelectField
  extends RemoteField
  implements FormValueControl<ChoiceValue | null>
{
  readonly value = model<ChoiceValue | null>(null);
  readonly emptyValue = input<'' | null>(null);
  readonly multiple = false;
  readonly selectedKeys = computed(() =>
    this.value() === null || this.value() === '' ? [] : [this.value() as ChoiceValue],
  );
  commit(keys: readonly ChoiceValue[]): void {
    this.value.set(keys[0] ?? this.emptyValue());
  }
}
@Component({
  selector: 'haven-remote-multiselect-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports,
  templateUrl: './remote-select.html',
  styleUrl: './remote-select.scss',
})
export class HavenRemoteMultiselectField
  extends RemoteField
  implements FormValueControl<ChoiceValue[]>
{
  readonly value = model<ChoiceValue[]>([]);
  readonly multiple = true;
  readonly selectedKeys = computed(() => this.value());
  commit(keys: readonly ChoiceValue[]): void {
    this.value.set([...keys]);
  }
}
