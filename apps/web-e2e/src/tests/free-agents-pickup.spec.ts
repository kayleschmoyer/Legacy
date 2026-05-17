/**
 * Free Agents Pickup Flow E2E Tests (LS-1605)
 *
 * Covers: browse free agents list, search/filter players, select player
 * to claim, submit waiver claim, verify confirmation UI, empty state.
 *
 * All GraphQL queries are mocked so these tests run without a live backend.
 *
 * The LeagueFreeAgents component renders on the free-agents tab of the
 * league detail page (/baseball/league/1/free-agents).
 */

import { expect, test } from '../fixtures/auth-enhanced';
import { extractOperationName } from '../fixtures/shared-mocks';
import { FIXED_NOW_ISO } from '../mocks/time';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

// ── Helpers ──────────────────────────────────────────────────────────────────

// ── Constants ────────────────────────────────────────────────────────────────

const FREE_AGENTS_URL = '/baseball/league/1/free-agents';

// ── Mock Player Data ─────────────────────────────────────────────────────────

function mockFreeAgentPlayer(overrides: Record<string, unknown> = {}) {
  return {
    __typename: 'Player',
    id: 101,
    firstName: 'Babe',
    lastName: 'Ruth',
    brefId: 'ruthba01',
    eligiblePositions: ['OF', 'P'],
    scoring: {
      battingScore: 95,
      pitchingScore: 60,
      fieldingScore: 70,
      hitterScore: 90,
      hitterAvgPointsPerGame: 12.5,
      pitchingAvgPointsPerGame: 0,
      totalScore: 150,
      careerGames: 2503,
      avgPointsPerGame: 10.2,
    },
    averageSeasonBatting: {
      seasons: 22,
      games: 140,
      atBats: 500,
      runs: 120,
      hits: 180,
      homeRuns: 35,
      rbi: 120,
      stolenBases: 8,
      battingAverage: 0.342,
      onBasePercentage: 0.474,
      sluggingPercentage: 0.69,
    },
    careerBatting: {
      games: 2503,
      runs: 2174,
      homeRuns: 714,
      rbi: 2213,
      stolenBases: 123,
      hits: 2873,
      atBats: 8399,
      plateAppearances: 10626,
      baseOnBalls: 2062,
      hitByPitch: 43,
      sacrificeHits: 113,
      totalBases: 5793,
      offensiveWAR: 162.7,
    },
    careerPitching: null,
    careerAchievements: {
      allStarSelections: 2,
      mvpAwards: 1,
      cyYoungAwards: 0,
      goldGloves: 0,
      silverSluggers: 0,
      worldSeriesRings: 7,
      hallOfFame: true,
      rookieOfTheYear: false,
    },
    primaryEra: 'Dead Ball',
    ...overrides,
  };
}

