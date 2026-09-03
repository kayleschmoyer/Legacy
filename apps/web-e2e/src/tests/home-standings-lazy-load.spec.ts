/**
 * Home dashboard — standings lazy-load (LS-9528)
 *
 * The throttled repro for the ticket's core claim: the home page used to render
 * nothing until `GetUserLeagueSummaries` returned, and that query was slow
 * because it fanned out to `StandingsService` for every league.
 *
 * These tests hold `GetUserLeagueStandings` open for `STANDINGS_DELAY_MS` while
 * answering `GetUserLeagueSummaries` immediately, then assert:
 *   1. league cards are on screen *while standings are still in flight*, and
 *   2. records read as an em dash rather than a fabricated "0-0" during that
 *      window, then fill in with the real values once standings land.
 *
 * (2) is the half that keeps this from being a regression: lazy-loading without
 * the tri-state work in `leagueSummaryStats.ts` would trade a slow page for one
 * that briefly lies about the user's record.
 */

import { expect, test } from '../fixtures/auth';
import { isGraphQLEndpoint } from '../mocks/graphql/router';
import { extractOperationName } from '../fixtures/shared-mocks';

/** Long enough to assert against, short enough to keep the spec quick. */
const STANDINGS_DELAY_MS = 3000;

const SUMMARIES = [
  {
    __typename: 'UserLeagueSummary',
    leagueId: 101,
    leagueName: 'Iron Glove Dynasty',
    sport: 'baseball',
    leaguePhase: 'active',
    seasonNumber: 3,
    draftStatus: 'completed',
    draftScheduledAt: null,
    draftMode: 'snake',
    selectionMethod: 'snake',
    teamCount: 10,
    currentWeekNumber: 9,
    totalMatchups: 22,
    matchupId: null,
    matchupStatus: null,
    matchupEndTime: null,
    userScore: null,
    opponentScore: null,
    opponentTeamName: null,
    eraFilter: 'all',
    customEraStartYear: null,
    customEraEndYear: null,
    isCommissioner: false,
  },
];

const STANDINGS = [
  {
    __typename: 'UserLeagueStandings',
    leagueId: 101,
    wins: 6,
    losses: 2,
    ties: 0,
    rank: 1,
    totalTeams: 10,
  },
];

test.describe('Home standings lazy-load @critical', () => {
  test.beforeEach(async ({ page }) => {
    await page.route(isGraphQLEndpoint, async (route) => {
      const op = extractOperationName(route).toLowerCase();

      if (op === 'getuserleaguesummaries') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { getUserLeagueSummaries: SUMMARIES } }),
        });
        return;
      }

      if (op === 'getuserleaguestandings') {
        // The throttle: stall standings well past first paint.
        await new Promise((resolve) => setTimeout(resolve, STANDINGS_DELAY_MS));
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { getUserLeagueStandings: STANDINGS } }),
        });
        return;
      }

      await route.fallback();
    });
  });

  test('renders league cards while standings are still in flight', async ({
    page,
  }) => {
    const start = Date.now();
    await page.goto('/');

    // The league name comes from the summaries query, so it must be painted
    // long before the standings request settles.
    await expect(page.getByText('Iron Glove Dynasty')).toBeVisible({
      timeout: STANDINGS_DELAY_MS - 500,
    });

    expect(Date.now() - start).toBeLessThan(STANDINGS_DELAY_MS);
  });

  test('shows an em dash, never a fabricated 0-0, until standings arrive', async ({
    page,
  }, testInfo) => {
    // The "· Overall 6-2" aggregate only renders in GreetingHeader, which is
    // used by the wide-viewport dashboard branch; the narrow ("Scoreboard
    // First") branch renders GreetingRow instead and has no aggregate stat
    // (HomeScreen.tsx isNarrow branch, LS-8794/LS-9055) — so it never appears
    // on the mobile projects (LS-9493).
    const isNarrowProject =
      testInfo.project.name === 'Mobile Chrome' ||
      testInfo.project.name === 'Mobile Safari';

    await page.goto('/');
    const heroCard = page.getByTestId('home-hero-card');
    await expect(page.getByText('Iron Glove Dynasty')).toBeVisible();

    // The defect this ticket exists to avoid: a 6-2 league reading "0-0" and
    // then correcting itself. The card shows an em dash in the meantime.
    await expect(page.getByText('0-0')).toHaveCount(0);
    // exact:true so this resolves the standing stat's em-dash placeholder
    // alone — a substring match also hits every card string containing an
    // em dash (the era descriptor, the stub label).
    await expect(heroCard.getByText('—', { exact: true })).toBeVisible();

    // ...and the real values land once the throttled query resolves. Scoped to
    // the card because the header's aggregate renders "6-2" too — asserting
    // both is the point: they come from the same merged payload.
    await expect(heroCard.getByText('6-2')).toBeVisible({
      timeout: STANDINGS_DELAY_MS + 5000,
    });
    if (!isNarrowProject) {
      // LS-9586: this reads from the same merged payload as the hero card's
      // "6-2" above and always commits in the same React render — but it ran
      // with the bare 3000ms default `expect` timeout while the hero-card
      // assertion above it gets STANDINGS_DELAY_MS+5000. Under CI load that
      // left this assertion with no slack at all against the very query
      // delay it depends on. Match the hero card's timeout so a slow CI
      // runner can't flake this line independently of it.
      await expect(page.getByText('· Overall 6-2')).toBeVisible({
        timeout: STANDINGS_DELAY_MS + 5000,
      });
    }
    await expect(page.getByText('Rank #1')).toBeVisible({
      timeout: STANDINGS_DELAY_MS + 5000,
    });
    await expect(page.getByText('0-0')).toHaveCount(0);
  });
});
