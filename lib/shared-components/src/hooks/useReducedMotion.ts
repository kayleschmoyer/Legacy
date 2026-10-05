import React from 'react';

/** localStorage key of the web user-preferences blob (written by the Preferences page). */
export const PREFS_STORAGE_KEY = 'ls_user_preferences';

/**
 * Window event the web Preferences page dispatches after persisting, so
 * same-tab consumers re-read the stored `enableAnimations` preference (the
 * native `storage` event only fires in *other* tabs).
 */
export const USER_PREFERENCES_CHANGED_EVENT = 'ls:user-preferences-changed';

/** True when the persisted `enableAnimations` preference is explicitly off. */
function readAnimationsDisabled(): boolean {
  try {
    const raw = window.localStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { enableAnimations?: unknown } | null;
    return parsed?.enableAnimations === false;
  } catch {
    return false;
  }
}

/**
 * Whether animations should be collapsed on web: either the OS requests
 * `(prefers-reduced-motion: reduce)` or the user switched off "Enable
 * animations" in Preferences (`enableAnimations: false` in the
 * `ls_user_preferences` blob, LS-7073). Always `false` on native (and during
 * SSR) — there is no DOM `matchMedia` to query.
 *
 * Consumers use this to collapse spring/timing animations (Dialog, Sheet,
 * etc.) to a near-instant duration so users who request reduced motion get
 * one, and so Playwright's `contextOptions: { reducedMotion: 'reduce' }`
 * (set repo-wide for E2E) makes dialog enter/exit settle deterministically
 * fast instead of riding out a full spring — this is what keeps WebKit's
 * spring-to-CSS timing variance from blowing past assertion timeouts
 * (LS-8995).
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(false);
  React.useEffect(() => {
    // React Native defines a global `window` (an alias of `global`) but no
    // DOM APIs, so `typeof window` alone does not detect native: calling
    // `window.matchMedia` there threw "undefined is not a function" from this
    // effect and crashed every screen rendering a Dialog/Sheet — e.g. Create
    // League (LS-9249).
    if (
      typeof document === 'undefined' ||
      typeof window.matchMedia !== 'function'
    ) {
      return;
    }
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(mq.matches || readAnimationsDisabled());
    sync();
    mq.addEventListener('change', sync);
    window.addEventListener('storage', sync);
    window.addEventListener(USER_PREFERENCES_CHANGED_EVENT, sync);
    return () => {
      mq.removeEventListener('change', sync);
      window.removeEventListener('storage', sync);
      window.removeEventListener(USER_PREFERENCES_CHANGED_EVENT, sync);
    };
  }, []);
  return reduced;
}
