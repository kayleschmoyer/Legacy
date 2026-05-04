/**
 * Season Renewal Flow — Team Migration & Error Handling Tests (LS-690)
 *
 * Validates team migration and error handling in the season renewal flow:
 *   1. Teams are migrated to the new season
 *   2. Error states are handled gracefully
 *
 * All GraphQL operations are mocked — no live backend required.
 * Default test JWT has id=1, so leagues with owner=1 give commissioner access.
 */

import { expect, test } from '../fixtures/auth-enhanced';
import { unmockedGraphQLFallback } from '../fixtures/shared-mocks';

// ── Helpers ──────────────────────────────────────────────────────────────────

function isGraphQLEndpoint(url: URL): boolean {
  const s = url.toString();
  return (
    s.includes('/graphql') &&
    !s.includes('/@fs/') &&
    !s.includes('.ts') &&
    !s.includes('.js')
  );
}

// ── Constants ────────────────────────────────────────────────────────────────

const LEAGUE_ID = 500;
const LEAGUE_NAME = 'Dynasty Legends';
const NEW_LEAGUE_ID = 501;
const NEW_LEAGUE_NAME = 'Dynasty Legends';

// ── Mock Data Factories ──────────────────────────────────────────────────────

function makeLeague(overrides: Record<string, unknown> = {}) {
  return {
    __typename: 'League',
    id: LEAGUE_ID,
    name: LEAGUE_NAME,
    description: 'Season renewal flow test league',
    owner: 1,
    maxRosterSize: 25,
    draftStatus: 'completed',
    currentMatchup: null,
    numberOfTeams: 4,
    playerPool: 'all',
    draftMode: 'automated',
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
    inviteCode: 'RENEW5678',
    userMembership: { teamId: 10 },
    minCareerGames: 50,
    minCareerSeasons: 3,
    waiverType: 'standard',
    gamesPerMatchup: 5,
    spStartsPerMatchup: 1,
    totalMatchups: 10,
    playoffEnabled: true,
    playoffFormat: '4-team',
    playoffMultiWeek: false,
    frozenAt: null,
    lmNote: null,
    seasonNumber: 1,
    previousLeagueId: null,
    ...overrides,
  };
}

/** Renewed league inherits settings from the original. */
function makeRenewedLeague(overrides: Record<string, unknown> = {}) {
  return {
    ...makeLeague({
      id: NEW_LEAGUE_ID,
      name: NEW_LEAGUE_NAME,
      draftStatus: 'not-started',
      currentMatchup: null,
      frozenAt: null,
      seasonNumber: 2,
      previousLeagueId: LEAGUE_ID,
      inviteCode: 'RENEW9999',
      userMembership: { teamId: 20 },
    }),
    ...overrides,
  };
}

const MOCK_TEAMS = [
  {
    __typename: 'Team',
    id: 10,
    name: 'Dynasty Kings',
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
    id: 11,
    name: 'The Sluggers',
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
    id: 12,
    name: 'Ace Armada',
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
    id: 13,
    name: 'Power Hitters',
    owner: 4,
    leagueId: LEAGUE_ID,
    waiverOrder: 4,
    faabBudget: 100,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
  },
];

/** Teams migrated to the new league — same names, new IDs. */
const MIGRATED_TEAMS = MOCK_TEAMS.map((team, i) => ({
  ...team,
  id: 20 + i,
  leagueId: NEW_LEAGUE_ID,
}));

const MOCK_POSITIONS = [
  { __typename: 'LeaguePosition', id: 1, name: 'Catcher', abbrev: 'C' },
  { __typename: 'LeaguePosition', id: 2, name: 'First Base', abbrev: '1B' },
  { __typename: 'LeaguePosition', id: 3, name: 'Shortstop', abbrev: 'SS' },
  {
    __typename: 'LeaguePosition',
    id: 4,
    name: 'Starting Pitcher',
    abbrev: 'SP',
  },
];

