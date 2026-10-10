/**
 * MLB Scoreboard E2E Tests (Mocked GraphQL)
 *
 * All network requests are intercepted with route.fulfill() — there is no
 * live backend in CI. Tests cover page structure, game display, empty state,
 * and error state.
 */

import { expect, test, unauthTest } from '../fixtures/auth-enhanced';
import { extractOperationName } from '../fixtures/shared-mocks';
import { FIXED_NOW_ISO } from '../mocks/time';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

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
              lastUpdated: FIXED_NOW_ISO,
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
              lastUpdated: FIXED_NOW_ISO,
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
    // V2 game cards render the team abbreviation in two places (compact
    // header label + linescore row), so disambiguate via .first().
    await expect(liveCard.getByText('NYY').first()).toBeVisible();
    await expect(liveCard.getByText('BOS').first()).toBeVisible();
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
    // Same dual-render pattern as NYY in the live-card test above.
    await expect(finalCard.getByText('CHC').first()).toBeVisible();
    await expect(finalCard.getByText('STL').first()).toBeVisible();
  });

  test('shows dash for preview game score instead of 0', async ({ page }) => {
    const previewCard = page.getByTestId('game-card-1003');
    await expect(previewCard).toBeVisible();
    // Preview games show '–' (en-dash) not numeric 0
    await expect(previewCard).toContainText('–');
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
              lastUpdated: FIXED_NOW_ISO,
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

    // The re-query should carry the new date.
    await expect.poll(() => capturedDates).toContain('2026-04-02');
  });
});

test.describe('Scoreboard — DateNav arrow buttons @regression', () => {
  test('clicking Previous day sends GetScoreboard query with the preceding date', async ({
    page,
  }) => {
    const capturedDates: string[] = [];

    await page.route(isGraphQLEndpoint, async (route) => {
      const opName = extractOperationName(route).toLowerCase();
      if (opName !== 'getscoreboard') {
        await route.fallback();
        return;
      }

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
              lastUpdated: FIXED_NOW_ISO,
              games: [MOCK_LIVE_GAME, MOCK_FINAL_GAME, MOCK_PREVIEW_GAME],
            },
          },
        }),
      });
    });

    // Start from a known date via ?date= (LS-10648) rather than filling the
    // picker: a fill raced the page's initial date sync and could revert to
    // today before the click (LS-11045).
    await page.goto('/scoreboard?date=2026-04-10');
    await page.waitForLoadState('load');
    await expect(page.getByTestId('scoreboard-heading')).toBeVisible();
    const picker = page.getByTestId('scoreboard-date-picker');
    await expect(picker).toHaveValue('2026-04-10');

    // Click Previous day — the outgoing query must carry the preceding date.
    await page.getByRole('button', { name: 'Previous day' }).click();
    await expect.poll(() => capturedDates).toContain('2026-04-09');
  });

  test('Next day button is enabled on today so upcoming slates are reachable (LS-10456)', async ({
    page,
  }) => {
    await mockScoreboardGraphQL(page);
    await page.goto('/scoreboard');
    await page.waitForLoadState('load');
    await expect(page.getByTestId('scoreboard-heading')).toBeVisible();

    // Scoreboard initialises to today — Next day must be enabled so users can
    // preview tomorrow's scheduled games.
    const nextBtn = page.getByRole('button', { name: 'Next day' });
    await expect(nextBtn).toBeEnabled();
  });

  test('clicking Next day sends GetScoreboard query with the following date', async ({
    page,
  }) => {
    const capturedDates: string[] = [];

    await page.route(isGraphQLEndpoint, async (route) => {
      const opName = extractOperationName(route).toLowerCase();
      if (opName !== 'getscoreboard') {
        await route.fallback();
        return;
      }

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
              lastUpdated: FIXED_NOW_ISO,
              games: [MOCK_PREVIEW_GAME],
            },
          },
        }),
      });
    });

    // Known starting date via ?date= — see the Previous day test (LS-11045).
    await page.goto('/scoreboard?date=2026-04-10');
    await page.waitForLoadState('load');
    await expect(page.getByTestId('scoreboard-heading')).toBeVisible();
    const picker = page.getByTestId('scoreboard-date-picker');
    await expect(picker).toHaveValue('2026-04-10');

    await page.getByRole('button', { name: 'Next day' }).click();
    await expect.poll(() => capturedDates).toContain('2026-04-11');
  });

  test('a date past the schedule window is clamped with a visible notice (LS-10456)', async ({
    page,
  }) => {
    await mockScoreboardGraphQL(page);
    await page.goto('/scoreboard');
    await page.waitForLoadState('load');
    await expect(page.getByTestId('scoreboard-heading')).toBeVisible();

    const picker = page.getByTestId('scoreboard-date-picker');
    const maxDate = await picker.getAttribute('max');
    expect(maxDate).toBeTruthy();

    await picker.fill('2099-01-01');

    // Clamped to the bound — not silently reset to today.
    await expect(picker).toHaveValue(maxDate ?? '');
    await expect(page.getByTestId('scoreboard-date-clamped')).toBeVisible();
  });
});

