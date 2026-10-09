import { useEffect } from 'react';
import {
  PREFS_STORAGE_KEY,
  USER_PREFERENCES_CHANGED_EVENT,
} from '@legacy-sports/shared-components/utils';
import { getDefaultEnableAnimations } from '../pages/preferences/defaultEnableAnimations';

/**
 * Resolved "Animations" preference (LS-10273): the value saved from the
 * Preferences page when there is one, otherwise the OS-derived default
 * (LS-7072).
 */
export function resolveEnableAnimations(): boolean {
  try {
    const raw = window.localStorage.getItem(PREFS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { enableAnimations?: unknown } | null;
      if (typeof parsed?.enableAnimations === 'boolean') {
        return parsed.enableAnimations;
      }
    }
  } catch {
    // Unreadable storage or corrupt JSON: fall through to the OS default.
  }
  return getDefaultEnableAnimations();
}

/** Mirrors the resolved preference onto `<html data-animations="on|off">`. */
export function applyMotionPreference(): void {
  document.documentElement.dataset.animations = resolveEnableAnimations()
    ? 'on'
    : 'off';
}

/**
 * Renders nothing; keeps `<html data-animations>` in sync with the
 * Preferences "Animations" toggle app-wide. Mounted at the app root so the
 * attribute is set at load (not only after visiting Preferences) and follows
 * same-tab toggles (`USER_PREFERENCES_CHANGED_EVENT`), other-tab writes
 * (`storage`) and live OS reduced-motion changes without a reload.
 */
export function MotionPreferenceSync(): null {
  useEffect(() => {
    applyMotionPreference();
    const mq =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;
    window.addEventListener(
      USER_PREFERENCES_CHANGED_EVENT,
      applyMotionPreference,
    );
    window.addEventListener('storage', applyMotionPreference);
    mq?.addEventListener('change', applyMotionPreference);
    return () => {
      window.removeEventListener(
        USER_PREFERENCES_CHANGED_EVENT,
        applyMotionPreference,
      );
      window.removeEventListener('storage', applyMotionPreference);
      mq?.removeEventListener('change', applyMotionPreference);
    };
  }, []);
  return null;
}
