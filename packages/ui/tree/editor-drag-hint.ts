import { Directive, inject } from '@angular/core';
import { MAT_TOOLTIP_DEFAULT_OPTIONS } from '@angular/material/tooltip';

/** Explanatory drag hints must never intercept CDK's pointer hit test, including while fading out. */
@Directive({
  selector: '[havenTreeDragHint]',
  providers: [
    {
      provide: MAT_TOOLTIP_DEFAULT_OPTIONS,
      useFactory: () => ({
        ...inject(MAT_TOOLTIP_DEFAULT_OPTIONS, { skipSelf: true }),
        disableTooltipInteractivity: true,
      }),
    },
  ],
})
export class HavenTreeDragHint {}
