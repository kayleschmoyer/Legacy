/**
 * Football Matchups List Tab — E2E Tests (LS-5419)
 *
 * Covers /football/league/:id/matchup — the Matchups List feature:
 *   - Renders every matchup for the current/selected week
 *   - The viewer's own matchup is pinned to the top of the list
 *   - Each card shows a status badge (Live / Final / Scheduled)
 *   - Tapping a card opens that matchup's detail view below the list
 *
 * All GraphQL responses are mocked so no live backend is required.
 */

import { expect, test } from '../fixtures/pages';
import { unmockedGraphQLFallback } from '../fixtures/shared-mocks';
import {
  isGraphQLEndpoint,
  parseGraphQLRequest,
} from '../mocks/graphql/router';

const LEAGUE_ID = 1;
const WEEK = 5;
const USER_MATCHUP_ID = 100;
const OTHER_MATCHUP_ID = 101;

const MOCK_LEAGUE = {
  __typename: 'League',
  id: LEAGUE_ID,
  name: 'Gridiron Legends',
  description: 'E2E football league-detail test league',
  owner: 1,
  sport: 'football',
  maxRosterSize: 25,
  draftStatus: 'completed',
  currentMatchup: USER_MATCHUP_ID,
  currentWeekNumber: WEEK,
  numberOfTeams: 4,
  playerPool: 'all',
  draftMode: 'live',
  selectionMethod: 'standard',
  draftOrder: 'snake',
  isPublic: false,
  maxBatters: null,
  maxPitchers: null,
  tradingEnabled: true,
  waiverEnabled: true,
  startDate: null,
  logoUrl: null,
  bannerUrl: null,
  primaryColor: null,
  secondaryColor: null,
  inviteCode: 'GRID1234',
  userMembership: { teamId: 1 },
  minCareerGames: 0,
  minCareerSeasons: 0,
  waiverType: 'standard',
  leaguePhase: null,
  weekAdvanceStatus: null,
  faabBudgetDefault: null,
  pitcherStartsPerMatchup: null,
  gamesPerMatchup: null,
  totalMatchups: 14,
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
    name: 'Alpha Squad',
    owner: 1,
    leagueId: LEAGUE_ID,
    waiverOrder: 1,
    faabBudget: 100,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
  },
  {
    __typename: 'Team',
    id: 2,
    name: 'Beta Force',
    owner: 2,
    leagueId: LEAGUE_ID,
    waiverOrder: 2,
    faabBudget: 100,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
  },
  {
    __typename: 'Team',
    id: 3,
    name: 'Gamma Rays',
    owner: 3,
    leagueId: LEAGUE_ID,
    waiverOrder: 3,
    faabBudget: 100,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
  },
  {
    __typename: 'Team',
    id: 4,
    name: 'Delta Hawks',
    owner: 4,
    leagueId: LEAGUE_ID,
    waiverOrder: 4,
    faabBudget: 100,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
  },
];

function makeMatchup(overrides: Record<string, unknown> = {}) {
  return {
    __typename: 'Matchup',
    id: String(USER_MATCHUP_ID),
    leagueId: LEAGUE_ID,
    weekNumber: WEEK,
    team1Id: 1,
    team2Id: 2,
    team1Score: 24.5,
    team2Score: 17.0,
    status: 'in_progress',
    statsLoadingStatus: 'COMPLETE',
    gamesPerMatchup: null,
    pitcherStartsPerMatchup: null,
    selectedGamesCount: null,
    startTime: null,
    endTime: null,
    team1: { __typename: 'Team', id: 1, name: 'Alpha Squad' },
    team2: { __typename: 'Team', id: 2, name: 'Beta Force' },
    ...overrides,
  };
}

// The viewer's own matchup — deliberately listed SECOND in GetMatchupsByWeek
// so a passing "pinned to top" assertion can't be a no-op from server ordering.
const USER_MATCHUP = makeMatchup();

