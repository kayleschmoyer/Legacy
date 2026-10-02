export const LEGACY_ONBOARDING_KEY = 'ls_onboarding_complete';

export const getOnboardingStepKey = (uid: number) =>
  `ls_onboarding_step_${uid}`;

/**
 * Reads the last-viewed tutorial step index, or 0 when nothing valid is
 * stored. The upper bound is clamped by `OnboardingTutorial` itself, which
 * owns the step list. Storage access errors propagate to the caller.
 */
export function readOnboardingStep(
  storage: Pick<Storage, 'getItem'>,
  stepKey: string,
): number {
  const raw = storage.getItem(stepKey);
  if (raw === null) return 0;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
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
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
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

  storage.setItem(userKey, JSON.stringify(true));
  storage.removeItem(LEGACY_ONBOARDING_KEY);
  return true;
}
