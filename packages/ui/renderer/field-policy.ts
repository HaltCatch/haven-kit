import type { FieldContentState } from './field-content';
import { isChoiceOptions, isTreeNodes, isMultilingualLocales } from '@haven/schema';
import type { UiNode, TemporalKind } from '@haven/schema';
import type { HavenOptionResolution } from '@haven/ui/form';
import type { FieldPolicy } from '@haven/ui/form-state';
export interface NodeState extends FieldPolicy {
  node: UiNode;
}
interface PolicyContext {
  uploading(id: string): boolean;
  assetIncomplete?(id: string): boolean;
  content?(node: UiNode): FieldContentState | undefined;
  parseInvalid(id: string): boolean;
  repeatInvalid(id: string): boolean;
  options(node: UiNode): HavenOptionResolution;
  treeOptions?(node: UiNode): HavenOptionResolution;
}
export function buildFieldPolicy(
  states: readonly NodeState[],
  context: PolicyContext,
): FieldPolicy {
  return {
    visible: !states.length || states.some((state) => state.visible),
    disabled: !!states.length && states.every((state) => state.disabled),
    readonly: !!states.length && states.every((state) => state.readonly),
    required: states.some((state) => state.required),
    uploadPending: states.some(
      (state) => state.visible && !state.disabled && context.uploading(state.node.id),
    ),
    assetIncomplete: states.some(
      (state) =>
        state.visible &&
        !state.disabled &&
        !state.readonly &&
        context.assetIncomplete?.(state.node.id),
    ),
    richText: states
      .filter(
        (state) =>
          state.visible &&
          !state.disabled &&
          !state.readonly &&
          state.node.kind === 'field.rich-text',
      )
      .map(({ node }) => {
        const content = context.content?.(node);
        return {
          ready: content?.ready ?? false,
          valid: content?.valid ?? false,
          empty: content?.empty ?? true,
          textLength: content?.textLength ?? 0,
          ...(typeof node.props?.['minTextLength'] === 'number'
            ? { minTextLength: node.props['minTextLength'] }
            : {}),
          ...(typeof node.props?.['maxTextLength'] === 'number'
            ? { maxTextLength: node.props['maxTextLength'] }
            : {}),
        };
      }),
    repeatInvalid: states.some((state) => context.repeatInvalid(state.node.id)),
    multiple: states.some((state) =>
      ['field.multiselect', 'field.tree-multiselect'].includes(state.node.kind),
    ),
    parseInvalid: states.some(
      (state) =>
        state.visible &&
        !state.disabled &&
        ['field.date', 'field.time', 'field.datetime'].includes(state.node.kind) &&
        context.parseInvalid(state.node.id),
    ),
    temporal: states
      .filter(
        (state) =>
          state.visible &&
          !state.disabled &&
          ['field.date', 'field.time', 'field.datetime'].includes(state.node.kind),
      )
      .map((state) => ({
        kind: state.node.kind.slice(6) as TemporalKind,
        ...(typeof state.node.props?.['min'] === 'string' ? { min: state.node.props['min'] } : {}),
        ...(typeof state.node.props?.['max'] === 'string' ? { max: state.node.props['max'] } : {}),
      })),
    assets: states
      .filter(
        (state) =>
          state.visible &&
          !state.disabled &&
          ['field.file', 'field.files', 'field.image'].includes(state.node.kind),
      )
      .map(({ node }) => ({
        image: node.kind === 'field.image',
        multiple: node.kind === 'field.files',
        accept: typeof node.props?.['accept'] === 'string' ? node.props['accept'] : '',
        ...(typeof node.props?.['maxBytes'] === 'number'
          ? { maxBytes: node.props['maxBytes'] }
          : {}),
      })),
    translations: states
      .filter(
        (state) => state.visible && !state.disabled && state.node.kind === 'field.multilingual',
      )
      .map(({ node }) => ({
        locales: isMultilingualLocales(node.props?.['locales']) ? node.props['locales'] : [],
        ...(typeof node.props?.['maxLength'] === 'number'
          ? { maxLength: node.props['maxLength'] }
          : {}),
      })),
    trees: states
      .filter(
        (state) =>
          state.visible &&
          !state.disabled &&
          ['field.tree-select', 'field.tree-multiselect', 'field.cascader'].includes(
            state.node.kind,
          ) &&
          state.node.props?.['resource'] === undefined,
      )
      .map(({ node }) => ({
        nodes: isTreeNodes(node.props?.['nodes']) ? node.props['nodes'] : [],
        multiple: node.kind === 'field.tree-multiselect',
        leafOnly: node.kind === 'field.cascader' || node.props?.['leafOnly'] === true,
      })),
    remote: states
      .filter(
        (state) =>
          state.visible &&
          !state.disabled &&
          [
            'field.select',
            'field.multiselect',
            'field.tree-select',
            'field.tree-multiselect',
            'field.cascader',
          ].includes(state.node.kind) &&
          typeof state.node.props?.['resource'] === 'string',
      )
      .map((state) =>
        ['field.tree-select', 'field.tree-multiselect', 'field.cascader'].includes(state.node.kind)
          ? (context.treeOptions?.(state.node) ?? {
              keys: [],
              options: [],
              pending: false,
              ready: false,
              failed: true,
            })
          : context.options(state.node),
      ),
    optionSets: states
      .filter(
        (state) =>
          state.visible &&
          !state.disabled &&
          ['field.select', 'field.radio', 'field.multiselect'].includes(state.node.kind) &&
          state.node.props?.['resource'] === undefined,
      )
      .flatMap((state) => {
        const options = state.node.props?.['options'];
        return isChoiceOptions(options) ? [options.map((option) => option.value)] : [];
      }),
  };
}
