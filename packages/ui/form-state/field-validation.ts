import {
  assetFileIssue,
  isAssetListValue,
  isMultilingualValue,
  isTreeValue,
  isTreeMultipleValue,
} from '@haven/schema';
import type { TreeNode } from '@haven/schema';

export interface AdvancedFieldPolicy {
  richText?: readonly {
    ready: boolean;
    valid: boolean;
    empty: boolean;
    textLength: number;
    minTextLength?: number;
    maxTextLength?: number;
  }[];
  assetIncomplete?: boolean;
  assets?: readonly { image: boolean; accept: string; maxBytes?: number; multiple?: boolean }[];
  translations?: readonly { locales: readonly string[]; maxLength?: number }[];
  trees?: readonly { nodes: readonly TreeNode[]; leafOnly: boolean; multiple?: boolean }[];
}

/** Validators share the same public value contracts as independently consumed controls. */
export function advancedFieldError(
  value: unknown,
  policy: AdvancedFieldPolicy,
  required: boolean,
): { kind: string } | null {
  if (policy.assetIncomplete) return { kind: 'assetIncomplete' };
  for (const content of policy.richText ?? []) {
    if (!content.ready) return { kind: 'richTextPending' };
    if (!content.valid) return { kind: 'richText' };
    // Signal Forms already reports a required error for the literal empty string.
    // HTML such as <p><br></p> needs the semantic error from this parser instead.
    if (required && content.empty) return value === '' ? null : { kind: 'required' };
    if (content.minTextLength !== undefined && content.textLength < content.minTextLength)
      return { kind: 'minLength' };
    if (content.maxTextLength !== undefined && content.textLength > content.maxTextLength)
      return { kind: 'maxLength' };
  }
  if (policy.assets?.length) {
    if (!isAssetListValue(value)) return { kind: 'asset' };
    if (value.length > 1 && policy.assets.some((constraint) => !constraint.multiple))
      return { kind: 'asset' };
    if (required && !value.length) return { kind: 'required' };
    if (
      policy.assets.some((constraint) =>
        value.some((file) =>
          assetFileIssue(
            { name: file.name, type: file.mediaType, size: file.size },
            constraint.accept,
            constraint.maxBytes,
            constraint.image,
          ),
        ),
      )
    )
      return { kind: 'asset' };
  }
  for (const constraint of policy.translations ?? []) {
    if (!isMultilingualValue(value)) return { kind: 'multilingual' };
    if (required && !constraint.locales.some((locale) => value[locale]?.length))
      return { kind: 'required' };
    if (
      constraint.maxLength !== undefined &&
      constraint.locales.some((locale) => (value[locale]?.length ?? 0) > constraint.maxLength!)
    )
      return { kind: 'maxLength' };
  }
  if (
    policy.trees?.some(
      (constraint) =>
        !(constraint.multiple ? isTreeMultipleValue : isTreeValue)(
          value,
          constraint.nodes,
          constraint.leafOnly,
        ),
    )
  )
    return { kind: 'option' };
  return null;
}
