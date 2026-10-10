/**
 * NFL Player Stats — category tabs, sort, pagination & sport switch (LS-8566)
 *
 * Hermetic E2E coverage for the reworked NFL view on /players/stats:
 *
 *   1. Default landing (?sport=nfl) — Overview tab active, the outgoing
 *      FootballPlayerStatsGrid variables carry NO `category` and the default
 *      name/asc sort, and DST synthetic rows render alongside offensive
 *      players.
 *   2. Passing tab — new request with category 'passing' and the
 *      passing.yds/desc leaders default; URL gains view=passing; passing stat
 *      headers (YDS/TD/INT/RTG) render.
 *   3. Header sort — clicking "Sort by TD" on the Passing tab issues a request
 *      with sortBy 'passing.td' desc and persists sortBy=passing.td to the URL.
 *   4. DST tab hidden (LS-10727) — the Defense tab still maps to 'idp', the
 *      team-defense DST tab is not offered, and a view=defense deep link
 *      lands on Overview.
 *   5. Pagination — totalCount 60 @ pageSize 25 → 'Next →' issues a request
 *      with the offset cursor after: '25'.
 *   6. Sport switch regression (LS-8566) — from the NFL view the MLB control
 *      lands on the MLB grid with a fresh sport=mlb param set (no NFL
 *      position/view/sortBy leakage) and the page settles without a
 *      navigation/request loop.
 *
 * All GraphQL responses are mocked with route.fulfill() — route.continue() is
 * never used per project hermetic-test policy.
 */

import type { Page, Request } from '@playwright/test';
import { expect, test } from '../fixtures/auth-enhanced';
import { enableFootball } from '../fixtures/shared-mocks';
import { createGraphQLRouter, fulfillJson } from '../mocks/graphql/router';

const PAGE_URL = '/players/stats?sport=nfl';

// ── Mock rows (FootballPlayerStatsRow fragment shape) ─────────────────────────

/** All-null career categories; each fixture overrides its own category. */
const EMPTY_CAREER = {
  __typename: 'FootballCareerStats',
  fantasyPoints: null,
  passing: null,
  rushing: null,
  receiving: null,
  kicking: null,
  defense: null,
  idp: null,
} as const;

/** QB with passing stats — distinguishable on the Passing tab. */
const MAHOMES = {
  __typename: 'FootballPlayer',
  id: 1,
  firstName: 'Patrick',
  lastName: 'Mahomes',
  position: 'QB',
  isDst: false,
  nflTeam: 'KC',
  careerStats: {
    ...EMPTY_CAREER,
    fantasyPoints: 3120.5,
    passing: {
      __typename: 'FootballCareerPassing',
      g: 120,
      cmp: 3100,
      att: 4700,
      yds: 32000,
      td: 245,
      int: 61,
      rating: 103.4,
    },
  },
} as const;

/** RB with rushing stats. */
const BARKLEY = {
  __typename: 'FootballPlayer',
  id: 2,
  firstName: 'Saquon',
  lastName: 'Barkley',
  position: 'RB',
  isDst: false,
  nflTeam: 'PHI',
  careerStats: {
    ...EMPTY_CAREER,
    fantasyPoints: 1710.2,
    rushing: {
      __typename: 'FootballCareerRushing',
      g: 92,
      att: 1500,
      yds: 7200,
      td: 52,
      lng: 83,
      fumbles: 9,
    },
  },
} as const;

/** Synthetic DST row (isDst true, position DST) with team-defense stats. */
const NINERS_DST = {
  __typename: 'FootballPlayer',
  id: 3,
  firstName: 'San Francisco',
  lastName: '49ers',
  position: 'DST',
  isDst: true,
  nflTeam: 'SF',
  careerStats: {
    ...EMPTY_CAREER,
    fantasyPoints: 890.0,
    defense: {
      __typename: 'FootballCareerDefense',
      g: 180,
      sacks: 460.5,
      int: 155,
      fumRec: 120,
      defTd: 28,
      safeties: 4,
      ptsAllowedPerG: 19.4,
      ydsAllowedPerG: 315.2,
    },
  },
} as const;

/** IDP defender (LB) — distinguishable on the Defense (idp) tab. */
const PARSONS = {
  __typename: 'FootballPlayer',
  id: 4,
  firstName: 'Micah',
  lastName: 'Parsons',
  position: 'LB',
  isDst: false,
  nflTeam: 'DAL',
  careerStats: {
    ...EMPTY_CAREER,
    fantasyPoints: 610.8,
    idp: {
      __typename: 'FootballCareerIdp',
      g: 65,
      soloTkl: 190,
      astTkl: 85,
      totalTkl: 275,
      sacks: 52.5,
      int: 1,
      pd: 12,
      ff: 9,
      fr: 4,
      defTd: 1,
    },
  },
} as const;

