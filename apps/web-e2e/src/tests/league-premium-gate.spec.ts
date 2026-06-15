/**
 * League Premium Gate — E2E Tests (LS-5030)
 *
 * Covers premium gating on:
 *   - /baseball/league/:id        → LeagueDetailPageV2 wrapped in PremiumGate
 *
 * The live draft route (/baseball/league/:id/draft) is intentionally NOT gated
 * — drafting is a free, core feature (PR #5283 un-gated EliteDraftBoard).
 *
 * Scenarios:
 *   - Free user sees premium overlay on the league detail route
 *   - Premium user sees content (no overlay) on the league detail route
 *   - "Upgrade to Premium" CTA opens the UpgradeModal
 *
 * All GraphQL responses are mocked so no live backend is required.
 */

import { createCustomAuthTest, expect } from '../fixtures/auth-enhanced';
import {
  extractOperationName,
  unmockedGraphQLFallback,
  useTier,
} from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

// ---------------------------------------------------------------------------
// Shared mock data
// ---------------------------------------------------------------------------

const MOCK_LEAGUE = {
  __typename: 'League',
  id: 1,
  name: 'Test League',
  description: null,
  owner: 1,
  maxRosterSize: 25,
  draftStatus: 'pre-draft',
  currentMatchup: null,
  numberOfTeams: 4,
  playerPool: 'all',
  draftMode: 'live',
  selectionMethod: 'standard',
  draftOrder: 'snake',
  isPublic: false,
  maxBatters: 14,
  maxPitchers: 9,
  tradingEnabled: true,
  waiverEnabled: true,
  startDate: null,
  logoUrl: null,
  bannerUrl: null,
  primaryColor: null,
  secondaryColor: null,
  inviteCode: 'TEST1234',
  userMembership: { teamId: 1 },
  minCareerGames: 50,
  minCareerSeasons: 3,
  waiverType: 'standard',
  currentWeekNumber: 1,
  leaguePhase: null,
  weekAdvanceStatus: null,
  faabBudgetDefault: null,
  pitcherStartsPerMatchup: 1,
  gamesPerMatchup: 5,
  totalMatchups: 10,
  playoffEnabled: true,
  playoffFormat: '4-team',
  playoffMultiWeek: false,
  lmNotes: null,
  isMockDraft: false,
  previousLeagueId: null,
  frozenAt: null,
  seasonNumber: 1,
  salaryCapEnabled: false,
  salaryCap: null,
  salaryFloor: null,
  luxuryTaxThreshold: null,
  minSalary: null,
  salaryEscalationPct: null,
  salaryDecayPct: null,
  auctionBudget: null,
  auctionMinBid: null,
  eraFilter: null,
  baseballHofOnly: false,
  customEraStartYear: null,
  customEraEndYear: null,
};

const MOCK_TEAMS = [
  {
    __typename: 'Team',
    id: 1,
    name: 'My Team',
    owner: 1,
    leagueId: 1,
    waiverOrder: 1,
    faabBudget: 100,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
  },
];

const MOCK_POSITIONS = [
  { __typename: 'LeaguePosition', id: 1, leagueId: 1, positionType: 'C' },
  { __typename: 'LeaguePosition', id: 2, leagueId: 1, positionType: '1B' },
];

// ---------------------------------------------------------------------------
// GraphQL mock helpers
//
// The user's entitlement tier (free vs premium) is no longer mocked ad-hoc here
// — it now comes from the shared `useTier(page, tier)` helper (LS-8056), the one
// source of truth for entitlement state. This helper only mocks the
// league-specific scenario data; the per-test `beforeEach` calls `useTier`
// alongside it.
// ---------------------------------------------------------------------------

