/**
 * Matchup Detail — AI Recap Premium Gate E2E Tests (LS-7629 / LS-8467)
 *
 * QA coverage for the `PremiumGate` wrapper around `MatchupRecapPanel` on
 * `/baseball/league/:leagueId/matchups/:matchupId` — a distinct feature
 * surface from the recap content itself (see
 * docs/agents/qa-coverage/jira-page-epics/pages/baseball-matchup-detail/features/matchup-detail-recap-premium-gate/feature.md):
 *   - Free user sees the `premium-feature-gate` overlay instead of the recap
 *   - Free user sees the gate's `featureDescription` copy
 *   - Premium user sees the recap content, not the overlay
 *   - Free user's "Upgrade to Premium" CTA opens the UpgradeModal
 *
 * The recap panel only renders for a completed matchup
 * (MatchupDetailPage.tsx:251), so every fixture here uses
 * `status: 'completed'`. All GraphQL responses are mocked via
 * `route.fulfill()` only — no live backend is required.
 */

import { createCustomAuthTest, expect } from '../fixtures/auth-enhanced';
import {
  extractOperationName,
  unmockedGraphQLFallback,
  useTier,
} from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LEAGUE_ID = 1;
const MATCHUP_ID = 10;
const MATCHUP_URL = `/baseball/league/${LEAGUE_ID}/matchups/${MATCHUP_ID}`;

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_MATCHUP = {
  __typename: 'Matchup',
  id: MATCHUP_ID,
  leagueId: LEAGUE_ID,
  weekNumber: 3,
  team1Id: 1,
  team2Id: 2,
  team1Score: 42.5,
  team2Score: 38.1,
  // Real MatchupStatus enum value (lib/graphql) is lowercase 'completed' —
  // the recap panel block only renders when matchup.status === 'completed'.
  status: 'completed',
  statsLoadingStatus: 'complete',
  gamesPerMatchup: 7,
  pitcherStartsPerMatchup: 2,
  selectedGamesCount: 7,
  startTime: null,
  endTime: null,
};

const MOCK_TEAMS = [
  {
    __typename: 'Team',
    id: 1,
    name: 'Alpha Squad',
    leagueId: LEAGUE_ID,
    waiverOrder: 1,
    faabBudget: 100,
    isLocked: false,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
    avatarUrl: null,
    bannerUrl: null,
    managerId: 1,
  },
  {
    __typename: 'Team',
    id: 2,
    name: 'Beta Force',
    leagueId: LEAGUE_ID,
    waiverOrder: 2,
    faabBudget: 100,
    isLocked: false,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
    avatarUrl: null,
    bannerUrl: null,
    managerId: 2,
  },
];

const RECAP_HEADLINE = 'Alpha Squad edges out Beta Force in a nail-biter';

const MOCK_RECAP = {
  __typename: 'MatchupRecap',
  headline: RECAP_HEADLINE,
  narrative:
    'A back-and-forth battle down to the final inning, with Alpha Squad pulling ahead late.',
  highlights: ['Alpha Squad closed the week on a hot streak.'],
  matchupType: 'close',
  winnerId: 1,
};

// ---------------------------------------------------------------------------
// Route handler factory
// ---------------------------------------------------------------------------

/**
 * Mocks every GraphQL operation the matchup detail page issues for a
 * completed matchup. `GetMatchupRecap` (fired by `MatchupRecapPanel`
 * regardless of entitlement, since `PremiumGate` always mounts its children)
 * always returns a non-null recap so the premium pass-through path has
 * content to assert against.
 */
async function mockMatchupRecapGraphQL(page: import('@playwright/test').Page) {
  await page.route(isGraphQLEndpoint, async (route) => {
    const op = extractOperationName(route);

    if (op === 'GetMatchupById') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getMatchupById: MOCK_MATCHUP } }),
      });
    } else if (op === 'GetMatchupsForLeague') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { getMatchupsForLeague: [MOCK_MATCHUP] },
        }),
      });
    } else if (op === 'GetCurrentWeekForLeague') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getCurrentWeekForLeague: 3 } }),
      });
    } else if (op === 'GetUserTeamId') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { userTeamId: 1 } }),
      });
    } else if (op === 'GetLeagueTeams') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueTeams: MOCK_TEAMS } }),
      });
    } else if (op === 'GetMatchupRecap') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { getMatchupById: { ...MOCK_MATCHUP, recap: MOCK_RECAP } },
        }),
      });
    } else {
      await unmockedGraphQLFallback(route);
    }
  });
}