/** 60 total rows @ pageSize 25 → 3 pages, so the pager's Next is enabled. */
const TOTAL_COUNT = 60;

function gridResponse(variables: Record<string, unknown>): object {
  const category = variables.category;
  const nodes =
    category === 'passing'
      ? [MAHOMES]
      : category === 'rushing'
        ? [BARKLEY]
        : category === 'defense'
          ? [NINERS_DST]
          : category === 'idp'
            ? [PARSONS]
            : [MAHOMES, BARKLEY, NINERS_DST, PARSONS];
  return {
    data: {
      footballPlayers: {
        __typename: 'FootballPlayerConnection',
        nodes,
        pageInfo: {
          __typename: 'PageInfo',
          hasNextPage: true,
          endCursor: '25',
        },
        totalCount: TOTAL_COUNT,
      },
    },
  };
}

// ── MLB grid mocks (sport-switch scenario) ────────────────────────────────────

const MLB_BATTING_RESPONSE = {
  data: {
    careerBattingStats: {
      __typename: 'CareerBattingConnection',
      totalCount: 1,
      edges: [
        {
          __typename: 'CareerBattingEdge',
          node: {
            __typename: 'CareerBatting',
            playerId: 101,
            primaryPosition: 'LF',
            positionsPlayed: 'LF,RF',
            games: 2986,
            plateAppearances: 12606,
            atBats: 9847,
            runs: 2227,
            hits: 2935,
            doubles: 601,
            triples: 77,
            homeRuns: 762,
            rbi: 1996,
            stolenBases: 514,
            caughtStealing: 141,
            baseOnBalls: 2558,
            strikeouts: 1539,
            totalBases: 5976,
            groundedIntoDoublePlays: 144,
            hitByPitch: 95,
            sacrificeHits: 24,
            intentionalBaseOnBalls: 688,
            battingAverage: 0.298,
            onBasePercentage: 0.444,
            sluggingPercentage: 0.607,
            offensiveWAR: 162.8,
            player: {
              __typename: 'Player',
              id: 101,
              firstName: 'Barry',
              lastName: 'Bonds',
              brefId: 'bondsba01',
            },
          },
        },
      ],
      pageInfo: {
        __typename: 'PageInfo',
        hasNextPage: false,
        hasPreviousPage: false,
        startCursor: null,
        endCursor: null,
      },
    },
  },
};

const MLB_PITCHING_RESPONSE = {
  data: {
    careerPitchingStats: [
      {
        __typename: 'CareerPitching',
        playerId: 201,
        wins: 354,
        losses: 184,
        games: 709,
        gamesStarted: 707,
        gamesFinished: 1,
        completeGames: 100,
        shutouts: 46,
        saves: 0,
        hits: 4672,
        runs: 1940,
        earnedRuns: 1770,
        homeRuns: 363,
        baseOnBalls: 1580,
        intentionalBaseOnBalls: 79,
        strikeouts: 4672,
        hitByPitch: 158,
        balks: 8,
        wildPitches: 153,
        battersFaced: 20016,
        outsRecorded: 13095,
        outRate: null,
        era: '3.19',
        winPercentage: 0.658,
        player: {
          __typename: 'Player',
          id: 201,
          firstName: 'Roger',
          lastName: 'Clemens',
        },
      },
    ],
  },
};

// ── Harness helpers ───────────────────────────────────────────────────────────

/**
 * Register the GraphQL router: the NFL stats-grid operation records every
 * request's variables into the returned array; the MLB grid operations are
 * mocked so the sport-switch scenario renders a real MLB grid. Everything
 * else cascades to the `_apiIsolation` baseline auto-fixture.
 */
async function mockStatsGrids(
  page: Page,
): Promise<Array<Record<string, unknown>>> {
  const gridCalls: Array<Record<string, unknown>> = [];
  await createGraphQLRouter(page, {
    footballplayerstatsgrid: (route, { variables }) => {
      gridCalls.push(variables);
      return fulfillJson(route, gridResponse(variables));
    },
    getcareerbattingstats: (route) => fulfillJson(route, MLB_BATTING_RESPONSE),
    getcareerpitchingstatscount: (route) =>
      fulfillJson(route, { data: { careerPitchingStatsCount: 1 } }),
    getcareerpitchingstats: (route) =>
      fulfillJson(route, MLB_PITCHING_RESPONSE),
  });
  return gridCalls;
}

