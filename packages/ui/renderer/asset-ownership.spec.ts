import { By } from '@angular/platform-browser';
import { HavenFileField } from '@haven/ui/assets';
import type { FileReference } from '@haven/runtime';
import english from '@haven/ui/i18n/locales/en-US.json';
import { expect, it } from 'vitest';
import { fieldAt } from '@haven/ui/form-state';
import {
  setupAssetTests,
  deferred,
  document,
  source,
  render,
  fileInput,
  choose,
  assetSchema,
} from '../../../tests/ui/asset-support';

setupAssetTests();

it('cancels the active upload and ignores its late success without changing form values', async () => {
  const work = deferred<FileReference>();
  let signal!: AbortSignal;
  const fixture = await render(
    document(),
    source({
      upload: (_file, _name, options) => {
        signal = options.signal;
        return work.promise;
      },
    }),
  );
  choose(
    fileInput(fixture.nativeElement as HTMLElement),
    new File(['x'], 'a.txt', { type: 'text/plain' }),
  );
  await fixture.whenStable();
  const cancel = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find(
    (button) => button.textContent?.trim() === english['asset.cancel'],
  )!;
  cancel.click();
  await fixture.whenStable();
  expect(signal.aborted).toBe(true);
  work.resolve({ id: 'late', name: 'a.txt', mediaType: 'text/plain', size: 1 });
  await Promise.resolve();
  await fixture.whenStable();
  expect(fixture.componentInstance.value()['asset']).toEqual([]);
});

it('aborts the old document upload and prevents ignored-abort completion from polluting the new owner', async () => {
  const work = deferred<FileReference>();
  let signal!: AbortSignal;
  const adapter = source({
    upload: (_file, _name, options) => {
      signal = options.signal;
      return work.promise;
    },
  });
  const model = document();
  const fixture = await render(model, adapter);
  choose(
    fileInput(fixture.nativeElement as HTMLElement),
    new File(['x'], 'a.txt', { type: 'text/plain' }),
  );
  expect(fixture.componentInstance.uploading()).toBe(true);
  const prior = fixture.debugElement.query(By.directive(HavenFileField)).componentInstance;
  const events: unknown[] = [];
  fixture.componentInstance.uiEvent.subscribe((event) => events.push(event));
  fixture.componentRef.setInput('document', { ...model, id: 'assets-second' });
  fixture.componentRef.setInput('value', { asset: [] });
  await fixture.whenStable();
  expect(signal.aborted).toBe(true);
  expect(fixture.componentInstance.uploading()).toBe(false);
  expect(fixture.debugElement.query(By.directive(HavenFileField)).componentInstance).not.toBe(
    prior,
  );
  work.resolve({ id: 'old-result', name: 'a.txt', mediaType: 'text/plain', size: 1 });
  await Promise.resolve();
  await fixture.whenStable();
  expect(fixture.componentInstance.value()['asset']).toEqual([]);
  expect(events).toEqual([]);
});

