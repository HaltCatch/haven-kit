import type { ComponentManifest } from './types.js';
const text = (label: string) => ({ type: 'string' as const, label, localizable: true });
export const treeManifests: readonly ComponentManifest[] = [
  {
    kind: 'tree',
    version: 1,
    title: 'Tree navigation',
    container: false,
    binding: 'none',
    dataTypes: [],
    events: ['activate', 'expandedChange', 'filterChange'],
    properties: {
      title: text('Title'),
      nodes: { type: 'array', label: 'Complete local tree' },
      resource: { type: 'string', label: 'Remote tree resource' },
      filterable: { type: 'boolean', label: 'Filter' },
      readonly: { type: 'boolean', label: 'Readonly' },
    },
  },
  ...['tree-select', 'tree-multiselect', 'cascader'].map((kind) => ({
    kind: `field.${kind}`,
    version: 1,
    title: kind,
    container: false,
    binding: 'required' as const,
    dataTypes:
      kind === 'tree-multiselect' ? (['array'] as const) : (['string', 'number', 'null'] as const),
    events: ['change', 'blur'],
    properties: {
      label: text('Label'),
      description: text('Description'),
      nodes: { type: 'array' as const, label: 'Complete local tree' },
      resource: { type: 'string' as const, label: 'Remote tree resource' },
      readonly: { type: 'boolean' as const, label: 'Readonly' },
      filterable: { type: 'boolean' as const, label: 'Filter' },
      ...(kind === 'tree-multiselect'
        ? { cascade: { type: 'boolean' as const, label: 'Cascade selection' } }
        : {}),
      ...(kind !== 'cascader'
        ? { leafOnly: { type: 'boolean' as const, label: 'Select leaves only' } }
        : {}),
    },
  })),
];
