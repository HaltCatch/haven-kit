import type { HavenDocument, TreeNode, UiNode } from '@haven/schema';

export function limitDocument(ui: UiNode): HavenDocument {
  return {
    schemaVersion: '1.0',
    id: 'limit-owner',
    title: 'Bounded renderer',
    dataSchema: { type: 'object', properties: {} },
    ui,
    theme: { preset: 'material', mode: 'dark', density: 'comfortable' },
    actions: {},
    resources: {},
  };
}

/** A valid 23-level source needs extra JSON depth only when projected into tree props. */
export function deepProjection() {
  let node: UiNode = { id: 'leaf', kind: 'view.text', version: 1, props: { text: 'Deep leaf' } };
  for (let level = 21; level >= 0; level--)
    node = { id: `level-${level}`, kind: 'layout.stack', version: 1, children: [node] };
  const project = (node: UiNode): TreeNode => ({
    key: node.id,
    label: node.id === 'leaf' ? 'Deep leaf' : node.id,
    ...(node.children ? { children: node.children.map(project) } : {}),
  });
  const source = limitDocument(node);
  const projected = limitDocument({
    id: 'tree',
    kind: 'tree.editor',
    version: 1,
    props: { nodes: [project(node)] },
  });
  return { source, projected };
}

export function largeDocument() {
  return limitDocument({
    id: 'large',
    kind: 'layout.stack',
    version: 1,
    children: Array.from({ length: 280 }, (_, index) => ({
      id: `text-${index}`,
      kind: 'view.text',
      version: 1,
      props: { text: 'x'.repeat(4096) },
    })),
  });
}
