import { assetListManifest } from './asset-list.js';
import { richTextManifest } from './rich-text.js';
import { actionsManifests } from './actions-manifests.js';
import { assetManifests } from './asset-manifests.js';
import { multilingualManifest } from './multilingual-manifest.js';
import { treeManifests } from './tree-manifests.js';
import { treeEditorManifest } from './tree-editor-manifest.js';
import { presentationManifests } from './presentation-manifests.js';
import type { ComponentManifest, DataType, PropertyDefinition } from './types.js';
const text = (label: string, localizable = true): PropertyDefinition => ({
  type: 'string',
  label,
  localizable,
});
const toggle = (label: string): PropertyDefinition => ({ type: 'boolean', label });
const fieldProps = {
  label: text('标签'),
  description: text('说明'),
  placeholder: text('占位提示'),
  readonly: toggle('只读'),
};
const containers = [
  'layout.stack',
  'layout.grid',
  'layout.section',
  'layout.tabs',
  'layout.stepper',
  'form',
];
const fields: Readonly<Record<string, readonly DataType[]>> = {
  text: ['string'],
  password: ['string'],
  textarea: ['string'],
  number: ['number', 'null'],
  switch: ['boolean'],
  checkbox: ['boolean'],
  select: ['string', 'number', 'null'],
  multiselect: ['array'],
  radio: ['string', 'number', 'null'],
  date: ['string', 'null'],
  time: ['string', 'null'],
  datetime: ['string', 'null'],
};
/** This catalog describes contracts; UI implementations must separately declare supported kinds. */
export const coreManifests: readonly ComponentManifest[] = [
  ...actionsManifests,
  ...assetManifests,
  assetListManifest,
  richTextManifest,
  multilingualManifest,
  ...treeManifests,
  treeEditorManifest,
  ...presentationManifests,
  ...containers.map((kind): ComponentManifest => ({
    kind,
    version: 1,
    title: kind,
    container: true,
    binding: 'none',
    dataTypes: [],
    events: kind === 'form' ? ['submit', 'reset'] : [],
    properties: {
      ...(kind === 'layout.stepper' ? { linear: toggle('线性导航') } : {}),
      title: text('标题'),
      gap: { type: 'string', label: '间距', enum: ['none', 'xs', 'sm', 'md', 'lg', 'xl'] },
      columns: { type: 'number', label: '列数', minimum: 1, maximum: 12 },
    },
  })),
  ...Object.entries(fields).map(([name, dataTypes]): ComponentManifest => ({
    kind: `field.${name}`,
    version: 1,
    title: name,
    container: false,
    binding: 'required',
    dataTypes,
    events: ['change', 'blur'],
    properties: {
      ...fieldProps,
      ...(['date', 'time', 'datetime'].includes(name)
        ? { min: text('最小值', false), max: text('最大值', false) }
        : {}),
      ...(['select', 'multiselect', 'radio'].includes(name)
        ? { options: { type: 'array' as const, label: '选项' }, resource: text('选项资源', false) }
        : {}),
    },
  })),
  {
    kind: 'form.repeat',
    version: 1,
    title: '重复组',
    container: true,
    binding: 'required',
    dataTypes: ['array'],
    events: ['add', 'remove', 'reorder'],
    properties: { title: text('标题'), description: text('说明'), readonly: toggle('只读') },
  },
  {
    kind: 'action.button',
    version: 1,
    title: '按钮',
    container: false,
    binding: 'none',
    dataTypes: [],
    events: ['click'],
    properties: {
      label: text('标签'),
      appearance: { type: 'string', label: '样式', enum: ['filled', 'outlined', 'text'] },
    },
  },
  {
    kind: 'view.text',
    version: 1,
    title: '文本',
    container: false,
    binding: 'optional',
    dataTypes: ['string', 'number', 'boolean', 'null'],
    events: [],
    properties: { text: text('文本') },
  },
  {
    kind: 'table',
    version: 1,
    title: '表格',
    container: false,
    binding: 'optional',
    dataTypes: ['array'],
    events: [
      'selectionChange',
      'filterChange',
      'columnFiltersChange',
      'viewChange',
      'queryChange',
      'rowClick',
      'edit',
      'editCommitted',
      'rowAction',
      'expandedChange',
    ],
    properties: {
      title: text('标题'),
      columns: { type: 'array', label: '列' },
      headerGroups: { type: 'array', label: '分组表头' },
      hierarchy: { type: 'object', label: '本地树形行' },
      expandedRowKeys: { type: 'array', label: '初始展开行键' },
      virtualization: { type: 'object', label: '虚拟滚动' },
      columnFilters: { type: 'array', label: '初始列筛选' },
      editMode: { type: 'string', label: '编辑方式', enum: ['cell', 'row'] },
      editHandler: text('远程提交处理器', false),
      rowActions: { type: 'array', label: '行操作' },
      rowKey: text('稳定行标识', false),
      resource: text('数据源', false),
      pageSize: { type: 'number', label: '每页行数', minimum: 1, maximum: 1000 },
      filterable: toggle('允许筛选'),
      selectable: toggle('允许选择'),
      columnMenu: toggle('列视图设置'),
      exportable: toggle('允许 CSV 导出'),
      readonly: toggle('只读'),
      view: { type: 'object', label: '列视图' },
    },
  },
];
export function createManifestRegistry(
  manifests: readonly ComponentManifest[] = coreManifests,
): ReadonlyMap<string, ComponentManifest> {
  const registry = new Map<string, ComponentManifest>();
  for (const manifest of manifests) {
    const key = `${manifest.kind}@${manifest.version}`;
    if (registry.has(key)) throw new Error(`Duplicate component: ${key}`);
    registry.set(key, Object.freeze(structuredClone(manifest)));
  }
  return registry;
}
