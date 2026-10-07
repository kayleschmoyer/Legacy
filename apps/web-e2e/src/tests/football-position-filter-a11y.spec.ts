/**
 * Football position filter — multi-select toggle group a11y & keyboard tests
 * (LS-6466, multi-select promoted in LS-6464; canonical-surface parity
 * restored in LS-9371)
 *
 * The position pill row on /players?sport=nfl (the shared
 * FootballPositionPillGroup in footballStatsConfig.tsx) is a multi-select
 * toggle-button group: each pill is a `role=button` with `aria-pressed`, the
 * container is a `role=group`, and keyboard users get roving tabindex (arrow
 * keys move focus) with Space/Enter toggling the focused pill. "All" clears
 * the selection.
 *
 * All GraphQL responses are mocked with route.fulfill() — route.continue() is
 * never used per project hermetic-test policy.
 */

// Element access goes through `playersPage.football` (LS-8096 / ADR-0015 —
// this spec is selector-free; locators live in the page object).
import { test } from '../fixtures/pages';
import { extractOperationName } from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

// Selectable position pills, excluding the leading "All" pill. DST is hidden
// while no team-defense players exist (LS-10727).
const POSITIONS = [
  'QB',
  'RB',
  'WR',
  'TE',
  'FLEX',
  'K',
  'DL',
  'LB',
  'DB',
] as const;

const ALL_PILLS = ['All', ...POSITIONS] as const;

// ── Minimal mock data ────────────────────────────────────────────────────────

const EMPTY_PLAYERS_RESPONSE = {
  data: {
    footballPlayers: {
      nodes: [],
      pageInfo: { hasNextPage: false, endCursor: null },
      totalCount: 0,
    },
  },
};

async function mockFootballPlayers(page: import('@playwright/test').Page) {
  await page.route(
    (url) => isGraphQLEndpoint(url),
    async (route) => {
      const op = extractOperationName(route).toLowerCase();
      // The desktop grid fires FootballPlayerStatsGrid; the narrow-viewport
      // card feed fires FootballPlayers (LS-9366). Serve both.
      if (op === 'footballplayers' || op === 'footballplayerstatsgrid') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(EMPTY_PLAYERS_RESPONSE),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: {} }),
        });
      }
    },
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe('FootballPositionFilter — toggle group ARIA @regression', () => {
  test.beforeEach(async ({ page, playersPage }) => {
    await mockFootballPlayers(page);
    await playersPage.football.goto();
  });

  test('pill container has role=group with accessible label', async ({
    playersPage,
  }) => {
    await playersPage.football.expectPillGroupVisible();
  });

  test('every pill is a role=button toggle', async ({ playersPage }) => {
    await playersPage.football.expectPillCount(ALL_PILLS.length);
  });

  test('"All" pill is pressed and in tab order by default', async ({
    playersPage,
  }) => {
    await playersPage.football.expectPositionPressed('All', true);
    await playersPage.football.expectPositionTabStop('All', true);
  });

  test('position pills are unpressed and out of tab order by default', async ({
    playersPage,
  }) => {
    for (const pos of POSITIONS) {
      await playersPage.football.expectPositionPressed(pos, false);
      await playersPage.football.expectPositionTabStop(pos, false);
    }
  });
});

