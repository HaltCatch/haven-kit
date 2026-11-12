import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TranslocoService } from '@jsverse/transloco';
import { afterEach, beforeEach, expect, it } from 'vitest';
import type { HavenDocument, RemoteTreeNode } from '@haven/schema';
import type { TreeDataAdapter } from '@haven/runtime';
import { HavenRemoteTreeSelectField } from '@haven/ui/tree';
import { fieldAt } from '@haven/ui/form-state';
import { HavenRenderer } from '../../renderer';
import { setupTreeSelection } from '../../../../../tests/ui/tree-selection-support';

beforeEach(setupTreeSelection);
afterEach(() => TestBed.resetTestingModule());

it.each(['leafOnly', 'kind'] as const)(
  'revokes old branch membership before input propagation when %s changes',
  async (change) => {
    const branch: RemoteTreeNode = { key: 0, label: 'Branch', hasChildren: true };
    const adapter: TreeDataAdapter = {
      children: async () => [branch],
      resolve: async () => ({ paths: [[branch]], unresolved: [] }),
    };
    const document: HavenDocument = {
      schemaVersion: '1.0',
      id: 'tree-ownership',
      title: 'Tree ownership',
      dataSchema: { type: 'object', properties: { choice: { type: 'number' } } },
      ui: {
        id: 'choice',
        kind: 'field.tree-select',
        version: 1,
        bind: '/choice',
        props: { label: 'Choice', resource: 'nodes' },
      },
      theme: { preset: 'material', mode: 'dark', density: 'comfortable' },
      resources: { nodes: { type: 'tree', adapter: 'host.nodes' } },
      actions: {},
    };
    const fixture = TestBed.createComponent(HavenRenderer),
      renderer = fixture.componentInstance;
    fixture.componentRef.setInput('document', document);
    fixture.componentRef.setInput('host', { trees: new Map([['host.nodes', adapter]]) });
    fixture.componentRef.setInput('value', { choice: 0 });
    const field = () => fieldAt(renderer.fields()!, '/choice')!();
    await fixture.whenStable();
    await expect
      .poll(() => {
        TestBed.tick();
        return field().valid();
      })
      .toBe(true);
    const control = fixture.debugElement.query(By.directive(HavenRemoteTreeSelectField))
      .componentInstance as HavenRemoteTreeSelectField;
    const oldResolution = control.membership.resolution();
    const next = structuredClone(document);
    if (change === 'kind') next.ui.kind = 'field.cascader';
    else next.ui.props!['leafOnly'] = true;
    fixture.componentRef.setInput('document', next);
    // The old producer can still deliver a queued output before its new inputs propagate.
    renderer.treeResources.set(document.ui, oldResolution);
    expect(field().valid()).toBe(false);
    let writes = 0;
    expect(
      await renderer.submit({
        action: async () => {
          writes++;
        },
      }),
    ).toBe(false);
    expect(writes).toBe(0);
    await fixture.whenStable();
    expect(field().valid()).toBe(false);
    expect(renderer.value()['choice']).toBe(0);
  },
);

it.each(['missing', 'pending'] as const)(
  'rejects old-locale membership synchronously and recovers after a %s locale lookup',
  async (mode) => {
    const leaf: RemoteTreeNode = { key: 0, label: 'Leaf', hasChildren: false };
    let chineseSignal: AbortSignal | undefined;
    let finishChinese = () => {};
    const adapter: TreeDataAdapter = {
      children: async () => [leaf],
      resolve: async (keys, context) => {
        if (context.locale === 'en-US') return { paths: [[leaf]], unresolved: [] };
        chineseSignal = context.signal;
        if (mode === 'missing') return { paths: [], unresolved: [...keys] };
        return new Promise((resolve) => {
          finishChinese = () => resolve({ paths: [], unresolved: [...keys] });
        });
      },
    };
    const document: HavenDocument = {
      schemaVersion: '1.0',
      id: 'tree-locale',
      title: 'Tree locale',
      dataSchema: { type: 'object', properties: { choice: { type: 'number' } } },
      ui: {
        id: 'choice',
        kind: 'field.tree-select',
        version: 1,
        bind: '/choice',
        props: { label: 'Choice', resource: 'nodes' },
      },
      theme: { preset: 'material', mode: 'dark', density: 'comfortable' },
      resources: { nodes: { type: 'tree', adapter: 'host.nodes' } },
      actions: {},
    };
    const fixture = TestBed.createComponent(HavenRenderer),
      renderer = fixture.componentInstance;
    fixture.componentRef.setInput('document', document);
    fixture.componentRef.setInput('host', { trees: new Map([['host.nodes', adapter]]) });
    fixture.componentRef.setInput('value', { choice: 0 });
    const field = () => fieldAt(renderer.fields()!, '/choice')!();
    await fixture.whenStable();
    await expect
      .poll(() => {
        TestBed.tick();
        return field().valid();
      })
      .toBe(true);
    const control = fixture.debugElement.query(By.directive(HavenRemoteTreeSelectField))
      .componentInstance as HavenRemoteTreeSelectField;
    const oldResolution = control.membership.resolution(),
      identity = control.source()?.identity;
    const localization = TestBed.inject(TranslocoService);
    localization.setActiveLang('zh-CN');
    // A queued old output cannot renew membership for a different adapter locale.
    renderer.treeResources.set(document.ui, oldResolution);
    expect(field().valid()).toBe(false);
    let writes = 0;
    expect(
      await renderer.submit({
        action: async () => {
          writes++;
        },
      }),
    ).toBe(false);
    expect(writes).toBe(0);
    await expect
      .poll(() => {
        TestBed.tick();
        return !!chineseSignal;
      })
      .toBe(true);
    expect(field().valid()).toBe(false);
    expect(renderer.value()['choice']).toBe(0);
    expect(control.source()?.identity).toBe(identity);
    localization.setActiveLang('en-US');
    await expect
      .poll(() => {
        TestBed.tick();
        return field().valid();
      })
      .toBe(true);
    if (mode === 'pending') {
      expect(chineseSignal?.aborted).toBe(true);
      finishChinese();
      await fixture.whenStable();
      expect(field().valid()).toBe(true);
    }
    expect(renderer.value()['choice']).toBe(0);
  },
);
