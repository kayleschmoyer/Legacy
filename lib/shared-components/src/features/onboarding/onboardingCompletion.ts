/**
 * Onboarding-completion persistence helpers (shared across web and mobile).
 *
 * Owns the per-user storage key, (de)serialization of the completion flag, and
 * the one-time migration from the legacy global flag (LS-10379). Intentionally
 * storage-agnostic, mirroring `utils/lastVisitedLeague.ts`: each platform wraps
 * these with its own backend (web: browser storage; mobile: `AsyncStorage`).
 */

/** Pre-per-user global flag. Only ever written on completion. */
export const LEGACY_ONBOARDING_KEY = 'ls_onboarding_complete';

/** Minimal synchronous key/value surface. */
export interface OnboardingStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Per-user storage key for the onboarding-complete flag. */
export function getOnboardingKey(userId: number): string {
  return `${LEGACY_ONBOARDING_KEY}_${userId}`;
}

/** Serialize the completion flag for storage. */
export function serializeOnboardingComplete(completed: boolean): string {
  return JSON.stringify(completed);
}

/**
 * Parse a stored completion flag. A missing value means "not completed".
 * An invalid-JSON value throws, so callers can surface storage corruption the
 * same way they surface storage access errors.
 */
export function parseOnboardingComplete(raw: string | null): boolean {
  return raw !== null ? (JSON.parse(raw) as boolean) : false;
}

/**
 * Migrates the legacy global onboarding flag to the per-user key.
 *
 * Returns true when the legacy flag marks onboarding as complete. A legacy
 * value that is present but unparseable still counts as complete: the old
 * code only ever wrote the key on completion, so its presence is the signal.
 * Storage access errors propagate to the caller.
 */
export function migrateLegacyOnboardingFlag(
  storage: OnboardingStorage,
  userKey: string,
): boolean {
  const legacyRaw = storage.getItem(LEGACY_ONBOARDING_KEY);
  if (legacyRaw === null) return false;

  let legacyDone: boolean;
  try {
    legacyDone = Boolean(JSON.parse(legacyRaw));
  } catch {
    legacyDone = true;
  }
  if (!legacyDone) return false;

  storage.setItem(userKey, serializeOnboardingComplete(true));
  storage.removeItem(LEGACY_ONBOARDING_KEY);
  return true;
}