test.describe('FootballPositionFilter — multi-select @regression', () => {
  test.beforeEach(async ({ page, playersPage }) => {
    await mockFootballPlayers(page);
    await playersPage.football.goto();
  });

  test('clicking a position selects it and deselects "All"', async ({
    playersPage,
  }) => {
    await playersPage.football.clickPosition('QB');

    await playersPage.football.expectPositionPressed('QB', true);
    await playersPage.football.expectPositionPressed('All', false);
  });

  test('multiple positions can be selected at once (QB + RB)', async ({
    playersPage,
  }) => {
    await playersPage.football.clickPosition('QB');
    await playersPage.football.clickPosition('RB');

    await playersPage.football.expectPositionPressed('QB', true);
    await playersPage.football.expectPositionPressed('RB', true);
    await playersPage.football.expectPositionPressed('All', false);
  });

  test('clicking a selected position toggles it back off', async ({
    playersPage,
  }) => {
    await playersPage.football.clickPosition('QB');
    await playersPage.football.expectPositionPressed('QB', true);
    await playersPage.football.clickPosition('QB');
    await playersPage.football.expectPositionPressed('QB', false);
  });

  test('"All" clears the current multi-selection', async ({ playersPage }) => {
    await playersPage.football.clickPosition('QB');
    await playersPage.football.clickPosition('RB');
    await playersPage.football.clickPosition('All');

    await playersPage.football.expectPositionPressed('All', true);
    for (const pos of POSITIONS) {
      await playersPage.football.expectPositionPressed(pos, false);
    }
  });
});

test.describe('FootballPositionFilter — keyboard navigation @regression', () => {
  test.beforeEach(async ({ page, playersPage }) => {
    await mockFootballPlayers(page);
    await playersPage.football.goto();
  });

  test('ArrowRight moves roving focus from All → QB', async ({
    page,
    playersPage,
  }) => {
    await playersPage.football.focusPosition('All');
    await page.keyboard.press('ArrowRight');

    await playersPage.football.expectPositionTabStop('QB', true);
    await playersPage.football.expectPositionFocused('QB');
    await playersPage.football.expectPositionTabStop('All', false);
  });

  test('ArrowLeft wraps roving focus from All → DB (last item)', async ({
    page,
    playersPage,
  }) => {
    await playersPage.football.focusPosition('All');
    await page.keyboard.press('ArrowLeft');

    await playersPage.football.expectPositionTabStop('DB', true);
    await playersPage.football.expectPositionFocused('DB');
  });

  test('Space toggles the focused pill without moving selection', async ({
    page,
    playersPage,
  }) => {
    await playersPage.football.focusPosition('All');
    await page.keyboard.press('ArrowRight'); // focus QB
    await page.keyboard.press(' '); // toggle QB on

    await playersPage.football.expectPositionPressed('QB', true);
  });

  test('only the focused pill has tabindex=0 after keyboard navigation', async ({
    page,
    playersPage,
  }) => {
    await playersPage.football.focusPosition('All');
    await page.keyboard.press('ArrowRight'); // QB
    await page.keyboard.press('ArrowRight'); // RB

    await playersPage.football.expectPositionTabStop('RB', true);

    for (const label of ALL_PILLS.filter((p) => p !== 'RB')) {
      await playersPage.football.expectPositionTabStop(label, false);
    }
  });
});

test.describe('Football players search — clear button & a11y @regression', () => {
  test.beforeEach(async ({ page, playersPage }) => {
    await mockFootballPlayers(page);
    await playersPage.football.goto();
  });

  test('search input exposes an accessible name (LS-6488)', async ({
    playersPage,
  }) => {
    await playersPage.football.expectSearchVisible();
  });

  test('clear button is hidden while the search input is empty (LS-6487)', async ({
    playersPage,
  }) => {
    await playersPage.football.expectClearSearchAbsent();
  });

  test('clear button appears once text is entered and clears it on click (LS-6487)', async ({
    playersPage,
  }) => {
    await playersPage.football.fillSearch('mahomes');

    await playersPage.football.expectClearSearchVisible();

    await playersPage.football.clickClearSearch();
    await playersPage.football.expectSearchValue('');
    await playersPage.football.expectClearSearchAbsent();
  });

  test('clear button is keyboard operable (LS-6487)', async ({
    page,
    playersPage,
  }) => {
    await playersPage.football.fillSearch('allen');

    await playersPage.football.focusClearSearch();
    await page.keyboard.press('Enter');

    await playersPage.football.expectSearchValue('');
    await playersPage.football.expectClearSearchAbsent();
  });
});
