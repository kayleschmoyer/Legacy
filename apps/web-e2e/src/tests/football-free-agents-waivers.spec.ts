/**
 * Football Free Agents / Waivers Tab — hermetic E2E tests (LS-5417, LS-9772)
 *
 * Covers the football branch of `LeagueDetailFreeAgentsTab`
 * (`lib/shared-components/src/features/baseball/LeagueDetailFreeAgentsTab.tsx`)
 * on the football league detail page (`/football/league/:id/free-agents`):
 *
 *   AC1 — the free-agent player list renders
 *   AC2 — a position filter chip (QB/RB/WR/TE/K/DST) narrows the list to that
 *         position
 *   AC3 — triggering the claim action opens the waiver claim modal and, on
 *         submit, shows the success confirmation
 *   AC4 — position-specific stat columns render from `careerStats`, and PROJ
 *         derives a real value instead of the always-null
 *         `projectedFantasyPoints` field (LS-9772 regression coverage)
 *
 * All GraphQL queries are mocked so this spec runs without a live backend
 * (per LS-5268's epic goal: QA coverage for this page is delivered as
 * automated Playwright E2E tests, not manual testing).
 */

import { expect, test } from '../fixtures/auth-enhanced';
import { unmockedGraphQLFallback } from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';
import { FIXED_NOW_ISO } from '../mocks/time';

// ── Constants ────────────────────────────────────────────────────────────────

const LEAGUE_ID = 1;

// ── Mock League ──────────────────────────────────────────────────────────────

function makeFootballLeague(overrides: Record<string, unknown> = {}) {
  return {
    __typename: 'League',
    id: LEAGUE_ID,
    name: 'Test Football League',
    description: 'E2E football free-agents test',
    owner: 1,
    sport: 'football',
    defensiveFormat: 'dst',
    maxRosterSize: 25,
    draftStatus: 'not-started',
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
    waiverType: 'standard',
    faabBudgetDefault: null,
    startDate: null,
    logoUrl: null,
    bannerUrl: null,
    primaryColor: null,
    secondaryColor: null,
    inviteCode: 'TEST1234',
    userMembership: { teamId: 1 },
    minCareerGames: 50,
    minCareerSeasons: 3,
    gamesPerMatchup: 1,
    pitcherStartsPerMatchup: 1,
    totalMatchups: 10,
    playoffEnabled: true,
    playoffFormat: '4-team',
    playoffMultiWeek: false,
    frozenAt: null,
    lmNotes: null,
    ...overrides,
  };
}

// ── Mock Football Players ────────────────────────────────────────────────────

/**
 * `projectedFantasyPoints` is always NULL in production (LS-9772 — no
 * projections/ADP pipeline exists yet); real fixtures reflect that and
 * exercise the `careerStats`-derived PROJ column instead.
 */
function mockFootballPlayer(overrides: Record<string, unknown> = {}) {
  return {
    __typename: 'FootballPlayer',
    id: 201,
    firstName: 'Patrick',
    lastName: 'Mahomes',
    position: 'QB',
    isDst: false,
    nflTeam: 'KC',
    pfrId: 'MahoPa00',
    headshotUrl: null,
    previousTeams: null,
    projectedFantasyPoints: null,
    adpRank: 5,
    careerStats: null,
    ...overrides,
  };
}

const MOCK_FOOTBALL_PLAYERS = [
  mockFootballPlayer({
    id: 201,
    firstName: 'Patrick',
    lastName: 'Mahomes',
    position: 'QB',
    nflTeam: 'KC',
    careerStats: {
      __typename: 'FootballCareerStats',
      fantasyPoints: 340,
      passing: {
        __typename: 'FootballCareerPassing',
        g: 17,
        yds: 4800,
        td: 38,
        int: 10,
        rating: 105.2,
      },
      rushing: null,
      receiving: null,
      kicking: null,
      defense: null,
      idp: null,
    },
  }),
  mockFootballPlayer({
    id: 202,
    firstName: 'Christian',
    lastName: 'McCaffrey',
    position: 'RB',
    nflTeam: 'SF',
    careerStats: {
      __typename: 'FootballCareerStats',
      fantasyPoints: 272,
      passing: null,
      rushing: {
        __typename: 'FootballCareerRushing',
        g: 16,
        yds: 1459,
        td: 14,
      },
      receiving: null,
      kicking: null,
      defense: null,
      idp: null,
    },
  }),
  mockFootballPlayer({
    id: 203,
    firstName: 'Justin',
    lastName: 'Jefferson',
    position: 'WR',
    nflTeam: 'MIN',
    careerStats: {
      __typename: 'FootballCareerStats',
      fantasyPoints: 238,
      passing: null,
      rushing: null,
      receiving: {
        __typename: 'FootballCareerReceiving',
        g: 17,
        rec: 128,
        yds: 1809,
        td: 10,
      },
      kicking: null,
      defense: null,
      idp: null,
    },
  }),
];