/** Parse a request's FootballPlayerStatsGrid variables, or null if not it. */
function gridRequestVariables(
  request: Request,
): Record<string, unknown> | null {
  const body = request.postData();
  if (!body) return null;
  try {
    const parsed = JSON.parse(body) as {
      operationName?: string;
      variables?: Record<string, unknown>;
    };
    return parsed.operationName === 'FootballPlayerStatsGrid'
      ? (parsed.variables ?? {})
      : null;
  } catch {
    return null;
  }
}

/**
 * Promise for the next FootballPlayerStatsGrid request whose variables match
 * `predicate`. Create BEFORE the triggering action (goto / click).
 */
function waitForGridRequest(
  page: Page,
  predicate: (variables: Record<string, unknown>) => boolean = () => true,
): Promise<Record<string, unknown>> {
  return page
    .waitForRequest((request) => {
      if (!request.url().includes('/graphql')) return false;
      const variables = gridRequestVariables(request);
      return variables !== null && predicate(variables);
    })
    .then((request) => gridRequestVariables(request) ?? {});
}

function statsTab(page: Page, label: string) {
  return page.getByRole('tab', { name: label, exact: true });
}

test.beforeEach(async ({ page }) => {
  // Pin the football rollout flag on so the NFL view and the sport switcher
  // render regardless of the GrowthBook environment.
  await enableFootball(page);
});

// ── 1. Default landing ────────────────────────────────────────────────────────

test.describe('NFL stats — Overview default (LS-8566, LS-9504) @regression', () => {
  test('lands on Overview with no category, fpts/desc sort, and DST rows inline', async ({
    page,
  }) => {
    await mockStatsGrids(page);
    const firstRequest = waitForGridRequest(page);
    await page.goto(PAGE_URL);

    // Outgoing variables: no category (overview), default fpts/desc sort
    // (pool-wide career fantasy points — LS-9504).
    const variables = await firstRequest;
    expect(variables.category).toBeUndefined();
    expect(variables.sortBy).toBe('fpts');
    expect(variables.sortDir).toBe('desc');
    expect(variables.first).toBe(25);
    expect(variables.after).toBeUndefined();

    // Overview tab is the active tab.
    await expect(statsTab(page, 'Overview')).toHaveAttribute(
      'aria-selected',
      'true',
    );

    // Offensive players and the synthetic DST row render side by side.
    const table = page.getByTestId('player-list-table');
    await expect(table.getByText('Patrick Mahomes')).toBeVisible();
    await expect(table.getByText('Saquon Barkley')).toBeVisible();
    await expect(table.getByText('San Francisco 49ers')).toBeVisible();
    // The DST row shows the DST position badge.
    await expect(table.getByText('DST', { exact: true })).toBeVisible();
  });
});

// ── 2 & 3. Passing tab + header sort ─────────────────────────────────────────

