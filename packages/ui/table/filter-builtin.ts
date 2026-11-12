import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { FormField } from '@angular/forms/signals';
import type { Field, FieldTree } from '@angular/forms/signals';
import {
  HavenTextField,
  HavenNumberField,
  HavenCheckboxField,
  HavenTemporalField,
  HavenSelectField,
} from '@haven/ui/form';
import { fieldAt } from '@haven/ui/form-state';
import { HavenLocalization } from '@haven/ui';
import { isChoiceOptions } from '@haven/schema';
import type { HavenTableFilterContext } from './filters';
@Component({
  selector: 'haven-table-builtin-filter',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormField,
    HavenTextField,
    HavenNumberField,
    HavenCheckboxField,
    HavenTemporalField,
    HavenSelectField,
  ],
  templateUrl: './filter-builtin.html',
  styles:
    ':host { display:block; min-width:0; } .range { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,10rem),1fr)); gap:var(--haven-gap-sm); }',
})
export class HavenTableBuiltinFilter {
  readonly context = input.required<HavenTableFilterContext>();
  readonly field = input.required<FieldTree<Record<string, unknown>>>();
  readonly localization = inject(HavenLocalization);
  readonly text = computed(() => this.field() as unknown as Field<string>);
  readonly boolean = computed(() => this.field() as unknown as Field<boolean>);
  readonly choice = computed(() => this.field() as unknown as Field<string | number | null>);
  readonly options = computed(() => {
    if (this.context().filterId === 'empty')
      return ['empty', 'not-empty'].map((value) => ({
        value,
        label: this.localization.message('table.filters.' + value),
      }));
    const options = this.context().params['options'];
    return isChoiceOptions(options) ? options : [];
  });
  number(path: string): Field<number | null> {
    return fieldAt(this.field(), path) as Field<number | null>;
  }
  date(path: string): Field<string | null> {
    return fieldAt(this.field(), path) as Field<string | null>;
  }
  parseNumber(event: Event, key: string): void {
    const input = event.target;
    if (input instanceof HTMLInputElement) this.context().parseError(key, input.validity.badInput);
  }
}
