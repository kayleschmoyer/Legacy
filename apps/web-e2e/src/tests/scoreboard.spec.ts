/**
 * MLB Scoreboard E2E Tests (Mocked GraphQL)
 *
 * All network requests are intercepted with route.fulfill() — there is no
 * live backend in CI. Tests cover page structure, game display, empty state,
 * and error state.
 */

import { expect, test, unauthTest } from '../fixtures/auth-enhanced';
import { extractOperationName } from '../fixtures/shared-mocks';

function isGraphQLEndpoint(url: URL): boolean {
  const s = url.toString();
  return (
    s.includes('/graphql') &&
    !s.includes('/@fs/') &&
    !s.includes('.ts') &&
    !s.includes('.js')
  );
}

const MOCK_LIVE_GAME = {
  __typename: 'ScoreboardGame',
  gamePk: 1001,
  status: 'Live',
  startTime: '2026-04-01T18:10:00Z',
  inning: 7,
  inningHalf: 'Bot',
  outs: 1,
  homeTeam: {
    __typename: 'ScoreboardTeam',
    teamName: 'Yankees',
    abbreviation: 'NYY',
    runs: 4,
    hits: 8,
    errors: 0,
    linescoreInnings: [0, 1, 0, 2, 0, 0, 1],
  },
  awayTeam: {
    __typename: 'ScoreboardTeam',
    teamName: 'Red Sox',
    abbreviation: 'BOS',
    runs: 2,
    hits: 5,
    errors: 1,
    linescoreInnings: [0, 0, 1, 0, 0, 1, 0],
  },
};

const MOCK_FINAL_GAME = {
  __typename: 'ScoreboardGame',
  gamePk: 1002,
  status: 'Final',
  startTime: '2026-04-01T13:05:00Z',
  inning: 9,
  inningHalf: null,
  outs: null,
  homeTeam: {
    __typename: 'ScoreboardTeam',
    teamName: 'Cubs',
    abbreviation: 'CHC',
    runs: 5,
    hits: 10,
    errors: 1,
    linescoreInnings: [0, 0, 2, 0, 0, 0, 1, 2, 0],
  },
  awayTeam: {
    __typename: 'ScoreboardTeam',
    teamName: 'Cardinals',
    abbreviation: 'STL',
    runs: 3,
    hits: 7,
    errors: 0,
    linescoreInnings: [1, 0, 0, 0, 0, 2, 0, 0, 0],
  },
};

const MOCK_PREVIEW_GAME = {
  __typename: 'ScoreboardGame',
  gamePk: 1003,
  status: 'Preview',
  startTime: '2026-04-01T22:10:00Z',
  inning: null,
  inningHalf: null,
  outs: null,
  homeTeam: {
    __typename: 'ScoreboardTeam',
    teamName: 'Dodgers',
    abbreviation: 'LAD',
    runs: 0,
    hits: 0,
    errors: 0,
    linescoreInnings: [],
  },
  awayTeam: {
    __typename: 'ScoreboardTeam',
    teamName: 'Giants',
    abbreviation: 'SF',
    runs: 0,
    hits: 0,
    errors: 0,
    linescoreInnings: [],
  },
};

async function mockScoreboardGraphQL(
  page: import('@playwright/test').Page,
  opts: {
    games?: unknown[];
    error?: boolean;
    empty?: boolean;
    date?: string;
  } = {},
) {
  await page.route(isGraphQLEndpoint, async (route) => {
    const opName = extractOperationName(route).toLowerCase();

    if (opName !== 'getscoreboard') {
      // Let non-scoreboard operations fall through to the baseline fixture
      // layer so they are handled correctly rather than returning fake errors.
      await route.fallback();
      return;
    }

    const scoreboardDate = opts.date ?? '2026-04-01';

    if (opts.error) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          errors: [{ message: 'Failed to load scoreboard data' }],
          data: { scoreboard: null },
        }),
      });
    } else if (opts.empty) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            scoreboard: {
              __typename: 'Scoreboard',
              date: scoreboardDate,
              lastUpdated: new Date().toISOString(),
              games: [],
            },
          },
        }),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            scoreboard: {
              __typename: 'Scoreboard',
              date: scoreboardDate,
              lastUpdated: new Date().toISOString(),
              games: opts.games ?? [
                MOCK_LIVE_GAME,
                MOCK_FINAL_GAME,
                MOCK_PREVIEW_GAME,
              ],
            },
          },
        }),
      });
    }
  });
}

test.describe('Scoreboard — navigation @smoke', () => {
  test('navigates to /scoreboard without errors', async ({ page }) => {
    await mockScoreboardGraphQL(page);
    await page.goto('/scoreboard');
    await page.waitForLoadState('load');

    await expect(page).toHaveURL('/scoreboard');
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });
});

