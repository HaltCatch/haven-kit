import { isLocalizedText } from './localization.js';
import { escapePointer, schemaAtPointer } from './pointer.js';
import type { DataSchema, Diagnostic, HavenDocument, UiNode } from './types.js';
import type { ValidationRef } from './field-validators.js';
/** Structural JSON checks run first. This resolves every declared reference before Angular sees it. */
export function validateFieldBindings(
  node: UiNode,
  document: HavenDocument,
  scope: DataSchema,
  repeated: boolean,
  bound: DataSchema | undefined,
  path: string,
): Diagnostic[] {
  const errors: Diagnostic[] = [],
    ids = new Set<string>();
  const add = (suffix: string, message: string) =>
    errors.push({
      code: 'validation.binding',
      path: `${path}/validators${suffix}`,
      nodeId: node.id,
      message,
    });
  if (!node.validators?.length) return errors;
  if (!node.kind.startsWith('field.') || node.bind === undefined || !bound) {
    add('', 'Validators require a bound field component');
    return errors;
  }
  const resolve = (ref: ValidationRef, location: string) => {
    if (ref.scope === 'item' && !repeated) {
      add(location, 'Item validation requires a repeat row');
      return;
    }
    try {
      const result = schemaAtPointer(
        ref.scope === 'root' ? document.dataSchema : scope,
        ref.path,
        document.dataSchema,
      );
      if (!result) add(location, 'Validation references an unknown field');
      return result;
    } catch {
      add(location, 'Validation references an invalid or unsafe JSON Pointer');
      return;
    }
  };
  for (const [index, rule] of node.validators.entries()) {
    const location = `/${index}`;
    if (ids.has(rule.id)) add(`${location}/id`, 'Validator IDs must be unique within a node');
    ids.add(rule.id);
    if (typeof rule.message !== 'string' && !isLocalizedText(rule.message))
      add(`${location}/message`, 'Invalid localized validation message');
    if (rule.type === 'compare') {
      const other = resolve(rule.other, `${location}/other`);
      if (
        other &&
        (bound.type !== other.type ||
          !['string', 'number', 'boolean'].includes(bound.type ?? '') ||
          (!['eq', 'ne'].includes(rule.operator) && bound.type !== 'number'))
      )
        add(location, 'Comparison requires matching scalars; ordering requires numbers');
    } else {
      const binding = document.resources[rule.resource];
      if (!binding || binding.type !== 'validation')
        add(`${location}/resource`, 'Expected a named validation resource');
      for (const [key, ref] of Object.entries(rule.dependencies ?? {}))
        resolve(ref, `${location}/dependencies/${escapePointer(key)}`);
    }
  }
  return errors;
}
