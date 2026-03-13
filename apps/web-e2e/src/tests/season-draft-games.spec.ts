/**
 * E2E Tests: Season Draft Games (LS-695)
 *
 * Covers:
 *  - Lobby page (/games/season-draft): game listing, empty state, create button
 *  - Active and completed game cards with status badges
 *  - "Your Turn" indicator for drafting games
 *  - Create game page (/games/season-draft/create): form fields, cancel
 *
 * All GraphQL queries are mocked so these tests run without a live backend.
 */

import { expect } from '@playwright/test';
import { test } from '../fixtures/auth-enhanced';

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
const GAMES_RESPONSE_EMPTY = {
  data: {
    seasonDraftGames: [],
  },
};

const GAMES_RESPONSE_WITH_GAMES = {
  data: {
    seasonDraftGames: [
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
        name: 'Old Season Game',
        status: 'completed',
        statKey: 'h',
        gameMode: 'season',
        playerType: 'hitter',
        isMyTurn: false,
      },
      {
        __typename: 'SeasonDraftGame',
        id: 4,
        name: 'Cancelled Game',
        status: 'cancelled',
        statKey: 'rbi',
        gameMode: 'season',
        playerType: 'hitter',
        isMyTurn: false,
      },
    ],
  },
};

async function mockSeasonDraftGamesGraphQL(
  page: import('@playwright/test').Page,
  response: object,
) {
  await page.route(isGraphQLEndpoint, async (route, request) => {
    const body = request.postDataJSON() as { operationName?: string };
    if (body?.operationName === 'GetSeasonDraftGames') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(response),
      });
      return;
    }
    await route.fallback();
  });
}

// ── Lobby page ─────────────────────────────────────────────────────────────

test.describe('Season Draft Games Lobby', () => {
  test('shows page heading and create button @smoke', async ({ page }) => {
    await mockSeasonDraftGamesGraphQL(page, GAMES_RESPONSE_EMPTY);
    await page.goto('/games/season-draft');

    await expect(
      page.getByRole('heading', { name: /season draft games/i }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /new game/i })).toBeVisible();
  });

  test('shows empty state when no games exist @critical', async ({ page }) => {
    await mockSeasonDraftGamesGraphQL(page, GAMES_RESPONSE_EMPTY);
    await page.goto('/games/season-draft');

    await expect(page.getByText(/no games yet/i)).toBeVisible();
    await expect(
      page.getByRole('button', { name: /create game/i }),
    ).toBeVisible();
  });

  test('lists active games with name and status @critical', async ({
    page,
  }) => {
    await mockSeasonDraftGamesGraphQL(page, GAMES_RESPONSE_WITH_GAMES);
    await page.goto('/games/season-draft');

    await expect(page.getByText('Home Run Derby')).toBeVisible();
    await expect(page.getByText('Strikeout Masters')).toBeVisible();
    await expect(page.getByText(/in progress/i)).toBeVisible();
    await expect(page.getByText(/setup/i)).toBeVisible();
  });

  test('shows "Your Turn!" indicator for active drafting games @critical', async ({
    page,
  }) => {
    await mockSeasonDraftGamesGraphQL(page, GAMES_RESPONSE_WITH_GAMES);
    await page.goto('/games/season-draft');

    await expect(page.getByText(/your turn/i)).toBeVisible();
  });

  test('shows completed games section @regression', async ({ page }) => {
    await mockSeasonDraftGamesGraphQL(page, GAMES_RESPONSE_WITH_GAMES);
    await page.goto('/games/season-draft');

    await expect(page.getByText('Old Season Game')).toBeVisible();
    await expect(page.getByText(/completed/i)).toBeVisible();
  });

  test('displays stat key labels for games @regression', async ({ page }) => {
    await mockSeasonDraftGamesGraphQL(page, GAMES_RESPONSE_WITH_GAMES);
    await page.goto('/games/season-draft');

    // Home Runs is the STAT_LABELS entry for 'hr'
    await expect(page.getByText(/home runs/i)).toBeVisible();
    // Strikeouts is the STAT_LABELS entry for 'so'
    await expect(page.getByText(/strikeouts/i)).toBeVisible();
  });

  test('navigates to create page when New Game clicked @critical', async ({
    page,
  }) => {
    await mockSeasonDraftGamesGraphQL(page, GAMES_RESPONSE_EMPTY);
    await page.goto('/games/season-draft');

    await page.getByRole('button', { name: /new game/i }).click();
    await expect(page).toHaveURL(/\/games\/season-draft\/create/);
  });
});

// ── Create game page ───────────────────────────────────────────────────────

test.describe('Season Draft Game Create Page', () => {
  async function mockCreatePageGraphQL(page: import('@playwright/test').Page) {
    await page.route(isGraphQLEndpoint, async (route, request) => {
      const body = request.postDataJSON() as { operationName?: string };
      if (body?.operationName === 'CreateSeasonDraftGame') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              createSeasonDraftGame: {
                __typename: 'SeasonDraftGame',
                id: 100,
                name: 'New Game',
                status: 'setup',
                statKey: 'hr',
                gameMode: 'season',
                playerType: 'hitter',
                isMyTurn: false,
              },
            },
          }),
        });
        return;
      }
      if (body?.operationName === 'SearchUsersForDraft') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { searchUsers: [] } }),
        });
        return;
      }
      await route.fallback();
    });
  }

  test('shows create form heading @smoke', async ({ page }) => {
    await mockCreatePageGraphQL(page);
    await page.goto('/games/season-draft/create');

    await expect(
      page.getByRole('heading', { name: /create.*season draft game/i }),
    ).toBeVisible();
  });

  test('shows game name input field @critical', async ({ page }) => {
    await mockCreatePageGraphQL(page);
    await page.goto('/games/season-draft/create');

    await expect(page.getByPlaceholder(/game name/i)).toBeVisible();
  });

  test('cancel button returns to lobby @critical', async ({ page }) => {
    await mockCreatePageGraphQL(page);
    await page.goto('/games/season-draft/create');

    const cancelBtn = page.getByRole('button', { name: /cancel/i });
    await expect(cancelBtn).toBeVisible();
    await cancelBtn.click();
    await expect(page).toHaveURL(/\/games\/season-draft$/);
  });

  test('shows hitter and pitcher player type options @regression', async ({
    page,
  }) => {
    await mockCreatePageGraphQL(page);
    await page.goto('/games/season-draft/create');

    await expect(page.getByText(/hitter/i)).toBeVisible();
    await expect(page.getByText(/pitcher/i)).toBeVisible();
  });

  test('shows stat key selection options @regression', async ({ page }) => {
    await mockCreatePageGraphQL(page);
    await page.goto('/games/season-draft/create');

    // Home Runs is the default/first hitter stat option
    await expect(page.getByText(/home runs/i)).toBeVisible();
  });

  test('shows invite players search section @regression', async ({ page }) => {
    await page.route(isGraphQLEndpoint, async (route, request) => {
      const body = request.postDataJSON() as { operationName?: string };
      if (body?.operationName === 'SearchUsersForDraft') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              searchUsers: [
                {
                  __typename: 'User',
                  id: 99,
                  username: 'frienduser',
                  avatarUrl: null,
                },
              ],
            },
          }),
        });
        return;
      }
      await route.fallback();
    });

    await page.goto('/games/season-draft/create');

    // There should be a search/invite players section
    await expect(
      page.getByPlaceholder(/search.*user|invite|username/i),
    ).toBeVisible();
  });
});
