/**
 * Multi-league selection and switching — E2E Tests (LS-2116)
 *
 * Covers the header `LeagueSwitcherChip` (apps/web/src/components/layout/
 * LeagueSwitcherChip.tsx) for users who belong to more than one league:
 * the dropdown/selector rendered on every authenticated page (including the
 * home page), switching the active league, the switched league's context
 * persisting (across a reload, driven by the URL rather than local state),
 * and the browser navigation trail produced when switching.
 *
 * The chip is mounted twice in `apps/web/src/app/app.tsx` — once in the
 * desktop nav (`$gtMd` visible) and once in the mobile header (`$gtMd`
 * hidden) — so both exist in the DOM at every viewport. This suite targets
 * the first (desktop) instance and only runs on wide-viewport projects,
 * matching the convention in home-standings-lazy-load.spec.ts /
 * league-list-row.spec.ts for viewport-gated components.
 *
 * Kept hermetic (GraphQL mocked via `route.fulfill`/`route.fallback`) per
 * the E2E hermeticity rule in AGENTS.md — no live backend required.
 */
import { expect, test } from '../fixtures/auth-enhanced';
import { isGraphQLEndpoint } from '../mocks/graphql/router';
import { extractOperationName } from '../fixtures/shared-mocks';
import { mockLeague } from '../mocks/graphql/league.mocks';

const MULTI_LEAGUES = [
  mockLeague({
    id: 1,
    name: 'Iron Horse Dynasty',
    playerPool: 'baseball',
    leaguePhase: 'active',
    currentWeekNumber: 9,
    totalMatchups: 22,
  }),
  mockLeague({
    id: 2,
    name: 'Deadball Diamonds',
    playerPool: 'baseball',
    leaguePhase: 'pre-draft',
    currentWeekNumber: null,
    totalMatchups: null,
  }),
  mockLeague({
    id: 3,
    name: 'Gridiron Generals',
    playerPool: 'football',
    leaguePhase: 'active',
    currentWeekNumber: 5,
    totalMatchups: 14,
  }),
];

/**
 * HomePage derives `hasLeagues` from GetUserLeagueSummaries (a separate query
 * from GetUserLeagues, which only feeds the header chip) and shows a blocking
 * "Welcome to Legacy Sports" onboarding dialog over the whole page when it
 * thinks the user has none — the baseline mocks it to `[]`. Without this
 * override every switcher interaction on the home page is intercepted by
 * that dialog.
 */
const LEAGUE_SUMMARIES = MULTI_LEAGUES.map((league) => ({
  __typename: 'UserLeagueSummary',
  leagueId: league.id,
  leagueName: league.name,
  sport: league.playerPool,
  leaguePhase: league.leaguePhase,
  seasonNumber: 1,
  draftStatus: league.draftStatus,
  draftScheduledAt: null,
  draftMode: 'Snake',
  selectionMethod: 'snake',
  teamCount: 10,
  currentWeekNumber: league.currentWeekNumber,
  totalMatchups: league.totalMatchups,
  matchupId: null,
  matchupStatus: null,
  matchupEndTime: null,
  userScore: null,
  opponentScore: null,
  opponentTeamName: null,
  eraFilter: 'all',
  customEraStartYear: null,
  customEraEndYear: null,
  isCommissioner: false,
}));

async function mockUserLeagues(
  page: import('@playwright/test').Page,
  leagues: typeof MULTI_LEAGUES,
) {
  await page.route(isGraphQLEndpoint, async (route) => {
    const op = extractOperationName(route).toLowerCase();
    if (op === 'getuserleagues') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { userLeagues: leagues, userLeagueCount: leagues.length },
        }),
      });
      return;
    }
    if (op === 'getuserleaguesummaries') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { getUserLeagueSummaries: LEAGUE_SUMMARIES },
        }),
      });
      return;
    }
    await route.fallback();
  });
}

/** Desktop instance of the chip — see file header comment for why `.first()`
 *  is required (the mobile instance is also in the DOM, merely hidden). */