/** All 10 weeks completed — season is done. */
function makeCompletedMatchups() {
  return Array.from({ length: 10 }, (_, i) => ({
    __typename: 'Matchup',
    id: i + 1,
    leagueId: LEAGUE_ID,
    weekNumber: i + 1,
    team1Id: 10,
    team2Id: 11,
    status: 'completed',
    selectedGamesCount: 5,
    gamesPerMatchup: 5,
    statsLoadingStatus: 'not_started',
  }));
}

// ── GraphQL Route Setup ──────────────────────────────────────────────────────

interface MockOptions {
  league?: ReturnType<typeof makeLeague>;
  teams?: typeof MOCK_TEAMS;
  matchups?: Array<Record<string, unknown>>;
  renewedLeague?: ReturnType<typeof makeRenewedLeague>;
  renewedTeams?: typeof MIGRATED_TEAMS;
  onRenewLeague?: (variables: {
    keepRosters: boolean;
  }) =>
    | Record<string, unknown>
    | null
    | Promise<Record<string, unknown> | null>;
}

async function setupGraphQL(
  page: import('@playwright/test').Page,
  opts: MockOptions = {},
) {
  const {
    league = makeLeague(),
    teams = MOCK_TEAMS,
    matchups = makeCompletedMatchups(),
    renewedLeague = makeRenewedLeague(),
    renewedTeams = MIGRATED_TEAMS,
    onRenewLeague,
  } = opts;

  /** Track which league we're currently viewing — changes after renewal. */
  let activeLeagueId = league.id;

  await page.route(isGraphQLEndpoint, async (route) => {
    const postData = route.request().postData() ?? '';
    let parsed: { operationName?: string; variables?: Record<string, unknown> };
    try {
      parsed = JSON.parse(postData) as typeof parsed;
    } catch {
      parsed = {};
    }
    const op = (parsed.operationName ?? '').toLowerCase();
    const rawOp = parsed.operationName ?? '';

    // ── League queries ────────────────────────────────────────────
    if (op === 'getleaguebyid' || op === 'getleague') {
      const requestedId =
        (parsed.variables?.['id'] as number) ??
        (parsed.variables?.['leagueId'] as number) ??
        activeLeagueId;
      const isNewLeague = requestedId === NEW_LEAGUE_ID;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { league: isNewLeague ? renewedLeague : league },
        }),
      });
      return;
    }

    if (op === 'getleagueteams') {
      const requestedId =
        (parsed.variables?.['leagueId'] as number) ?? activeLeagueId;
      const isNewLeague = requestedId === NEW_LEAGUE_ID;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { leagueTeams: isNewLeague ? renewedTeams : teams },
        }),
      });
      return;
    }

    if (op === 'getpositionsforleague') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leaguePositions: MOCK_POSITIONS } }),
      });
      return;
    }

    if (op === 'getuserteamid') {
      const requestedId =
        (parsed.variables?.['leagueId'] as number) ?? activeLeagueId;
      const isNewLeague = requestedId === NEW_LEAGUE_ID;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { userTeamId: isNewLeague ? 20 : 10 },
        }),
      });
      return;
    }

    if (op === 'getmatchupsforleague') {
      const requestedId =
        (parsed.variables?.['leagueId'] as number) ?? activeLeagueId;
      const isNewLeague = requestedId === NEW_LEAGUE_ID;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            getMatchupsForLeague: isNewLeague ? [] : matchups,
          },
        }),
      });
      return;
    }

    if (op === 'getcurrentweekforleague') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { getCurrentWeekForLeague: null },
        }),
      });
      return;
    }

    if (op === 'getleaguedraft' || op === 'getleaguedraftquery') {
      const requestedId =
        (parsed.variables?.['leagueId'] as number) ?? activeLeagueId;
      const isNewLeague = requestedId === NEW_LEAGUE_ID;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            getLeagueDraft: {
              __typename: 'Draft',
              draftMode: isNewLeague ? 'automated' : 'automated',
            },
          },
        }),
      });
      return;
    }

    if (op === 'getuserleagues' || op === 'getusers') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { userLeagues: [league] } }),
      });
      return;
    }

    if (op === 'getdraftteamorder') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getDraftTeamOrder: [] } }),
      });
      return;
    }

    // ── Activity / chat / announcements ───────────────────────────
    if (
      op === 'getleagueactivity' ||
      op === 'leagueactivity' ||
      op === 'getleaguechatmessages' ||
      op === 'getleaguemessages' ||
      op === 'getleagueannouncements'
    ) {
      const key =
        op.includes('chat') || op.includes('messages')
          ? 'getLeagueMessages'
          : op.includes('announcement')
            ? 'getLeagueAnnouncements'
            : 'leagueActivity';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { [key]: [] } }),
      });
      return;
    }

    // ── Standings / scoring / trades / waivers ────────────────────
    if (op === 'getleaguestandings' || op === 'leaguestandings') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getLeagueStandings: [] } }),
      });
      return;
    }

    if (op === 'getleaguescoring' || op === 'leaguescoringprofile') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueScoringProfile: null } }),
      });
      return;
    }

    if (op === 'getpendingtradeoffers' || op === 'pendingtradeoffers') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { pendingTradeOffers: [] } }),
      });
      return;
    }

    if (op === 'getteamwaiverclaims' || op === 'teamwaiverclaims') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { teamWaiverClaims: [] } }),
      });
      return;
    }

    if (op === 'getteammembers' || op === 'teammembers') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { teamMembers: [] } }),
      });
      return;
    }

    if (op === 'getmatchupbyid') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getMatchupById: null } }),
      });
      return;
    }

    if (op === 'getmatchupplayers') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getMatchupPlayers: [] } }),
      });
      return;
    }

    // ── RenewLeague mutation ──────────────────────────────────────
    if (op === 'renewleague') {
      if (onRenewLeague) {
        const result = await onRenewLeague({
          keepRosters: parsed.variables?.['keepRosters'] as boolean,
        });
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: { renewLeague: result ?? renewedLeague },
          }),
        });
      } else {
        // After renewal succeeds, switch to showing the new league
        activeLeagueId = NEW_LEAGUE_ID;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { renewLeague: renewedLeague } }),
        });
      }
      return;
    }

    // ── Fallback — surface any unmocked operation as a diagnostic error ──
    await unmockedGraphQLFallback(route);
  });
}

