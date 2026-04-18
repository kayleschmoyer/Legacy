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

import { expect, test, unauthTest } from '../fixtures/auth-enhanced';
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
    await unmockedGraphQLFallback(route);
  });
}

// ── Lobby page ─────────────────────────────────────────────────────────────

test.describe('Season Draft Games Lobby @critical', () => {
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

test.describe('Season Draft Game Create Page @critical', () => {
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
      await unmockedGraphQLFallback(route);
    });
  }

  /** Mock the lobby page query so navigating back from create doesn't trigger an unmocked op */
  async function mockLobbyGraphQL(page: import('@playwright/test').Page) {
    await page.route(isGraphQLEndpoint, async (route, request) => {
      const body = request.postDataJSON() as { operationName?: string };
      if (body?.operationName === 'GetSeasonDraftGames') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { getSeasonDraftGames: [] } }),
        });
        return;
      }
      await unmockedGraphQLFallback(route);
    });
  }

  test('shows create form heading @smoke', async ({ page }) => {
    await mockCreatePageGraphQL(page);
    await page.goto('/games/season-draft/create');

    await expect(
      page.getByRole('heading', { name: /new season draft/i }),
    ).toBeVisible();
  });

  test('shows game name input field @critical', async ({ page }) => {
    await mockCreatePageGraphQL(page);
    await page.goto('/games/season-draft/create');

    await expect(page.getByPlaceholder(/hr challenge/i)).toBeVisible();
  });

  test('cancel button returns to lobby @critical', async ({ page }) => {
    await mockLobbyGraphQL(page);
    await mockCreatePageGraphQL(page);
    await page.goto('/games/season-draft/create');

    const cancelBtn = page.getByRole('button', { name: /cancel/i });
    await expect(cancelBtn).toBeVisible();
    await cancelBtn.click();
    await expect(page).toHaveURL(/\/games\/season-draft/);
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
      await unmockedGraphQLFallback(route);
    });

    await page.goto('/games/season-draft/create');

    // There should be a search/invite players section
    await expect(
      page.getByPlaceholder(/search.*user|invite|username/i),
    ).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// LS-3491: [functional] 404 error on /games/season-draft/create
// An automated audit crawler navigated to /games/season-draft/create and
// received a functional 404 — the server responded with HTTP 404 and the
// page rendered the "Build Your Dynasty" marketing landing page instead of
// the season-draft creation interface. /games/season-draft/create is a
// protected route: EnhancedAuthGuard intercepts unauthenticated requests and
// renders PublicLandingPage with sign-in CTAs. These tests lock in that the
// sign-in CTAs are visible and the URL remains at /games/season-draft/create
// (no spurious redirect to /) for unauthenticated visitors.
// ---------------------------------------------------------------------------

unauthTest.describe(
  'Season Draft Game Create — unauthenticated visitor @regression',
  () => {
    unauthTest(
      '"Continue with Google" button is visible and enabled on /games/season-draft/create when unauthenticated',
      async ({ page }) => {
        await page.goto('/games/season-draft/create');
        await page.waitForLoadState('load');

        const googleBtn = page.getByRole('button', {
          name: /continue with google/i,
        });
        await expect(googleBtn).toBeVisible({ timeout: 15_000 });
        await expect(googleBtn).toBeEnabled();
      },
    );

    unauthTest(
      '"Get Started Free" CTA is visible and interactive on /games/season-draft/create for unauthenticated users',
      async ({ page }) => {
        await page.goto('/games/season-draft/create');
        await page.waitForLoadState('load');

        const getStartedBtn = page.getByRole('button', {
          name: /get started free/i,
        });
        await expect(getStartedBtn).toBeVisible({ timeout: 15_000 });
        await expect(getStartedBtn).toBeEnabled();
      },
    );

    unauthTest(
      '"Continue with Discord" button is visible on /games/season-draft/create when unauthenticated',
      async ({ page }) => {
        await page.goto('/games/season-draft/create');
        await page.waitForLoadState('load');

        await expect(
          page.getByRole('button', { name: /continue with discord/i }),
        ).toBeVisible({ timeout: 15_000 });
      },
    );

    unauthTest(
      'URL stays at /games/season-draft/create for unauthenticated users — no auth-guard redirect',
      async ({ page }) => {
        await page.goto('/games/season-draft/create');
        await page.waitForLoadState('load');

        await expect(page).toHaveURL('/games/season-draft/create', {
          timeout: 15_000,
        });
      },
    );
  },
);