function chip(page: import('@playwright/test').Page) {
  return page.getByTestId('league-switcher-chip').first();
}

test.describe('Multi-league selection and switching (LS-2116) @regression', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name === 'Mobile Chrome' ||
        testInfo.project.name === 'Mobile Safari',
      'Desktop chip instance is hidden on narrow viewports; the mobile header renders its own separate instance.',
    );
    await mockUserLeagues(page, MULTI_LEAGUES);
  });

  test('league selector is visible on the home page and shows the current league', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForLoadState('load');

    await expect(chip(page)).toBeVisible();
    // No `/baseball/league/:id` in the URL yet, so the chip falls back to the
    // first league in the list.
    await expect(chip(page)).toContainText('Iron Horse Dynasty');
  });

  test('dropdown lists leagues filtered by sport and marks the active one', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForLoadState('load');

    await chip(page).click();
    const listbox = page.getByRole('listbox', { name: 'League selector' });
    await expect(listbox).toBeVisible();

    // Defaults to the Baseball tab (derived from the current league's sport).
    await expect(
      listbox.getByRole('option', { name: /Iron Horse Dynasty/ }),
    ).toBeVisible();
    await expect(
      listbox.getByRole('option', { name: /Deadball Diamonds/ }),
    ).toBeVisible();
    await expect(
      listbox.getByRole('option', { name: /Gridiron Generals/ }),
    ).not.toBeVisible();
    await expect(
      listbox.getByRole('option', { name: /Iron Horse Dynasty/ }),
    ).toHaveAttribute('aria-selected', 'true');
    await expect(
      listbox.getByRole('option', { name: /Deadball Diamonds/ }),
    ).toHaveAttribute('aria-selected', 'false');

    // Switching the sport segmented control filters to the football league.
    await listbox.getByText('Football', { exact: true }).click();
    await expect(
      listbox.getByRole('option', { name: /Gridiron Generals/ }),
    ).toBeVisible();
    await expect(
      listbox.getByRole('option', { name: /Iron Horse Dynasty/ }),
    ).not.toBeVisible();
  });

  test('selecting a different league switches the active league and navigates to it', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForLoadState('load');

    await chip(page).click();
    const listbox = page.getByRole('listbox', { name: 'League selector' });
    await listbox.getByRole('option', { name: /Deadball Diamonds/ }).click();

    await page.waitForURL(/\/baseball\/league\/2$/);
    await expect(listbox).not.toBeVisible();
    await expect(chip(page)).toContainText('Deadball Diamonds');
  });

  test('switched league context persists across a page reload', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForLoadState('load');

    await chip(page).click();
    await page
      .getByRole('listbox', { name: 'League selector' })
      .getByRole('option', { name: /Deadball Diamonds/ })
      .click();
    await page.waitForURL(/\/baseball\/league\/2$/);

    // Context is derived from the URL, not client-side state — a reload
    // must keep the switched league as "current".
    await page.reload();
    await page.waitForLoadState('load');
    await expect(chip(page)).toContainText('Deadball Diamonds');

    await chip(page).click();
    const listbox = page.getByRole('listbox', { name: 'League selector' });
    await expect(
      listbox.getByRole('option', { name: /Deadball Diamonds/ }),
    ).toHaveAttribute('aria-selected', 'true');
    await expect(
      listbox.getByRole('option', { name: /Iron Horse Dynasty/ }),
    ).toHaveAttribute('aria-selected', 'false');
  });

  test('switching leagues preserves browser navigation history back to the previous page', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForLoadState('load');

    await chip(page).click();
    await page
      .getByRole('listbox', { name: 'League selector' })
      .getByRole('option', { name: /Deadball Diamonds/ })
      .click();
    await page.waitForURL(/\/baseball\/league\/2$/);

    await page.goBack();
    await page.waitForURL((url) => url.pathname === '/');
    await expect(chip(page)).toContainText('Iron Horse Dynasty');
  });
});