test.describe('Scoreboard — page structure @regression', () => {
  test.beforeEach(async ({ page }) => {
    await mockScoreboardGraphQL(page);
    await page.goto('/scoreboard');
    await page.waitForLoadState('load');
  });

  test('shows "MLB Scoreboard" heading', async ({ page }) => {
    await expect(page.getByTestId('scoreboard-heading')).toBeVisible();
    await expect(page.getByTestId('scoreboard-heading')).toContainText(
      'MLB Scoreboard',
    );
  });

  test('shows date picker', async ({ page }) => {
    await expect(page.getByTestId('scoreboard-date-picker')).toBeVisible();
  });

  test('shows live game badge', async ({ page }) => {
    await expect(page.getByText(/live/i).first()).toBeVisible();
  });

  test('shows team abbreviations for live game', async ({ page }) => {
    const liveCard = page.getByTestId('game-card-1001');
    await expect(liveCard.getByText('NYY')).toBeVisible();
    await expect(liveCard.getByText('BOS')).toBeVisible();
  });

  test('shows run score for live game', async ({ page }) => {
    // NYY 4, BOS 2
    const gameCard = page.getByTestId('game-card-1001');
    await expect(gameCard).toBeVisible();
    await expect(gameCard).toContainText('4');
    await expect(gameCard).toContainText('2');
  });

  test('shows Final status for completed game', async ({ page }) => {
    await expect(
      page.getByTestId('game-card-1002').getByText('Final'),
    ).toBeVisible();
  });

  test('shows team abbreviations for final game', async ({ page }) => {
    const finalCard = page.getByTestId('game-card-1002');
    await expect(finalCard.getByText('CHC')).toBeVisible();
    await expect(finalCard.getByText('STL')).toBeVisible();
  });

  test('shows dash for preview game score instead of 0', async ({ page }) => {
    const previewCard = page.getByTestId('game-card-1003');
    await expect(previewCard).toBeVisible();
    // Preview games show '-' not numeric 0
    await expect(previewCard).toContainText('-');
  });
});

test.describe('Scoreboard — date change triggers new query @regression', () => {
  test('changing date sends GetScoreboard query with updated date variable', async ({
    page,
  }) => {
    const capturedDates: string[] = [];

    // Layer on top of the baseline mock to capture the date variable sent with
    // each GetScoreboard request before fulfilling the response normally.
    await page.route(isGraphQLEndpoint, async (route) => {
      const opName = extractOperationName(route).toLowerCase();
      if (opName !== 'getscoreboard') {
        await route.fallback();
        return;
      }

      // Capture the date variable from the request body.
      try {
        const body = JSON.parse(route.request().postData() ?? '{}') as {
          variables?: { date?: string };
        };
        if (body.variables?.date) {
          capturedDates.push(body.variables.date);
        }
      } catch {
        // ignore parse errors
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            scoreboard: {
              __typename: 'Scoreboard',
              date: '2026-04-01',
              lastUpdated: new Date().toISOString(),
              games: [MOCK_LIVE_GAME, MOCK_FINAL_GAME, MOCK_PREVIEW_GAME],
            },
          },
        }),
      });
    });

    await page.goto('/scoreboard');
    await page.waitForLoadState('load');
    await expect(page.getByTestId('scoreboard-heading')).toBeVisible();

    // Change the date via the date picker.
    const picker = page.getByTestId('scoreboard-date-picker');
    await picker.fill('2026-04-02');
    await picker.dispatchEvent('change');

    // Wait for the component to re-query.
    await page.waitForTimeout(300);

    // The second request should carry the new date.
    expect(capturedDates).toContain('2026-04-02');
  });
});

test.describe('Scoreboard — GameCard expand/collapse @regression', () => {
  test('clicking a game card with linescore data toggles the Linescore', async ({
    page,
  }) => {
    await mockScoreboardGraphQL(page);
    await page.goto('/scoreboard');
    await page.waitForLoadState('load');

    const liveCard = page.getByTestId('game-card-1001');
    await expect(liveCard).toBeVisible();

    // Linescore should not be visible before expanding.
    await expect(liveCard.getByText('Linescore ▼')).toBeVisible();
    await expect(liveCard.getByText('Hide ▲')).not.toBeVisible();

    // Click to expand — Linescore component appears.
    await liveCard.click();
    await expect(liveCard.getByText('Hide ▲')).toBeVisible();
    // Inning number headers are rendered inside the Linescore grid.
    await expect(liveCard.getByText('1').first()).toBeVisible();

    // Click again to collapse — Linescore component disappears.
    await liveCard.click();
    await expect(liveCard.getByText('Linescore ▼')).toBeVisible();
    await expect(liveCard.getByText('Hide ▲')).not.toBeVisible();
  });
});

test.describe('Scoreboard — empty state @regression', () => {
  test('shows no games message when scoreboard is empty', async ({ page }) => {
    await mockScoreboardGraphQL(page, { empty: true });
    await page.goto('/scoreboard');
    await page.waitForLoadState('load');

    await expect(page.getByTestId('scoreboard-empty')).toBeVisible();
    await expect(page.getByTestId('scoreboard-empty')).toContainText(
      'No games scheduled',
    );
  });
});

