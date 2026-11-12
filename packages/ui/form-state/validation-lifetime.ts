import { DestroyRef, effect, inject, untracked } from '@angular/core';
import type { ResourceRef } from '@angular/core';
/** Public lifecycle only; Angular remains the sole owner of loading, validation and stale results. */
export function bindValidationLifetime<T>(
  resource: ResourceRef<T | undefined>,
  owner: DestroyRef,
): void {
  // Angular 22.2.4 makes undefined params idle without aborting the existing transport.
  // Public set(undefined) aborts it; a valueless local resource produces no validation errors.
  const idle = effect(() => {
    if (resource.status() === 'idle') untracked(() => resource.set(undefined));
  });
  // Whole-form cleanup is missing upstream (#71622). Normal removed-field cleanup stays native.
  const unregister = owner.onDestroy(() => {
    idle.destroy();
    resource.destroy();
  });
  inject(DestroyRef).onDestroy(unregister);
}
