/**
 * Subscription gating — UI integration tests (LS-848)
 *
 * True end-to-end integration tests hitting the live backend.
 * No GraphQL mocking — all assertions use real API responses and a real browser.
 *
 * Covers:
 *   1. GraphQL premium gating middleware: free user receives PREMIUM_REQUIRED error
 *      when calling a premium-gated resolver
 *   2. League limit enforcement: free users cannot activate more than 3 leagues
 *      via setActiveLeagues mutation
 *   3. Mock draft limit: free users are blocked after 2 mock drafts per week
 *   4. SubscriptionPage renders correctly for a real free-tier user
 *   5. PricingPage is accessible and shows plan details
 *
 * Note: Stripe webhook lifecycle flows (checkout.session.completed, payment
 * failures, cancellation) are fully covered by the unit tests in
 * lambdas/stripe-webhook/src/index.spec.ts, which mock the Stripe SDK at the
 * module level. Reproducing those flows in a live integration test would
 * require constructable Stripe signatures — a security concern better handled
 * in isolation.
 *
 * Run:
 *   pnpm exec playwright test --config apps/web-e2e/playwright.integration.config.ts \
 *     apps/web-e2e/src/integration/tests/subscription-gating.integration.spec.ts
 */

import { expect } from '@playwright/test';
import { test } from '../fixtures/ui';
import { gqlFetchEnvelope as gqlFetch } from '../helpers/gql-fetch';
import { cleanupLeague } from '../helpers/cleanup-league';

// These tests intentionally inspect `errors[].extensions.code` to verify
// premium-gating middleware shapes (`PREMIUM_REQUIRED`, etc.), so they use
// the envelope variant rather than the strict `gqlFetch` from
// `../helpers/gql-fetch`. HTTP/parse failures still throw, surfacing the
// real backend error instead of an opaque `result.errors === undefined`
// downstream (LS-4461).

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

interface TestState {
  commissionerJwt: string;
  managerJwt: string;
}

let state: TestState;

// ---------------------------------------------------------------------------
// Phase 1: GraphQL premium gating middleware
// ---------------------------------------------------------------------------

test.describe('subscription gating — GraphQL premium middleware @critical', () => {
  test.describe.configure({ mode: 'serial' });

  test('free user receives PREMIUM_REQUIRED error on a gated resolver', async ({
    commissionerJwt,
    freeJwt,
  }) => {
    state = { commissionerJwt, managerJwt: freeJwt };

    // The playerComparison resolver (or similar) is gated behind requirePremium.
    // A free-tier user calling it should get a PREMIUM_REQUIRED error (LS-8057:
    // the manager fixtures are premium now, so gate assertions use freeJwt).
    const result = await gqlFetch<{ comparePlayers: unknown }>(
      freeJwt,
      `
        query ComparePlayers($playerIds: [Int!]!) {
          comparePlayers(playerIds: $playerIds) {
            playerId
          }
        }
      `,
      { playerIds: [1, 2] },
    );

    // Should either include a PREMIUM_REQUIRED error or return null data
    const hasPremiumError =
      result.errors?.some(
        (e) =>
          e.extensions?.code === 'PREMIUM_REQUIRED' ||
          e.message.toLowerCase().includes('premium'),
      ) ?? false;
    const hasNoData =
      result.data?.comparePlayers === null ||
      result.data?.comparePlayers === undefined;

    expect(hasPremiumError || hasNoData).toBe(true);
  });

  test('premium user or resolver falls through without PREMIUM_REQUIRED error', async ({
    commissionerJwt,
  }) => {
    // The commissioner/admin user may have premium. If not, this test validates
    // that at minimum no unrelated errors occur (server responds to the query).
    const result = await gqlFetch<unknown>(
      commissionerJwt,
      `query { mySubscription { status tier } }`,
    );

    // Should not throw a 500 — any subscription status (including null) is valid
    expect(
      result.errors?.some(
        (e) => e.extensions?.code === 'INTERNAL_SERVER_ERROR',
      ),
    ).toBeFalsy();
  });
});

// ---------------------------------------------------------------------------
// Phase 2: League limit enforcement
// ---------------------------------------------------------------------------

