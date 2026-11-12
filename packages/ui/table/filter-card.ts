import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  EnvironmentInjector,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { HavenLocalization } from '@haven/ui';
import { HAVEN_THEME_CONTEXT } from '@haven/ui/theme';
import { fieldAt, submitValidated } from '@haven/ui/form-state';
import type { JsonObject, JsonValue, TableColumn } from '@haven/schema';
import { HavenTableCellSnapshots } from './cell-snapshots';
import type { HavenTableFilterContext, HavenTableFilterRegistration } from './filters';
import { captureFilterValue, createTableFilterForm } from './filter-form';
interface FilterDraft {
  scope: string;
  registration: HavenTableFilterRegistration;
  baseline: JsonValue | undefined;
  native: ReturnType<typeof createTableFilterForm>;
}
@Component({
  selector: 'haven-table-filter-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgComponentOutlet, MatButtonModule],
  templateUrl: './filter-card.html',
  styles:
    ':host { display:block; min-width:0; } .controls { display:flex; flex-wrap:wrap; gap:var(--haven-gap-sm); }',
})
export class HavenTableFilterCard {
  readonly column = input.required<TableColumn>();
  readonly registration = input.required<HavenTableFilterRegistration>();
  readonly value = input<JsonValue>();
  readonly owner = input('standalone');
  readonly active = input<() => boolean>(() => true);
  readonly disabled = input(false);
  readonly changed = output<JsonValue | undefined>();
  readonly localization = inject(HavenLocalization);
  readonly #injector = inject(EnvironmentInjector);
  readonly #theme = inject(HAVEN_THEME_CONTEXT, { optional: true });
  readonly #snapshots = inject(HavenTableCellSnapshots);
  readonly #destroy = inject(DestroyRef);
  readonly draft = signal<FilterDraft | null>(null);
  readonly configurationError = signal(false);
  readonly scope = computed(() =>
    JSON.stringify([this.owner(), this.column().id, this.column().path, this.column().filter]),
  );
  readonly context = computed<HavenTableFilterContext>(() => {
    const column = this.column(),
      draft = this.draft(),
      theme = this.#theme?.();
    return Object.freeze({
      columnId: column.id,
      filterId: column.filter!.id,
      label: this.localization.text(column.header),
      params: this.#snapshots.snapshot(column.filter?.params ?? {}),
      locale: this.localization.locale(),
      theme: theme ? this.#snapshots.snapshot(theme) : null,
      disabled: this.disabled(),
      parseError: (key: string, invalid: boolean) => {
        if (draft && this.current(draft))
          draft.native.parse.update((previous) => {
            const next = new Set(previous);
            if (invalid) next.add(key);
            else next.delete(key);
            return next;
          });
      },
    });
  });
  readonly componentInputs = computed(() => ({
    context: this.context(),
    field: this.draft() ? fieldAt(this.draft()!.native.tree, '/value') : undefined,
  }));
  constructor() {
    effect((cleanup) => {
      const scope = this.scope(),
        registration = this.registration(),
        baseline = this.value();
      untracked(() => {
        this.configurationError.set(false);
        try {
          const params = this.#snapshots.snapshot(
            this.column().filter?.params ?? {},
          ) as Readonly<JsonObject>;
          const native = createTableFilterForm(
            this.#injector,
            registration,
            params,
            baseline,
            this.disabled,
          );
          this.draft.set({ scope, registration, baseline, native });
          cleanup(() => native.destroy());
        } catch {
          this.draft.set(null);
          this.configurationError.set(true);
        }
      });
    });
  }
  private current(draft: FilterDraft): boolean {
    return (
      !this.#destroy.destroyed &&
      this.active()() &&
      this.draft() === draft &&
      draft.scope === this.scope() &&
      draft.registration === this.registration() &&
      draft.baseline === this.value() &&
      !this.disabled()
    );
  }
  async apply(): Promise<void> {
    const draft = this.draft();
    if (!draft || !this.current(draft)) return;
    await submitValidated(draft.native.tree, {
      action: async () => {
        const value = captureFilterValue(draft.native.value()['value']);
        if (value && this.current(draft)) this.changed.emit(value.value);
      },
    });
  }
  clear(): void {
    if (!this.disabled() && this.active()()) this.changed.emit(undefined);
  }
}