const MOCK_PLAYERS = [
  mockFreeAgentPlayer({
    id: 101,
    firstName: 'Babe',
    lastName: 'Ruth',
    brefId: 'ruthba01',
    eligiblePositions: ['OF'],
  }),
  mockFreeAgentPlayer({
    id: 102,
    firstName: 'Lou',
    lastName: 'Gehrig',
    brefId: 'gehrill01',
    eligiblePositions: ['1B'],
    scoring: {
      battingScore: 92,
      pitchingScore: 0,
      fieldingScore: 65,
      hitterScore: 88,
      hitterAvgPointsPerGame: 11.8,
      pitchingAvgPointsPerGame: 0,
      totalScore: 140,
      careerGames: 2164,
      avgPointsPerGame: 9.8,
    },
    careerBatting: {
      games: 2164,
      runs: 1888,
      homeRuns: 493,
      rbi: 1995,
      stolenBases: 102,
      hits: 2721,
      atBats: 8001,
      plateAppearances: 9665,
      baseOnBalls: 1508,
      hitByPitch: 46,
      sacrificeHits: 64,
      totalBases: 5060,
      offensiveWAR: 112.4,
    },
    careerAchievements: {
      allStarSelections: 7,
      mvpAwards: 2,
      cyYoungAwards: 0,
      goldGloves: 0,
      silverSluggers: 0,
      worldSeriesRings: 6,
      hallOfFame: true,
      rookieOfTheYear: false,
    },
  }),
  mockFreeAgentPlayer({
    id: 103,
    firstName: 'Ted',
    lastName: 'Williams',
    brefId: 'willite01',
    eligiblePositions: ['OF'],
    scoring: {
      battingScore: 98,
      pitchingScore: 0,
      fieldingScore: 55,
      hitterScore: 95,
      hitterAvgPointsPerGame: 13.1,
      pitchingAvgPointsPerGame: 0,
      totalScore: 148,
      careerGames: 2292,
      avgPointsPerGame: 11.0,
    },
    careerBatting: {
      games: 2292,
      runs: 1798,
      homeRuns: 521,
      rbi: 1839,
      stolenBases: 24,
      hits: 2654,
      atBats: 7706,
      plateAppearances: 9791,
      baseOnBalls: 2021,
      hitByPitch: 39,
      sacrificeHits: 20,
      totalBases: 4884,
      offensiveWAR: 121.8,
    },
    careerAchievements: {
      allStarSelections: 19,
      mvpAwards: 2,
      cyYoungAwards: 0,
      goldGloves: 0,
      silverSluggers: 0,
      worldSeriesRings: 0,
      hallOfFame: true,
      rookieOfTheYear: false,
    },
  }),
];

// ── GraphQL Route Handler ─────────────────────────────────────────────────────

interface SetupOptions {
  players?: ReturnType<typeof mockFreeAgentPlayer>[];
  errorPlayers?: boolean;
  onClaimFreeAgent?: (vars: {
    playerId: number;
    leagueId: number;
    dropPlayerId?: number;
    faabBid?: number;
  }) => void;
  claimError?: string;
}

async function setupGraphQL(
  page: import('@playwright/test').Page,
  opts: SetupOptions = {},
) {
  const {
    players = MOCK_PLAYERS,
    errorPlayers = false,
    onClaimFreeAgent,
    claimError,
  } = opts;

  await page.route(isGraphQLEndpoint, async (route) => {
    const opName = extractOperationName(route).toLowerCase();

    if (opName === 'getplayerswithstats') {
      if (errorPlayers) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            errors: [{ message: 'Unable to load players' }],
          }),
        });
        return;
      }

      // Parse search/position variables to support filtering tests
      let filteredPlayers = [...players];
      try {
        const body = JSON.parse(route.request().postData() ?? '{}') as {
          variables?: {
            search?: string;
            position?: string;
          };
        };
        const vars = body.variables;
        if (vars?.search) {
          const searchLower = vars.search.toLowerCase();
          filteredPlayers = filteredPlayers.filter(
            (p) =>
              String(p.firstName).toLowerCase().includes(searchLower) ||
              String(p.lastName).toLowerCase().includes(searchLower),
          );
        }
      } catch {
        // Ignore parse errors — return all players
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { players: filteredPlayers } }),
      });
    } else if (opName === 'claimfreeagent') {
      let vars: Record<string, unknown> = {};
      try {
        const raw = JSON.parse(route.request().postData() ?? '{}') as {
          variables?: Record<string, unknown>;
        };
        vars = raw.variables ?? {};
      } catch {
        // ignore
      }

      onClaimFreeAgent?.({
        playerId: vars.playerId as number,
        leagueId: vars.leagueId as number,
        dropPlayerId: vars.dropPlayerId as number | undefined,
        faabBid: vars.faabBid as number | undefined,
      });

      if (claimError) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            errors: [{ message: claimError }],
          }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              claimFreeAgent: {
                id: 1,
                leagueId: vars.leagueId ?? 1,
                teamId: 1,
                playerId: vars.playerId ?? 101,
                dropPlayerId: vars.dropPlayerId ?? null,
                faabBid: vars.faabBid ?? null,
                status: 'pending',
                errorMessage: null,
                createdAt: FIXED_NOW_ISO,
              },
            },
          }),
        });
      }
    } else {
      // Let unmatched operations cascade to baseline mocks (layer 1 of the fixture stack)
      await route.fallback();
    }
  });
}

