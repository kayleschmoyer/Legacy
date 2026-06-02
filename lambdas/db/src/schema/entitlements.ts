/**
 * Entitlement lookup keys for feature gating.
 *
 * The constants now live in `@legacy-sports/utils` (a platform-shared library)
 * so both this feature-gating code and the `seed-stripe` CLI command
 * (`apps/cli/src/commands/seedStripe.ts`) can import a single source of truth —
 * `lambdas/db` is an nx application and cannot be imported by other projects.
 *
 * This module re-exports those symbols unchanged so existing relative importers
 * (`./entitlements`, `../entitlements`, …) and their test mocks keep working.
 */
export {
  ENTITLEMENTS,
  TIER_ENTITLEMENTS,
  ENTITLEMENT_LABELS,
  tierHasEntitlement,
  type EntitlementKey,
  type SubscriptionTier,
} from '@legacy-sports/utils';
