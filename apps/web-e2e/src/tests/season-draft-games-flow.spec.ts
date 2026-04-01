/**
 * E2E Tests: Season Draft Games — Create → Lobby → Start Flow (LS-1624)
 *
 * Covers:
 *  - Game list page displays games correctly
 *  - Create game button opens configuration form
 *  - Game configuration shows team count and settings
 *  - Game lobby shows joined players and ready status
 *  - Start game button visible when enough players ready
 *
 * All GraphQL queries are mocked so these tests run without a live backend.
 */

import { expect, test } from '../fixtures/auth-enhanced';
import { unmockedGraphQLFallback } from '../fixtures/shared-mocks';

// ── Helpers ────────────────────────────────────────────────────────────────

function isGraphQLEndpoint(url: URL): boolean {
  const s = url.toString();
  return (
    s.includes('/graphql') &&
    !s.includes('/@fs/') &&
    !s.includes('.ts') &&
    !s.includes('.js')
  );
}

// ── Mock Data ──────────────────────────────────────────────────────────────

const MOCK_GAMES = [
  {
    __typename: 'SeasonDraftGame',
    id: 1,
    name: 'Home Run Derby',
    status: 'drafting',
    statKey: 'hr',
    gameMode: 'season',
    playerType: 'hitter',
    isMyTurn: true,
  },
  {
    __typename: 'SeasonDraftGame',
    id: 2,
    name: 'Strikeout Masters',
    status: 'setup',
    statKey: 'so',
    gameMode: 'career_team',
    playerType: 'pitcher',
    isMyTurn: false,
  },
  {
    __typename: 'SeasonDraftGame',
    id: 3,
    name: 'Completed Classics',
    status: 'completed',
    statKey: 'h',
    gameMode: 'season',
    playerType: 'hitter',
    isMyTurn: false,
  },
];

const MOCK_GAME_DETAIL_SETUP = {
  data: {
    seasonDraftGame: {
      __typename: 'SeasonDraftGame',
      id: 2,
      name: 'Strikeout Masters',
      status: 'setup',
      currentTurn: 0,
      createdBy: 1, // matches the test user id from auth-enhanced fixture
      statKey: 'so',
      gameMode: 'career_team',
      playerType: 'pitcher',
      players: [
        {
          __typename: 'SeasonDraftPlayer',
          id: 10,
          userId: 1,
          playerName: 'testuser',
          draftOrder: 0,
          totalScore: 0,
          roster: [
            {
              __typename: 'SeasonDraftRosterSlot',
              id: 100,
              position: 'SP',
              slotNumber: 0,
              isFilled: false,
              pick: null,
            },
            {
              __typename: 'SeasonDraftRosterSlot',
              id: 101,
              position: 'SP',
              slotNumber: 1,
              isFilled: false,
              pick: null,
            },
          ],
        },
        {
          __typename: 'SeasonDraftPlayer',
          id: 11,
          userId: 2,
          playerName: 'opponent1',
          draftOrder: 1,
          totalScore: 0,
          roster: [
            {
              __typename: 'SeasonDraftRosterSlot',
              id: 200,
              position: 'SP',
              slotNumber: 0,
              isFilled: false,
              pick: null,
            },
            {
              __typename: 'SeasonDraftRosterSlot',
              id: 201,
              position: 'SP',
              slotNumber: 1,
              isFilled: false,
              pick: null,
            },
          ],
        },
      ],
      picks: [],
    },
  },
};

