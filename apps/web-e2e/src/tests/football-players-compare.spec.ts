/**
 * Football Player Comparison Page E2E Tests (LS-8465)
 *
 * Covers /football/players/compare — the football counterpart to the baseball
 * /players/compare tool. This page is behind `FootballGate` and is URL-param
 * driven (`?a=<id>&b=<id>`): it fires two parallel `FootballPlayer` queries and
 * renders a side-by-side "VS" table. There is no search/add-player flow here —
 * "adding" two players means deep-linking two ids — so the assertions run
 * through the dedicated {@link FootballPlayersComparePage} page object rather
 * than the baseball comparison object (the two surfaces share no interaction
 * model).
 *
 * AC1 — page renders under FootballGate (flag seeded on) with two NFL players
 *        and football stat-row labels (Pass YDS, Rush YDS, …).
 * AC2 — premium gating consistent with /players/compare (player_comparison
 *        entitlement): free users see the premium-gate overlay, premium users
 *        see the table.
 * AC3 — empty / minimum-player / not-found states asserted.
 *
 * All GraphQL responses are mocked with route.fulfill() (via createGraphQLRouter
 * / useTier); no live-backend passthrough is used, per project hermetic policy.
 */

import { customAuthTest, expect, test, unauthTest } from '../fixtures/pages';
import { enableFootball, useTier } from '../fixtures/shared-mocks';
import { createGraphQLRouter, fulfillJson } from '../mocks/graphql/router';

// ── Mock player fixtures ────────────────────────────────────────────────────

// Two QBs: both have passing stats (so the passing rows render for both), only
// Mahomes has rushing (so a Rush row stays with an em-dash for Allen), and
// neither has kicking/defense (so those rows are hidden). Shape matches the
// `FootballPlayer` query selection (FootballPlayerHeader + DetailExtras);
// unused stat groups are null.
const MAHOMES = {
  __typename: 'FootballPlayer',
  id: 42,
  firstName: 'Patrick',
  lastName: 'Mahomes',
  position: 'QB',
  isDst: false,
  nflTeam: 'KC',
  pfrId: 'MahoPa00',
  headshotUrl: null,
  previousTeams: [],
  projectedFantasyPoints: null,
  adpRank: null,
  careerStats: {
    fantasyPoints: 2200,
    passing: { yds: 28424, td: 219, int: 63, rating: 103.5 },
    rushing: { yds: 1522, td: 18 },
    receiving: null,
    kicking: null,
    defense: null,
    idp: null,
  },
  seasonStats: null,
} as const;

const ALLEN = {
  __typename: 'FootballPlayer',
  id: 7,
  firstName: 'Josh',
  lastName: 'Allen',
  position: 'QB',
  isDst: false,
  nflTeam: 'BUF',
  pfrId: 'AlleJo02',
  headshotUrl: null,
  previousTeams: [],
  projectedFantasyPoints: null,
  adpRank: null,
  careerStats: {
    fantasyPoints: 2100,
    passing: { yds: 21458, td: 165, int: 68, rating: 96.1 },
    rushing: null,
    receiving: null,
    kicking: null,
    defense: null,
    idp: null,
  },
  seasonStats: null,
} as const;

const PLAYERS_BY_ID: Record<number, unknown> = { 42: MAHOMES, 7: ALLEN };

/**
 * Mock the two-per-page `FootballPlayer` queries by id. Unknown ids resolve to
 * `null` so the "Player not found" state can be exercised. Every other operation
 * cascades to the shared baseline.
 */
async function mockFootballCompare(
  page: import('@playwright/test').Page,
  playersById: Record<number, unknown> = PLAYERS_BY_ID,
): Promise<void> {
  await createGraphQLRouter(page, {
    footballplayer: (route, { variables }) => {
      const id = Number(variables.id);
      return fulfillJson(route, {
        data: { footballPlayer: playersById[id] ?? null },
      });
    },
  });
}

// ── AC1 / AC3: page shell + empty state under FootballGate @smoke ────────────

test.describe('Football Player Comparison – page renders under FootballGate @smoke', () => {
  test.beforeEach(async ({ page }) => {
    // AC1: seed football_enabled so the FootballGate flag is explicitly on.
    await enableFootball(page);
    await mockFootballCompare(page);
  });

  test('renders the Compare Players heading with no ids selected', async ({
    page,
    footballComparePage,
  }) => {
    await footballComparePage.goto();

    await expect(page).toHaveURL('/football/players/compare');
    await footballComparePage.expectHeadingVisible();
  });

  test('shows the empty "select two players" prompt when no ids are provided', async ({
    footballComparePage,
  }) => {
    await footballComparePage.goto();

    await footballComparePage.expectSelectTwoPrompt();
    await footballComparePage.expectSelectTwoHint();
  });
});

// ── AC1: two NFL players → comparison table with football stat labels @regression

