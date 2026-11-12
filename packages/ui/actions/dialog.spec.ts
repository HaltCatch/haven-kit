import { Component, ViewContainerRef, inject, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonHarness } from '@angular/material/button/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatDialogHarness } from '@angular/material/dialog/testing';
import { provideTransloco, TranslocoService } from '@jsverse/transloco';
import { provideHavenTransloco } from '@haven/ui/i18n';
import { HAVEN_THEME_CONTEXT, HavenThemeDirective } from '@haven/ui/theme';
import type { HavenTheme } from '@haven/schema';
import english from '@haven/ui/i18n/locales/en-US.json';
import chinese from '@haven/ui/i18n/locales/zh-CN.json';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HavenDialog, HavenDialogContent, HavenDialogActions } from './public-api';

interface EditorData {
  name: string;
}
interface EditorResult {
  name: string;
}
@Component({
  selector: 'haven-test-editor-dialog',
  imports: [HavenDialogContent, HavenDialogActions, MatButtonModule],
  template: `<haven-dialog-content [title]="title"
    ><input #name aria-label="Name" [value]="data.name" />
    <p>{{ theme?.()?.preset }}</p>
    <button havenDialogActions matButton type="button" (click)="ref.close({ name: name.value })">
      Save
    </button>
  </haven-dialog-content>`,
})
class EditorDialog {
  readonly data = inject<EditorData>(MAT_DIALOG_DATA);
  readonly ref = inject<MatDialogRef<EditorDialog, EditorResult>>(MatDialogRef);
  readonly theme = inject(HAVEN_THEME_CONTEXT, { optional: true });
  readonly title = { default: 'Edit value', translations: { 'zh-CN': '编辑值' } };
}
@Component({
  selector: 'haven-test-launcher',
  template: `<button type="button" (click)="open()">Open editor</button>`,
})
class Launcher {
  readonly dialogs = inject(HavenDialog);
  readonly viewContainerRef = inject(ViewContainerRef);
  ref: MatDialogRef<EditorDialog, EditorResult> | undefined;
  open(): void {
    this.ref = this.dialogs.open<EditorDialog, EditorData, EditorResult>(EditorDialog, {
      viewContainerRef: this.viewContainerRef,
      data: { name: 'Original' },
      enterAnimationDuration: 0,
      exitAnimationDuration: 0,
    });
  }
  confirm(): Promise<boolean> {
    return this.dialogs.confirm({
      viewContainerRef: this.viewContainerRef,
      title: { default: 'Remove item', translations: { 'zh-CN': '移除项目' } },
      message: 'This is a host-owned confirmation.',
      destructive: true,
      enterAnimationDuration: 0,
      exitAnimationDuration: 0,
    });
  }
}
@Component({
  imports: [HavenThemeDirective, Launcher],
  template: `<section [havenTheme]="theme()"><haven-test-launcher /></section>`,
})
class Host {
  readonly theme = signal<HavenTheme>({
    preset: 'material',
    mode: 'dark',
    density: 'comfortable',
    tokens: { primary: '#123456' },
  });
}
beforeEach(() => {
  // jsdom has no geometry; let CDK InteractivityChecker see mounted controls as visible.
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(100);
  TestBed.configureTestingModule({
    providers: [
      provideTransloco({
        config: { defaultLang: 'en-US', availableLangs: ['en-US', 'zh-CN'], prodMode: true },
      }),
      provideHavenTransloco(),
    ],
  });
  const service = TestBed.inject(TranslocoService);
  service.setTranslation({ haven: english }, 'en-US');
  service.setTranslation({ haven: chinese }, 'zh-CN');
});
afterEach(() => {
  TestBed.resetTestingModule();
  vi.restoreAllMocks();
});
async function create() {
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  const launcher = fixture.debugElement.query(By.directive(Launcher)).componentInstance as Launcher;
  return { fixture, launcher, loader: TestbedHarnessEnvironment.documentRootLoader(fixture) };
}