const MOCK_GAME_DETAIL_DRAFTING = {
  data: {
    seasonDraftGame: {
      __typename: 'SeasonDraftGame',
      id: 1,
      name: 'Home Run Derby',
      status: 'drafting',
      currentTurn: 0,
      createdBy: 1,
      statKey: 'hr',
      gameMode: 'season',
      playerType: 'hitter',
      players: [
        {
          __typename: 'SeasonDraftPlayer',
          id: 10,
          userId: 1,
          playerName: 'testuser',
          draftOrder: 0,
          totalScore: 15,
          roster: [
            {
              __typename: 'SeasonDraftRosterSlot',
              id: 100,
              position: '1B',
              slotNumber: 0,
              isFilled: true,
              pick: {
                __typename: 'SeasonDraftPick',
                playerName: 'Babe Ruth',
                season: 1927,
                statValue: 60,
                team: null,
              },
            },
            {
              __typename: 'SeasonDraftRosterSlot',
              id: 101,
              position: 'OF',
              slotNumber: 0,
              isFilled: false,
              pick: null,
            },
          ],
        },
        {
          __typename: 'SeasonDraftPlayer',
          id: 11,
          userId: 2,
          playerName: 'opponent1',
          draftOrder: 1,
          totalScore: 10,
          roster: [
            {
              __typename: 'SeasonDraftRosterSlot',
              id: 200,
              position: '1B',
              slotNumber: 0,
              isFilled: false,
              pick: null,
            },
            {
              __typename: 'SeasonDraftRosterSlot',
              id: 201,
              position: 'OF',
              slotNumber: 0,
              isFilled: false,
              pick: null,
            },
          ],
        },
      ],
      picks: [
        {
          __typename: 'SeasonDraftGamePickHistory',
          pickNumber: 0,
          playerName: 'testuser',
          draftingUser: 'testuser',
          baseballPlayerName: 'Babe Ruth',
          season: 1927,
          position: '1B',
          statValue: 60,
          team: null,
          pickedAt: '2025-06-15T12:00:00Z',
        },
      ],
    },
  },
};

// ── Route mock helpers ─────────────────────────────────────────────────────

async function mockGamesListPage(page: import('@playwright/test').Page) {
  await page.route(isGraphQLEndpoint, async (route, request) => {
    const body = request.postDataJSON() as { operationName?: string };
    if (body?.operationName === 'GetSeasonDraftGames') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { seasonDraftGames: MOCK_GAMES } }),
      });
      return;
    }
    await unmockedGraphQLFallback(route);
  });
}

async function mockGameDetailSetup(page: import('@playwright/test').Page) {
  await page.route(isGraphQLEndpoint, async (route, request) => {
    const body = request.postDataJSON() as { operationName?: string };
    if (body?.operationName === 'GetSeasonDraftGame') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_GAME_DETAIL_SETUP),
      });
      return;
    }
    if (body?.operationName === 'GetSeasonDraftGames') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { seasonDraftGames: MOCK_GAMES } }),
      });
      return;
    }
    await unmockedGraphQLFallback(route);
  });
}

async function mockGameDetailDrafting(page: import('@playwright/test').Page) {
  await page.route(isGraphQLEndpoint, async (route, request) => {
    const body = request.postDataJSON() as { operationName?: string };
    if (body?.operationName === 'GetSeasonDraftGame') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_GAME_DETAIL_DRAFTING),
      });
      return;
    }
    if (body?.operationName === 'GetSeasonDraftGames') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { seasonDraftGames: MOCK_GAMES } }),
      });
      return;
    }
    await unmockedGraphQLFallback(route);
  });
}

async function mockCreatePageGraphQL(page: import('@playwright/test').Page) {
  await page.route(isGraphQLEndpoint, async (route, request) => {
    const body = request.postDataJSON() as { operationName?: string };
    if (body?.operationName === 'CreateSeasonDraftGame') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { createSeasonDraftGame: 50 } }),
      });
      return;
    }
    if (body?.operationName === 'SearchUsersForDraft') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            searchUsers: [
              {
                __typename: 'User',
                id: 2,
                username: 'frienduser',
                avatarUrl: null,
              },
            ],
          },
        }),
      });
      return;
    }
    if (body?.operationName === 'GetSeasonDraftGames') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { seasonDraftGames: [] } }),
      });
      return;
    }
    await unmockedGraphQLFallback(route);
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────