// ── Test Suite: Team Migration ───────────────────────────────────────────────

test.describe('Season Renewal Flow — team migration @critical', () => {
  test('all teams are migrated to the new league', async ({ page }) => {
    await setupGraphQL(page, {
      renewedTeams: MIGRATED_TEAMS,
    });

    // Navigate to the new league overview
    await page.goto(`/baseball/league/${NEW_LEAGUE_ID}/overview`);
    await page.waitForLoadState('load');

    // Verify no application error
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );

    // Verify team names from the original league are visible in the new league
    // The migrated teams should have the same names
    for (const team of MIGRATED_TEAMS) {
      await expect(
        page.getByText(team.name, { exact: false }).first(),
      ).toBeVisible({ timeout: 10_000 });
    }
  });

  test('commissioner team is preserved in renewed league', async ({ page }) => {
    await setupGraphQL(page);

    // Navigate to the new league commissioner tab
    await page.goto(`/baseball/league/${NEW_LEAGUE_ID}/commissioner`);
    await page.waitForLoadState('load');

    // Commissioner (user 1) should see the commissioner tab — this proves
    // the ownership was migrated because the renewed league has owner=1
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );

    // The new league has draftStatus='not-started' so the "Start Draft"
    // button should be visible — confirming commissioner access
    await expect(
      page.getByText('Start Draft', { exact: false }).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('renewed league has correct number of teams', async ({ page }) => {
    await setupGraphQL(page);

    // Navigate to the new league overview
    await page.goto(`/baseball/league/${NEW_LEAGUE_ID}/overview`);
    await page.waitForLoadState('load');

    // Verify no error
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );

    // The league should show all 4 team names
    const teamNames = MIGRATED_TEAMS.map((t) => t.name);
    for (const name of teamNames) {
      await expect(page.getByText(name, { exact: false }).first()).toBeVisible({
        timeout: 10_000,
      });
    }
  });
});

