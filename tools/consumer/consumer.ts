import { formSchema, submitValidated } from '@haven/ui/form-state';
import { HavenRepeat } from '@haven/ui/repeat';
import { HavenToolbar, HavenDialog, HavenDialogContent } from '@haven/ui/actions';
import { HavenFileField, HavenFilesField, HavenImageField } from '@haven/ui/assets';
import { HavenRichTextField } from '@haven/ui/rich-text';
import {
  HavenRemoteTree,
  HavenRemoteTreeSelectField,
  HavenRemoteTreeMultiselectField,
  HavenRemoteCascaderField,
  HavenTree,
  HavenTreeEditor,
  HavenTreeSelectField,
  HavenTreeMultiselectField,
  HavenCascaderField,
} from '@haven/ui/tree';
import {
  HavenCard,
  HavenAccordion,
  HavenBadge,
  HavenProgress,
  HavenAlert,
  HavenDivider,
} from '@haven/ui/display';
import { Component, input, signal, computed, inject } from '@angular/core';
import { FormField, form, required } from '@angular/forms/signals';
import { validateDocument } from '@haven/schema';
import { captureEditingBatch } from '@haven/schema/editing';
import { applyEditingBatch } from '@haven/runtime/editing';
import { localizeText } from '@haven/schema/localization';
import type { LocalizedText } from '@haven/schema/localization';
import type {
  HavenDocument,
  TableColumn,
  TableView,
  TableQuery,
  TableHeaderLayout,
  TableHierarchy,
  TableVirtualization,
  TableRowKey,
} from '@haven/schema';
import { ActionRegistry } from '@haven/runtime';
import type {
  TreeDataSource,
  FileReference,
  UploadAdapter,
  OptionsAdapter,
  TableDataSource,
} from '@haven/runtime';
import {
  HavenMultilingualField,
  HavenTextField,
  HavenNumberField,
  HavenCheckboxField,
  HavenSelectField,
  HavenRadioField,
  HavenSwitchField,
  HavenRemoteSelectField,
  HavenRemoteMultiselectField,
} from '@haven/ui/form';
import { HavenStack, HavenPanel, HavenTabs, HavenStepper } from '@haven/ui/page';
import { HavenThemeDirective } from '@haven/ui/theme';
import { HavenGlassSurface } from '@haven/ui/glass';
import { provideHavenTransloco } from '@haven/ui/i18n';
import { HavenRenderer, provideHavenRendererHost } from '@haven/ui/renderer';
import {
  HavenTable,
  createHavenTableCellRenderers,
  createHavenTableFilters,
  projectHavenTableRows,
} from '@haven/ui/table';
import type { HavenTableCellContext } from '@haven/ui/table';

@Component({ selector: 'consumer-cell', template: '{{ context().value }}' })
class ConsumerCell {
  readonly context = input.required<HavenTableCellContext>();
}

@Component({
  selector: 'consumer-dialog',
  imports: [HavenDialogContent],
  template: '<haven-dialog-content title="Details">Typed dialog content</haven-dialog-content>',
})
class ConsumerDialog {}

