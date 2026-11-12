import type { ComponentManifest } from './types.js';

/** Canonical HTML is persisted; browser/editor state and asset preview URLs are not. */
export interface RichTextContentState {
  valid: boolean;
  empty: boolean;
  textLength: number;
}
export interface RichTextConstraints {
  minTextLength?: number;
  maxTextLength?: number;
  maxImageBytes?: number;
}
export function isRichTextConstraints(value: RichTextConstraints): boolean {
  return (
    ['minTextLength', 'maxTextLength', 'maxImageBytes'].every((key) => {
      const limit = value[key as keyof RichTextConstraints];
      return (
        limit === undefined ||
        (Number.isSafeInteger(limit) && limit >= (key === 'maxImageBytes' ? 1 : 0))
      );
    }) &&
    (value.minTextLength === undefined ||
      value.maxTextLength === undefined ||
      value.minTextLength <= value.maxTextLength)
  );
}
export const richTextManifest: ComponentManifest = {
  kind: 'field.rich-text',
  version: 1,
  title: 'Rich text',
  container: false,
  binding: 'required',
  dataTypes: ['string'],
  events: ['change', 'blur'],
  properties: {
    label: { type: 'string', label: '标签', localizable: true },
    description: { type: 'string', label: '说明', localizable: true },
    readonly: { type: 'boolean', label: '只读' },
    placeholder: { type: 'string', label: '占位提示', localizable: true },
    minTextLength: { type: 'number', label: '最少正文字数', minimum: 0 },
    maxTextLength: { type: 'number', label: '最多正文字数', minimum: 0 },
    upload: { type: 'string', label: '图片上传资源' },
    maxImageBytes: { type: 'number', label: '图片大小上限', minimum: 1 },
  },
};
