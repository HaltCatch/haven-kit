import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { CdkDrag, CdkDropList } from '@angular/cdk/drag-drop';
import type { CdkDragDrop } from '@angular/cdk/drag-drop';
import type { TreeKey } from '@haven/schema';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { setupTreeSelection } from '../../../../tests/ui/tree-selection-support';
import { createEditor } from '../../../../tests/ui/tree-editor-support';

beforeEach(setupTreeSelection);
afterEach(() => {
  TestBed.resetTestingModule();
  vi.restoreAllMocks();
});
it.each([
  ['empty', 50, 'empty', null],
  ['leaf', 10, 'root', 'leaf'],
  ['0', 90, 'group', null],
] as const)(
  'maps CDK target %s at y=%i into a stable insertion proposal',
  async (target, y, parent, before) => {
    const { fixture, component, proposals } = await createEditor();
    const source = fixture.debugElement
      .queryAll(By.directive(CdkDrag))
      .map((row) => row.injector.get<CdkDrag<TreeKey>>(CdkDrag))
      .find((drag) => drag.data === 0)!;
    const destination = fixture.debugElement
      .queryAll(By.directive(CdkDropList))
      .map((row) => row.injector.get<CdkDropList<TreeKey>>(CdkDropList))
      .find((list) => list.data === target)!;
    vi.spyOn(destination.element.nativeElement, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 0, 300, 100),
    );
    const event: CdkDragDrop<TreeKey, TreeKey, TreeKey> = {
      item: source,
      container: destination,
      previousContainer: source.dropContainer!,
      previousIndex: 998,
      currentIndex: 999,
      isPointerOverContainer: true,
      distance: { x: 0, y },
      dropPoint: { x: 20, y },
      event: new MouseEvent('mouseup'),
    };
    component.drag.start(0);
    component.drag.end(); // Native CDK emits ended before dropped; the proposal must still be accepted.
    component.drag.drop(event);
    expect(proposals).toEqual([{ type: 'move', key: 0, parent, before }]);
    expect(component.nodes()[0]!.children![0]!.children!.map((node) => node.key)).toEqual([0, '0']);
  },
);
it('rejects an old CDK drag after owner replacement and keeps out-of-container releases inert', async () => {
  const { fixture, component, proposals } = await createEditor();
  const source = fixture.debugElement
    .queryAll(By.directive(CdkDrag))
    .map((row) => row.injector.get<CdkDrag<TreeKey>>(CdkDrag))
    .find((drag) => drag.data === 0)!;
  const destination = fixture.debugElement
    .queryAll(By.directive(CdkDropList))
    .map((row) => row.injector.get<CdkDropList<TreeKey>>(CdkDropList))
    .find((list) => list.data === 'empty')!;
  vi.spyOn(destination.element.nativeElement, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 300, 100),
  );
  const event: CdkDragDrop<TreeKey, TreeKey, TreeKey> = {
    item: source,
    container: destination,
    previousContainer: source.dropContainer!,
    previousIndex: 0,
    currentIndex: 0,
    isPointerOverContainer: true,
    distance: { x: 0, y: 50 },
    dropPoint: { x: 20, y: 50 },
    event: new MouseEvent('mouseup'),
  };
  component.drag.start(0);
  fixture.componentRef.setInput('identity', 'new-owner');
  component.drag.drop(event);
  component.drag.start(0);
  component.drag.drop({ ...event, isPointerOverContainer: false });
  expect(proposals).toEqual([]);
});
