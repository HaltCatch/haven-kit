import { TestBed } from '@angular/core/testing';
import { provideTransloco, TranslocoService } from '@jsverse/transloco';
import { provideHavenTransloco } from '@haven/ui/i18n';
import type { TreeNode } from '@haven/schema';
import english from '@haven/ui/i18n/locales/en-US.json';
import chinese from '@haven/ui/i18n/locales/zh-CN.json';
export const selectionNodes: TreeNode[] = [
  {
    key: 'group',
    label: 'Group',
    children: [
      { key: 0, label: { default: 'Zero', translations: { 'zh-CN': '零' } } },
      { key: '0', label: 'String zero' },
    ],
  },
  {
    key: 'locked',
    label: 'Locked',
    disabled: true,
    children: [{ key: 'child', label: 'Locked child' }],
  },
];
export function setupTreeSelection() {
  TestBed.configureTestingModule({
    providers: [
      provideTransloco({
        config: { defaultLang: 'en-US', availableLangs: ['en-US', 'zh-CN'], prodMode: true },
      }),
      provideHavenTransloco(),
    ],
  });
  const l = TestBed.inject(TranslocoService);
  l.setTranslation({ haven: english }, 'en-US');
  l.setTranslation({ haven: chinese }, 'zh-CN');
}
