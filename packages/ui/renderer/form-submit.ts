import { submitValidated } from '@haven/ui/form-state';
import type { FieldTree, FormSubmitOptions } from '@angular/forms/signals';
export type RendererSubmitOptions = Omit<
  FormSubmitOptions<unknown, Record<string, unknown>>,
  'ignoreValidators'
>;
interface Owner {
  fields(): FieldTree<Record<string, unknown>> | undefined;
  identity(): string;
  valid(): boolean;
  destroyed(): boolean;
}
/** Native submit plus renderer ownership; no additional submitting state or delayed automatic save. */
export async function submitRendererForm(
  options: RendererSubmitOptions,
  owner: Owner,
): Promise<boolean> {
  const tree = owner.fields(),
    identity = owner.identity();
  if (!tree || !owner.valid() || owner.destroyed()) return false;
  const current = () =>
    !owner.destroyed() && owner.valid() && owner.fields() === tree && owner.identity() === identity;
  const accepted = await submitValidated(tree, {
    ...options,
    action: async (field, detail) => {
      if (!current()) return;
      const result = await options.action(field, detail);
      return current() ? result : undefined;
    },
  });
  return current() && accepted;
}