test.describe('Football Player Comparison – comparison table @regression', () => {
  test.beforeEach(async ({ page, footballComparePage }) => {
    await enableFootball(page);
    await mockFootballCompare(page);
    await useTier(page, 'premium');
    await footballComparePage.goto({ a: 42, b: 7 });
  });

  test('renders both NFL player names side by side', async ({
    footballComparePage,
  }) => {
    await footballComparePage.expectComparisonVisible();
    await footballComparePage.expectPlayerNameVisible('Patrick Mahomes');
    await footballComparePage.expectPlayerNameVisible('Josh Allen');
  });

  test('shows football passing stat rows for both players', async ({
    footballComparePage,
  }) => {
    await footballComparePage.expectStatLabelVisible('Pass YDS');
    await footballComparePage.expectStatLabelVisible('Pass TD');
    await footballComparePage.expectStatLabelVisible('Pass INT');
    await footballComparePage.expectStatLabelVisible('Pass RTG');
    // Career passing yards, formatted with a thousands separator.
    await footballComparePage.expectStatValueVisible('28,424');
    await footballComparePage.expectStatValueVisible('21,458');
  });

  test('keeps a rushing row where only one player has the stat', async ({
    footballComparePage,
  }) => {
    await footballComparePage.expectStatLabelVisible('Rush YDS');
    await footballComparePage.expectStatValueVisible('1,522');
  });

  test('hides stat rows neither player has (kicking / defense)', async ({
    footballComparePage,
  }) => {
    await footballComparePage.expectStatLabelHidden('FG Made');
    await footballComparePage.expectStatLabelHidden('Sacks');
  });

  test('does not gate the table for a premium user', async ({
    footballComparePage,
  }) => {
    await footballComparePage.expectPremiumGateAbsent();
  });
});

// ── AC2: premium gating (player_comparison entitlement) @regression ──────────

const freeUserTest = customAuthTest('freeuser@test.com', 'none');

freeUserTest.describe(
  'Football Player Comparison – premium gate @regression',
  () => {
    freeUserTest.beforeEach(async ({ page }) => {
      await enableFootball(page);
      await mockFootballCompare(page);
      // Pin the current user to free so useHasEntitlement('player_comparison')
      // resolves false and the shared PremiumGate overlay renders (LS-8058).
      await useTier(page, 'free');
    });

    freeUserTest(
      'shows the premium-gate overlay for non-premium users',
      async ({ footballComparePage }) => {
        await footballComparePage.goto({ a: 42, b: 7 });

        await footballComparePage.expectPremiumGateVisible();
      },
    );
  },
);

// ── AC3: minimum-player & not-found states @regression ───────────────────────

test.describe('Football Player Comparison – minimum & not-found states @regression', () => {
  test.beforeEach(async ({ page }) => {
    await enableFootball(page);
    await mockFootballCompare(page);
  });

  test('shows the select-two prompt when only one id is provided', async ({
    footballComparePage,
  }) => {
    await footballComparePage.goto({ a: 42 });

    await footballComparePage.expectSelectTwoPrompt();
  });

  test('shows "Player not found" when a selected id resolves to null', async ({
    footballComparePage,
  }) => {
    // 999 is not in the mock map → the FootballPlayer query resolves null.
    await footballComparePage.goto({ a: 42, b: 999 });

    await footballComparePage.expectPlayerNotFound();
  });
});

// ── Error state: a failed FootballPlayer query @regression ──────────────────

test.describe('Football Player Comparison – query error @regression', () => {
  test('shows the error banner when the FootballPlayer query fails', async ({
    page,
    footballComparePage,
  }) => {
    await enableFootball(page);
    await createGraphQLRouter(page, {
      footballplayer: (route, { variables }) => {
        const id = Number(variables.id);
        if (id === 7) {
          return fulfillJson(route, {
            errors: [{ message: 'Internal server error' }],
          });
        }
        return fulfillJson(route, {
          data: { footballPlayer: PLAYERS_BY_ID[id] ?? null },
        });
      },
    });

    await footballComparePage.goto({ a: 42, b: 7 });

    await footballComparePage.expectErrorBanner();
  });
});

// ── Unauthenticated access: /football/players/compare is a protected route ──
//
// `footballPlayer` (lambdas/db/src/schema/football.ts) requires `context.user`
// and would return an UNAUTHENTICATED error if it were ever reached — but the
// top-level auth guard intercepts unauthenticated visitors before the page (or
// its queries) ever mounts, redirecting to the sign-in landing page. This
// mirrors the existing "protected route" assertion pattern (see
// scoreboard.spec.ts's "navigating … to a protected route shows the login
// gate").

unauthTest.describe(
  'Football Player Comparison – unauthenticated visitor @regression',
  () => {
    unauthTest(
      'shows the sign-in landing page instead of the comparison table',
      async ({ page }) => {
        await page.goto('/football/players/compare?a=42&b=7');
        await page.waitForLoadState('load');

        await expect(
          page.getByRole('button', { name: /continue with google/i }),
        ).toBeVisible({ timeout: 15000 });
      },
    );
  },
);
