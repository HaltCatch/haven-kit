import { validationReady } from './submit-readiness';
import { submit } from '@angular/forms/signals';
import type { FieldTree, FormSubmitOptions } from '@angular/forms/signals';
/** No waiting loop or extra submission state. Live readiness rejects this attempt, even after validation. */
export async function submitValidated<T>(
  tree: FieldTree<T>,
  options: Omit<FormSubmitOptions<unknown, T>, 'ignoreValidators'>,
): Promise<boolean> {
  // Native debounced resources update on a later effect turn. Do not submit their old result.
  if (tree().valid() && !validationReady(tree)) {
    tree().markAsTouched();
    return false;
  }
  let blocked = false;
  const accepted = await submit(tree, {
    ...options,
    ignoreValidators: 'none',
    action: async (field, detail) => {
      if (!validationReady(tree)) {
        blocked = true;
        return;
      }
      const result = await options.action(field, detail);
      if (!validationReady(tree)) {
        blocked = true;
        return;
      }
      return result;
    },
  });
  return accepted && !blocked && validationReady(tree);
}