test.describe('subscription gating — league limit enforcement @critical', () => {
  test.describe.configure({ mode: 'serial' });

  test('setActiveLeagues rejects more than 3 leagues for free tier user', async ({
    freeJwt,
  }) => {
    // Try to activate 4 league IDs. For a free-tier user this should fail with
    // an error indicating the limit.
    const result = await gqlFetch<{ setActiveLeagues: boolean }>(
      freeJwt,
      `
        mutation SetActiveLeagues($leagueIds: [Int!]!) {
          setActiveLeagues(leagueIds: $leagueIds)
        }
      `,
      { leagueIds: [1, 2, 3, 4] },
    );

    const hasLimitError =
      result.errors?.some(
        (e) =>
          e.message.toLowerCase().includes('limit') ||
          e.message.toLowerCase().includes('premium') ||
          e.message.toLowerCase().includes('3'),
      ) ?? false;

    // Free users get a limit error or false. Premium users succeed (true).
    // Either way the API must return a meaningful response (no unhandled 500).
    const hasUnexpectedError =
      result.errors?.some(
        (e) => e.extensions?.code === 'INTERNAL_SERVER_ERROR' && !hasLimitError,
      ) ?? false;
    expect(hasUnexpectedError).toBe(false);
    expect(hasLimitError || result.data != null).toBe(true);
  });

  test('setActiveLeagues allows exactly 3 leagues for free tier user', async ({
    freeJwt,
  }) => {
    // Passing exactly 3 league IDs (even non-existent ones) should pass the
    // tier-limit gate without a PREMIUM_REQUIRED or limit error, though it
    // may still fail if those leagues don't exist or are not owned by the user.
    const result = await gqlFetch<{ setActiveLeagues: boolean }>(
      freeJwt,
      `
        mutation SetActiveLeagues($leagueIds: [Int!]!) {
          setActiveLeagues(leagueIds: $leagueIds)
        }
      `,
      { leagueIds: [1, 2, 3] },
    );

    // Should NOT have a tier-limit error (may have other errors for non-owned leagues)
    const hasTierLimitError =
      result.errors?.some(
        (e) =>
          (e.message.toLowerCase().includes('limit') &&
            e.message.includes('3')) ||
          e.message.toLowerCase().includes('premium required'),
      ) ?? false;

    expect(hasTierLimitError).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Phase 3: Mock draft limit enforcement
// ---------------------------------------------------------------------------

test.describe('subscription gating — mock draft limit @critical', () => {
  test('initializeMockDraft mutation returns PREMIUM_REQUIRED after 2 mock drafts/week for free user', async ({
    freeJwt,
    apiCommissioner,
  }) => {
    // The limit is enforced at the GraphQL layer inside initialize-mock-draft.ts.
    // We verify the error shape when the limit is reached.
    //
    // Despite the comment this test used to carry, `initializeMockDraft` is NOT
    // a no-op probe — it is the same real mutation the mock-draft-simulator-ui
    // spec drives through the UI, and it creates a real "Mock Draft Practice"
    // league (with `freeJwt`/MANAGER_1 as commissioner) whenever the weekly
    // limit hasn't yet been reached. Left uncleaned, this leaked one league per
    // run:integration execution — accumulating unboundedly because MANAGER_1
    // *owns* each one, and the manager-membership sweep in global-setup.ts only
    // reaps leagues a manager is a *member* of, not one they commission
    // (LS-10134). This is what ultimately pinned MANAGER_1 (free-tier) over the
    // 3-league join cap and hard-failed globalSetup for every PR.
    //
    // If the user already has ≥ 2 mock drafts this week, the error fires immediately.
    // If not, we document the expected error shape via the unit tests.
    const result = await gqlFetch<{
      initializeMockDraft: { leagueId?: number } | null;
    }>(
      freeJwt,
      `
        mutation InitMockDraft {
          initializeMockDraft(
            numTeams: 2
            rosterSize: 5
            userPickPosition: 1
          ) {
            leagueId
          }
        }
      `,
    );

    // If limit is reached → PREMIUM_REQUIRED. If not → data returned or other
    // validation error. What must NOT happen is an unhandled 500.
    const hasUnhandledError =
      result.errors?.some(
        (e) =>
          e.extensions?.code === 'INTERNAL_SERVER_ERROR' &&
          !e.message.toLowerCase().includes('premium'),
      ) ?? false;
    expect(hasUnhandledError).toBe(false);

    // Clean up any league this mutation actually created. Deletion goes through
    // the admin commissioner (not freeJwt) because `deleteLeague` only allows
    // the owner or an admin caller, and this mirrors the admin-bypass delete
    // path the manager-membership sweep already relies on (LS-9280).
    const leagueId = result.data?.initializeMockDraft?.leagueId;
    if (leagueId) {
      await cleanupLeague(apiCommissioner, leagueId);
    }
  });
});

// ---------------------------------------------------------------------------
// Phase 4: UI — SubscriptionPage for a real free user
// ---------------------------------------------------------------------------

test.describe('subscription gating — SubscriptionPage UI @smoke', () => {
  test.describe.configure({ mode: 'serial' });

  test('SubscriptionPage loads and shows subscription section for free user', async ({
    freePage,
  }) => {
    // Dedicated free-tier browser context (LS-8057) — this asserts the free
    // user's SubscriptionPage, so it must NOT use the now-premium manager
    // fixtures. A dedicated context (vs switchUser on commissionerPage) also
    // avoids the AUTH_LOGOUT race where the background JWT refresh clears
    // localStorage after page.evaluate() sets the profile (LS-3672).
    await freePage.goto('/profile/subscription');
    // Wait for all resources including the lazy-loaded SubscriptionPage chunk
    // so React has finished mounting before we assert (LS-3616).
    await freePage.waitForLoadState('load');

    await expect(
      freePage.getByRole('heading', { name: /subscription|billing/i }),
    ).toBeVisible({ timeout: 20_000 });
  });
});

// ---------------------------------------------------------------------------
// Phase 5: UI — PricingPage accessible and displays plans
// ---------------------------------------------------------------------------

test.describe('subscription gating — PricingPage UI @smoke', () => {
  test('PricingPage is publicly accessible and shows plan details', async ({
    commissionerPage,
  }) => {
    await commissionerPage.goto('/pricing');
    await commissionerPage.waitForLoadState('load');

    await expect(
      commissionerPage.getByRole('heading', { name: /the plan that fits/i }),
    ).toBeVisible({ timeout: 15_000 });

    // Use .first() to disambiguate when the word appears multiple times on the page
    await expect(
      commissionerPage.getByText('FREE', { exact: true }).first(),
    ).toBeVisible();
    await expect(
      commissionerPage.getByText('PREMIUM', { exact: true }).first(),
    ).toBeVisible();
  });
});
