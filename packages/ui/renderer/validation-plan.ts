import type { UiNode } from '@haven/schema';
import type { ValidationScope } from '@haven/ui/form-state';
/** Persisted repeat templates become native applyEach registrations, not an expanded second tree. */
export function validationPlan(root: UiNode): ValidationScope {
  const fields: ValidationScope['fields'][number][] = [],
    repeats: ValidationScope['repeats'][number][] = [];
  const visit = (node: UiNode) => {
    if (node.validators?.length && node.bind !== undefined && node.kind.startsWith('field.'))
      fields.push({ sourceId: node.id, bind: node.bind, rules: node.validators });
    if (node.kind === 'form.repeat' && node.bind !== undefined) {
      repeats.push({
        bind: node.bind,
        scope: validationPlan({
          id: 'scope',
          kind: 'layout.stack',
          version: 1,
          children: node.children ?? [],
        }),
      });
      return;
    }
    node.children?.forEach(visit);
  };
  visit(root);
  return { fields, repeats };
}