// ---------------------------------------------------------------------------
// Fixtures
//
// Non-admin identities so useIsPremium falls through to the GetUserById
// subscriptionTier check rather than short-circuiting on accessLevel ===
// 'admin' — mirrors the pattern in matchup-week-navigation.spec.ts.
// ---------------------------------------------------------------------------

const freeTest = createCustomAuthTest('recap-gate-free@test.com');
const premiumTest = createCustomAuthTest('recap-gate-premium@test.com');

/**
 * Scopes to the recap panel's `premium-feature-gate` overlay specifically.
 * The page also renders a sibling `PremiumGate` around
 * `MatchupWinProbabilityPanel` ("Matchup Projections") — for a free user
 * on a completed matchup that gate's overlay renders too (PremiumGate
 * always renders its own overlay for free users regardless of whether its
 * children render anything), so a bare `getByTestId('premium-feature-gate')`
 * resolves to two elements. Filter by the recap gate's unique
 * featureDescription copy to disambiguate.
 */
function recapGate(page: import('@playwright/test').Page) {
  return page
    .getByTestId('premium-feature-gate')
    .filter({ hasText: /AI-generated narrative recaps/i });
}

// ---------------------------------------------------------------------------
// Tests – free user sees the gate
// ---------------------------------------------------------------------------

freeTest.describe(
  'Matchup Detail Recap – premium gate (free user) @regression',
  () => {
    freeTest.beforeEach(async ({ page }) => {
      await mockMatchupRecapGraphQL(page);
      await useTier(page, 'free');
      await page.goto(MATCHUP_URL);
      await page.waitForLoadState('load');
    });

    freeTest(
      'free user sees the premium-feature-gate overlay instead of the recap',
      async ({ page }) => {
        // PremiumGate blurs (CSS filter) rather than removes its children, so
        // the recap headline remains technically "visible" to Playwright once
        // GetMatchupRecap resolves — assert the overlay is on top instead of
        // asserting the blurred content is hidden (mirrors the win-probability
        // gate tests in matchup-week-navigation.spec.ts, which only assert the
        // overlay + CTA are shown for free users).
        await expect(recapGate(page)).toBeVisible();
        await expect(
          recapGate(page).getByText('Premium Feature'),
        ).toBeVisible();
      },
    );

    freeTest(
      'free user sees the featureDescription copy in the gate overlay',
      async ({ page }) => {
        await expect(
          page.getByText(/AI-generated narrative recaps/i),
        ).toBeVisible();
      },
    );

    freeTest(
      '"Upgrade to Premium" CTA opens the UpgradeModal',
      async ({ page }) => {
        await recapGate(page)
          .getByRole('button', { name: /upgrade to premium/i })
          .click();

        // The UpgradeModal renders a native <dialog> wrapping an ARIA
        // role="dialog" div, so a bare getByRole('dialog') matches two
        // elements (strict-mode violation) — match by accessible name.
        await expect(
          page.getByRole('dialog', { name: /upgrade to premium/i }),
        ).toBeVisible();
      },
    );
  },
);

// ---------------------------------------------------------------------------
// Tests – premium user passes through
// ---------------------------------------------------------------------------

premiumTest.describe(
  'Matchup Detail Recap – premium gate (premium user) @regression',
  () => {
    premiumTest.beforeEach(async ({ page }) => {
      await mockMatchupRecapGraphQL(page);
      await useTier(page, 'premium');
      await page.goto(MATCHUP_URL);
      await page.waitForLoadState('load');
    });

    premiumTest(
      'premium user does not see the premium-feature-gate overlay',
      async ({ page }) => {
        await expect(
          page.getByTestId('premium-feature-gate'),
        ).not.toBeVisible();
        await expect(page.getByText('Premium Feature')).not.toBeVisible();
      },
    );

    premiumTest('premium user sees the recap content', async ({ page }) => {
      await expect(page.getByText(RECAP_HEADLINE)).toBeVisible({
        timeout: 10000,
      });
    });
  },
);