it.each(['cancel', 'readonly', 'disabled', 'remove'] as const)(
  'exposes in-flight replacement uploads to the host and restores submission eligibility after %s',
  async (reason) => {
    const saved = { id: 'saved', name: 'saved.txt', size: 1, mediaType: 'text/plain' };
    const work = deferred<FileReference>();
    let signal!: AbortSignal;
    const model = document();
    const fixture = await render(
      model,
      source({
        upload: (_file, _name, options) => {
          signal = options.signal;
          return work.promise;
        },
      }),
    );
    fixture.componentInstance.value.set({ asset: [saved] });
    await fixture.whenStable();
    expect(fieldAt(fixture.componentInstance.fields()!, '/asset')!().valid()).toBe(true);
    const control = fixture.debugElement.query(By.directive(HavenFileField))
      .componentInstance as HavenFileField;
    const pending = control.choose(new File(['x'], 'replacement.txt', { type: 'text/plain' }));
    await fixture.whenStable();
    expect(fixture.componentInstance.uploading()).toBe(true);
    expect(fixture.componentInstance.value()['asset']).toEqual([saved]);
    expect(
      fieldAt(fixture.componentInstance.fields()!, '/asset')!()
        .errors()
        .map((error) => error.kind),
    ).toContain('uploadPending');
    expect(fixture.componentInstance.fields()!().valid()).toBe(false);
    if (reason === 'cancel') control.cancel();
    else {
      const node = model.ui.children![0]!;
      fixture.componentRef.setInput('document', {
        ...model,
        ui: {
          ...model.ui,
          children:
            reason === 'remove'
              ? []
              : [
                  {
                    ...node,
                    ...(reason === 'readonly'
                      ? { props: { ...node.props, readonly: true } }
                      : {
                          rules: {
                            disabled: {
                              op: 'eq',
                              left: { literal: true },
                              right: { literal: true },
                            },
                          },
                        }),
                  },
                ],
        },
      });
    }
    await fixture.whenStable();
    expect(signal.aborted).toBe(true);
    expect(fixture.componentInstance.uploading()).toBe(false);
    expect(fixture.componentInstance.fields()!().valid()).toBe(true);
    work.resolve({ ...saved, id: 'late' });
    await pending;
    await fixture.whenStable();
    expect(fixture.componentInstance.value()['asset']).toEqual([saved]);
  },
);

it.each(['bind', 'hide', 'kind'] as const)(
  'retires upload work when the same node changes its %s lifetime',
  async (change) => {
    const model = document();
    model.dataSchema.properties!['other'] = assetSchema();
    const work = deferred<FileReference>();
    let signal!: AbortSignal;
    const fixture = await render(
      model,
      source({
        upload: (_file, _name, options) => {
          signal = options.signal;
          return work.promise;
        },
      }),
    );
    const shared: FileReference[] = [];
    fixture.componentInstance.value.set({ asset: shared, other: shared });
    await fixture.whenStable();
    const control = fixture.debugElement.query(By.directive(HavenFileField))
      .componentInstance as HavenFileField;
    const pending = control.choose(new File(['x'], 'old.txt', { type: 'text/plain' }));
    await fixture.whenStable();
    expect(fixture.componentInstance.uploading()).toBe(true);
    const node = model.ui.children![0]!;
    const next = {
      ...model,
      ui: {
        ...model.ui,
        children: [
          {
            ...node,
            ...(change === 'bind'
              ? { bind: '/other' }
              : change === 'kind'
                ? {
                    kind: 'field.image',
                    props: { ...node.props, accept: 'image/png' },
                  }
                : {
                    rules: {
                      visible: {
                        op: 'eq' as const,
                        left: { literal: true },
                        right: { literal: false },
                      },
                    },
                  }),
          },
        ],
      },
    };
    fixture.componentRef.setInput('document', next);
    await fixture.whenStable();
    expect(signal.aborted).toBe(true);
    expect(fixture.componentInstance.uploading()).toBe(false);
    if (change === 'hide') {
      expect(fixture.debugElement.query(By.directive(HavenFileField))).toBeNull();
      fixture.componentRef.setInput('document', model);
      await fixture.whenStable();
      expect(fixture.debugElement.query(By.directive(HavenFileField))).not.toBeNull();
    }
    work.resolve({ id: 'stale', name: 'old.txt', mediaType: 'text/plain', size: 1 });
    await pending;
    await fixture.whenStable();
    expect(fixture.componentInstance.value()).toEqual({ asset: [], other: [] });
    expect(fixture.componentInstance.uploading()).toBe(false);
    for (const path of ['/asset', '/other']) {
      expect(
        fieldAt(fixture.componentInstance.fields()!, path)!()
          .errors()
          .map((error) => error.kind),
      ).not.toContain('uploadPending');
    }
  },
);
