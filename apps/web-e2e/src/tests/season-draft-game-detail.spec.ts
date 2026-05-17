/**
 * E2E Tests: Season Draft Game Detail (LS-603)
 *
 * Extends LS-695 coverage with the game detail page (/games/season-draft/:gameId):
 *   - Setup phase: game info, player list, Start Draft / Cancel Game buttons
 *   - Active drafting: turn indicator, player search, season/team picker, position slots, confirm pick
 *   - Scoreboard and roster display
 *   - Draft history (pick log)
 *   - Completed game state
 *   - Cancelled game state
 *   - Cancel confirmation dialog
 *
 * All GraphQL queries are mocked so these tests run without a live backend.
 */

import { expect } from '../fixtures/auth-enhanced';
import { test } from '../fixtures/auth-enhanced';
import { unmockedGraphQLFallback } from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

// ── Helpers ──────────────────────────────────────────────────────────────────

// ── Mock Data ────────────────────────────────────────────────────────────────

const CURRENT_USER_ID = 1;

function makeRosterSlot(
  id: number,
  position: string,
  slotNumber: number,
  isFilled: boolean,
  pick?: {
    playerName: string;
    season: number;
    statValue: number;
    team?: string | null;
  },
) {
  return {
    __typename: 'SeasonDraftRosterSlot' as const,
    id,
    position,
    slotNumber,
    isFilled,
    pick: pick ? { __typename: 'SeasonDraftPick' as const, ...pick } : null,
  };
}

function makeGameResponse(overrides: {
  status?: 'setup' | 'drafting' | 'completed' | 'cancelled';
  currentTurn?: number;
  picks?: Array<{
    pickNumber: number;
    playerName: string;
    draftingUser: string;
    baseballPlayerName: string;
    season: number;
    position: string;
    statValue: number;
    team?: string | null;
    pickedAt: string;
  }>;
  players?: Array<{
    id: number;
    userId: number;
    playerName: string;
    draftOrder: number;
    totalScore: number;
    roster: Array<ReturnType<typeof makeRosterSlot>>;
  }>;
}) {
  const status = overrides.status ?? 'setup';
  const defaultPlayers = [
    {
      __typename: 'SeasonDraftPlayer' as const,
      id: 1,
      userId: CURRENT_USER_ID,
      playerName: 'TestUser',
      draftOrder: 0,
      totalScore: overrides.players?.[0]?.totalScore ?? 0,
      roster: overrides.players?.[0]?.roster ?? [
        makeRosterSlot(101, 'OF', 0, false),
        makeRosterSlot(102, '1B', 0, false),
        makeRosterSlot(103, 'SS', 0, false),
      ],
    },
    {
      __typename: 'SeasonDraftPlayer' as const,
      id: 2,
      userId: 99,
      playerName: 'Opponent',
      draftOrder: 1,
      totalScore: overrides.players?.[1]?.totalScore ?? 0,
      roster: overrides.players?.[1]?.roster ?? [
        makeRosterSlot(201, 'OF', 0, false),
        makeRosterSlot(202, '1B', 0, false),
        makeRosterSlot(203, 'SS', 0, false),
      ],
    },
  ];

  const picks = (overrides.picks ?? []).map((p) => ({
    __typename: 'SeasonDraftGamePickHistory' as const,
    ...p,
  }));

  return {
    data: {
      seasonDraftGame: {
        __typename: 'SeasonDraftGame',
        id: 1,
        name: 'Home Run Derby',
        status,
        currentTurn: overrides.currentTurn ?? 0,
        createdBy: CURRENT_USER_ID,
        statKey: 'hr',
        gameMode: 'season',
        playerType: 'hitter',
        players: overrides.players
          ? overrides.players.map((p) => ({
              __typename: 'SeasonDraftPlayer' as const,
              ...p,
            }))
          : defaultPlayers,
        picks,
      },
    },
  };
}

/** Setup phase game — waiting for creator to start. */
const SETUP_GAME = makeGameResponse({ status: 'setup' });

/** Drafting game — current user's turn. */
const DRAFTING_MY_TURN = makeGameResponse({
  status: 'drafting',
  currentTurn: 0,
});

/** Drafting game — opponent's turn. */
const DRAFTING_OPPONENT_TURN = makeGameResponse({
  status: 'drafting',
  currentTurn: 1,
});