// ── GraphQL Route Handler ─────────────────────────────────────────────────────

interface SetupOptions {
  league?: ReturnType<typeof makeFootballLeague>;
  players?: ReturnType<typeof mockFootballPlayer>[];
  onClaimFreeAgent?: (vars: { playerId: number; leagueId: number }) => void;
}

async function setupGraphQL(
  page: import('@playwright/test').Page,
  opts: SetupOptions = {},
) {
  const {
    league = makeFootballLeague(),
    players = MOCK_FOOTBALL_PLAYERS,
    onClaimFreeAgent,
  } = opts;

  await page.route(isGraphQLEndpoint, async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as {
      operationName?: string;
      variables?: Record<string, unknown>;
    };
    const op = body.operationName ?? '';

    if (op === 'GetLeagueById') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { league } }),
      });
      return;
    }

    if (op === 'FootballPlayers') {
      const vars = body.variables ?? {};
      const positions = vars.positions as string[] | undefined;
      const search = (vars.search as string | undefined)?.toLowerCase();

      let filtered = [...players];
      if (positions && positions.length > 0) {
        filtered = filtered.filter((p) =>
          positions.includes(String(p.position)),
        );
      }
      if (search) {
        filtered = filtered.filter(
          (p) =>
            String(p.firstName).toLowerCase().includes(search) ||
            String(p.lastName).toLowerCase().includes(search),
        );
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            footballPlayers: {
              __typename: 'FootballPlayersConnection',
              nodes: filtered,
              pageInfo: {
                __typename: 'PageInfo',
                hasNextPage: false,
                endCursor: null,
              },
            },
          },
        }),
      });
      return;
    }

    if (op === 'ClaimFreeAgent') {
      const vars = body.variables ?? {};
      onClaimFreeAgent?.({
        playerId: vars.playerId as number,
        leagueId: vars.leagueId as number,
      });

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            claimFreeAgent: {
              __typename: 'WaiverClaim',
              id: 1,
              leagueId: vars.leagueId ?? LEAGUE_ID,
              teamId: 1,
              playerId: vars.playerId ?? 201,
              dropPlayerId: null,
              faabBid: null,
              status: 'pending',
              errorMessage: null,
              createdAt: FIXED_NOW_ISO,
            },
          },
        }),
      });
      return;
    }

    await unmockedGraphQLFallback(route);
  });
}

async function gotoFreeAgents(page: import('@playwright/test').Page) {
  await page.goto(`/football/league/${LEAGUE_ID}/free-agents`);
  await expect(
    page.getByRole('button', { name: 'All positions' }),
  ).toBeVisible();
}

// ── Tests: Free Agents Page Renders (AC1) ────────────────────────────────────

test.describe('Football Free Agents / Waivers — page renders with player list @critical', () => {
  test('displays player names in the free agents list', async ({ page }) => {
    await setupGraphQL(page);
    await gotoFreeAgents(page);

    await expect(page.getByText('Patrick Mahomes')).toBeVisible();
    await expect(page.getByText('Christian McCaffrey')).toBeVisible();
    await expect(page.getByText('Justin Jefferson')).toBeVisible();
  });

  test('shows the football position filter chips (QB/RB/WR/TE/K/DST)', async ({
    page,
  }) => {
    await setupGraphQL(page);
    await gotoFreeAgents(page);

    for (const pos of ['QB', 'RB', 'WR', 'TE', 'K', 'DST']) {
      await expect(page.getByTestId(`position-filter-${pos}`)).toBeVisible();
    }
  });
});

// ── Tests: Position Filter Narrows Results (AC2) ─────────────────────────────