/** Compiled in a separate directory against tarballs, without workspace source aliases. */
@Component({
  selector: 'consumer-root',
  imports: [
    HavenRepeat,
    HavenToolbar,
    HavenFileField,
    HavenFilesField,
    HavenRichTextField,
    HavenImageField,
    HavenRemoteTree,
    HavenRemoteTreeSelectField,
    HavenRemoteTreeMultiselectField,
    HavenRemoteCascaderField,
    HavenTree,
    HavenTreeEditor,
    HavenTreeSelectField,
    HavenTreeMultiselectField,
    HavenCascaderField,
    HavenCard,
    HavenAccordion,
    HavenBadge,
    HavenProgress,
    HavenAlert,
    HavenDivider,
    HavenMultilingualField,
    HavenGlassSurface,
    FormField,
    HavenTextField,
    HavenNumberField,
    HavenCheckboxField,
    HavenSelectField,
    HavenRadioField,
    HavenSwitchField,
    HavenRemoteSelectField,
    HavenRemoteMultiselectField,
    HavenStack,
    HavenThemeDirective,
    HavenRenderer,
    HavenPanel,
    HavenTabs,
    HavenStepper,
    HavenTable,
  ],
  template: `
    <p>{{ localizedCaption }}</p>
    <haven-remote-tree [source]="remoteTree" [filterable]="true" />
    <haven-remote-tree-select-field label="Remote single" [source]="remoteTree" [value]="0" />
    <haven-remote-tree-multiselect-field
      label="Remote multiple"
      [source]="remoteTree"
      [value]="[0]"
    />
    <haven-remote-cascader-field label="Remote cascade" [source]="remoteTree" [value]="0" />
    <haven-glass-surface>Optional Glass consumer</haven-glass-surface>
    <haven-table
      #exportTable
      [exportable]="true"
      [source]="remoteTable"
      [(query)]="tableQuery"
      [columns]="columns"
      [headerGroups]="headerGroups()"
      [filters]="filters"
      [(columnFilters)]="columnFilters"
      [cellRenderers]="cells"
      [readonly]="true"
    />
    <button (click)="exportTable.createCsv({ scope: 'loaded-page' })">Create CSV</button>
    <button [disabled]="exportTable.pendingEdits()">Continue after table edit</button>
    <button (click)="exportTable.exportContext()">Read export context</button>
    <haven-stack [havenTheme]="theme">
      <haven-text-field label="Title" [formField]="fields.title" />
      <haven-number-field label="Amount" [formField]="fields.amount" />
      <haven-checkbox-field label="Enabled" [formField]="fields.enabled" />
      <haven-select-field label="Select" [options]="choices" [formField]="fields.amount" />
      <haven-radio-field label="Radio" [options]="choices" [formField]="fields.amount" />
      <haven-switch-field label="Enabled" [formField]="fields.enabled" />
      <haven-remote-select-field label="Remote" [adapter]="options" [formField]="fields.amount" />
      <haven-remote-multiselect-field
        label="Remote multiple"
        [adapter]="options"
        [formField]="fields.selected"
      />
      <haven-multilingual-field
        label="Translations"
        [locales]="['en-US']"
        [formField]="fields.translations"
      />
      <haven-file-field label="File" [adapter]="uploads" [formField]="fields.files" />
      <haven-files-field
        label="Files"
        [adapter]="uploads"
        [maxItems]="10"
        [concurrency]="2"
        [formField]="fields.files"
      />
      <haven-rich-text-field
        label="Description"
        [adapter]="uploads"
        [textMaxLength]="2000"
        [formField]="fields.html"
      />
      <haven-image-field
        label="Image"
        [adapter]="uploads"
        [maxWidth]="2048"
        [maxHeight]="2048"
        [formField]="fields.files"
      />
      <haven-tree title="Navigation" [nodes]="treeNodes" />
      <haven-tree-editor #treeEditor title="Structure" [nodes]="treeNodes" identity="document:1" />
      <button [disabled]="treeEditor.pendingEdits()">Continue after tree edit</button>
      <haven-tree-select-field
        label="Tree selection"
        [nodes]="treeNodes"
        [formField]="fields.amount"
      />
      <haven-tree-multiselect-field
        label="Tree multiple"
        [nodes]="treeNodes"
        [cascade]="true"
        [leafOnly]="true"
        [formField]="fields.selected"
      />
      <haven-cascader-field label="Cascader" [nodes]="treeNodes" [formField]="fields.amount" />
      <haven-card title="Card"
        ><haven-badge text="Ready" /><haven-progress [value]="42" /><haven-divider /><haven-alert
          title="Status"
          message="Available"
      /></haven-card>
      <haven-accordion
        ><ng-template havenPanel id="group" title="Group">Content</ng-template></haven-accordion
      >
      <haven-toolbar label="Actions" align="space-between"
        ><button (click)="open()">Open details</button
        ><button (click)="confirm()">Confirm</button></haven-toolbar
      >
      <haven-repeat title="Rows" [items]="repeatItems()" [rowTemplate]="repeatTemplate" />
      <ng-template #repeatTemplate let-index="index"
        ><haven-text-field label="Name" [formField]="fields.rows[index]!.name"
      /></ng-template>
      <haven-tabs [(activeId)]="tab">
        <ng-template havenPanel id="first" title="First">First panel</ng-template>
        <ng-template havenPanel id="second" title="Second">Second panel</ng-template>
      </haven-tabs>
      <haven-stepper [linear]="true">
        <ng-template havenPanel id="details" title="Details" [valid]="true">Details</ng-template>
        <ng-template havenPanel id="confirm" title="Confirm">Confirm</ng-template>
      </haven-stepper>
      <haven-table
        [rows]="hierarchyRows"
        [hierarchy]="hierarchy"
        [virtualization]="virtualization"
        [(expandedRowKeys)]="expandedRowKeys"
        [columns]="columns"
        [headerGroups]="headerGroups()"
        [cellRenderers]="cells"
        [filterable]="true"
        [selectable]="true"
        [columnMenu]="true"
        [(view)]="view"
      />
      <haven-renderer
        #rendered
        [document]="document"
        [host]="host"
        [validationLimits]="{ maxDepth: 56 }"
      />
      <button [disabled]="rendered.pendingEdits()">Continue after model edit</button>
    </haven-stack>
  `,
})
export class Consumer {
  readonly caption: LocalizedText = {
    default: 'Caption',
    translations: { 'en-US': 'Consumer caption' },
  };
  readonly localizedCaption = localizeText(this.caption, 'en-US');
  readonly dialogs = inject(HavenDialog);
  open() {
    return this.dialogs.open<ConsumerDialog, { purpose: string }, boolean>(ConsumerDialog, {
      data: { purpose: 'example' },
    });
  }
  confirm(): Promise<boolean> {
    return this.dialogs.confirm({ title: 'Confirm', message: 'Continue with this operation?' });
  }
  readonly repeatItems = computed(() =>
    this.value().rows.map((value) => ({ key: value.key, value })),
  );
  readonly remoteTree: TreeDataSource = {
    identity: 'consumer-tree',
    adapter: {
      children: async () => [{ key: 0, label: 'Zero', hasChildren: false }],
      resolve: async (keys) => ({
        paths: keys.map((key) => [{ key, label: String(key), hasChildren: false }]),
        unresolved: [],
      }),
    },
  };
  readonly headerGroups = computed<TableHeaderLayout>(() => [
    { id: 'data', header: 'Data', children: this.columns.map((column) => column.id) },
  ]);
  readonly treeNodes = [{ key: 0, label: 'Zero' }];
  readonly uploads: UploadAdapter = {
    upload: async (file, name) => ({
      id: 'file',
      name,
      mediaType: file.type,
      size: file.size,
    }),
    url: async () => 'https://example.test/file',
  };
  readonly choices = [{ value: 0, label: 'Zero' }];
  readonly options: OptionsAdapter = {
    search: async () => ({ items: [{ key: 0, label: 'Zero' }] }),
    resolve: async (keys) => keys.map((key) => ({ key, label: String(key) })),
  };
  readonly value = signal({
    title: '',
    html: '',
    rows: [{ key: 'stable-row', name: '' }],
    translations: { 'en-US': '' },
    files: [] as FileReference[],
    amount: null as number | null,
    enabled: false,
    selected: [] as number[],
  });
  readonly fields = form(this.value, (path) => required(path.title));
  readonly theme = { preset: 'material', mode: 'dark', density: 'comfortable' } as const;
  readonly tab = signal<string | null>('first');
  readonly rows = [{ id: 0, title: 'Sample' }];
  readonly hierarchy: TableHierarchy = { parentPath: '/parent', rootValue: null };
  readonly virtualization: TableVirtualization = { viewportHeight: 320, overscan: 3 };
  readonly expandedRowKeys = signal<readonly TableRowKey[]>([0]);
  readonly hierarchyRows = projectHavenTableRows([
    { id: 0, parent: null, title: 'Root' },
    { id: 1, parent: 0, title: 'Child' },
  ])!;
  readonly columns: TableColumn[] = [
    {
      id: 'title',
      header: 'Title',
      path: '/title',
      renderer: 'sample.cell',
      filter: { id: 'text' },
    },
  ];
  readonly filters = createHavenTableFilters();
  readonly columnFilters = signal<readonly import('@haven/schema').TableColumnFilterValue[]>([]);
  readonly cells = createHavenTableCellRenderers([['sample.cell', ConsumerCell]]);
  readonly view = signal<TableView>({ pinned: { start: ['title'] }, widths: { title: 240 } });
  readonly remoteTable: TableDataSource = {
    identity: 'sample-table',
    adapter: {
      supportedColumnFilters: [{ columnId: 'title', filterId: 'text' }],
      load: async () => ({ rows: this.rows, total: 1 }),
    },
  };
  readonly tableQuery = signal<TableQuery>({ pageIndex: 0, pageSize: 10, sort: [], filter: '' });
  readonly host = {
    tables: new Map([['sample.table', this.remoteTable.adapter]]),
    uploads: new Map([['sample.files', this.uploads]]),
    options: new Map([['sample.options', this.options]]),
    actions: new ActionRegistry(),
    tableCellRenderers: this.cells,
    tableFilters: this.filters,
    revision: 'draft:1',
  };
  readonly document: HavenDocument = {
    schemaVersion: '1.0',
    id: 'sample',
    title: 'Sample',
    dataSchema: { type: 'object', properties: { title: { type: 'string' } } },
    ui: {
      id: 'root',
      kind: 'form',
      version: 1,
      children: [{ id: 'title', kind: 'field.text', version: 1, bind: '/title' }],
    },
    theme: this.theme,
    actions: {},
    resources: {},
  };
  readonly sharedFormSchema = formSchema;
  readonly strictSubmit = submitValidated;
  readonly validate = validateDocument;
  readonly edit = applyEditingBatch;
  readonly captureBatch = captureEditingBatch;
  readonly localizationProvider = provideHavenTransloco();
  readonly rendererProvider = provideHavenRendererHost(this.host);
}
