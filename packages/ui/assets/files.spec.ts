import { expect, it } from 'vitest';
import { setupAssetTests } from '../../../tests/ui/asset-support';
import { createFiles, file, reference } from '../../../tests/ui/files-support';
setupAssetTests();
it('uses native multiple input, commits metadata without runtime keys and keeps failed rows in the list', async () => {
  const { fixture, field, jobs } = await createFiles([reference('old')]);
  const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('input')!;
  expect(input.multiple).toBe(true);
  Object.defineProperty(input, 'files', { value: [file('a'), file('b')] });
  input.dispatchEvent(new Event('change', { bubbles: true }));
  expect(input.value).toBe('');
  expect(field.rows()).toHaveLength(3);
  jobs[1]!.work.reject(new Error('PRIVATE SECRET'));
  jobs[0]!.work.resolve(reference('a'));
  await expect.poll(() => field.uploading()).toBe(false);
  expect(field.value()).toEqual([reference('old'), reference('a')]);
  expect(field.rows()[2]).toMatchObject({ name: 'b.txt', status: 'error', error: 'upload' });
  expect(field.unresolved()).toBe(true);
  await fixture.whenStable();
  expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('PRIVATE SECRET');
  const failed = field.rows()[2]!.key;
  field.retry(failed);
  expect(field.unresolved()).toBe(false);
  expect(field.uploading()).toBe(true);
  jobs[2]!.work.resolve(reference('b'));
  await expect.poll(() => field.uploading()).toBe(false);
  expect(field.rows()[2]!.key).toBe(failed);
  expect(field.value()).toEqual([reference('old'), reference('a'), reference('b')]);
});
it('updates order from buttons with stable keys while uploads are active', async () => {
  const { fixture, field, jobs } = await createFiles([reference('old')]);
  field.choose([file('a'), file('b')]);
  const b = field.rows()[2]!.key;
  field.move(b, -1);
  field.move(b, -1);
  expect(field.rows()[0]!.key).toBe(b);
  jobs[1]!.work.resolve(reference('b'));
  jobs[0]!.work.resolve(reference('a'));
  await expect.poll(() => field.uploading()).toBe(false);
  expect(field.value().map((r) => r.id)).toEqual(['b', 'old', 'a']);
  await fixture.whenStable();
  const buttons = [
    ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
      'li:first-child button',
    ),
  ];
  expect(buttons.find((button) => button.disabled)).toBeDefined();
  field.remove(b);
  expect(field.value().map((r) => r.id)).toEqual(['old', 'a']);
});
it('holds native incomplete until failed or rejected selection is resolved explicitly', async () => {
  const { field, jobs } = await createFiles([], 1, 1);
  const events: string[] = [];
  field.unresolvedChange.subscribe((value) => events.push(`incomplete:${value}`));
  field.uploadingChange.subscribe((value) => events.push(`busy:${value}`));
  field.choose([file('a')]);
  field.choose([file('overflow')]);
  expect(field.error()).toBe('count');
  expect(field.unresolved()).toBe(true);
  jobs[0]!.work.reject(new Error('fail'));
  await expect.poll(() => field.uploading()).toBe(false);
  expect(events.indexOf('incomplete:true')).toBeLessThan(events.indexOf('busy:false'));
  field.remove(field.rows()[0]!.key);
  expect(field.unresolved()).toBe(false);
  expect(field.error()).toBeNull();
});
it.each(['readonly', 'disabled'] as const)(
  'cancels all work and retains saved values when %s is enabled',
  async (property) => {
    const { fixture, field, jobs, upload } = await createFiles([reference('saved')], 1);
    field.choose([file('a'), file('b')]);
    fixture.componentRef.setInput(property, true);
    await fixture.whenStable();
    expect(jobs[0]!.options.signal.aborted).toBe(true);
    expect(field.uploading()).toBe(false);
    expect(field.value()).toEqual([reference('saved')]);
    field.choose([file('blocked')]);
    field.remove(field.rows()[0]!.key);
    field.move(field.rows()[0]!.key, 1);
    field.retry('unknown');
    expect(upload).toHaveBeenCalledOnce();
    jobs[0]!.work.resolve(reference('late'));
    await fixture.whenStable();
    expect(field.value()).toEqual([reference('saved')]);
  },
);
it.each(['identity', 'adapter', 'value', 'maxItems', 'accept', 'concurrency'] as const)(
  'isolates jobs on external %s replacement',
  async (property) => {
    const { fixture, field, jobs } = await createFiles([reference('saved')]);
    field.choose([file('a')]);
    const input = {
      identity: 'new-owner',
      adapter: undefined,
      value: [reference('external')],
      maxItems: 20,
      accept: '.txt',
      concurrency: 1,
    }[property];
    fixture.componentRef.setInput(property, input);
    await fixture.whenStable();
    expect(jobs[0]!.options.signal.aborted).toBe(true);
    expect(field.uploading()).toBe(false);
    jobs[0]!.work.resolve(reference('late'));
    await fixture.whenStable();
    expect(field.value().map((r) => r.id)).toEqual([property === 'value' ? 'external' : 'saved']);
  },
);
it('diagnoses duplicate existing metadata without truncating and bounds direct-call configuration', async () => {
  const { fixture, field, upload } = await createFiles([reference('x'), reference('x')]);
  expect(field.validValue()).toBe(false);
  expect(field.value()).toHaveLength(2);
  expect(field.error()).toBe('reference');
  field.choose([file('a')]);
  expect(upload).not.toHaveBeenCalled();
  fixture.componentRef.setInput('value', []);
  fixture.componentRef.setInput('concurrency', 0);
  await fixture.whenStable();
  expect(field.error()).toBe('config');
  expect(field.unresolved()).toBe(true);
});
it('preserves over-capacity existing references and clears the diagnostic only after enough explicit removals', async () => {
  const { field } = await createFiles([reference('a'), reference('b'), reference('c')], 1, 1);
  expect(field.rows()).toHaveLength(3);
  expect(field.value()).toHaveLength(3);
  expect(field.error()).toBe('count');
  expect(field.unresolved()).toBe(true);
  field.remove(field.rows()[0]!.key);
  expect(field.value()).toHaveLength(2);
  expect(field.unresolved()).toBe(true);
  field.remove(field.rows()[0]!.key);
  expect(field.value()).toEqual([reference('c')]);
  expect(field.unresolved()).toBe(false);
});
