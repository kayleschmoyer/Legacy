/**
 * About Page UI Tests
 *
 * The About page content is mostly static (env vars / build constants), but
 * the app shell still issues ambient GraphQL requests (e.g. ScoreboardTicker)
 * during page load.  The baseline mocks in shared-mocks.ts cover these.
 */

import { expect, test, unauthTest } from '../fixtures/auth-enhanced';
import { extractOperationName } from '../fixtures/shared-mocks';
import { FIXED_NOW_ISO } from '../mocks/time';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

test.describe('About Page @smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/about');
    await page.waitForLoadState('load');
  });

  test('renders the About Legacy Sports heading', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /about legacy sports/i }),
    ).toBeVisible();
  });

  test('shows descriptive subtitle text', async ({ page }) => {
    await expect(
      page.getByText(/fantasy sports management platform/i),
    ).toBeVisible();
  });

  test('shows Build Information section', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /build information/i }),
    ).toBeVisible();
  });

  test('displays Version label', async ({ page }) => {
    await expect(page.getByText('Version:')).toBeVisible();
  });

  test('displays Build Date label', async ({ page }) => {
    await expect(page.getByText('Build Date:')).toBeVisible();
  });

  test('shows Application Info section', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /application info/i }),
    ).toBeVisible();
  });

  test('displays Environment label', async ({ page }) => {
    await expect(page.getByText('Environment:')).toBeVisible();
  });

  test('displays GraphQL API label', async ({ page }) => {
    await expect(page.getByText('GraphQL API:')).toBeVisible();
  });

  test('shows a View on GitHub button', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: /view on github/i }),
    ).toBeVisible();
  });

  test('shows copyright footer text', async ({ page }) => {
    await expect(page.getByText(/© \d{4} legacy sports/i)).toBeVisible();
  });

  test('navigating to /about shows the about page', async ({ page }) => {
    await expect(page).toHaveURL(/\/about/);
  });
});

// ---------------------------------------------------------------------------
// LS-3525: /about is protected by the root-level EnhancedAuthGuard.
// Unauthenticated visitors see PublicLandingPage with "Get Started Free" CTA.
// Locates button via getByRole (accessible name) — NOT the broken
// `(button:visible, [role="button"]:visible)` CSS selector that caused the
// crawler-reported failure.
// ---------------------------------------------------------------------------

unauthTest.describe('About page — unauthenticated visitor @regression', () => {
  unauthTest(
    '"Get Started Free" CTA is visible and interactive on /about for unauthenticated users',
    async ({ page }) => {
      await page.goto('/about');
      await page.waitForLoadState('load');

      const getStartedBtn = page.getByRole('button', {
        name: /get started free/i,
      });
      await expect(getStartedBtn).toBeVisible({ timeout: 15_000 });
      await expect(getStartedBtn).toBeEnabled();
    },
  );
});

// ─── Scoreboard ticker navigation ─────────────────────────────────────────────
// LS-3444: Clicking a ScoreboardTicker chip from the About page must navigate
// to /scoreboard without a 401 error.  The ticker's continuous CSS animation
// makes game chips "not stable" for Playwright unless prefers-reduced-motion
// is set — this test uses page.emulateMedia() to disable the animation so
// the link is clickable.

test.describe('About page — scoreboard ticker navigation @regression', () => {
  test('ticker link navigates to /scoreboard without errors', async ({
    page,
  }) => {
    // Override the baseline GetScoreboard empty response so the ticker renders
    // at least one game chip (the baseline returns no games by default).
    await page.route(isGraphQLEndpoint, async (route) => {
      const opName = extractOperationName(route).toLowerCase();
      if (opName !== 'getscoreboard') {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            scoreboard: {
              __typename: 'Scoreboard',
              date: '2026-04-01',
              lastUpdated: FIXED_NOW_ISO,
              games: [
                {
                  __typename: 'ScoreboardGame',
                  gamePk: 9001,
                  status: 'Final',
                  startTime: '2026-04-01T18:05:00Z',
                  inning: 9,
                  inningHalf: null,
                  outs: null,
                  homeTeam: {
                    __typename: 'ScoreboardTeam',
                    teamName: 'Yankees',
                    abbreviation: 'NYY',
                    runs: 11,
                    hits: 14,
                    errors: 0,
                    linescoreInnings: [1, 0, 2, 0, 3, 0, 1, 2, 2],
                  },
                  awayTeam: {
                    __typename: 'ScoreboardTeam',
                    teamName: 'Angels',
                    abbreviation: 'LAA',
                    runs: 10,
                    hits: 12,
                    errors: 1,
                    linescoreInnings: [2, 0, 0, 3, 2, 0, 3, 0, 0],
                  },
                },
              ],
            },
          },
        }),
      });
    });

    // Disable animations so the ticker game chips are positionally stable
    // and Playwright can click them without a "not stable" timeout.
    await page.emulateMedia({ reducedMotion: 'reduce' });

    await page.goto('/about');
    await page.waitForLoadState('load');

    // The ticker must be visible before we try to click inside it.
    await expect(page.getByTestId('scoreboard-ticker')).toBeVisible();

    // Click the first /scoreboard link in the ticker.
    await page
      .getByTestId('scoreboard-ticker')
      .getByRole('link')
      .first()
      .click();

    // Navigation must succeed — no 401 / Unexpected Application Error.
    await expect(page).toHaveURL(/\/scoreboard/);
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });
});

// ---------------------------------------------------------------------------
// LS-3524: /about is a public route. Unauthenticated users must see the
// About page content — not the "Build Your Dynasty" landing page rendered by
// EnhancedAuthGuard for protected routes. An automated audit crawler visited
// https://legacy-fantasy.com/about unauthenticated, received the GitHub Pages
// 404 response (expected for SPA routes), then saw the marketing landing page
// after the 404.html redirect loaded the SPA — and mis-reported it as a
// functional 404. The route is correctly listed in publicPaths; these tests
// lock in the unauthenticated rendering so a regression cannot go undetected.
// ---------------------------------------------------------------------------

unauthTest.describe('About page — unauthenticated visitor @regression', () => {
  unauthTest.beforeEach(async ({ page }) => {
    await page.goto('/about');
    await page.waitForLoadState('load');
  });

  unauthTest(
    'shows About Legacy Sports heading on /about when not authenticated',
    async ({ page }) => {
      await expect(
        page.getByRole('heading', { name: /about legacy sports/i }),
      ).toBeVisible({ timeout: 15_000 });
    },
  );

  unauthTest(
    'does not show the marketing landing page on /about when not authenticated',
    async ({ page }) => {
      await expect(page.getByText(/build your dynasty/i)).not.toBeVisible();
    },
  );

  unauthTest(
    'shows Build Information section on /about when not authenticated',
    async ({ page }) => {
      await expect(
        page.getByRole('heading', { name: /build information/i }),
      ).toBeVisible({ timeout: 15_000 });
    },
  );

  unauthTest(
    '"Get Started Free" button is visible and navigates to / on /about when not authenticated',
    async ({ page }) => {
      const btn = page.getByRole('button', { name: /get started free/i });
      await expect(btn).toBeVisible({ timeout: 15_000 });
      await btn.click();
      await expect(page).toHaveURL('/');
    },
  );
});