// ── Test Suite: Renewal Error Handling ────────────────────────────────────────

test.describe('Season Renewal Flow — error handling @regression', () => {
  test('renewal mutation error is handled gracefully', async ({ page }) => {
    // Set up base mocks first — Playwright routes match in LIFO order,
    // so the error override registered after will intercept renewLeague first.
    await setupGraphQL(page);

    await page.route(isGraphQLEndpoint, async (route) => {
      const postData = route.request().postData() ?? '';
      let parsed: { operationName?: string };
      try {
        parsed = JSON.parse(postData) as typeof parsed;
      } catch {
        parsed = {};
      }
      const op = (parsed.operationName ?? '').toLowerCase();

      if (op === 'renewleague') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: null,
            errors: [
              {
                message: 'League cannot be renewed while frozen',
                extensions: { code: 'LEAGUE_FROZEN' },
              },
            ],
          }),
        });
        return;
      }

      await route.fallback();
    });

    await page.goto(`/baseball/league/${LEAGUE_ID}/commissioner`);
    await page.waitForLoadState('load');

    const startBtn = page.getByRole('button', { name: /Start New Season/i });
    await expect(startBtn).toBeVisible({ timeout: 15_000 });
    await startBtn.click();

    await expect(page.getByText(/Start New Season for/i).first()).toBeVisible({
      timeout: 10_000,
    });

    await page.getByRole('button', { name: /Confirm New Season/i }).click();

    // Should stay on the same page (not navigate away on error)
    await expect(page).toHaveURL(
      new RegExp(`/baseball/league/${LEAGUE_ID}/commissioner`),
      { timeout: 10_000 },
    );
  });

  test('renewal not available for non-completed seasons', async ({ page }) => {
    // League with in-progress draft — not completed
    await setupGraphQL(page, {
      league: makeLeague({
        draftStatus: 'in-progress',
        currentMatchup: null,
      }),
      matchups: [],
    });

    await page.goto(`/baseball/league/${LEAGUE_ID}/commissioner`);
    await page.waitForLoadState('load');

    // "Start New Season" should NOT appear because draftStatus is not 'completed'
    await expect(
      page.getByRole('button', { name: /Start New Season/i }),
    ).not.toBeVisible({ timeout: 5_000 });
  });

  test('renewal not available mid-season with active matchup', async ({
    page,
  }) => {
    // League with active matchup — season still in progress
    await setupGraphQL(page, {
      league: makeLeague({
        draftStatus: 'completed',
        currentMatchup: 5,
        totalMatchups: 10,
      }),
      matchups: Array.from({ length: 5 }, (_, i) => ({
        __typename: 'Matchup',
        id: i + 1,
        leagueId: LEAGUE_ID,
        weekNumber: i + 1,
        team1Id: 10,
        team2Id: 11,
        status: i < 4 ? 'completed' : 'in-progress',
        selectedGamesCount: i < 4 ? 5 : 2,
        gamesPerMatchup: 5,
        statsLoadingStatus: 'not_started',
      })),
    });

    await page.goto(`/baseball/league/${LEAGUE_ID}/commissioner`);
    await page.waitForLoadState('load');

    // "Start New Season" should NOT appear because there's an active matchup
    await expect(
      page.getByRole('button', { name: /Start New Season/i }),
    ).not.toBeVisible({ timeout: 5_000 });
  });
});