/** Completed game with picks and scores. */
const COMPLETED_GAME = makeGameResponse({
  status: 'completed',
  players: [
    {
      id: 1,
      userId: CURRENT_USER_ID,
      playerName: 'TestUser',
      draftOrder: 0,
      totalScore: 108,
      roster: [
        makeRosterSlot(101, 'OF', 0, true, {
          playerName: 'Aaron Judge',
          season: 2022,
          statValue: 62,
          team: null,
        }),
        makeRosterSlot(102, '1B', 0, true, {
          playerName: 'Pete Alonso',
          season: 2019,
          statValue: 46,
          team: null,
        }),
        makeRosterSlot(103, 'SS', 0, false),
      ],
    },
    {
      id: 2,
      userId: 99,
      playerName: 'Opponent',
      draftOrder: 1,
      totalScore: 95,
      roster: [
        makeRosterSlot(201, 'OF', 0, true, {
          playerName: 'Shohei Ohtani',
          season: 2023,
          statValue: 44,
          team: null,
        }),
        makeRosterSlot(202, '1B', 0, true, {
          playerName: 'Matt Olson',
          season: 2023,
          statValue: 51,
          team: null,
        }),
        makeRosterSlot(203, 'SS', 0, false),
      ],
    },
  ],
  picks: [
    {
      pickNumber: 0,
      playerName: 'TestUser',
      draftingUser: 'TestUser',
      baseballPlayerName: 'Aaron Judge',
      season: 2022,
      position: 'OF',
      statValue: 62,
      team: null,
      pickedAt: '2026-03-15T12:00:00Z',
    },
    {
      pickNumber: 1,
      playerName: 'Opponent',
      draftingUser: 'Opponent',
      baseballPlayerName: 'Shohei Ohtani',
      season: 2023,
      position: 'OF',
      statValue: 44,
      team: null,
      pickedAt: '2026-03-15T12:01:00Z',
    },
    {
      pickNumber: 2,
      playerName: 'TestUser',
      draftingUser: 'TestUser',
      baseballPlayerName: 'Pete Alonso',
      season: 2019,
      position: '1B',
      statValue: 46,
      team: null,
      pickedAt: '2026-03-15T12:02:00Z',
    },
    {
      pickNumber: 3,
      playerName: 'Opponent',
      draftingUser: 'Opponent',
      baseballPlayerName: 'Matt Olson',
      season: 2023,
      position: '1B',
      statValue: 51,
      team: null,
      pickedAt: '2026-03-15T12:03:00Z',
    },
  ],
});

/** Cancelled game. */
const CANCELLED_GAME = makeGameResponse({ status: 'cancelled' });

/** Player search results. */
const SEARCH_PLAYERS_RESPONSE = {
  data: {
    players: [
      {
        __typename: 'Player',
        id: 10,
        firstName: 'Aaron',
        lastName: 'Judge',
        statsLastFetchedAt: '2026-03-01T00:00:00Z',
      },
      {
        __typename: 'Player',
        id: 11,
        firstName: 'Shohei',
        lastName: 'Ohtani',
        statsLastFetchedAt: '2026-03-01T00:00:00Z',
      },
    ],
  },
};

/** Player season options (available seasons for a player). */
const PLAYER_OPTIONS_RESPONSE = {
  data: {
    seasonDraftGamePlayerOptions: ['2022', '2023', '2024'],
  },
};

// ── Route Setup ──────────────────────────────────────────────────────────────

async function setupGameMocks(
  page: import('@playwright/test').Page,
  gameResponse: object,
) {
  await page.route(isGraphQLEndpoint, async (route, request) => {
    const body = request.postDataJSON() as { operationName?: string };
    const opName = body?.operationName ?? '';

    if (opName === 'GetSeasonDraftGame') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(gameResponse),
      });
    } else if (opName === 'SearchPlayersForDraft') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(SEARCH_PLAYERS_RESPONSE),
      });
    } else if (opName === 'GetSeasonDraftGamePlayerOptions') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(PLAYER_OPTIONS_RESPONSE),
      });
    } else if (
      opName === 'StartSeasonDraftGame' ||
      opName === 'CancelSeasonDraftGame'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            [opName === 'StartSeasonDraftGame'
              ? 'startSeasonDraftGame'
              : 'cancelSeasonDraftGame']: true,
          },
        }),
      });
    } else if (opName === 'GetSeasonDraftGameStatValue') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { seasonDraftGamePlayerSeasonStatValue: 42 },
        }),
      });
    } else if (
      opName === 'TriggerSeasonDraftStatLoading' ||
      opName === 'MakeSeasonDraftPick'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            [opName === 'TriggerSeasonDraftStatLoading'
              ? 'triggerSeasonDraftStatLoading'
              : 'makeSeasonDraftPick']: true,
          },
        }),
      });
    } else {
      await unmockedGraphQLFallback(route);
    }
  });
}