test.describe('Football Free Agents / Waivers — position filter @critical', () => {
  test('selecting the QB position chip narrows the list to QBs', async ({
    page,
  }) => {
    await setupGraphQL(page);
    await gotoFreeAgents(page);

    await expect(page.getByText('Patrick Mahomes')).toBeVisible();
    await expect(page.getByText('Christian McCaffrey')).toBeVisible();
    await expect(page.getByText('Justin Jefferson')).toBeVisible();

    await page
      .getByRole('button', { name: 'Filter by position: QB', exact: true })
      .click();

    await expect(page.getByText('Patrick Mahomes')).toBeVisible();
    await expect(page.getByText('Christian McCaffrey')).not.toBeVisible();
    await expect(page.getByText('Justin Jefferson')).not.toBeVisible();
  });
});

// ── Tests: Stat Columns and Projections (AC4, LS-9772 regression) ───────────

test.describe('Football Free Agents / Waivers — stats and projections @critical', () => {
  test('shows a non-empty PROJ value derived from career stats, not the always-null field', async ({
    page,
  }) => {
    await setupGraphQL(page);
    await gotoFreeAgents(page);

    await expect(page.getByText('Patrick Mahomes')).toBeVisible();

    // Mahomes: careerStats.fantasyPoints 340 / passing.g 17 * gamesPerMatchup 1 = 20.0
    await expect(page.getByTestId('fa-col-PROJ')).toBeVisible();
    const projCell = page.getByText('20.0', { exact: true });
    await expect(projCell).toBeVisible();
  });

  test('selecting the QB position chip reveals passing stat columns with real values', async ({
    page,
  }) => {
    await setupGraphQL(page);
    await gotoFreeAgents(page);

    await page
      .getByRole('button', { name: 'Filter by position: QB', exact: true })
      .click();

    await expect(page.getByTestId('fa-col-QB_YDS')).toBeVisible();
    await expect(page.getByTestId('fa-col-QB_TD')).toBeVisible();
    await expect(page.getByTestId('fa-col-QB_INT')).toBeVisible();
    await expect(page.getByTestId('fa-col-QB_RTG')).toBeVisible();

    // Mahomes's passing.yds (4800) renders as a formatted integer.
    await expect(page.getByText('4,800', { exact: true })).toBeVisible();
  });

  test('selecting the RB position chip reveals rushing stat columns with real values', async ({
    page,
  }) => {
    await setupGraphQL(page);
    await gotoFreeAgents(page);

    await page
      .getByRole('button', { name: 'Filter by position: RB', exact: true })
      .click();

    await expect(page.getByTestId('fa-col-RB_YDS')).toBeVisible();
    await expect(page.getByTestId('fa-col-RB_TD')).toBeVisible();
    await expect(page.getByText('1,459', { exact: true })).toBeVisible();
  });

  test('a player with no career stats for the category shows a placeholder, not a crash', async ({
    page,
  }) => {
    await setupGraphQL(page, {
      players: [mockFootballPlayer({ id: 301, careerStats: null })],
    });
    await gotoFreeAgents(page);

    await expect(page.getByText('Patrick Mahomes')).toBeVisible();
    await expect(page.getByTestId('fa-col-PROJ')).toBeVisible();
  });
});

// ── Tests: Claim Flow (AC3) ──────────────────────────────────────────────────

test.describe('Football Free Agents / Waivers — claim action opens waiver claim flow @critical', () => {
  test('clicking Add opens the waiver claim modal', async ({ page }) => {
    await setupGraphQL(page);
    await gotoFreeAgents(page);

    await expect(page.getByText('Patrick Mahomes')).toBeVisible();

    await page.getByRole('button', { name: /Add Patrick Mahomes/i }).click();

    await expect(page.getByText('Claim Free Agent')).toBeVisible();
    await expect(page.getByText('Patrick Mahomes').last()).toBeVisible();
  });

  test('submitting the claim triggers ClaimFreeAgent and shows the confirmation', async ({
    page,
  }) => {
    const claimedPlayers: number[] = [];
    await setupGraphQL(page, {
      onClaimFreeAgent: ({ playerId }) => claimedPlayers.push(playerId),
    });
    await gotoFreeAgents(page);

    await expect(page.getByText('Patrick Mahomes')).toBeVisible();
    await page.getByRole('button', { name: /Add Patrick Mahomes/i }).click();
    await expect(page.getByText('Claim Free Agent')).toBeVisible();

    await page.getByRole('button', { name: /Submit Claim/i }).click();

    await expect.poll(() => claimedPlayers, { timeout: 10000 }).toContain(201);
    await expect(page.getByText('Waiver Claim Submitted!')).toBeVisible();
    await expect(
      page.getByText(/Your claim for Patrick Mahomes has been submitted/i),
    ).toBeVisible();
  });
});