async function mockLeagueGraphQL(page: import('@playwright/test').Page) {
  await page.route(isGraphQLEndpoint, async (route) => {
    const op = extractOperationName(route);

    if (op === 'GetMySubscription') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { mySubscription: null } }),
      });
    } else if (op === 'GetStripePrices') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            stripePrices: {
              monthlyPriceCents: 499,
              annualTotalCents: 3999,
              monthlyPriceId: 'price_monthly_test',
              annualPriceId: 'price_annual_test',
              trialPeriodDays: 0,
            },
          },
        }),
      });
    } else if (op === 'GetLeagueById') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { league: MOCK_LEAGUE } }),
      });
    } else if (op === 'GetLeagueTeams') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueTeams: MOCK_TEAMS } }),
      });
    } else if (op === 'GetPositionsForLeague') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leaguePositions: MOCK_POSITIONS } }),
      });
    } else if (op === 'GetUserTeamId') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { userTeamId: 1 } }),
      });
    } else if (op === 'GetLeagueScoringProfile') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueScoringProfile: null } }),
      });
    } else {
      await unmockedGraphQLFallback(route);
    }
  });
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const freeUserTest = createCustomAuthTest('freeuser@test.com', 'none');
const premiumUserTest = createCustomAuthTest('premiumuser@test.com', 'none');

// ---------------------------------------------------------------------------
// Tests: Free user sees premium gate on league detail @regression
// ---------------------------------------------------------------------------

freeUserTest.describe(
  'League Detail – premium gate for free users @regression',
  () => {
    freeUserTest.beforeEach(async ({ page }) => {
      await mockLeagueGraphQL(page);
      await useTier(page, 'free');
      await page.goto('/baseball/league/1');
      await page.waitForLoadState('load');
    });

    freeUserTest(
      'shows "Premium Feature" heading in the gate overlay',
      async ({ page }) => {
        await expect(page.getByText(/premium feature/i)).toBeVisible();
      },
    );

    freeUserTest(
      'shows "Upgrade to Premium" button in the gate overlay',
      async ({ page }) => {
        await expect(
          page
            .getByTestId('premium-feature-gate')
            .getByRole('button', { name: /upgrade to premium/i }),
        ).toBeVisible();
      },
    );

    freeUserTest(
      '"Upgrade to Premium" CTA opens the UpgradeModal',
      async ({ page }) => {
        await page
          .getByTestId('premium-feature-gate')
          .getByRole('button', { name: /upgrade to premium/i })
          .click();

        // The UpgradeModal renders a native <dialog> wrapping an ARIA
        // role="dialog" div, so a bare getByRole('dialog') matches two elements
        // (strict-mode violation). Match by the modal's accessible name to
        // resolve the single labelled dialog.
        await expect(
          page.getByRole('dialog', { name: /upgrade to premium/i }),
        ).toBeVisible();
      },
    );
  },
);

// ---------------------------------------------------------------------------
// NOTE (LS-8010): the "/baseball/league/:id/draft" premium-gate tests were
// removed. Per product intent the live draft must be FREE — gating it (LS-5030)
// was a bug, now reverted by un-gating EliteDraftBoard (the `PremiumGate`
// wrapper was deleted in PR #5283). Asserting the draft gate here would
// entrench that bug. Draft access is covered by the draft-* specs
// (draft-selection-workflow, auction-draft, mid-draft-trades), which expect a
// FREE draft board. Only the draft *recommendations* inside the board remain
// premium. See docs/product/subscription-tiers.md.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Tests: Premium user sees full content on league detail @regression
// ---------------------------------------------------------------------------

premiumUserTest.describe(
  'League Detail – no gate for premium users @regression',
  () => {
    premiumUserTest.beforeEach(async ({ page }) => {
      await mockLeagueGraphQL(page);
      await useTier(page, 'premium');
      await page.goto('/baseball/league/1');
      await page.waitForLoadState('load');
    });

    premiumUserTest(
      'does not show the premium gate overlay',
      async ({ page }) => {
        await expect(
          page.getByTestId('premium-feature-gate'),
        ).not.toBeVisible();
      },
    );

    premiumUserTest(
      'renders the league name in the shell',
      async ({ page }) => {
        await expect(page.getByText(/test league/i).first()).toBeVisible();
      },
    );
  },
);
