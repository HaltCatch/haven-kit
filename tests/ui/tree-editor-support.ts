import { TestBed } from '@angular/core/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatTreeHarness } from '@angular/material/tree/testing';
import { HavenTreeEditor } from '../../packages/ui/tree/tree-editor';
import type { TreeEditProposal, TreeNode } from '@haven/schema';

export const editorNodes: TreeNode[] = [
  {
    key: 'root',
    label: 'Root',
    children: [
      {
        key: 'group',
        label: { default: 'Group', translations: { 'zh-CN': '分组' } },
        children: [
          { key: 0, label: 'Zero' },
          { key: '0', label: 'String zero' },
        ],
      },
      { key: 'empty', label: 'Empty', children: [] },
      { key: 'leaf', label: { default: 'Leaf', translations: { 'zh-CN': '叶子', fr: 'Feuille' } } },
      {
        key: 'locked',
        label: 'Locked',
        disabled: true,
        children: [{ key: 'saved', label: 'Saved' }],
      },
    ],
  },
];
export async function createEditor() {
  const fixture = TestBed.createComponent(HavenTreeEditor);
  fixture.componentRef.setInput('nodes', editorNodes);
  fixture.componentRef.setInput('fixedKeys', ['root']);
  fixture.componentRef.setInput('expandedKeys', ['root', 'group', 'locked']);
  fixture.componentRef.setInput('identity', 'document:revision-1');
  fixture.componentRef.setInput('actions', [
    { id: 'host.inspect', label: { default: 'Inspect', translations: { 'zh-CN': '检查' } } },
  ]);
  const proposals: TreeEditProposal[] = [];
  fixture.componentInstance.proposal.subscribe((proposal) => proposals.push(proposal));
  const tree = await TestbedHarnessEnvironment.loader(fixture).getHarness(MatTreeHarness);
  return { fixture, component: fixture.componentInstance, proposals, tree };
}
