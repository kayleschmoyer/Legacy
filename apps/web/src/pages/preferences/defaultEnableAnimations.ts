/**
 * Default for the Preferences "Animations" toggle (LS-7072). Users whose OS
 * asks for reduced motion get animations OFF until they opt in; everyone else
 * (and any environment without `matchMedia`) keeps the previous default of ON.
 * A value the user has already saved always overrides this default.
 */
export function getDefaultEnableAnimations(): boolean {
  if (
    typeof window === 'undefined' ||
    typeof window.matchMedia !== 'function'
  ) {
    return true;
  }
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
