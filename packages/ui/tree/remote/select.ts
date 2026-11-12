import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import type { FormValueControl } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { HavenGlassSurface } from '@haven/ui/glass';
import { isTreeKey, isTreeSelection } from '@haven/schema';
import type { TreeKey } from '@haven/schema';
import { RemoteTreeField } from './field';

const imports = [MatButtonModule, MatFormFieldModule, MatInputModule, HavenGlassSurface];
@Component({
  selector: 'haven-remote-tree-select-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports,
  templateUrl: './select.html',
  styleUrl: '../fields.scss',
})
export class HavenRemoteTreeSelectField
  extends RemoteTreeField
  implements FormValueControl<TreeKey | null>
{
  readonly value = model<TreeKey | null>(null);
  readonly emptyValue = input<'' | null>(null);
  readonly multiple = false;
  readonly validValue = computed(
    () => this.value() === null || this.value() === '' || isTreeKey(this.value()),
  );
  readonly selectedKeys = computed(() =>
    this.value() === null || this.value() === '' ? [] : [this.value()!],
  );
  commit(keys: readonly TreeKey[]): void {
    this.value.set(keys[0] ?? this.emptyValue());
  }
}
@Component({
  selector: 'haven-remote-tree-multiselect-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports,
  templateUrl: './select.html',
  styleUrl: '../fields.scss',
})
export class HavenRemoteTreeMultiselectField
  extends RemoteTreeField
  implements FormValueControl<TreeKey[]>
{
  readonly value = model<TreeKey[]>([]);
  readonly multiple = true;
  readonly validValue = computed(() => isTreeSelection(this.value()));
  readonly selectedKeys = computed(() => (this.validValue() ? this.value() : []));
  commit(keys: readonly TreeKey[]): void {
    this.value.set([...keys]);
  }
}