test.describe('NFL stats — Passing tab (LS-8566) @regression', () => {
  test('Passing tab requests category passing with yds/desc leaders default', async ({
    page,
  }) => {
    await mockStatsGrids(page);
    await page.goto(PAGE_URL);
    await expect(
      page.getByTestId('player-list-table').getByText('Patrick Mahomes'),
    ).toBeVisible();

    const passingRequest = waitForGridRequest(
      page,
      (v) => v.category === 'passing',
    );
    await statsTab(page, 'Passing').click();

    const variables = await passingRequest;
    expect(variables.sortBy).toBe('passing.yds');
    expect(variables.sortDir).toBe('desc');

    // URL mirrors the active tab.
    await expect(page).toHaveURL(/view=passing/);

    // Passing stat headers render (sortable header cells expose
    // "Sort by <LABEL>" accessible names).
    for (const label of ['YDS', 'TD', 'INT', 'RTG']) {
      await expect(
        page.getByRole('button', { name: `Sort by ${label}`, exact: true }),
      ).toBeVisible();
    }
    await expect(statsTab(page, 'Passing')).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  test('clicking the TD header commits sortBy passing.td desc and persists it to the URL', async ({
    page,
  }) => {
    await mockStatsGrids(page);
    await page.goto('/players/stats?sport=nfl&view=passing');
    await expect(
      page.getByTestId('player-list-table').getByText('Patrick Mahomes'),
    ).toBeVisible();

    const sortRequest = waitForGridRequest(
      page,
      (v) => v.sortBy === 'passing.td',
    );
    await page.getByRole('button', { name: 'Sort by TD', exact: true }).click();

    const variables = await sortRequest;
    expect(variables.category).toBe('passing');
    expect(variables.sortDir).toBe('desc');

    await expect(page).toHaveURL(/sortBy=passing\.td/);
    await expect(page).toHaveURL(/sortDir=desc/);
  });
});

// ── 4. DST tab hidden (LS-10727) ─────────────────────────────────────────────

test.describe('NFL stats — DST tab hidden until team-defense data exists (LS-10727) @regression', () => {
  test('Defense tab requests category idp and no DST tab is offered', async ({
    page,
  }) => {
    await mockStatsGrids(page);
    await page.goto(PAGE_URL);
    await expect(
      page.getByTestId('player-list-table').getByText('Patrick Mahomes'),
    ).toBeVisible();

    // The individual-defender Defense tab sends category 'idp'…
    const idpRequest = waitForGridRequest(page, (v) => v.category === 'idp');
    await statsTab(page, 'Defense').click();
    const idpVariables = await idpRequest;
    expect(idpVariables.sortBy).toBe('idp.totalTkl');
    await expect(
      page.getByTestId('player-list-table').getByText('Micah Parsons'),
    ).toBeVisible();

    // …and the team-defense DST tab is not offered while it has no data.
    await expect(statsTab(page, 'DST')).toHaveCount(0);
  });

  test('a view=defense deep link lands on Overview instead of an empty DST grid', async ({
    page,
  }) => {
    await mockStatsGrids(page);
    const overviewRequest = waitForGridRequest(page, (v) => v.category == null);
    await page.goto(`${PAGE_URL}&view=defense`);
    await overviewRequest;
    await expect(
      page.getByTestId('player-list-table').getByText('Patrick Mahomes'),
    ).toBeVisible();
  });
});

// ── 5. Pagination ─────────────────────────────────────────────────────────────

test.describe('NFL stats — pagination (LS-8566) @regression', () => {
  test('Next → requests page two with the offset cursor after: "25"', async ({
    page,
  }) => {
    await mockStatsGrids(page);
    await page.goto(PAGE_URL);
    await expect(
      page.getByTestId('player-list-table').getByText('Patrick Mahomes'),
    ).toBeVisible();
    // 60 rows @ 25/page → 3 pages.
    await expect(page.getByText('Page 1 of 3')).toBeVisible();

    const pageTwoRequest = waitForGridRequest(page, (v) => v.after === '25');
    await page.getByRole('button', { name: 'Next →', exact: true }).click();

    const variables = await pageTwoRequest;
    expect(variables.first).toBe(25);
    await expect(page.getByText('Page 2 of 3')).toBeVisible();
  });
});

// ── 6. Sport switch regression (LS-8566) ─────────────────────────────────────

test.describe('NFL stats — sport switch to MLB (LS-8566) @regression', () => {
  test('MLB control lands on the MLB grid with no NFL param leakage and no loop', async ({
    page,
  }) => {
    const gridCalls = await mockStatsGrids(page);
    // Start from an NFL view carrying every kind of sport-specific param that
    // used to leak into the MLB parser (position/view/sortBy).
    await page.goto(
      '/players/stats?sport=nfl&view=passing&position=QB&sortBy=passing.td&sortDir=desc',
    );
    await expect(
      page.getByTestId('player-list-table').getByText('Patrick Mahomes'),
    ).toBeVisible();

    await page.getByRole('button', { name: /view mlb statistics/i }).click();

    // The MLB grid renders (mocked Barry Bonds row) on the Combined tab.
    // 10s: the first paint after the sport switch loads the lazy MLB grid
    // chunk + runs the mocked query; that first-render budget can exceed the
    // 3s expect default on a loaded CI shard (LS-9449).
    await expect(page.getByText('Barry Bonds')).toBeVisible({
      timeout: 10_000,
    });
    await expect(page).toHaveURL(/sport=mlb/);

    // No NFL params leak across the switch.
    const url = new URL(page.url());
    expect(url.searchParams.get('position')).toBeNull();
    expect(url.searchParams.get('sortBy')).toBeNull();
    expect(url.searchParams.get('sortDir')).toBeNull();
    const viewParam = url.searchParams.get('view');
    if (viewParam !== null) {
      // Only an MLB view vocabulary value is acceptable post-switch.
      expect(['combined', 'hitters', 'pitchers']).toContain(viewParam);
    }

    // The page settles: the URL stays stable and the NFL grid stops querying
    // (the LS-8566 loop re-fired FootballPlayerStatsGrid and stomped the
    // sport param back to nfl).
    // Justified negative window (LS-11045): "nothing else happens" has no
    // web-first signal. The loop was effect-driven and re-fired within a
    // render or two, so a short beat is enough to catch a regression.
    const settledUrl = page.url();
    const settledGridCalls = gridCalls.length;
    await page.waitForTimeout(500);
    expect(page.url()).toBe(settledUrl);
    expect(gridCalls.length).toBe(settledGridCalls);
    await expect(page.getByText('Barry Bonds')).toBeVisible();
  });
});
