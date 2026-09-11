/**
 * Home dashboard — LeagueListRow phase coverage (LS-8754)
 *
 * `LeagueListRow` (lib/shared-components/src/features/home/HomeScreen.tsx)
 * shows different contextual status depending on where a league sits in its
 * lifecycle: a live-draft indicator, an in-progress matchup score, a
 * scheduled draft date, or a plain win-loss record. This suite seeds one
 * league per phase in a single `GetUserLeagueSummaries` response and asserts
 * each row renders its correct score/status label — and its era/team-count/
 * commissioner metadata — without throwing.
 *
 * `sortByUrgency` always promotes the single most urgent league to the
 * dashboard's hero card (`LeagueHeroCard`/`PlayboardHeroCard`), not
 * `LeagueListRow` — so a dedicated, most-urgent "Hero Occupier" league is
 * seeded here purely to soak up that slot, keeping all four phases under
 * test in the row list where the component under test actually renders.
 *
 * The wide (desktop) dashboard branch renders every remaining league as a
 * `LeagueListRow`; the narrow ("Scoreboard First") branch caps the inline
 * list to `MAX_INLINE_LEAGUES - 1` (currently 1) rows, so this suite only
 * runs on desktop-width projects — see the `isNarrowProject` skip below,
 * the same pattern used in home-standings-lazy-load.spec.ts.
 *
 * Kept hermetic (all GraphQL mocked via `route.fulfill`) rather than hitting
 * a live backend, per the E2E hermeticity rule in AGENTS.md.
 */

import { expect, test } from '../fixtures/auth';
import { isGraphQLEndpoint } from '../mocks/graphql/router';
import { extractOperationName } from '../fixtures/shared-mocks';

const SUMMARIES = [
  // Most urgent (live draft) — becomes the hero card, not a LeagueListRow.
  {
    __typename: 'UserLeagueSummary',
    leagueId: 300,
    leagueName: 'Hero Occupier',
    sport: 'baseball',
    leaguePhase: 'pre-draft',
    seasonNumber: 1,
    draftStatus: 'in-progress',
    draftScheduledAt: null,
    draftMode: 'Auction',
    selectionMethod: 'auction',
    teamCount: 10,
    currentWeekNumber: null,
    totalMatchups: null,
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
  // Live draft, tied for most-urgent — pushed into the row list because it
  // sorts after "Hero Occupier" (stable sort preserves array order for ties).
  {
    __typename: 'UserLeagueSummary',
    leagueId: 302,
    leagueName: 'Iron Horse Dynasty',
    sport: 'baseball',
    leaguePhase: 'pre-draft',
    seasonNumber: 1,
    draftStatus: 'in-progress',
    draftScheduledAt: null,
    draftMode: 'Snake',
    selectionMethod: 'snake',
    teamCount: 12,
    currentWeekNumber: null,
    totalMatchups: null,
    matchupId: null,
    matchupStatus: null,
    matchupEndTime: null,
    userScore: null,
    opponentScore: null,
    opponentTeamName: null,
    eraFilter: 'all',
    customEraStartYear: null,
    customEraEndYear: null,
    isCommissioner: true,
  },
  // Active season with a matchup currently being scored.
  {
    __typename: 'UserLeagueSummary',
    leagueId: 303,
    leagueName: 'Rival FC',
    sport: 'football',
    leaguePhase: 'active',
    seasonNumber: 2,
    draftStatus: 'completed',
    draftScheduledAt: null,
    draftMode: 'Snake',
    selectionMethod: 'snake',
    teamCount: 8,
    currentWeekNumber: 9,
    totalMatchups: 14,
    matchupId: 7,
    matchupStatus: 'in_progress',
    matchupEndTime: null,
    userScore: 12.5,
    opponentScore: 9.25,
    opponentTeamName: 'Blitz Squad',
    eraFilter: 'custom',
    customEraStartYear: 1990,
    customEraEndYear: 2000,
    isCommissioner: false,
  },
  // Pre-draft, with a scheduled draft date (AC: must render without error).
  {
    __typename: 'UserLeagueSummary',
    leagueId: 301,
    leagueName: 'Deadball Diamonds',
    sport: 'baseball',
    leaguePhase: 'pre-draft',
    seasonNumber: 1,
    draftStatus: 'not-started',
    draftScheduledAt: '2026-04-20T20:00:00.000Z',
    draftMode: 'Snake',
    selectionMethod: 'snake',
    teamCount: 10,
    currentWeekNumber: null,
    totalMatchups: null,
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
  // Completed / off-season league — falls back to the win-loss record.
  {
    __typename: 'UserLeagueSummary',
    leagueId: 304,
    leagueName: 'Sunbelt Sluggers',
    sport: 'baseball',
    leaguePhase: 'completed',
    seasonNumber: 3,
    draftStatus: 'completed',
    draftScheduledAt: null,
    draftMode: 'Snake',
    selectionMethod: 'snake',
    teamCount: 10,
    currentWeekNumber: null,
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
    leagueId: 304,
    wins: 6,
    losses: 2,
    ties: 0,
    rank: 1,
    totalTeams: 10,
  },
];

test.describe('Home dashboard — LeagueListRow phases @critical', () => {
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

  test('renders every phase branch with its correct score/status label', async ({
    page,
  }, testInfo) => {
    // The narrow ("Scoreboard First") branch caps the inline league list to
    // MAX_INLINE_LEAGUES - 1 rows, so only one of the four seeded phases
    // would render as a LeagueListRow there. The wide dashboard branch
    // (chromium/firefox/webkit at default viewport) renders every
    // non-hero league, which is what this suite needs to exercise all four
    // phases in one pass.
    test.skip(
      testInfo.project.name === 'Mobile Chrome' ||
        testInfo.project.name === 'Mobile Safari',
      'Narrow dashboard layout caps the inline league list to one row',
    );

    await page.goto('/');
    await expect(page.getByText('Hero Occupier')).toBeVisible();

    // Live draft.
    await expect(page.getByText('Iron Horse Dynasty')).toBeVisible();
    await expect(page.getByText('Live', { exact: true })).toBeVisible();
    await expect(page.getByText('Snake', { exact: true })).toBeVisible();

    // Active matchup: user score, opponent score + name.
    await expect(page.getByText('Rival FC')).toBeVisible();
    await expect(page.getByText('12.5', { exact: true })).toBeVisible();
    await expect(page.getByText(/vs 9\.3 Blitz Squad/)).toBeVisible();
    // Era metadata rendered from the custom era range.
    await expect(page.getByText(/1990–2000/)).toBeVisible();

    // Pre-draft: scheduled draft date + label, no crash.
    await expect(page.getByText('Deadball Diamonds')).toBeVisible();
    await expect(page.getByText('Draft scheduled')).toBeVisible();
    await expect(page.getByText(/Apr 20/)).toBeVisible();

    // Completed league: falls back to the win-loss record once standings land.
    await expect(page.getByText('Sunbelt Sluggers')).toBeVisible();
    await expect(page.getByText('6-2', { exact: true })).toBeVisible();
    await expect(page.getByText('Rank #1 of 10')).toBeVisible();

    // Metadata: team count and commissioner tag.
    await expect(page.getByText(/12 teams/)).toBeVisible();
    await expect(page.getByText('You commission this one')).toBeVisible();

    // No error boundary / crash surface for any of the four phases.
    await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
  });
});
