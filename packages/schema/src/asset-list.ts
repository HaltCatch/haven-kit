import type { ComponentManifest } from './types.js';
import { isAssetReference } from './asset-manifests.js';
import type { AssetReference } from './asset-manifests.js';

export const MAX_ASSET_ITEMS = 1000;
export function isAssetListLimit(value: unknown): value is number {
  return (
    Number.isSafeInteger(value) && (value as number) >= 1 && (value as number) <= MAX_ASSET_ITEMS
  );
}
/** Existing references are retained exactly; duplicate persistent identities are diagnosed. */
export function isAssetListValue(value: unknown): value is AssetReference[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_ASSET_ITEMS &&
    Array.from(value).every(isAssetReference) &&
    new Set(value.map((item) => item.id)).size === value.length
  );
}
export const assetListManifest: ComponentManifest = {
  kind: 'field.files',
  version: 1,
  title: 'Files',
  container: false,
  binding: 'required',
  dataTypes: ['array'],
  events: ['change', 'blur'],
  properties: {
    label: { type: 'string', label: '标签', localizable: true },
    description: { type: 'string', label: '说明', localizable: true },
    readonly: { type: 'boolean', label: '只读' },
    resource: { type: 'string', label: '上传适配器资源' },
    accept: { type: 'string', label: '允许的类型' },
    maxBytes: { type: 'number', label: '文件字节上限', minimum: 1 },
    concurrency: { type: 'number', label: '并行上传数', minimum: 1, maximum: 4 },
    dropzone: { type: 'boolean', label: '文件拖放区域' },
  },
};