test.describe('Scoreboard — selected date kept in the URL (LS-10648) @regression', () => {
  test('changing the date writes ?date= and a reload keeps it', async ({
    page,
  }) => {
    await mockScoreboardGraphQL(page);
    await page.goto('/scoreboard');
    await page.waitForLoadState('load');

    const picker = page.getByTestId('scoreboard-date-picker');
    await picker.fill('2026-04-10');
    await expect(page).toHaveURL(/\/scoreboard\?date=2026-04-10$/);

    await page.reload();
    await page.waitForLoadState('load');
    await expect(page.getByTestId('scoreboard-date-picker')).toHaveValue(
      '2026-04-10',
    );
  });

  test('Back returns to the previously viewed date and Forward re-applies it', async ({
    page,
  }) => {
    await mockScoreboardGraphQL(page);
    await page.goto('/scoreboard?date=2026-04-10');
    await page.waitForLoadState('load');

    const picker = page.getByTestId('scoreboard-date-picker');
    await expect(picker).toHaveValue('2026-04-10');
    await page.getByRole('button', { name: 'Previous day' }).click();
    await expect(picker).toHaveValue('2026-04-09');

    await page.goBack();
    await expect(page).toHaveURL(/\?date=2026-04-10$/);
    await expect(picker).toHaveValue('2026-04-10');

    await page.goForward();
    await expect(page).toHaveURL(/\?date=2026-04-09$/);
    await expect(picker).toHaveValue('2026-04-09');
  });

  test('an invalid ?date= falls back to today without an error', async ({
    page,
  }) => {
    await mockScoreboardGraphQL(page);
    await page.goto('/scoreboard?date=not-a-date');
    await page.waitForLoadState('load');

    await expect(page.getByTestId('scoreboard-heading')).toBeVisible();
    // "Today" as the page computes it — the browser's local calendar date.
    const today = await page.evaluate(() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
    await expect(page.getByTestId('scoreboard-date-picker')).toHaveValue(today);
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
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
      'Unable to load the scoreboard',
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

// ─── Sport filter pill (LS-4584) — MLB/All show games, NFL shows placeholder ─

test.describe('Scoreboard — sport filter @regression', () => {
  test('renders the All / MLB / NFL sport filter pill', async ({ page }) => {
    await mockScoreboardGraphQL(page);
    await page.goto('/scoreboard');
    await page.waitForLoadState('load');

    // All three options are present and accessible as radio buttons.
    const group = page.getByRole('radiogroup', {
      name: /filter scoreboard by sport/i,
    });
    await expect(group).toBeVisible();
    await expect(page.getByTestId('scoreboard-sport-all')).toBeVisible();
    await expect(page.getByTestId('scoreboard-sport-mlb')).toBeVisible();
    await expect(page.getByTestId('scoreboard-sport-nfl')).toBeVisible();

    // Default selection is "All".
    await expect(page.getByTestId('scoreboard-sport-all')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(page.getByTestId('scoreboard-sport-mlb')).toHaveAttribute(
      'aria-checked',
      'false',
    );
    await expect(page.getByTestId('scoreboard-sport-nfl')).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  test('selecting NFL renders the coming-soon placeholder and skips MLB data', async ({
    page,
  }) => {
    // Track GetScoreboard request count so we can confirm the query is
    // skipped while NFL is active. Apollo's cache-and-network policy fires
    // an initial request on mount; switching to NFL must not fire another.
    //
    // Deliberately use a non-live game (status 'Final', not 'Live') here even
    // though gamePk 1001 mirrors MOCK_LIVE_GAME. `shouldPollScoreboard`
    // (lib/shared-components/src/features/scoreboard/partition.ts) starts a
    // 15s Apollo live-poll whenever any game is 'Live', and under CI load a
    // test can take long enough to reach the NFL click near that poll
    // boundary — racing the in-flight poll tick against the `skip: true`
    // re-render and firing a second GetScoreboard just after the switch.
    // This test is about the sport-filter skip behavior, not live polling,
    // so keep the fixture non-live to remove that timer entirely rather
    // than papering over the race with a longer wait.
    const NON_LIVE_GAME_1001 = {
      ...MOCK_LIVE_GAME,
      status: 'Final',
      inningHalf: null,
      outs: null,
    };

    let scoreboardRequestCount = 0;
    await page.route(isGraphQLEndpoint, async (route) => {
      const opName = extractOperationName(route).toLowerCase();
      if (opName !== 'getscoreboard') {
        await route.fallback();
        return;
      }
      scoreboardRequestCount += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            scoreboard: {
              __typename: 'Scoreboard',
              date: '2026-04-01',
              lastUpdated: FIXED_NOW_ISO,
              games: [NON_LIVE_GAME_1001, MOCK_FINAL_GAME],
            },
          },
        }),
      });
    });

    await page.goto('/scoreboard');
    await page.waitForLoadState('load');
    await expect(page.getByTestId('scoreboard-heading')).toContainText(
      'MLB Scoreboard',
    );

    // Poll the request count until it has stopped changing for a few
    // consecutive checks. Used both before capturing the baseline and before
    // the final assertion: a fixed sleep is a race by construction (LS-10018),
    // so wait exactly as long as the count keeps moving (up to the timeout).
    const waitForRequestCountToSettle = async (): Promise<void> => {
      let lastObservedCount = -1;
      let stableChecks = 0;
      await expect
        .poll(
          () => {
            if (scoreboardRequestCount === lastObservedCount) {
              stableChecks += 1;
            } else {
              lastObservedCount = scoreboardRequestCount;
              stableChecks = 0;
            }
            return stableChecks;
          },
          { timeout: 2000, intervals: [25, 25, 50, 50, 100, 100, 200] },
        )
        .toBeGreaterThanOrEqual(3);
    };

    // The heading renders as soon as the first response lands, but a second
    // mount-time GetScoreboard (StrictMode double-effect, a cache-and-network
    // refetch, the first poll tick) can still arrive after that and before the
    // NFL click (LS-10317). Capture the baseline only once mount-time requests
    // have settled so a late mount request is never attributed to the switch.
    await waitForRequestCountToSettle();
    const requestsAfterMount = scoreboardRequestCount;
    expect(requestsAfterMount).toBeGreaterThan(0);

    // Switch to NFL — heading flips, placeholder shows, MLB cards hide.
    await page.getByTestId('scoreboard-sport-nfl').click();
    await expect(page.getByTestId('scoreboard-heading')).toContainText(
      'NFL Scoreboard',
    );
    await expect(page.getByTestId('scoreboard-nfl-coming-soon')).toBeVisible();
    await expect(page.getByTestId('scoreboard-nfl-coming-soon')).toContainText(
      'coming soon',
    );
    await expect(page.getByTestId('game-card-1001')).not.toBeVisible();

    // No new GetScoreboard requests should fire while NFL is selected. With
    // no live game in this fixture there's no poll timer racing the switch,
    // so we're not proving a negative against an active timer — just giving
    // any (unexpected) re-render-driven refetch a chance to land before we
    // check. A fixed sleep here is a race by construction (LS-10018): too
    // short under CI contention and a slow refetch reads as a false pass.
    // Instead wait for the count to settle — this keeps waiting (up to the
    // timeout) if a refetch is still in flight, so a genuinely-late unwanted
    // request is still caught.
    await waitForRequestCountToSettle();
    expect(scoreboardRequestCount).toBe(requestsAfterMount);

    // Switch back to MLB — placeholder hides, MLB cards return.
    await page.getByTestId('scoreboard-sport-mlb').click();
    await expect(page.getByTestId('scoreboard-heading')).toContainText(
      'MLB Scoreboard',
    );
    await expect(
      page.getByTestId('scoreboard-nfl-coming-soon'),
    ).not.toBeVisible();
    await expect(page.getByTestId('game-card-1001')).toBeVisible();
  });

  test('clicking MLB updates aria-checked and keeps MLB games visible', async ({
    page,
  }) => {
    await mockScoreboardGraphQL(page);
    await page.goto('/scoreboard');
    await page.waitForLoadState('load');

    await page.getByTestId('scoreboard-sport-mlb').click();
    await expect(page.getByTestId('scoreboard-sport-mlb')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(page.getByTestId('scoreboard-sport-all')).toHaveAttribute(
      'aria-checked',
      'false',
    );
    // MLB cards remain visible (the "MLB" selection behaves like "All" today
    // since there's only one sport in the data).
    await expect(page.getByTestId('game-card-1001')).toBeVisible();
  });

  test('arrow keys move selection per radiogroup pattern', async ({ page }) => {
    await mockScoreboardGraphQL(page);
    await page.goto('/scoreboard');
    await page.waitForLoadState('load');

    // Focus the currently-selected radio (default: All), then arrow right.
    const all = page.getByTestId('scoreboard-sport-all');
    await all.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('scoreboard-sport-mlb')).toHaveAttribute(
      'aria-checked',
      'true',
    );

    // ArrowRight again lands on NFL and shows the placeholder.
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('scoreboard-sport-nfl')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(page.getByTestId('scoreboard-nfl-coming-soon')).toBeVisible();

    // ArrowLeft wraps back to MLB.
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByTestId('scoreboard-sport-mlb')).toHaveAttribute(
      'aria-checked',
      'true',
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

  // LS-3523: the functional scanner found a "Continue with Google" button on
  // /scoreboard and reported it as broken (the scanner used the invalid CSS
  // selector `(button:visible, [role="button"]:visible)`). The root cause was
  // that /scoreboard was a protected route; LS-3563 made it public. This test
  // locks in that the auth gate never appears on /scoreboard so unauthenticated
  // users always land directly on the scoreboard, not the sign-in page.
  unauthTest(
    '"Continue with Google" auth gate is not shown on public /scoreboard route (LS-3523)',
    async ({ page }) => {
      await mockScoreboardGraphQL(page);
      await page.goto('/scoreboard');
      await page.waitForLoadState('load');

      // /scoreboard is public — the auth gate must never intercept it.
      await expect(
        page.getByRole('button', { name: /continue with google/i }),
      ).not.toBeVisible({ timeout: 15_000 });

      // Confirm the scoreboard itself is reachable without sign-in.
      await expect(page.getByTestId('scoreboard-heading')).toBeVisible({
        timeout: 15_000,
      });
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
      // the user started on a public path. Using /management (protected) since
      // /baseball (LS-3532) and /players (LS-3493, LS-3497) are now publicly accessible.
      await page.goto('/management');
      await page.waitForLoadState('load');

      // The auth guard must now show the landing page, not management content.
      await expect(
        page.getByRole('button', { name: /continue with google/i }),
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

  test('ticker refetches on visibility/focus after a long idle (LS-3680) @regression', async ({
    page,
  }) => {
    // Regression for LS-3680: after a long browser session (e.g. tab left
    // open overnight) the ticker would get stuck on an empty `games` array
    // and never recover short of a hard refresh, because polling stops once
    // all today's games are Final. The fix wires the ticker to refetch when
    // the tab regains visibility or focus.
    // Use a mutable flag rather than a call counter so the test is robust to
    // however many calls Apollo's cache-and-network policy makes on mount.
    //
    // Control the clock (LS-7703): the ticker throttles visibility/focus
    // refetches to once per 30s. A window 'focus' event fired during page load
    // can non-deterministically consume that throttle window before the test
    // dispatches its own event, suppressing the refetch and leaving the ticker
    // stuck empty. Installing a fake clock and fast-forwarding past the
    // throttle below makes the refetch deterministic.
    await page.clock.install();
    let returnGames = false;
    await page.route(isGraphQLEndpoint, async (route) => {
      const opName = extractOperationName(route).toLowerCase();
      if (opName !== 'getscoreboard') {
        await route.fallback();
        return;
      }
      const games = returnGames ? [MOCK_FINAL_GAME] : [];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            scoreboard: {
              __typename: 'Scoreboard',
              date: '2026-04-01',
              lastUpdated: FIXED_NOW_ISO,
              games,
            },
          },
        }),
      });
    });

    await page.goto('/');
    await page.waitForLoadState('load');

    // Initially hidden — backend returns empty (the stale post-overnight state)
    await expect(page.getByTestId('scoreboard-ticker')).not.toBeVisible();

    // Backend now has games available again; simulate the tab regaining
    // focus after a long idle. The ticker's focus/visibility listener should
    // refetch and pick up the new data.
    returnGames = true;
    // Advance past the 30s refetch throttle so the dispatched visibility/focus
    // event is guaranteed to trigger a refetch regardless of any load-time
    // focus event that already consumed the throttle window.
    await page.clock.fastForward(31_000);
    await page.evaluate(() => {
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
    });

    // After the focus-triggered refetch, the ticker should re-appear
    await expect(page.getByTestId('scoreboard-ticker')).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByTestId('scoreboard-ticker')).toContainText('CHC');
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

    // 10s: SPA route transition after the click needs main-thread time (route
    // chunk load + render) that can exceed the 3s expect default on a loaded
    // CI shard (LS-9449).
    await expect(page).toHaveURL('/scoreboard', { timeout: 10_000 });
  });
});
