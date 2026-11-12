import type { ComponentManifest, PropertyDefinition } from './types.js';
const text = (label: string): PropertyDefinition => ({ type: 'string', label, localizable: true });
const toggle = (label: string): PropertyDefinition => ({ type: 'boolean', label });
const tone: PropertyDefinition = {
  type: 'string',
  label: '语义',
  enum: ['neutral', 'info', 'success', 'warning', 'error'],
};
/** Pure presentation/container contracts; no domain status dictionary or framework component metadata. */
export const presentationManifests: readonly ComponentManifest[] = [
  {
    kind: 'layout.card',
    version: 1,
    title: '卡片',
    container: true,
    binding: 'none',
    dataTypes: [],
    events: [],
    properties: {
      title: text('标题'),
      subtitle: text('副标题'),
      appearance: { type: 'string', label: '样式', enum: ['outlined', 'raised', 'filled'] },
    },
  },
  {
    kind: 'layout.accordion',
    version: 1,
    title: '折叠组',
    container: true,
    binding: 'none',
    dataTypes: [],
    events: ['expandedChange'],
    properties: {
      title: text('标题'),
      multi: toggle('允许多项展开'),
      readonly: toggle('只读'),
      expandedIds: { type: 'array', label: '展开面板标识' },
    },
  },
  {
    kind: 'view.badge',
    version: 1,
    title: '状态标签',
    container: false,
    binding: 'optional',
    dataTypes: ['string', 'number', 'boolean', 'null'],
    events: [],
    properties: { text: text('文本'), tone, announce: toggle('朗读状态变化') },
  },
  {
    kind: 'view.progress',
    version: 1,
    title: '进度',
    container: false,
    binding: 'optional',
    dataTypes: ['number', 'null'],
    events: [],
    properties: {
      label: text('标签'),
      value: { type: 'number', label: '百分比', minimum: 0, maximum: 100 },
      mode: { type: 'string', label: '模式', enum: ['determinate', 'indeterminate'] },
      showValue: toggle('显示百分比'),
    },
  },
  {
    kind: 'view.alert',
    version: 1,
    title: '提示',
    container: false,
    binding: 'optional',
    dataTypes: ['string', 'null'],
    events: ['dismiss'],
    properties: {
      title: text('标题'),
      message: text('内容'),
      tone,
      announce: toggle('朗读提示'),
      dismissible: toggle('允许关闭'),
      readonly: toggle('只读'),
    },
  },
  {
    kind: 'view.divider',
    version: 1,
    title: '分隔线',
    container: false,
    binding: 'none',
    dataTypes: [],
    events: [],
    properties: { label: text('无障碍标签'), vertical: toggle('竖向'), inset: toggle('缩进') },
  },
];
