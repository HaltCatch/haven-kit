import type { HavenTheme } from '@haven/schema';
const tokenProperties: Readonly<Record<string, string>> = {
  primary: '--mat-sys-primary',
  surface: '--mat-sys-surface',
  onSurface: '--mat-sys-on-surface',
  error: '--mat-sys-error',
  fontFamily: '--mat-sys-body-large-font',
  fontSize: '--haven-font-size',
  radius: '--haven-radius',
  spacing: '--haven-spacing',
  glassTint: '--haven-glass-tint',
  glassBlur: '--haven-glass-blur',
  glassBorder: '--haven-glass-border',
  glassRadius: '--haven-glass-radius',
  glassSaturation: '--haven-glass-saturation',
};
/** Applies one theme to one owned element; cleanup restores previous inline state. */
export function applyHavenTheme(element: HTMLElement, theme: HavenTheme): () => void {
  const previousPreset = element.getAttribute('data-haven-preset');
  element.setAttribute('data-haven-preset', theme.preset);
  const previousScheme = element.style.colorScheme;
  const previousDensity = element.getAttribute('data-haven-density');
  element.style.colorScheme = theme.mode === 'system' ? 'light dark' : theme.mode;
  element.setAttribute('data-haven-density', theme.density);
  const previous = new Map<string, string>();
  for (const [key, value] of Object.entries(theme.tokens ?? {})) {
    const property = tokenProperties[key];
    if (!property || /[;{}<>]|url\s*\(/i.test(value)) continue;
    previous.set(property, element.style.getPropertyValue(property));
    element.style.setProperty(property, value);
  }
  return () => {
    if (previousPreset === null) element.removeAttribute('data-haven-preset');
    else element.setAttribute('data-haven-preset', previousPreset);
    element.style.colorScheme = previousScheme;
    if (previousDensity === null) element.removeAttribute('data-haven-density');
    else element.setAttribute('data-haven-density', previousDensity);
    for (const [key, value] of previous) {
      if (value) element.style.setProperty(key, value);
      else element.style.removeProperty(key);
    }
  };
}