test.describe('Scoreboard — error state @regression', () => {
  test('shows error message when query fails', async ({ page }) => {
    await mockScoreboardGraphQL(page, { error: true });
    await page.goto('/scoreboard');
    await page.waitForLoadState('load');

    await expect(page.getByTestId('scoreboard-error')).toBeVisible();
    await expect(page.getByTestId('scoreboard-error')).toContainText(
      'Error loading scoreboard',
    );
  });

  test('page does not crash on query failure', async ({ page }) => {
    await mockScoreboardGraphQL(page, { error: true });
    await page.goto('/scoreboard');
    await page.waitForLoadState('load');

    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });
});

// ─── Public access — unauthenticated user can view /scoreboard (LS-3563) ──────

unauthTest.describe('Scoreboard — unauthenticated access @critical', () => {
  unauthTest(
    'shows MLB Scoreboard heading without requiring login',
    async ({ page }) => {
      await mockScoreboardGraphQL(page);
      await page.goto('/scoreboard');
      await page.waitForLoadState('load');

      await expect(page.getByTestId('scoreboard-heading')).toBeVisible({
        timeout: 15000,
      });
      await expect(page.getByTestId('scoreboard-heading')).toContainText(
        'MLB Scoreboard',
      );
    },
  );

  unauthTest(
    'does not show landing-page login CTA on /scoreboard',
    async ({ page }) => {
      await mockScoreboardGraphQL(page);
      await page.goto('/scoreboard');
      await page.waitForLoadState('load');

      await expect(page.locator('body')).not.toContainText(
        'Build Your Dynasty',
      );
      await expect(page.locator('body')).not.toContainText('Get Started Free');
    },
  );

  unauthTest(
    'navigating from /scoreboard to a protected route shows the login gate',
    async ({ page }) => {
      await mockScoreboardGraphQL(page);
      await page.goto('/scoreboard');
      await page.waitForLoadState('load');
      await expect(page.getByTestId('scoreboard-heading')).toBeVisible();

      // Navigate to a protected route — the auth guard must gate it even after
      // the user started on a public path.
      await page.goto('/baseball');
      await page.waitForLoadState('load');

      // The auth guard must now show the landing page, not the baseball hub.
      await expect(
        page.getByRole('button', { name: /get started with google/i }),
      ).toBeVisible({ timeout: 15000 });
    },
  );
});

// ─── Global ticker (ScoreboardTicker in app shell) ────────────────────────────

test.describe('ScoreboardTicker — global ticker visibility @regression', () => {
  test('ticker renders when games are present', async ({ page }) => {
    // Override the baseline GetScoreboard response to return live games
    await mockScoreboardGraphQL(page, {
      games: [MOCK_LIVE_GAME, MOCK_FINAL_GAME],
    });
    await page.goto('/');
    await page.waitForLoadState('load');

    await expect(page.getByTestId('scoreboard-ticker')).toBeVisible();
    // Confirm game abbreviations appear in the ticker
    await expect(page.getByTestId('scoreboard-ticker')).toContainText('NYY');
    await expect(page.getByTestId('scoreboard-ticker')).toContainText('BOS');
  });

  test('ticker is hidden and no blank strip shown when no games are scheduled', async ({
    page,
  }) => {
    // Override the baseline GetScoreboard response to return empty games
    await mockScoreboardGraphQL(page, { empty: true });
    await page.goto('/');
    await page.waitForLoadState('load');

    // The ticker element should not be in the DOM when there are no games
    await expect(page.getByTestId('scoreboard-ticker')).not.toBeVisible();
    // Also confirm no layout spacer is injected (no aria-hidden spacer div)
    const spacer = page.locator('[aria-hidden="true"][style*="height: 32px"]');
    await expect(spacer).not.toBeVisible();
  });

  test('scoreboard link in ticker is clickable from /players @regression', async ({
    page,
  }) => {
    // Regression for LS-3330: GameChip links inside the scrolling ticker were
    // flagged as "not stable" by Playwright because the CSS animation continuously
    // translates the inner container.  The fix adds prefers-reduced-motion support
    // to the ticker and sets reducedMotion:'reduce' in playwright.config.ts so the
    // animation is paused during all tests.
    await mockScoreboardGraphQL(page, {
      games: [MOCK_FINAL_GAME],
    });
    await page.goto('/players');
    await page.waitForLoadState('load');

    const ticker = page.getByTestId('scoreboard-ticker');
    await expect(ticker).toBeVisible();

    // The link inside the ticker should be stable and clickable
    const scoreboardLink = ticker.getByRole('link').first();
    await expect(scoreboardLink).toBeVisible();
    await scoreboardLink.click();

    await expect(page).toHaveURL('/scoreboard');
  });
});
