/**
 * Web wrapper for the onboarding persistence helpers. The completion key,
 * serialization, and legacy-flag migration live in
 * `@legacy-sports/shared-components` (LS-10379); this module re-exports them
 * so existing import paths stay stable, and owns the web-only step-resume
 * helpers.
 */
export {
  LEGACY_ONBOARDING_KEY,
  migrateLegacyOnboardingFlag,
} from '@legacy-sports/shared-components/utils';

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
