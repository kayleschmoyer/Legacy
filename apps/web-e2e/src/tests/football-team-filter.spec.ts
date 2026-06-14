/**
 * FootballTeamFilter — E2E tests (LS-6493, LS-6494)
 *
 * Covers two features:
 *
 *   1. Free Agents filter (LS-6493): selecting "Free Agents" from the team
 *      dropdown sends freeAgent:true to the GraphQL query and omits nflTeam.
 *
 *   2. Team dropdown sort order (LS-6494): sentinel options appear first
 *      (All Teams, Free Agents, AFC, NFC), followed by individual teams in
 *      conference → division → city order.
 *
 * Interaction strategy: Tamagui Select renders a hidden native <select> for
 * form submission (the "BubbleSelect"). Clicking the visible trigger does not
 * open the dropdown in headless Chromium, so tests target the native element
 * via select[name="team-filter"] and Playwright's selectOption() with
 * force:true to bypass the opacity:0 / pointer-events:none styles.
 *
 * All GraphQL responses are mocked via route.fulfill() — route.continue() is
 * never used per project hermetic-test policy.
 */

import { expect, test } from '../fixtures/auth-enhanced';
import { extractOperationName } from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

// ── Constants ────────────────────────────────────────────────────────────────

const PAGE_URL = '/football/players';

// ── Mock helpers ─────────────────────────────────────────────────────────────

const EMPTY_PLAYERS_RESPONSE = {
  data: {
    footballPlayers: {
      nodes: [],
      pageInfo: { hasNextPage: false, endCursor: null },
    },
  },
};

async function mockFootballPlayers(page: import('@playwright/test').Page) {
  await page.route(
    (url) => isGraphQLEndpoint(url),
    async (route) => {
      const op = extractOperationName(route).toLowerCase();
      if (op === 'footballplayers') {
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

// Locator for Tamagui's hidden native <select> (BubbleSelect).
// Tamagui populates this from the name prop on <Select name="team-filter">.
function nativeSelect(page: import('@playwright/test').Page) {
  return page.locator('select[name="team-filter"]');
}

// ── Tests: Free Agents filter (LS-6493) ─────────────────────────────────────

test.describe('FootballTeamFilter — Free Agents filter (LS-6493) @regression', () => {
  test.beforeEach(async ({ page }) => {
    await mockFootballPlayers(page);
    await page.goto(PAGE_URL);
  });

  test('"Free Agents" option exists in the team filter', async ({ page }) => {
    await expect(
      nativeSelect(page).locator('option[value="FREE_AGENT"]'),
    ).toBeAttached();
  });

  test('selecting "Free Agents" sends freeAgent:true with no nflTeam in the GraphQL query', async ({
    page,
  }) => {
    const requestPromise = page.waitForRequest(
      (req) =>
        isGraphQLEndpoint(new URL(req.url())) &&
        (() => {
          try {
            const body = JSON.parse(req.postData() ?? '{}') as {
              operationName?: string;
              variables?: Record<string, unknown>;
            };
            return (
              body.operationName?.toLowerCase() === 'footballplayers' &&
              body.variables?.freeAgent === true
            );
          } catch {
            return false;
          }
        })(),
    );

    await nativeSelect(page).selectOption('FREE_AGENT', { force: true });

    const req = await requestPromise;
    const body = JSON.parse(req.postData() ?? '{}') as {
      variables?: Record<string, unknown>;
    };
    expect(body.variables?.freeAgent).toBe(true);
    expect(body.variables?.nflTeam).toBeUndefined();
  });

  test('selecting "Free Agents" updates the trigger label to "Free Agents"', async ({
    page,
  }) => {
    await nativeSelect(page).selectOption('FREE_AGENT', { force: true });
    await expect(page.getByTestId('team-filter-trigger')).toContainText(
      'Free Agents',
    );
  });
});

// ── Tests: Sort order (LS-6494) ──────────────────────────────────────────────

test.describe('FootballTeamFilter — sort order (LS-6494) @regression', () => {
  test.beforeEach(async ({ page }) => {
    await mockFootballPlayers(page);
    await page.goto(PAGE_URL);
    // allInnerTexts() does not retry — wait for options to be mounted first
    await expect(nativeSelect(page).locator('option')).toHaveCount(36);
  });

  test('sentinel options appear first: All Teams, Free Agents, AFC, NFC', async ({
    page,
  }) => {
    const opts = nativeSelect(page).locator('option');
    await expect(opts.nth(0)).toHaveAttribute('value', 'All');
    await expect(opts.nth(1)).toHaveAttribute('value', 'FREE_AGENT');
    await expect(opts.nth(2)).toHaveAttribute('value', 'AFC');
    await expect(opts.nth(3)).toHaveAttribute('value', 'NFC');
  });

  test('all 32 teams plus 4 sentinel options are present in the dropdown', async ({
    page,
  }) => {
    // 4 sentinels (All Teams, Free Agents, AFC, NFC) + 32 NFL teams
    await expect(nativeSelect(page).locator('option')).toHaveCount(36);
  });

  test('AFC teams appear before NFC teams (BUF before DAL)', async ({
    page,
  }) => {
    const allTexts = await nativeSelect(page).locator('option').allInnerTexts();

    const bufIndex = allTexts.findIndex((t) => t.includes('BUF'));
    const dalIndex = allTexts.findIndex((t) => t.includes('DAL'));

    expect(bufIndex).toBeGreaterThan(-1);
    expect(dalIndex).toBeGreaterThan(-1);
    // BUF is AFC East; DAL is NFC East — AFC must come first
    expect(bufIndex).toBeLessThan(dalIndex);
  });

  test('within AFC, East division precedes North division (BUF before BAL)', async ({
    page,
  }) => {
    const allTexts = await nativeSelect(page).locator('option').allInnerTexts();

    const bufIndex = allTexts.findIndex((t) => t.includes('BUF'));
    const balIndex = allTexts.findIndex((t) => t.includes('BAL'));

    expect(bufIndex).toBeGreaterThan(-1);
    expect(balIndex).toBeGreaterThan(-1);
    // BUF is AFC East (division 0); BAL is AFC North (division 1)
    expect(bufIndex).toBeLessThan(balIndex);
  });

  test('within a division, teams are sorted alphabetically by city (HOU before IND)', async ({
    page,
  }) => {
    const allTexts = await nativeSelect(page).locator('option').allInnerTexts();

    // AFC South: Houston (HOU) < Indianapolis (IND) < Jacksonville (JAX) < Tennessee (TEN)
    const houIndex = allTexts.findIndex((t) => t.includes('HOU'));
    const indIndex = allTexts.findIndex((t) => t.includes('IND'));

    expect(houIndex).toBeGreaterThan(-1);
    expect(indIndex).toBeGreaterThan(-1);
    expect(houIndex).toBeLessThan(indIndex);
  });
});