/**
 * Navigate to the game detail page.
 *
 * The route mock (setupGameMocks) fulfills GetSeasonDraftGame synchronously,
 * so by the time page.goto resolves the data is already available to Apollo.
 * Playwright expect assertions auto-retry with a 5s timeout which is enough
 * for React to commit the render on even the slowest CI runners.
 */
async function gotoGamePage(page: import('@playwright/test').Page) {
  await page.goto('/games/season-draft/1');
}

// ── Tests: Setup phase ──────────────────────────────────────────────────────

test.describe('Season Draft Game – setup phase @critical', () => {
  test('shows game name in header', async ({ page }) => {
    await setupGameMocks(page, SETUP_GAME);
    await gotoGamePage(page);

    await expect(page.getByText('Home Run Derby')).toBeVisible();
  });

  test('shows Hitter Draft and Home Runs stat labels', async ({ page }) => {
    await setupGameMocks(page, SETUP_GAME);
    await gotoGamePage(page);

    // New design shows abbreviated stat chip "HR" and "Hitters" player type label
    await expect(page.getByText('Hitters').first()).toBeVisible();
    await expect(page.getByText('HR').first()).toBeVisible();
  });

  test('shows Game Setup card with start controls for creator', async ({
    page,
  }) => {
    await setupGameMocks(page, SETUP_GAME);
    await gotoGamePage(page);

    // Phase label is "Waiting Room"; setup panel shows "Invite Link" eyebrow
    await expect(page.getByText('Invite Link').first()).toBeVisible();
    // Creator sees Start Draft and Cancel Game buttons (not a "waiting" message)
    await expect(page.getByText('Start Draft')).toBeVisible();
    await expect(page.getByText('Cancel Game').first()).toBeVisible();
  });

  test('shows player names in setup card', async ({ page }) => {
    await setupGameMocks(page, SETUP_GAME);
    await gotoGamePage(page);

    // V2 SetupPanel shows 'You' for the current user (userId=1), not the raw playerName
    await expect(page.getByText('You').first()).toBeVisible();
    await expect(page.getByText(/Opponent/).first()).toBeVisible();
  });

  test('shows Start Draft and Cancel Game buttons for creator', async ({
    page,
  }) => {
    await setupGameMocks(page, SETUP_GAME);
    await gotoGamePage(page);

    await expect(page.getByText('Start Draft')).toBeVisible();
    await expect(page.getByText('Cancel Game').first()).toBeVisible();
  });

  test('shows Scoreboard section with both players', async ({ page }) => {
    // Scoreboard renders in drafting/completed phase (not setup)
    await setupGameMocks(page, DRAFTING_MY_TURN);
    await gotoGamePage(page);

    await expect(page.getByText('Scoreboard')).toBeVisible();
  });

  test('shows Rosters section with empty slots', async ({ page }) => {
    // Rosters renders in drafting/completed phase (not setup)
    await setupGameMocks(page, DRAFTING_MY_TURN);
    await gotoGamePage(page);

    await expect(page.getByText('Rosters')).toBeVisible();
    await expect(page.getByText('Empty').first()).toBeVisible();
  });

  test('shows Picks history with "No picks yet"', async ({ page }) => {
    // Picks history renders in drafting/completed phase (not setup); section title is "Picks"
    await setupGameMocks(page, DRAFTING_MY_TURN);
    await gotoGamePage(page);

    await expect(page.getByText('Picks', { exact: true })).toBeVisible();
    await expect(page.getByText(/no picks yet/i)).toBeVisible();
  });
});

// ── Tests: Active drafting — my turn ────────────────────────────────────────