const OTHER_MATCHUP = makeMatchup({
  id: String(OTHER_MATCHUP_ID),
  team1Id: 3,
  team2Id: 4,
  team1Score: 0,
  team2Score: 0,
  status: 'scheduled',
  team1: { __typename: 'Team', id: 3, name: 'Gamma Rays' },
  team2: { __typename: 'Team', id: 4, name: 'Delta Hawks' },
  // Premium projection engine output (LS-6323) — server-gated by
  // ENTITLEMENTS.matchup_projections, null for completed matchups.
  winProbability: {
    __typename: 'MatchupWinProbability',
    team1ProjectedScore: 124.5,
    team2ProjectedScore: 118.2,
  },
});

const WEEK_MATCHUPS = [OTHER_MATCHUP, USER_MATCHUP];

async function mockFootballMatchupsGraphQL(
  page: import('@playwright/test').Page,
) {
  await page.route(isGraphQLEndpoint, async (route) => {
    const { op, variables } = parseGraphQLRequest(route);

    if (op === 'getleaguebyid') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { league: MOCK_LEAGUE } }),
      });
    } else if (op === 'getleagueteams') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueTeams: MOCK_TEAMS } }),
      });
    } else if (op === 'getuserteamid') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { userTeamId: 1 } }),
      });
    } else if (op === 'getcurrentweekforleague') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getCurrentWeekForLeague: WEEK } }),
      });
    } else if (op === 'getmatchupsbyweek') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getMatchupsByWeek: WEEK_MATCHUPS } }),
      });
    } else if (op === 'getmatchupsforleague') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getMatchupsForLeague: WEEK_MATCHUPS } }),
      });
    } else if (op === 'getmatchupbyid') {
      const requestedId = (variables as { id?: number }).id ?? null;
      const found =
        WEEK_MATCHUPS.find((m) => m.id === String(requestedId)) ?? USER_MATCHUP;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getMatchupById: found } }),
      });
    } else if (op === 'getmatchupplayers') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getMatchupPlayers: [] } }),
      });
    } else if (op === 'getleaguescoringprofile') {
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

test.describe('Football Matchups List — pinned ordering & status @regression', () => {
  test.beforeEach(async ({ page }) => {
    await mockFootballMatchupsGraphQL(page);
    await page.goto(`/football/league/${LEAGUE_ID}/matchup`);
  });

  test('renders a matchup card for every matchup in the week', async ({
    page,
  }) => {
    const list = page.getByTestId('matchups-list');
    await expect(list).toBeVisible();
    await expect(list.getByTestId('matchup-card')).toHaveCount(2);
  });

  test("pins the viewer's matchup to the top of the list", async ({ page }) => {
    const cards = page.getByTestId('matchups-list').getByTestId('matchup-card');
    await expect(cards).toHaveCount(2);
    // Alpha Squad (the viewer's team) must appear in the first card, even
    // though GetMatchupsByWeek returned it second (LS-5419 AC).
    await expect(cards.nth(0)).toContainText('Alpha Squad');
    await expect(cards.nth(1)).toContainText('Gamma Rays');
  });

  test('shows a status badge for each matchup (Live / Scheduled)', async ({
    page,
  }) => {
    const list = page.getByTestId('matchups-list');
    await expect(list.getByText('Live', { exact: true })).toBeVisible();
    await expect(list.getByText('Scheduled', { exact: true })).toBeVisible();
  });

  test('shows the projected score for a matchup with premium projections (LS-6323)', async ({
    page,
  }) => {
    const card = page
      .getByTestId('matchups-list')
      .getByTestId('matchup-card')
      .filter({ hasText: 'Gamma Rays' });
    await expect(card.getByText('Proj 124.50')).toBeVisible();
    await expect(card.getByText('Proj 118.20')).toBeVisible();
  });

  test("tapping another matchup's card opens its detail view", async ({
    page,
  }) => {
    // Before tapping, "Gamma Rays" only appears once — inside its list card.
    await expect(page.getByText('Gamma Rays')).toHaveCount(1);

    const list = page.getByTestId('matchups-list');
    await list
      .getByTestId('matchup-card')
      .filter({ hasText: 'Gamma Rays' })
      .click();

    // After tapping, the detail view below the list (scoreboard hero +
    // roster comparison) also renders the selected matchup, so the team
    // name now appears in more places. The exact count is an implementation
    // detail of how many detail sub-components render the name, so assert
    // it strictly increased rather than pinning an exact total.
    await expect
      .poll(() => page.getByText('Gamma Rays').count())
      .toBeGreaterThan(1);
  });
});
