import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { HavenFilesField } from '../../packages/ui/assets/files';
import { deferred, source } from './asset-support';
import type { FileReference, UploadAdapter } from '@haven/runtime';

export const file = (id: string) => new File([id], `${id}.txt`, { type: 'text/plain' });
export const reference = (id: string): FileReference => ({
  id,
  name: `${id}.txt`,
  mediaType: 'text/plain',
  size: 1,
});
export async function createFiles(initial: FileReference[] = [], concurrency = 2, maxItems = 10) {
  const fixture = TestBed.createComponent(HavenFilesField);
  fixture.componentRef.setInput('label', 'Files');
  fixture.componentRef.setInput('value', initial);
  fixture.componentRef.setInput('concurrency', concurrency);
  fixture.componentRef.setInput('maxItems', maxItems);
  const jobs: {
    name: string;
    options: Parameters<UploadAdapter['upload']>[2];
    work: ReturnType<typeof deferred<FileReference>>;
  }[] = [];
  const upload = vi.fn<UploadAdapter['upload']>((_file, name, options) => {
    const work = deferred<FileReference>();
    jobs.push({ name, options, work });
    return work.promise;
  });
  fixture.componentRef.setInput('adapter', source({ upload }));
  await fixture.whenStable();
  return { fixture, field: fixture.componentInstance, jobs, upload };
}
