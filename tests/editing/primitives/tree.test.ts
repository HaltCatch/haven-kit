import { describe, expect, it } from 'vitest';
import { HavenEditingError } from '../../../packages/runtime/src/editing/errors.js';
import {
  flattenTree,
  isContainer,
  moveNode,
  removeNode,
  updateNode,
} from '../../../packages/runtime/src/editing/tree.js';
import { empty, field, frozen, group } from './support.js';

describe('shared immutable editing tree primitives', () => {
  it('indexes stable string identities and updates only the requested node while retaining hidden metadata', () => {
    const document = empty();
    const target = field('field');
    target.props = {
      label: { default: 'Name', translations: { 'fr-FR': 'Nom' } },
      description: 'Keep',
    };
    target.validators = [
      {
        id: 'comparison',
        type: 'compare',
        operator: 'eq',
        other: { scope: 'root', path: '/field' },
        message: 'Keep',
      },
    ];
    document.ui.children = [group('group', 'layout.stack', [target])];
    frozen(document);
    expect(
      flattenTree(document.ui).map(({ node, parentId, depth }) => [node.id, parentId, depth]),
    ).toEqual([
      ['root', null, 0],
      ['group', 'root', 1],
      ['field', 'group', 2],
    ]);
    const changed = updateNode(document, 'field', (node) => ({
      ...node,
      props: { ...node.props, description: 'Changed' },
    }));
    const result = flattenTree(changed.ui).at(-1)!.node;
    expect(result.props!['label']).toBe(target.props['label']);
    expect(result.validators).toBe(target.validators);
    expect(target.props['description']).toBe('Keep');
    expect(isContainer(document.ui)).toBe(true);
    expect(isContainer(target)).toBe(false);
    expect(isContainer({ ...document.ui, version: 99 })).toBe(false);
  });

  it('retains schema/resources/actions when removing a view and cleans only its direct accordion reference', () => {
    const document = empty();
    const first = group('first'),
      second = group('second');
    const accordion = group('accordion', 'layout.accordion', [first, second]);
    accordion.props = { expandedIds: ['first', 'second'], multi: true, description: 'Keep' };
    document.ui.children = [accordion];
    document.dataSchema.properties = { shared: { type: 'string' } };
    document.resources = { source: { type: 'options', adapter: 'host.options' } };
    document.actions = { run: { handler: 'host.run' } };
    frozen(document);
    const removed = removeNode(document, 'first');
    expect(removed.ui.children![0]!.children).toEqual([second]);
    expect(removed.ui.children![0]!.props).toEqual({
      expandedIds: ['second'],
      multi: true,
      description: 'Keep',
    });
    expect(removed.dataSchema).toBe(document.dataSchema);
    expect(removed.resources).toBe(document.resources);
    expect(removed.actions).toBe(document.actions);
    expect(accordion.children).toEqual([first, second]);
    expect(() => removeNode(document, 'root')).toThrow(
      new HavenEditingError('editing.rootRemoval'),
    );
  });

  it('preserves expansion for same-parent reorder but clears departing direct panels', () => {
    const document = empty(),
      first = group('first'),
      second = group('second');
    const accordion = group('accordion', 'layout.accordion', [first, second]);
    accordion.props = { expandedIds: ['first', 'second'], multi: true };
    document.ui.children = [accordion, group('destination')];
    frozen(document);
    const reordered = moveNode(document, 'second', 'accordion', -100);
    expect(reordered.ui.children![0]!.children).toEqual([second, first]);
    expect(reordered.ui.children![0]!.props).toBe(accordion.props);
    const departed = moveNode(document, 'first', 'destination', 100);
    expect(departed.ui.children![0]!.props!['expandedIds']).toEqual(['second']);
    expect(departed.ui.children![1]!.children![0]).toBe(first);
  });

  it('rejects roots, missing targets, noncontainers and cycles without mutating the input', () => {
    const document = empty();
    document.ui.children = [group('outer', 'layout.stack', [group('inner')]), field('leaf')];
    const before = structuredClone(document);
    for (const [id, parentId, code] of [
      ['root', 'outer', 'editing.moveTarget'],
      ['missing', 'outer', 'editing.moveTarget'],
      ['outer', 'missing', 'editing.moveTarget'],
      ['outer', 'leaf', 'editing.notContainer'],
      ['outer', 'inner', 'editing.moveCycle'],
      ['outer', 'outer', 'editing.moveCycle'],
    ] as const)
      expect(() => moveNode(document, id, parentId, 0)).toThrow(new HavenEditingError(code));
    expect(document).toEqual(before);
  });
});
