import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { FormField } from '@angular/forms/signals';
import type { Field } from '@angular/forms/signals';
import { HavenTextField } from '@haven/ui/form';
import type { HavenTableEditorContext } from '@haven/ui/table';

@Component({
  selector: 'haven-fixture-text-editor',
  imports: [FormField, HavenTextField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<haven-text-field
    data-fixture="custom-editor"
    [label]="context().label"
    [formField]="control()"
  />`,
})
export class FixtureTextEditor {
  readonly context = input.required<HavenTableEditorContext>();
  readonly field = input.required<Field<unknown>>();
  readonly control = computed(() => this.field() as Field<string>);
}