test.describe('Season Draft Game – drafting (my turn) @critical', () => {
  test('shows "Your Turn!" indicator', async ({ page }) => {
    await setupGameMocks(page, DRAFTING_MY_TURN);
    await gotoGamePage(page);

    // Component renders "Your Turn" (no exclamation mark) as badge text
    await expect(page.getByText('Your Turn').first()).toBeVisible();
  });

  test('shows Make Your Pick section', async ({ page }) => {
    await setupGameMocks(page, DRAFTING_MY_TURN);
    await gotoGamePage(page);

    // H1 in DraftPickPanel reads "Make your pick." (lowercase, with period)
    await expect(page.getByText(/make your pick/i)).toBeVisible();
  });

  test('shows player search input', async ({ page }) => {
    await setupGameMocks(page, DRAFTING_MY_TURN);
    await gotoGamePage(page);

    // Placeholder uses Unicode ellipsis (…), match by regex
    await expect(page.getByPlaceholder(/search player name/i)).toBeVisible();
  });

  test('shows position slot selection', async ({ page }) => {
    await setupGameMocks(page, DRAFTING_MY_TURN);
    await gotoGamePage(page);

    // "Assign Position" only renders after selecting a player AND a season.
    // Step 1: type in search to trigger SearchPlayersForDraft (300ms debounce)
    await page.getByPlaceholder(/search player name/i).fill('Aaron');
    // Step 2: select the player suggestion
    await page.getByText('Aaron Judge').click();
    // Step 3: season options load via GetSeasonDraftGamePlayerOptions — pick one
    await expect(page.getByRole('button', { name: '2022' })).toBeVisible();
    await page.getByRole('button', { name: '2022' }).click();
    // Now "Assign Position" step is visible with open-slot buttons. Use
    // exact match — V2 also renders an avatar trigger button whose
    // accessible name happens to contain "OF".
    await expect(page.getByText('Assign Position')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'OF', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: '1B', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'SS', exact: true }),
    ).toBeVisible();
  });

  test('shows Confirm Pick button (disabled by default)', async ({ page }) => {
    await setupGameMocks(page, DRAFTING_MY_TURN);
    await gotoGamePage(page);

    // Button text is "Confirm Pick · Home Runs" — match by partial name
    const confirmBtn = page.getByRole('button', { name: /Confirm Pick/i });
    await expect(confirmBtn).toBeVisible();
    await expect(confirmBtn).toBeDisabled();
  });

  test('shows Cancel Game button for creator during drafting', async ({
    page,
  }) => {
    await setupGameMocks(page, DRAFTING_MY_TURN);
    await gotoGamePage(page);

    await expect(page.getByText('Cancel Game').first()).toBeVisible();
  });
});

// ── Tests: Active drafting — opponent's turn ────────────────────────────────

test.describe('Season Draft Game – drafting (opponent turn) @regression', () => {
  test('shows waiting message for opponent', async ({ page }) => {
    await setupGameMocks(page, DRAFTING_OPPONENT_TURN);
    await gotoGamePage(page);

    // WaitingPanel renders "{activeName} is picking…" (opponent's name at currentTurn=1)
    await expect(page.getByText(/Opponent is picking/i)).toBeVisible();
  });

  test('does NOT show Make Your Pick section', async ({ page }) => {
    await setupGameMocks(page, DRAFTING_OPPONENT_TURN);
    await gotoGamePage(page);

    await expect(page.getByText(/make your pick/i)).not.toBeVisible();
  });

  test('still shows Scoreboard and Rosters', async ({ page }) => {
    await setupGameMocks(page, DRAFTING_OPPONENT_TURN);
    await gotoGamePage(page);

    await expect(page.getByText('Scoreboard')).toBeVisible();
    await expect(page.getByText('Rosters')).toBeVisible();
  });
});

// ── Tests: Completed game ───────────────────────────────────────────────────

test.describe('Season Draft Game – completed @regression', () => {
  test('shows completed status in header', async ({ page }) => {
    await setupGameMocks(page, COMPLETED_GAME);
    await gotoGamePage(page);

    // Phase label for completed game is "Game Complete" (eyebrow in header)
    await expect(page.getByText('Game Complete').first()).toBeVisible();
  });

  test('shows final scores in scoreboard', async ({ page }) => {
    await setupGameMocks(page, COMPLETED_GAME);
    await gotoGamePage(page);

    await expect(page.getByText('Scoreboard')).toBeVisible();
    // TestUser: 108, Opponent: 95
    await expect(page.getByText(/108/).first()).toBeVisible();
    await expect(page.getByText(/95/).first()).toBeVisible();
  });

  test('shows filled roster slots with player names and stats', async ({
    page,
  }) => {
    await setupGameMocks(page, COMPLETED_GAME);
    await gotoGamePage(page);

    await expect(page.getByText('Rosters')).toBeVisible();
    // Aaron Judge (2022) 62 HR
    await expect(page.getByText('Aaron Judge').first()).toBeVisible();
    await expect(page.getByText(/62/).first()).toBeVisible();
    // Pete Alonso (2019) 46 HR
    await expect(page.getByText('Pete Alonso').first()).toBeVisible();
    await expect(page.getByText(/46/).first()).toBeVisible();
  });

  test('shows draft history with all picks', async ({ page }) => {
    await setupGameMocks(page, COMPLETED_GAME);
    await gotoGamePage(page);

    // Section title is "Picks" (not "Draft History") in HistoryCard
    await expect(page.getByText('Picks', { exact: true })).toBeVisible();
    // Pick numbers are zero-padded (pickNumber+1 padStart 2): "01", "02"
    await expect(page.getByText('01', { exact: true })).toBeVisible();
    // Baseball player names from picks
    await expect(page.getByText('Aaron Judge').first()).toBeVisible();
    await expect(page.getByText('Shohei Ohtani').first()).toBeVisible();
  });

  test('does NOT show Make Your Pick or setup card', async ({ page }) => {
    await setupGameMocks(page, COMPLETED_GAME);
    await gotoGamePage(page);

    await expect(page.getByText(/make your pick/i)).not.toBeVisible();
    await expect(page.getByText('Game Setup')).not.toBeVisible();
  });
});

