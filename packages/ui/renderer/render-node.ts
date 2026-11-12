import { HavenRichTextField } from '@haven/ui/rich-text';
import { HavenRepeat } from '@haven/ui/repeat';
import { applyRepeatOperation } from './repeat-actions';
import type { RepeatOperation } from './repeat-actions';
import { HavenFileField, HavenFilesField, HavenImageField } from '@haven/ui/assets';
import {
  HavenTree,
  HavenTreeSelectField,
  HavenTreeMultiselectField,
  HavenCascaderField,
} from '@haven/ui/tree';
import { HavenPresentationNode } from './presentation-node';
import type { AssetReference } from '@haven/schema';
import { NgTemplateOutlet } from '@angular/common';
import { HavenTabs, HavenStepper, HavenPanel } from '@haven/ui/page';
import { HavenTableNode } from './table-node';
import { HavenRemoteTreeNode } from './tree-resource/node';
import { HavenTreeEditorNode } from './tree-editor-node';
import { HavenGlassSurface } from '@haven/ui/glass';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  linkedSignal,
  inject,
  input,
  DestroyRef,
  effect,
  untracked,
} from '@angular/core';
import type { Field } from '@angular/forms/signals';
import { FormField } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import {
  isChoiceOptions,
  isTreeNodes,
  isMultilingualLocales,
  readPointer,
  schemaAtPointer,
} from '@haven/schema';
import type { JsonValue, UiNode, ChoiceValue, TemporalKind, TreeKey } from '@haven/schema';
import { HavenLocalization } from '@haven/ui';
import {
  HavenMultilingualField,
  HavenTextField,
  HavenNumberField,
  HavenCheckboxField,
  HavenSelectField,
  HavenRadioField,
  HavenSwitchField,
  HavenTemporalField,
  HavenMultiselectField,
  HavenRemoteSelectField,
  HavenRemoteMultiselectField,
} from '@haven/ui/form';
import type { HavenRenderer } from './renderer';
import { fieldAt } from '@haven/ui/form-state';
@Component({
  selector: 'haven-render-node',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    HavenRepeat,
    HavenRichTextField,
    FormField,
    NgTemplateOutlet,
    HavenGlassSurface,
    HavenMultilingualField,
    HavenFileField,
    HavenFilesField,
    HavenImageField,
    HavenTree,
    HavenTreeSelectField,
    HavenTreeMultiselectField,
    HavenCascaderField,
    HavenPresentationNode,
    HavenTextField,
    HavenNumberField,
    HavenCheckboxField,
    HavenSelectField,
    HavenRadioField,
    HavenSwitchField,
    HavenTemporalField,
    HavenMultiselectField,
    HavenRemoteSelectField,
    HavenRemoteMultiselectField,
    HavenTableNode,
    HavenTreeEditorNode,
    HavenRemoteTreeNode,
    HavenTabs,
    HavenStepper,
    HavenPanel,
    MatButtonModule,
  ],
  host: {
    '[attr.data-node-id]': 'node().id',
    '[style.display]': 'state().visible ? null : "none"',
  },
  templateUrl: './render-node.html',
  styleUrl: './render-node.scss',
})
export class HavenRenderNode {
  readonly localization = inject(HavenLocalization);
  constructor() {
    effect(() => {
      this.uploadLifetime();
      untracked(() => {
        this.renderer().setUploading(this.node().id, false);
        this.renderer().setAssetIncomplete(this.node().id, false);
        this.renderer().fieldContent.remove(this.node().id);
      });
    });
    inject(DestroyRef).onDestroy(() => this.renderer().forgetNode(this.node().id));
  }
  readonly node = input.required<UiNode>();
  readonly renderer = input.required<HavenRenderer>();
  readonly state = computed(() => this.renderer().states().get(this.node().id)!);
  readonly label = computed(() => this.stringProp('label') || this.node().id);
  readonly ownerKey = computed(() => this.renderer().fieldIdentity(this.node()));
  // @switch / visibility can destroy an upload child without destroying this render node.
  readonly uploadLifetime = computed(() =>
    JSON.stringify([this.ownerKey(), this.node().kind, this.state().visible]),
  );
  readonly navigationId = linkedSignal({
    source: this.ownerKey,
    computation: () => null as string | null,
  });
  readonly panels = computed(() =>
    (this.node().children ?? []).filter((node) => this.renderer().states().get(node.id)?.visible),
  );
  panelTitle(node: UiNode): string {
    return this.localization.text(node.props?.['title'] ?? node.props?.['label']) || node.id;
  }
  panelValid(node: UiNode): boolean {
    const state = this.renderer().states().get(node.id);
    if (!state?.visible || state.disabled) return true;
    if (node.bind !== undefined && node.kind.startsWith('field.'))
      return fieldAt(this.renderer().fields()!, node.bind)?.().valid() ?? true;
    return (node.children ?? []).every((child) => this.panelValid(child));
  }
  touchPanel(id: string): void {
    const visit = (node: UiNode) => {
      if (node.bind !== undefined && node.kind.startsWith('field.'))
        fieldAt(this.renderer().fields()!, node.bind)?.().markAsTouched();
      for (const child of node.children ?? []) visit(child);
    };
    const node = this.panels().find((node) => node.id === id);
    if (node) visit(node);
  }
  readonly boundValue = computed(() =>
    this.node().bind === undefined
      ? undefined
      : (readPointer(this.renderer().value(), this.node().bind!) as JsonValue | undefined),
  );
  readonly assetField = computed(() => this.boundField() as Field<AssetReference[]> | undefined);
  readonly translationField = computed(
    () => this.boundField() as Field<Record<string, string>> | undefined,
  );
  readonly treeNodes = computed(() => {
    const nodes = this.node().props?.['nodes'];
    return isTreeNodes(nodes) ? nodes : [];
  });
  readonly locales = computed(() => {
    const locales = this.node().props?.['locales'];
    return isMultilingualLocales(locales) ? locales : [];
  });
  readonly treeActive = linkedSignal({
    source: this.ownerKey,
    computation: () => null as TreeKey | null,
  });
  readonly treeExpanded = linkedSignal({
    source: this.ownerKey,
    computation: () => [] as readonly TreeKey[],
  });
  readonly treeFilter = linkedSignal({ source: this.ownerKey, computation: () => '' });
  updateTreeExpanded(value: readonly TreeKey[]): void {
    this.treeExpanded.set(value);
    this.emit('expandedChange', [...value]);
  }
  updateTreeFilter(value: string): void {
    this.treeFilter.set(value);
    this.emit('filterChange', value);
  }
  numberProp(key: string): number | undefined {
    const value = this.node().props?.[key];
    return typeof value === 'number' ? value : undefined;
  }
  readonly description = computed(() => this.stringProp('description'));
  readonly boundField = computed(() =>
    this.node().bind === undefined
      ? undefined
      : fieldAt(this.renderer().fields()!, this.node().bind!),
  );
  readonly textField = computed(() => this.boundField() as Field<string> | undefined);
  readonly numberField = computed(() => this.boundField() as Field<number | null> | undefined);
  readonly choiceField = computed(
    () => this.boundField() as Field<string | number | null> | undefined,
  );
  readonly multipleField = computed(() => this.boundField() as Field<ChoiceValue[]> | undefined);
  readonly temporalField = computed(() => this.boundField() as Field<string | null> | undefined);
  readonly temporalKind = computed(() => this.node().kind.slice(6) as TemporalKind);
  // Native partial edits belong to one document/node/binding, not merely its current value.
  readonly treeSelectionIdentity = computed(() =>
    JSON.stringify([this.renderer().documentIdentity(), this.ownerKey(), this.node().kind]),
  );
  readonly temporalIdentity = computed(() => JSON.stringify([this.ownerKey(), this.node().kind]));
  readonly repeatRows = computed(() => this.renderer().instances().rows.get(this.node().id) ?? []);
  readonly boundSchema = computed(() =>
    schemaAtPointer(
      this.renderer().document().dataSchema,
      this.node().bind ?? '',
      this.renderer().document().dataSchema,
    ),
  );
  readonly repeatSchema = this.boundSchema;
  repeatOperation(operation: RepeatOperation): void {
    applyRepeatOperation(this.renderer(), this.node().id, operation);
  }
  readonly remoteAdapter = computed(() => this.renderer().optionAdapter(this.node()));
  readonly remoteIdentity = computed(() => this.renderer().optionIdentity(this.node()));
  readonly options = computed(() => {
    const value = this.node().props?.['options'];
    return isChoiceOptions(value) ? value : [];
  });
  readonly emptyValue = computed(() =>
    schemaAtPointer(
      this.renderer().document().dataSchema,
      this.node().bind ?? '',
      this.renderer().document().dataSchema,
    )?.type === 'number'
      ? null
      : ('' as const),
  );
  readonly checkboxField = computed(() => this.boundField() as Field<boolean> | undefined);
  readonly columns = computed(() =>
    typeof this.node().props?.['columns'] === 'number' ? this.node().props!['columns'] : 2,
  );
  readonly gap = computed(() => `var(--haven-gap-${this.stringProp('gap') || 'md'})`);
  readonly displayValue = computed(() =>
    this.node().bind === undefined
      ? this.stringProp('text')
      : String(readPointer(this.renderer().value(), this.node().bind!) ?? ''),
  );
  stringProp(key: string): string {
    const value = this.node().props?.[key];
    return this.localization.text(value);
  }
  emit(event: string, value?: JsonValue): void {
    this.renderer().dispatch(this.node(), event, value);
  }
}
