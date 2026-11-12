import { HavenGlassSurface } from '@haven/ui/glass';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
type Gap = 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';
@Component({
  selector: 'haven-stack',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<ng-content />',
  host: { '[style.gap]': '"var(--haven-gap-" + gap() + ")"' },
  styles: ':host { display: flex; flex-direction: column; min-width: 0; }',
})
export class HavenStack {
  readonly gap = input<Gap>('md');
}
@Component({
  selector: 'haven-grid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<ng-content />',
  host: {
    '[style.gap]': '"var(--haven-gap-" + gap() + ")"',
    '[style.grid-template-columns]': '"repeat(" + columns() + ", minmax(0, 1fr))"',
  },
  styles: ':host { display: grid; min-width: 0; }',
})
export class HavenGrid {
  readonly gap = input<Gap>('md');
  readonly columns = input(2);
}
@Component({
  selector: 'haven-section',
  imports: [HavenGlassSurface],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template:
    '<haven-glass-surface variant="panel"><section><h2>{{ title() }}</h2><ng-content /></section></haven-glass-surface>',
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    section {
      display: flex;
      flex-direction: column;
      gap: var(--haven-gap-md);
      border-radius: var(--haven-radius);
      padding: var(--haven-spacing);
      overflow-wrap: anywhere;
    }
    h2 {
      font: var(--mat-sys-title-medium);
      margin: 0;
    }
  `,
})
export class HavenSection {
  readonly title = input('');
}
