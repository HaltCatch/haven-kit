import type { ComponentManifest } from './types.js';

/** Toolbar layout only. Dialogs remain trusted host APIs, not executable model definitions. */
export const actionsManifests: readonly ComponentManifest[] = [
  {
    kind: 'layout.toolbar',
    version: 1,
    title: '工具栏',
    container: true,
    binding: 'none',
    dataTypes: [],
    events: [],
    properties: {
      label: { type: 'string', label: '无障碍名称', localizable: true },
      orientation: { type: 'string', label: '方向', enum: ['horizontal', 'vertical'] },
      wrap: { type: 'boolean', label: '自动换行' },
      align: {
        type: 'string',
        label: '主轴对齐',
        enum: ['start', 'center', 'end', 'space-between'],
      },
      gap: { type: 'string', label: '间距', enum: ['none', 'xs', 'sm', 'md', 'lg', 'xl'] },
    },
  },
];