describe('native Material dialogs with per-owner Haven theme', () => {
  it('delivers typed data/results through the native ref and restores focus to the trigger', async () => {
    const { fixture, launcher, loader } = await create();
    const trigger = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      'button',
    )!;
    trigger.focus();
    trigger.click();
    await fixture.whenStable();
    const ref = launcher.ref!,
      result = firstValueFrom(ref.afterClosed());
    const dialog = await loader.getHarness(MatDialogHarness);
    expect(await dialog.getTitleText()).toBe('Edit value');
    expect(await dialog.getAriaLabelledby()).toBeTruthy();
    const input = document.getElementById(ref.id)!.querySelector<HTMLInputElement>('input')!;
    expect(input.value).toBe('Original');
    input.value = 'Saved value';
    await (await dialog.getHarness(MatButtonHarness.with({ text: 'Save' }))).click();
    expect(await result).toEqual({ name: 'Saved value' });
    expect(document.activeElement).toBe(trigger);
  });
  it('preserves native cancellation as undefined for generic opens', async () => {
    const { fixture, launcher, loader } = await create();
    launcher.open();
    await fixture.whenStable();
    const result = firstValueFrom(launcher.ref!.afterClosed());
    await (await loader.getHarness(MatDialogHarness)).close();
    expect(await result).toBeUndefined();
  });
  it.each(['cancel', 'escape', 'backdrop', 'confirm'] as const)(
    'maps confirmation %s to an explicit boolean and initially focuses cancel',
    async (action) => {
      const { fixture, launcher, loader } = await create();
      const result = launcher.confirm();
      await fixture.whenStable();
      const dialog = await loader.getHarness(MatDialogHarness),
        cancel = await dialog.getHarness(MatButtonHarness.with({ text: 'Cancel' }));
      expect(await dialog.getRole()).toBe('alertdialog');
      await expect.poll(() => cancel.isFocused()).toBe(true);
      if (action === 'escape') await dialog.close();
      else if (action === 'backdrop') {
        document.querySelector<HTMLElement>('.cdk-overlay-backdrop')!.click();
        await fixture.whenStable();
      } else
        await (
          await dialog.getHarness(
            MatButtonHarness.with({ text: action === 'confirm' ? 'Continue' : 'Cancel' }),
          )
        ).click();
      expect(await result).toBe(action === 'confirm');
    },
  );
  it('reacts to locale/theme changes on only the owned overlay and cleans removed containers', async () => {
    const first = await create(),
      second = await create();
    second.fixture.componentInstance.theme.set({
      preset: 'liquid-glass',
      mode: 'light',
      density: 'compact',
    });
    first.launcher.open();
    second.launcher.open();
    await first.fixture.whenStable();
    await second.fixture.whenStable();
    const firstContainer = document.getElementById(first.launcher.ref!.id)!,
      secondContainer = document.getElementById(second.launcher.ref!.id)!;
    expect(firstContainer.getAttribute('data-haven-preset')).toBe('material');
    expect(firstContainer.style.colorScheme).toBe('dark');
    expect(firstContainer.style.getPropertyValue('--mat-sys-primary')).toBe('#123456');
    expect(secondContainer.getAttribute('data-haven-preset')).toBe('liquid-glass');
    expect(secondContainer.style.colorScheme).toBe('light');
    expect(
      document.querySelector('.cdk-overlay-container')?.getAttribute('data-haven-preset'),
    ).toBeNull();
    first.fixture.componentInstance.theme.set({
      preset: 'liquid-glass',
      mode: 'dark',
      density: 'comfortable',
    });
    TestBed.inject(TranslocoService).setActiveLang('zh-CN');
    await first.fixture.whenStable();
    expect(firstContainer.getAttribute('data-haven-preset')).toBe('liquid-glass');
    expect(firstContainer.style.getPropertyValue('--mat-sys-primary')).toBe('');
    expect(secondContainer.style.colorScheme).toBe('light');
    const dialogs = await first.loader.getAllHarnesses(MatDialogHarness);
    expect(await dialogs[0]!.getTitleText()).toBe('编辑值');
    const secondClosed = firstValueFrom(second.launcher.ref!.afterClosed());
    second.launcher.ref!.close();
    await secondClosed;
    const firstClosed = firstValueFrom(first.launcher.ref!.afterClosed());
    first.launcher.ref!.close();
    await firstClosed;
    expect(firstContainer.getAttribute('data-haven-preset')).toBeNull();
    expect(secondContainer.getAttribute('data-haven-preset')).toBeNull();
    first.fixture.componentInstance.theme.set({
      preset: 'material',
      mode: 'light',
      density: 'comfortable',
    });
    await first.fixture.whenStable();
    expect(firstContainer.getAttribute('data-haven-preset')).toBeNull();
  });
  it('honors native close policy and an explicit per-dialog theme override without modifying the owner', async () => {
    const { fixture, launcher, loader } = await create();
    const theme = signal<HavenTheme>({ preset: 'liquid-glass', mode: 'light', density: 'compact' });
    const ref = launcher.dialogs.open<EditorDialog, EditorData, EditorResult>(EditorDialog, {
      viewContainerRef: launcher.viewContainerRef,
      data: { name: 'Override' },
      theme,
      disableClose: true,
      enterAnimationDuration: 0,
      exitAnimationDuration: 0,
    });
    await fixture.whenStable();
    const result = firstValueFrom(ref.afterClosed()),
      dialog = await loader.getHarness(MatDialogHarness);
    expect(document.getElementById(ref.id)?.getAttribute('data-haven-preset')).toBe('liquid-glass');
    expect(ref.componentInstance.theme?.()?.mode).toBe('light');
    expect(fixture.componentInstance.theme().preset).toBe('material');
    await dialog.close();
    expect(document.getElementById(ref.id)).not.toBeNull();
    ref.close({ name: 'Allowed programmatic close' });
    expect(await result).toEqual({ name: 'Allowed programmatic close' });
  });
  it('closes an overlay when its owning view is destroyed', async () => {
    const { fixture, launcher } = await create();
    launcher.open();
    await fixture.whenStable();
    const ref = launcher.ref!,
      closed = firstValueFrom(ref.afterClosed());
    fixture.destroy();
    expect(await closed).toBeUndefined();
    expect(document.getElementById(ref.id)).toBeNull();
  });
});