// ── Tests: Free Agents Page Renders ──────────────────────────────────────────

test.describe('Free Agents — page renders with player list @critical', () => {
  test('displays player names in the free agents table', async ({ page }) => {
    await setupGraphQL(page);
    await page.goto(FREE_AGENTS_URL);
    await page.waitForLoadState('load');

    await expect(page.getByText('Babe Ruth')).toBeVisible();
    await expect(page.getByText('Lou Gehrig')).toBeVisible();
    await expect(page.getByText('Ted Williams')).toBeVisible();
  });

  test('shows Hitters and Pitchers toggle buttons', async ({ page }) => {
    await setupGraphQL(page);
    await page.goto(FREE_AGENTS_URL);
    await page.waitForLoadState('load');

    await expect(page.getByText('Hitters')).toBeVisible();
    await expect(page.getByText('Pitchers')).toBeVisible();
  });

  test('shows position filter chips', async ({ page }) => {
    await setupGraphQL(page);
    await page.goto(FREE_AGENTS_URL);
    await page.waitForLoadState('load');

    // The ALL chip and at least one position chip should be visible
    await expect(page.getByTestId('position-filter-ALL')).toBeVisible();
    await expect(page.getByTestId('position-filter-C')).toBeVisible();
  });

  test('shows pagination info when players are listed', async ({ page }) => {
    await setupGraphQL(page);
    await page.goto(FREE_AGENTS_URL);
    await page.waitForLoadState('load');

    // Should show "Showing 1–3" for our 3 mock players
    await expect(page.getByText(/Showing 1–3/)).toBeVisible();
  });
});

// ── Tests: Search/Filter ─────────────────────────────────────────────────────

test.describe('Free Agents — search and filter @critical', () => {
  test('search input narrows player results', async ({ page }) => {
    await setupGraphQL(page);
    await page.goto(FREE_AGENTS_URL);
    await page.waitForLoadState('load');

    // All three players should be visible initially
    await expect(page.getByText('Babe Ruth')).toBeVisible();
    await expect(page.getByText('Lou Gehrig')).toBeVisible();
    await expect(page.getByText('Ted Williams')).toBeVisible();

    // Type in the search box — the component uses a placeholder "Search players…"
    const searchInput = page.getByPlaceholder(/Search players/i);
    await searchInput.fill('Ruth');

    // After debounce and refetch, only Ruth should appear
    // (server-side search is mocked to filter by firstName/lastName)
    await expect(page.getByText('Babe Ruth')).toBeVisible();
    await expect(page.getByText('Lou Gehrig')).not.toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByText('Ted Williams')).not.toBeVisible();
  });

  test('position filter chip triggers new query', async ({ page }) => {
    const queryPositions: string[] = [];

    await page.route(isGraphQLEndpoint, async (route) => {
      const opName = extractOperationName(route).toLowerCase();

      if (opName === 'getplayerswithstats') {
        try {
          const body = JSON.parse(route.request().postData() ?? '{}') as {
            variables?: { position?: string };
          };
          if (body.variables?.position) {
            queryPositions.push(body.variables.position);
          }
        } catch {
          // ignore
        }

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { players: MOCK_PLAYERS } }),
        });
      } else {
        // Let other operations cascade to the auth fixture's baseline mocks
        await route.fallback();
      }
    });

    await page.goto(FREE_AGENTS_URL);
    await page.waitForLoadState('load');

    // Click on the "SS" position filter chip (use role=button to avoid matching
    // the Silver Slugger "SS" accolade badges rendered inside player rows)
    await page.getByRole('button', { name: 'SS', exact: true }).click();

    // Wait for the query to fire with the new position filter
    await expect.poll(() => queryPositions, { timeout: 5000 }).toContain('SS');
  });
});

