/**
 * Tiered auth helper — integration tests (LS-8055)
 *
 * Verifies the `loginAs('premium'|'free'|'admin')` helper and the
 * `premiumJwt` / `freeJwt` / `adminJwt` fixtures provision real, live-backend
 * users whose JWT claims reflect the requested access level (LS-5027 embeds
 * `subscriptionTier` and `accessLevel` in the token), and — the headline
 * acceptance criterion — that the premium identity is NOT blocked by
 * `premium-feature-gate`.
 *
 * These run against the live backend (no mocking). The users are provisioned
 * once in the dev DB (premium seat 1 is the non-admin manager-2, not the
 * commissioner — the commissioner fixture user also carries access_level=admin):
 *   premium → manager 2     (subscription_tier='premium', non-admin)
 *   free    → manager 1     (subscription_tier='free')
 *   admin   → dedicated user (access_level='admin')
 *
 * Run:
 *   pnpm exec playwright test --config apps/web-e2e/playwright.integration.config.ts \
 *     apps/web-e2e/src/integration/tests/tiered-auth.integration.spec.ts
 */

import { expect, test } from '../fixtures/api';
import { E2EJwtUtil } from '../../utils/jwt';
import { gqlFetchEnvelope } from '../helpers/gql-fetch';

interface DecodedClaims {
  subscriptionTier?: string;
  accessLevel?: string;
  email?: string;
  id?: number;
}

function decode(jwt: string): DecodedClaims {
  return E2EJwtUtil.decodeJwtPayload(jwt);
}

// A premium-gated query used as the gating probe. `footballPlayerLeagueAvailability`
// calls `requireEntitlement(advanced_search_filters)` (a premium entitlement)
// BEFORE it touches its args (lambdas/db/src/schema/football.ts), so a free user
// gets a `PREMIUM_REQUIRED` error immediately while a premium user falls through
// to a (harmless, empty for unknown leagues) result. The args are deliberately
// minimal/non-existent IDs — the gate fires regardless.
const PREMIUM_GATED_QUERY = `
  query FootballAvailabilityGate($playerIds: [Int!]!, $leagueIds: [Int!]!) {
    footballPlayerLeagueAvailability(playerIds: $playerIds, leagueIds: $leagueIds) {
      playerId
    }
  }
`;
const GATE_VARS = { playerIds: [1], leagueIds: [1] };

function isPremiumGated(
  result: Awaited<ReturnType<typeof gqlFetchEnvelope>>,
): boolean {
  return (
    result.errors?.some((e) => e.extensions?.code === 'PREMIUM_REQUIRED') ??
    false
  );
}

test.describe('tiered auth helper — JWT claims reflect tier @critical', () => {
  test('premium JWT (seat 1) carries subscriptionTier=premium', ({
    premiumJwt,
  }) => {
    expect(decode(premiumJwt).subscriptionTier).toBe('premium');
  });

  test('premium JWT (seat 2) is a distinct premium identity', ({
    premiumJwt,
    premiumJwt2,
  }) => {
    expect(decode(premiumJwt2).subscriptionTier).toBe('premium');
    // Seat 2 must be a different user so multi-user same-tier leagues work.
    expect(decode(premiumJwt2).id).not.toBe(decode(premiumJwt).id);
  });

  test('free JWT (seat 1) carries subscriptionTier=free', ({ freeJwt }) => {
    expect(decode(freeJwt).subscriptionTier).toBe('free');
  });

  test('free JWT (seat 2) is a distinct free identity', ({
    freeJwt,
    freeJwt2,
  }) => {
    expect(decode(freeJwt2).subscriptionTier).toBe('free');
    expect(decode(freeJwt2).id).not.toBe(decode(freeJwt).id);
  });

  test('admin JWT (seat 1) is access_level=admin on a FREE subscription (override path)', ({
    adminJwt,
  }) => {
    const claims = decode(adminJwt);
    expect(claims.accessLevel).toBe('admin');
    // Seat 1 admin intentionally has no premium subscription — it proves the
    // isAdmin→premium authorization override, not a premium tier column.
    expect(claims.subscriptionTier).toBe('free');
  });

  test('admin JWT (seat 2) is access_level=admin on a premium subscription', ({
    adminJwt2,
  }) => {
    const claims = decode(adminJwt2);
    expect(claims.accessLevel).toBe('admin');
    expect(claims.subscriptionTier).toBe('premium');
  });
});

test.describe('tiered auth helper — premium gating @critical', () => {
  test('premium (non-admin) user is NOT blocked by premium-feature-gate', async ({
    premiumJwt,
  }) => {
    // premiumJwt (seat 1) is a non-admin premium user, so clearing the gate
    // proves the *premium tier* grants access — not the admin override.
    const result = await gqlFetchEnvelope(
      premiumJwt,
      PREMIUM_GATED_QUERY,
      GATE_VARS,
    );
    expect(isPremiumGated(result)).toBe(false);
  });

  test('admin user is NOT blocked by premium-feature-gate', async ({
    adminJwt,
  }) => {
    // adminJwt (seat 1) is access_level=admin on a FREE subscription, so clearing
    // the gate proves the isAdmin→premium override
    // (lambdas/db/src/schema/authorization.ts), independent of subscription tier.
    const result = await gqlFetchEnvelope(
      adminJwt,
      PREMIUM_GATED_QUERY,
      GATE_VARS,
    );
    expect(isPremiumGated(result)).toBe(false);
  });

  test('free user IS blocked by premium-feature-gate (gate is real)', async ({
    freeJwt,
  }) => {
    const result = await gqlFetchEnvelope(
      freeJwt,
      PREMIUM_GATED_QUERY,
      GATE_VARS,
    );
    // Confirms the gate actually fires for free users — otherwise the premium
    // assertions above would be vacuously true.
    expect(isPremiumGated(result)).toBe(true);
  });
});
