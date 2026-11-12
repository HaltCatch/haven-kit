import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { FormField } from '@angular/forms/signals';
import type { Field } from '@angular/forms/signals';
import {
  HavenTextField,
  HavenNumberField,
  HavenCheckboxField,
  HavenSwitchField,
  HavenTemporalField,
  HavenSelectField,
  HavenRadioField,
} from '@haven/ui/form';
import { isChoiceOptions } from '@haven/schema';
import type { HavenTableEditorContext } from './editors';
/** Only the wrapper is new: values, errors, touch, disabled and focus belong to native fields. */
@Component({
  selector: 'haven-table-builtin-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormField,
    HavenTextField,
    HavenNumberField,
    HavenCheckboxField,
    HavenSwitchField,
    HavenTemporalField,
    HavenSelectField,
    HavenRadioField,
  ],
  templateUrl: './builtin-editor.html',
  styles: ':host { display: block; min-width: 0; }',
})
export class HavenTableBuiltinEditor {
  readonly context = input.required<HavenTableEditorContext>();
  readonly field = input.required<Field<unknown>>();
  readonly parseError = input<(invalid: boolean) => void>(() => undefined);
  // The registry/schema compatibility gate establishes these value types before outlet creation.
  readonly text = computed(() => this.field() as Field<string>);
  readonly number = computed(() => this.field() as Field<number | null>);
  readonly boolean = computed(() => this.field() as Field<boolean>);
  readonly temporal = computed(() => this.field() as Field<string | null>);
  readonly choice = computed(() => this.field() as Field<string | number | null>);
  readonly options = computed(() => {
    const value = this.context().params['options'];
    return isChoiceOptions(value) ? value : [];
  });
  readonly temporalKind = computed(() => {
    const id = this.context().editorId;
    return id === 'time' || id === 'datetime' ? id : 'date';
  });
}