// ── Tests: Claim Flow ────────────────────────────────────────────────────────

test.describe('Free Agents — claim button initiates waiver claim flow @critical', () => {
  test('clicking add button opens the waiver claim modal', async ({ page }) => {
    await setupGraphQL(page);
    await page.goto(FREE_AGENTS_URL);
    await page.waitForLoadState('load');

    // Wait for players to render
    await expect(page.getByText('Babe Ruth')).toBeVisible();

    // Click the claim button for Babe Ruth (aria-label "Add Babe Ruth")
    await page.getByRole('button', { name: /Add Babe Ruth/i }).click();

    // The WaiverClaimModal should open with "Claim Free Agent" header
    await expect(page.getByText('Claim Free Agent')).toBeVisible();
    // And it should display the player name
    await expect(page.getByText('Babe Ruth').last()).toBeVisible();
  });

  test('submitting claim triggers ClaimFreeAgent mutation and shows success', async ({
    page,
  }) => {
    const claimedPlayers: number[] = [];
    await setupGraphQL(page, {
      onClaimFreeAgent: ({ playerId }) => {
        claimedPlayers.push(playerId);
      },
    });
    await page.goto(FREE_AGENTS_URL);
    await page.waitForLoadState('load');

    await expect(page.getByText('Babe Ruth')).toBeVisible();

    // Open the claim modal
    await page.getByRole('button', { name: /Add Babe Ruth/i }).click();

    await expect(page.getByText('Claim Free Agent')).toBeVisible();

    // Click the submit button in the modal
    // The WaiverClaimModal has a "Submit Claim" button
    await page.getByRole('button', { name: /Submit Claim/i }).click();

    // Verify the mutation was called with the correct player
    await expect.poll(() => claimedPlayers, { timeout: 10000 }).toContain(101);

    // Verify success confirmation UI
    await expect(page.getByText('Waiver Claim Submitted!')).toBeVisible();
    await expect(
      page.getByText(/Your claim for Babe Ruth has been submitted/i),
    ).toBeVisible();
  });

  test('Done button closes the success modal', async ({ page }) => {
    await setupGraphQL(page);
    await page.goto(FREE_AGENTS_URL);
    await page.waitForLoadState('load');

    await expect(page.getByText('Babe Ruth')).toBeVisible();

    // Open claim modal, submit
    await page.getByRole('button', { name: /Add Babe Ruth/i }).click();
    await page.getByRole('button', { name: /Submit Claim/i }).click();

    await expect(page.getByText('Waiver Claim Submitted!')).toBeVisible();

    // Click Done to close
    await page.getByRole('button', { name: /Done/i }).click();

    // Modal should close — "Waiver Claim Submitted!" should no longer be visible
    await expect(page.getByText('Waiver Claim Submitted!')).not.toBeVisible();
  });
});

// ── Tests: Empty State ───────────────────────────────────────────────────────

test.describe('Free Agents — empty state @regression', () => {
  test('shows "No players found" when query returns empty array', async ({
    page,
  }) => {
    await setupGraphQL(page, { players: [] });
    await page.goto(FREE_AGENTS_URL);
    await page.waitForLoadState('load');

    await expect(page.getByText('No players found')).toBeVisible();
    await expect(
      page.getByText(/Try adjusting your search or position filter/i),
    ).toBeVisible();
  });

  test('shows error state when query fails', async ({ page }) => {
    await setupGraphQL(page, { errorPlayers: true });
    await page.goto(FREE_AGENTS_URL);
    await page.waitForLoadState('load');

    await expect(
      page.getByTestId('main-content').getByText('Unable to load players'),
    ).toBeVisible();
  });
});