// ---------------------------------------------------------------------------
// LS-3540 / LS-3541 / LS-3489: /games/season-draft is a protected route.
// Unauthenticated users visiting it are intercepted by EnhancedAuthGuard and
// shown PublicLandingPage with the "Continue with Google" and "Continue with
// Discord" sign-in CTAs and a "Get Started Free" CTA lower down. An automated
// audit crawler reported this as a 404 (evidence shows the landing page content
// — "Build Your Dynasty" — instead of the expected season-draft lobby) and a
// CSS-selector parse error when trying to click "Continue with Google" via
// the invalid `(button:visible, [role="button"]:visible)` selector. These
// tests lock in that the sign-in CTAs are located via getByRole (accessible
// name) so unauthenticated visitors can initiate sign-in / sign-up from
// /games/season-draft.
// ---------------------------------------------------------------------------

unauthTest.describe(
  'Season Draft Games — unauthenticated visitor @regression',
  () => {
    unauthTest(
      '"Continue with Google" button is visible and enabled on /games/season-draft when unauthenticated',
      async ({ page }) => {
        await page.goto('/games/season-draft');
        await page.waitForLoadState('load');

        // Located via getByRole (accessible name) — locking in interactivity
        // (not just visibility) so the sign-in CTA remains clickable for
        // unauthenticated visitors on this protected route.
        const googleBtn = page.getByRole('button', {
          name: /continue with google/i,
        });
        await expect(googleBtn).toBeVisible({ timeout: 15_000 });
        await expect(googleBtn).toBeEnabled();
      },
    );

    unauthTest(
      '"Continue with Google" button on /games/season-draft is clickable via getByRole (LS-3489)',
      async ({ page }) => {
        await page.goto('/games/season-draft');
        await page.waitForLoadState('load');

        const googleBtn = page.getByRole('button', {
          name: /continue with google/i,
        });
        await expect(googleBtn).toBeVisible({ timeout: 15_000 });
        await expect(googleBtn).toBeEnabled();
        // Confirm the click resolves without a CSS selector parse error —
        // regression coverage for the original crawler failure where the
        // invalid `(button:visible, [role="button"]:visible)` selector was used.
        await googleBtn.click();
      },
    );

    unauthTest(
      '"Get Started Free" CTA is visible and interactive on /games/season-draft for unauthenticated users',
      async ({ page }) => {
        await page.goto('/games/season-draft');
        await page.waitForLoadState('load');

        // The auth guard shows the PublicLandingPage on /games/season-draft
        // for unauthenticated users. The CTA (aria-label="Get started free")
        // must be present and enabled so visitors can initiate sign-up from
        // /games/season-draft. No .first() — the landing page exposes a single
        // "Get started free" CTA, so Playwright strictness will catch
        // accidental duplicates.
        const getStartedBtn = page.getByRole('button', {
          name: /get started free/i,
        });
        await expect(getStartedBtn).toBeVisible({ timeout: 15_000 });
        await expect(getStartedBtn).toBeEnabled();
      },
    );

    unauthTest(
      '"Get Started Free" CTA on /games/season-draft is clickable via getByRole (LS-3490)',
      async ({ page }) => {
        await page.goto('/games/season-draft');
        await page.waitForLoadState('load');

        const getStartedBtn = page.getByRole('button', {
          name: /get started free/i,
        });
        await expect(getStartedBtn).toBeVisible({ timeout: 15_000 });
        await expect(getStartedBtn).toBeEnabled();
        // Regression for LS-3490: confirm the click resolves without the
        // CSS selector parse error caused by the broken crawler selector
        // `(button:visible, [role="button"]:visible)`.
        await getStartedBtn.click();
      },
    );

    unauthTest(
      '"Continue with Discord" button is visible on /games/season-draft when unauthenticated',
      async ({ page }) => {
        await page.goto('/games/season-draft');
        await page.waitForLoadState('load');

        await expect(
          page.getByRole('button', { name: /continue with discord/i }),
        ).toBeVisible({ timeout: 15_000 });
      },
    );

    unauthTest(
      '"Continue with Discord" button on /games/season-draft is clickable via getByRole',
      async ({ page }) => {
        await page.goto('/games/season-draft');
        await page.waitForLoadState('load');

        const discordBtn = page.getByRole('button', {
          name: /continue with discord/i,
        });
        await expect(discordBtn).toBeVisible({ timeout: 15_000 });
        await expect(discordBtn).toBeEnabled();
        // Confirm the click resolves without a CSS selector parse error —
        // regression coverage for the original crawler failure. The Discord
        // OAuth handler sets window.location.href for a cross-origin redirect,
        // so noWaitAfter prevents Playwright from hanging on the navigation.
        await discordBtn.click({ noWaitAfter: true });
      },
    );
  },
);
