import type { ComponentManifest } from './types.js';

/** Persisted identity/metadata only. URLs, credentials, Blob and upload progress are transient. */
export type AssetReference = {
  id: string;
  name: string;
  mediaType: string;
  size: number;
};
export function isAssetReference(value: unknown): value is AssetReference {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (![Object.prototype, null].includes(Object.getPrototypeOf(value))) return false;
  const ref = value as Record<string, unknown>;
  return (
    Object.keys(ref).length === 4 &&
    typeof ref['id'] === 'string' &&
    ref['id'].length > 0 &&
    ref['id'].length <= 4096 &&
    typeof ref['name'] === 'string' &&
    ref['name'].length > 0 &&
    ref['name'].length <= 4096 &&
    typeof ref['mediaType'] === 'string' &&
    ref['mediaType'].length <= 255 &&
    typeof ref['size'] === 'number' &&
    Number.isSafeInteger(ref['size']) &&
    ref['size'] >= 0
  );
}
export function isAssetValue(value: unknown): value is AssetReference[] {
  return Array.isArray(value) && value.length <= 1 && Array.from(value).every(isAssetReference);
}
export function isAssetAccept(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 4096 &&
    (value === '' ||
      value
        .split(',')
        .every((part) =>
          /^(?:\.[a-z0-9][a-z0-9._+-]*|[a-z0-9!#$&^_.+-]+\/(?:[a-z0-9!#$&^_.+-]+|\*))$/i.test(
            part.trim(),
          ),
        ))
  );
}
/** Browser hints are checked again for UX; the receiving server must enforce its own policy. */
export function assetFileIssue(
  file: { name: string; type: string; size: number },
  accept: string,
  maxBytes?: number,
  image = false,
): 'config' | 'size' | 'type' | null {
  if (
    !isAssetAccept(accept) ||
    (maxBytes !== undefined && (!Number.isSafeInteger(maxBytes) || maxBytes < 1))
  )
    return 'config';
  if (
    !Number.isSafeInteger(file.size) ||
    file.size < 0 ||
    (maxBytes !== undefined && file.size > maxBytes)
  )
    return 'size';
  if (image && !file.type.toLowerCase().startsWith('image/')) return 'type';
  if (!accept) return null;
  const name = file.name.toLowerCase(),
    type = file.type.toLowerCase();
  return accept.split(',').some((part) => {
    const rule = part.trim().toLowerCase();
    return rule.startsWith('.')
      ? name.endsWith(rule)
      : rule.endsWith('/*')
        ? type.startsWith(rule.slice(0, -1))
        : type === rule;
  })
    ? null
    : 'type';
}
export interface ImageSizeConstraints {
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
}
export const imageSizeKeys = ['minWidth', 'maxWidth', 'minHeight', 'maxHeight'] as const;
export function isImageSizeConstraints(value: ImageSizeConstraints): boolean {
  return (
    imageSizeKeys.every(
      (key) => value[key] === undefined || (Number.isSafeInteger(value[key]) && value[key]! > 0),
    ) &&
    (value.minWidth === undefined ||
      value.maxWidth === undefined ||
      value.minWidth <= value.maxWidth) &&
    (value.minHeight === undefined ||
      value.maxHeight === undefined ||
      value.minHeight <= value.maxHeight)
  );
}
export const assetManifests: readonly ComponentManifest[] = ['file', 'image'].map((name) => ({
  kind: `field.${name}`,
  version: 1,
  title: name,
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
    dropzone: { type: 'boolean', label: '文件拖放区域' },
    ...(name === 'image'
      ? Object.fromEntries(
          imageSizeKeys.map((key) => [
            key,
            {
              type: 'number' as const,
              label: {
                minWidth: '最小宽度',
                maxWidth: '最大宽度',
                minHeight: '最小高度',
                maxHeight: '最大高度',
              }[key],
              minimum: 1,
            },
          ]),
        )
      : {}),
  },
}));
