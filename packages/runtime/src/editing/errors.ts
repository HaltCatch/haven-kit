export type HavenEditingErrorCode =
  | 'editing.duplicateNode'
  | 'editing.moveTarget'
  | 'editing.notContainer'
  | 'editing.moveCycle'
  | 'editing.moveScope'
  | 'editing.rootRemoval'
  | 'editing.editScope'
  | 'editing.bindingCollision'
  | 'editing.resourceCollision'
  | 'editing.position'
  | 'editing.missingNode'
  | 'editing.patchPath'
  | 'editing.patch';

/** Stable domain codes; applications own translation and presentation. */
export class HavenEditingError extends Error {
  constructor(readonly code: HavenEditingErrorCode) {
    super(code);
    this.name = 'HavenEditingError';
  }
}
