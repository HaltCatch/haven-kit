import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { FormField } from '@angular/forms/signals';
import type { Field } from '@angular/forms/signals';
import { fieldAt } from '@haven/ui/form-state';
import { HavenLocalization } from '@haven/ui';
import {
  HavenRemoteTree,
  HavenRemoteTreeSelectField,
  HavenRemoteTreeMultiselectField,
  HavenRemoteCascaderField,
} from '@haven/ui/tree';
import { schemaAtPointer } from '@haven/schema';
import type { TreeKey, UiNode } from '@haven/schema';
import type { HavenRenderer } from '../renderer';

@Component({
  selector: 'haven-remote-tree-node',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormField,
    HavenRemoteTree,
    HavenRemoteTreeSelectField,
    HavenRemoteTreeMultiselectField,
    HavenRemoteCascaderField,
  ],
  templateUrl: './node.html',
})
export class HavenRemoteTreeNode {
  readonly node = input.required<UiNode>();
  readonly renderer = input.required<HavenRenderer>();
  readonly localization = inject(HavenLocalization);
  readonly source = computed(() => this.renderer().treeResources.source(this.node));
  // The nested computed retains the source object across translated labels and other cosmetic edits.
  readonly dataSource = computed(() => this.source()());
  readonly state = computed(() => this.renderer().states().get(this.node().id));
  readonly available = () =>
    !!this.state()?.visible &&
    !this.state()?.disabled &&
    this.renderer().validation().valid &&
    !!this.dataSource();
  readonly editable = () => this.available() && !this.state()?.readonly;
  readonly title = computed(() =>
    this.localization.text(this.node().props?.['label'] ?? this.node().props?.['title']),
  );
  readonly description = computed(() => this.localization.text(this.node().props?.['description']));
  readonly scalar = computed(
    () => fieldAt(this.renderer().fields()!, this.node().bind!) as Field<TreeKey | null>,
  );
  readonly multiple = computed(
    () => fieldAt(this.renderer().fields()!, this.node().bind!) as Field<TreeKey[]>,
  );
  readonly emptyValue = computed(() =>
    schemaAtPointer(this.renderer().document().dataSchema, this.node().bind ?? '')?.type ===
    'number'
      ? null
      : ('' as const),
  );
  emit(event: string, value?: TreeKey | TreeKey[] | readonly TreeKey[] | null | string): void {
    if (!this.editable()) return;
    const current = this.state()?.node;
    if (current)
      this.renderer().dispatch(
        current,
        event,
        value === undefined
          ? undefined
          : Array.isArray(value)
            ? [...value]
            : (value as TreeKey | null),
      );
  }
}