// ── Tests: Cancelled game ───────────────────────────────────────────────────

test.describe('Season Draft Game – cancelled @regression', () => {
  test('shows Game Cancelled message', async ({ page }) => {
    await setupGameMocks(page, CANCELLED_GAME);
    await gotoGamePage(page);

    // V2 renders the cancelled label twice (chip + body); .first() is enough
    // to confirm at least one is on-screen.
    await expect(page.getByText('Game Cancelled').first()).toBeVisible();
    await expect(page.getByText(/this game has been cancelled/i)).toBeVisible();
  });

  test('does NOT show Start Draft or Make Your Pick', async ({ page }) => {
    await setupGameMocks(page, CANCELLED_GAME);
    await gotoGamePage(page);

    await expect(page.getByText('Start Draft')).not.toBeVisible();
    await expect(page.getByText('Make Your Pick')).not.toBeVisible();
  });
});

// ── Tests: Cancel confirmation dialog ───────────────────────────────────────

test.describe('Season Draft Game – cancel confirmation @regression', () => {
  test('clicking Cancel Game opens confirmation dialog', async ({ page }) => {
    await setupGameMocks(page, SETUP_GAME);
    await gotoGamePage(page);

    await page.getByText('Cancel Game').first().click();

    // Confirmation dialog should appear
    await expect(
      page.getByText(/are you sure you want to cancel/i),
    ).toBeVisible();
    await expect(page.getByText('Yes, Cancel Game')).toBeVisible();
    await expect(page.getByText('No, Keep Playing')).toBeVisible();
  });

  test('clicking "No, Keep Playing" closes dialog without cancelling', async ({
    page,
  }) => {
    await setupGameMocks(page, SETUP_GAME);
    await gotoGamePage(page);

    await page.getByText('Cancel Game').first().click();
    await expect(
      page.getByText(/are you sure you want to cancel/i),
    ).toBeVisible();

    await page.getByText('No, Keep Playing').click();

    // Dialog should close; setup panel "Invite Link" eyebrow still visible
    await expect(
      page.getByText(/are you sure you want to cancel/i),
    ).not.toBeVisible();
    await expect(page.getByText('Invite Link').first()).toBeVisible();
  });
});

// ── Tests: Player search in draft interface ─────────────────────────────────

test.describe('Season Draft Game – player search @regression', () => {
  test('typing in search shows player suggestions', async ({ page }) => {
    await setupGameMocks(page, DRAFTING_MY_TURN);
    await gotoGamePage(page);

    // Placeholder uses Unicode ellipsis (…), match by regex
    const searchInput = page.getByPlaceholder(/search player name/i);
    await searchInput.fill('Aaron');

    // Wait for search results from mock
    await expect(page.getByText('Aaron Judge').first()).toBeVisible();
  });

  test('shows Select Season label after player is selected', async ({
    page,
  }) => {
    await setupGameMocks(page, DRAFTING_MY_TURN);
    await gotoGamePage(page);

    // Placeholder uses Unicode ellipsis (…), match by regex
    const searchInput = page.getByPlaceholder(/search player name/i);
    await searchInput.fill('Aaron');

    await expect(async () => {
      await page.getByText('Aaron Judge').first().click({ timeout: 2000 });
    }).toPass({ timeout: 15000 });

    // Field label is "Choose a Season" (not "Select Season:")
    await expect(page.getByText('Choose a Season')).toBeVisible();
  });
});

// ── Tests: Game mode display ────────────────────────────────────────────────

test.describe('Season Draft Game – game mode info @smoke', () => {
  test('shows Season mode label in header', async ({ page }) => {
    await setupGameMocks(page, SETUP_GAME);
    await gotoGamePage(page);

    await expect(page.getByText('Season').first()).toBeVisible();
  });
});
