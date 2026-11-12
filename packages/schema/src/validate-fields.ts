import { isAssetListLimit } from './asset-list.js';
import { isRichTextConstraints } from './rich-text.js';
import { isAssetAccept, imageSizeKeys, isImageSizeConstraints } from './asset-manifests.js';
import { isMultilingualLocales } from './multilingual-manifest.js';
import { validateTreeNode } from './tree-node-validation.js';
import { resolveSchema } from './pointer.js';
import type { DataSchema, Diagnostic, UiNode } from './types.js';

/** UI configuration must agree with the explicitly declared data shape. */
export function validateAdvancedField(
  node: UiNode,
  bound: DataSchema | undefined,
  root: DataSchema,
  path: string,
): Diagnostic[] {
  const errors: Diagnostic[] = [];
  const add = (code: string, suffix: string, message: string) =>
    errors.push({ code, path: `${path}/${suffix}`, nodeId: node.id, message });
  errors.push(...validateTreeNode(node, bound, root, path));
  if (node.kind === 'field.multilingual') {
    const locales = node.props?.['locales'];
    if (!isMultilingualLocales(locales))
      add('multilingual.locales', 'props/locales', 'Expected unique valid locale tags');
    else if (
      bound?.type !== 'object' ||
      !isMultilingualLocales(Object.keys(bound.properties ?? {})) ||
      locales.some((locale) => {
        const property = bound.properties?.[locale];
        return !property || resolveSchema(property, root)?.type !== 'string';
      }) ||
      Object.values(bound.properties ?? {}).some(
        (property) => resolveSchema(property, root)?.type !== 'string',
      )
    )
      add(
        'multilingual.binding',
        'bind',
        'Every editable locale requires an explicit string property',
      );
    const maximum = node.props?.['maxLength'];
    if (maximum !== undefined && (!Number.isSafeInteger(maximum) || (maximum as number) < 0))
      add('multilingual.length', 'props/maxLength', 'Maximum length must be a nonnegative integer');
  }
  if (['field.file', 'field.files', 'field.image'].includes(node.kind)) {
    const item = bound?.items && resolveSchema(bound.items, root);
    const shape = { id: 'string', name: 'string', mediaType: 'string', size: 'number' };
    if (
      bound?.type !== 'array' ||
      (node.kind === 'field.files' ? !isAssetListLimit(bound.maxItems) : bound.maxItems !== 1) ||
      item?.type !== 'object' ||
      Object.keys(item.properties ?? {}).length !== 4 ||
      Object.entries(shape).some(([name, type]) => {
        const property = item.properties?.[name];
        return !property || resolveSchema(property, root)?.type !== type;
      })
    )
      add(
        'asset.binding',
        'bind',
        'Assets require a bounded array with explicit reference metadata; single assets use maxItems 1',
      );
    if (!isAssetAccept(node.props?.['accept'] ?? ''))
      add('asset.accept', 'props/accept', 'Invalid file type constraints');
    const concurrency = node.props?.['concurrency'];
    if (
      node.kind === 'field.files' &&
      concurrency !== undefined &&
      (!Number.isSafeInteger(concurrency) ||
        (concurrency as number) < 1 ||
        (concurrency as number) > 4)
    )
      add(
        'asset.concurrency',
        'props/concurrency',
        'Concurrent uploads must be an integer from 1 to 4',
      );
    const maximum = node.props?.['maxBytes'];
    if (maximum !== undefined && (!Number.isSafeInteger(maximum) || (maximum as number) < 1))
      add('asset.maxBytes', 'props/maxBytes', 'Maximum size must be a positive safe integer');
    if (node.kind === 'field.image') {
      const bounds = Object.fromEntries(imageSizeKeys.map((key) => [key, node.props?.[key]]));
      if (!isImageSizeConstraints(bounds))
        add(
          'asset.dimensions',
          'props',
          'Image dimensions must be positive safe integers with ordered ranges',
        );
    }
    if (typeof node.props?.['resource'] !== 'string' || !node.props['resource'])
      add('asset.resource', 'props/resource', 'An upload resource binding is required');
  }
  if (node.kind === 'field.rich-text') {
    const props = node.props ?? {};
    if (
      !isRichTextConstraints(
        Object.fromEntries(
          ['minTextLength', 'maxTextLength', 'maxImageBytes'].map((key) => [key, props[key]]),
        ),
      )
    )
      add(
        'richText.constraints',
        'props',
        'Rich text limits must be ordered nonnegative safe integers',
      );
    if (props['upload'] !== undefined && (typeof props['upload'] !== 'string' || !props['upload']))
      add(
        'richText.upload',
        'props/upload',
        'An upload resource reference must be a nonempty string',
      );
  }
  return errors;
}
