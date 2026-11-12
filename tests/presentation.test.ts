import { describe, expect, it } from 'vitest';
import { presentationManifests } from '../packages/schema/src/presentation-manifests.js';
import { validatePresentation } from '../packages/schema/src/presentation-validate.js';
import type { JsonValue, UiNode } from '@haven/schema';

const accordion = (expandedIds: JsonValue, multi = false): UiNode => ({
  id: 'sections',
  kind: 'layout.accordion',
  version: 1,
  props: { expandedIds, multi },
  children: [
    { id: 'first', kind: 'layout.card', version: 1 },
    { id: 'second', kind: 'layout.card', version: 1 },
  ],
});
describe('presentation model contracts', () => {
  it('defines six independent container/display contracts with explicit scalar bindings', () => {
    expect(new Set(presentationManifests.map((manifest) => manifest.kind)).size).toBe(6);
    expect(
      presentationManifests
        .filter((manifest) => manifest.container)
        .map((manifest) => manifest.kind),
    ).toEqual(['layout.card', 'layout.accordion']);
    expect(
      presentationManifests.find((manifest) => manifest.kind === 'view.progress'),
    ).toMatchObject({ binding: 'optional', dataTypes: ['number', 'null'] });
    expect(
      presentationManifests.find((manifest) => manifest.kind === 'view.alert')?.properties,
    ).not.toHaveProperty('open');
  });
  it.each([[], ['first'], ['second']].map((ids) => ({ ids })))(
    'accepts valid single-panel expanded state $ids',
    ({ ids }) => {
      expect(validatePresentation(accordion(ids), '/ui')).toEqual([]);
    },
  );
  it('accepts multiple panels only when the host enables multi', () => {
    expect(validatePresentation(accordion(['first', 'second'], true), '/ui')).toEqual([]);
    expect(validatePresentation(accordion(['first', 'second']), '/ui')).toHaveLength(1);
  });
  it.each(
    [['first', 'first'], ['missing'], [0], 'first', null, { first: true }].map((ids) => ({ ids })),
  )('rejects malformed or unknown expanded state %j without changing caller data', ({ ids }) => {
    const node = accordion(ids),
      original = structuredClone(node);
    expect(validatePresentation(node, '/ui')).toEqual([
      expect.objectContaining({
        code: 'accordion.expanded',
        path: '/ui/props/expandedIds',
        nodeId: 'sections',
      }),
    ]);
    expect(node).toEqual(original);
  });
  it('does not constrain unrelated components or optional initial expansion', () => {
    expect(validatePresentation({ id: 'card', kind: 'layout.card', version: 1 }, '/ui')).toEqual(
      [],
    );
    expect(
      validatePresentation({ id: 'panels', kind: 'layout.accordion', version: 1 }, '/ui'),
    ).toEqual([]);
  });
});