test.describe('Season Draft Games Flow @critical', () => {
  test('game list page shows active and completed games @smoke', async ({
    page,
  }) => {
    await mockGamesListPage(page);
    await page.goto('/games/season-draft');

    // Verify active games appear
    await expect(page.getByText('Home Run Derby')).toBeVisible();
    await expect(page.getByText('Strikeout Masters')).toBeVisible();

    // Verify completed games section
    await expect(page.getByText('Completed Classics')).toBeVisible();

    // Verify status labels
    await expect(page.getByText(/in progress/i)).toBeVisible();
    await expect(page.getByText('Setup', { exact: true })).toBeVisible();
    await expect(page.getByText('Completed', { exact: true })).toBeVisible();

    // Verify stat labels
    await expect(page.getByText(/home runs/i)).toBeVisible();
    await expect(page.getByText(/strikeouts/i)).toBeVisible();
  });

  test('create game button opens configuration form @critical', async ({
    page,
  }) => {
    await mockCreatePageGraphQL(page);
    await mockGamesListPage(page);
    await page.goto('/games/season-draft');

    // Click the New Game button in the header
    await page.getByRole('button', { name: /new game/i }).click();
    await expect(page).toHaveURL(/\/games\/season-draft\/create/);

    // Verify the create form heading appears
    await expect(
      page.getByRole('heading', { name: /new season draft/i }),
    ).toBeVisible();

    // Verify form fields are present
    await expect(page.getByPlaceholder(/hr challenge/i)).toBeVisible();
  });

  test('game configuration shows player type and stat options @critical', async ({
    page,
  }) => {
    await mockCreatePageGraphQL(page);
    await page.goto('/games/season-draft/create');

    // Player type selection (hitter / pitcher)
    await expect(page.getByText(/hitter/i).first()).toBeVisible();
    await expect(page.getByText(/pitcher/i).first()).toBeVisible();

    // Game mode options (season / career w/ team)
    await expect(page.getByText(/season/i).first()).toBeVisible();
    await expect(page.getByText(/career/i).first()).toBeVisible();

    // Stat key options — hitter stats shown by default
    await expect(page.getByText(/home runs/i)).toBeVisible();

    // Players section with count
    await expect(page.getByText(/players/i).first()).toBeVisible();
    // The current user should be listed (shows username or email + "(you)")
    await expect(page.getByText(/\(you\)/i).first()).toBeVisible();

    // Search input for inviting players
    await expect(page.getByPlaceholder(/search.*username/i)).toBeVisible();
  });

  test('game lobby shows joined players and game info @critical', async ({
    page,
  }) => {
    await mockGameDetailSetup(page);
    await page.goto('/games/season-draft/2');

    // Game name in header
    await expect(
      page.getByRole('heading', { name: /strikeout masters/i }),
    ).toBeVisible();

    // Game setup card
    await expect(page.getByText(/game setup/i)).toBeVisible();
    await expect(
      page.getByText(/waiting for the game creator to start/i),
    ).toBeVisible();

    // Players listed in the setup card
    await expect(page.getByText(/testuser/i).first()).toBeVisible();
    await expect(page.getByText(/opponent1/i).first()).toBeVisible();

    // Game configuration details in the header
    await expect(page.getByText(/pitcher/i).first()).toBeVisible();
    await expect(page.getByText(/strikeouts/i).first()).toBeVisible();
    await expect(page.getByText(/career/i).first()).toBeVisible();
  });

  test('start draft button visible for game creator in setup @critical', async ({
    page,
  }) => {
    await mockGameDetailSetup(page);
    await page.goto('/games/season-draft/2');

    // Creator should see the Start Draft button
    await expect(
      page.getByRole('button', { name: /start draft/i }),
    ).toBeVisible();

    // Creator should also see the Cancel Game button
    await expect(
      page.getByRole('button', { name: /cancel game/i }),
    ).toBeVisible();
  });

  test('drafting game shows scoreboard and draft history @regression', async ({
    page,
  }) => {
    await mockGameDetailDrafting(page);
    await page.goto('/games/season-draft/1');

    // Game name
    await expect(
      page.getByRole('heading', { name: /home run derby/i }),
    ).toBeVisible();

    // "Your Turn!" indicator (current user is draftOrder 0 and currentTurn is 0)
    await expect(page.getByText(/your turn/i).first()).toBeVisible();

    // Scoreboard section
    await expect(
      page.getByRole('heading', { name: /scoreboard/i }),
    ).toBeVisible();
    await expect(page.getByText(/testuser/i).first()).toBeVisible();
    await expect(page.getByText(/opponent1/i).first()).toBeVisible();

    // Draft history section
    await expect(
      page.getByRole('heading', { name: /draft history/i }),
    ).toBeVisible();
    await expect(page.getByText(/babe ruth/i).first()).toBeVisible();
  });
});
