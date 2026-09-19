/**
 * Home dashboard — standings lazy-load (LS-9528)
 *
 * The throttled repro for the ticket's core claim: the home page used to render
 * nothing until `GetUserLeagueSummaries` returned, and that query was slow
 * because it fanned out to `StandingsService` for every league.
 *
 * These tests hold `GetUserLeagueStandings` open until the test explicitly
 * releases it, while answering `GetUserLeagueSummaries` immediately, then
 * assert:
 *   1. league cards are on screen *while standings are still in flight*, and
 *   2. records read as an em dash rather than a fabricated "0-0" during that
 *      window, then fill in with the real values once standings land.
 *
 * (2) is the half that keeps this from being a regression: lazy-loading without
 * the tri-state work in `leagueSummaryStats.ts` would trade a slow page for one
 * that briefly lies about the user's record.
 *
 * The hold is a gate, not a timer (LS-10219): a wall-clock budget measured
 * from `page.goto` also counts navigation and browser startup, which on a slow
 * CI runner (Mobile Safari) exceeds any fixed delay even when the cards really
 * did render first. Gating standings on an explicit release proves the
 * ordering on every engine regardless of runner speed.
 */

import { expect, test } from '../fixtures/auth';
import { isGraphQLEndpoint } from '../mocks/graphql/router';
import { extractOperationName } from '../fixtures/shared-mocks';

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
  /** Resolves once the app has issued the standings request. */
  let standingsRequested: Promise<void>;
  /** Lets the held standings request complete. */
  let releaseStandings: () => void;

  test.beforeEach(async ({ page }) => {
    let markRequested!: () => void;
    standingsRequested = new Promise((resolve) => {
      markRequested = resolve;
    });
    const released = new Promise<void>((resolve) => {
      releaseStandings = resolve;
    });

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
        // The gate: standings stay in flight until the test releases them.
        markRequested();
        await released;
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
    await page.goto('/');

    // Standings are held open, so the card can only appear if it does not
    // wait on them. A regression that gates cards on standings times out here.
    await expect(page.getByText('Iron Glove Dynasty')).toBeVisible();

    // ...and the request really is in flight (not merely never sent): the app
    // issued it, and the card still shows the placeholder, not the record.
    await standingsRequested;
    const heroCard = page.getByTestId('home-hero-card');
    await expect(heroCard.getByText('—', { exact: true })).toBeVisible();
    await expect(heroCard.getByText('6-2')).toHaveCount(0);

    // Releasing the gate fills the record in.
    releaseStandings();
    await expect(heroCard.getByText('6-2')).toBeVisible();
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
    releaseStandings();

    // ...and the real values land once the held query is released. Scoped to
    // the card because the header's aggregate renders "6-2" too — asserting
    // both is the point: they come from the same merged payload.
    await expect(heroCard.getByText('6-2')).toBeVisible();
    if (!isNarrowProject) {
      // Same merged payload as the hero card's "6-2" above, committed in the
      // same React render. (LS-9586 widened these timeouts to outlast a fixed
      // standings delay; the delay is now a release gate, so the default
      // `expect` timeout applies to all three alike.)
      await expect(page.getByText('· Overall 6-2')).toBeVisible();
    }
    await expect(page.getByText('Rank #1')).toBeVisible();
    await expect(page.getByText('0-0')).toHaveCount(0);
  });
});
