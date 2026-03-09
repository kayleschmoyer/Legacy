/**
 * Commissioner Settings UI — Integration Test (LS-753)
 *
 * True end-to-end integration test hitting the live backend.
 * No GraphQL mocking — all interactions use real API calls and a real browser.
 *
 * Coverage:
 *   1. Roster eligibility limits  — Minimum Career Games and Minimum Career Seasons
 *      controls in the League Settings accordion save to the backend.
 *   2. Scoring profiles           — Scoring accordion is visible and shows all three
 *      stat groups (Batting / Pitching / Fielding).
 *   3. Toggles                    — Playoff Enabled, Playoff Format, Multi-Week Playoff
 *      Matchups buttons persist correctly after saving.
 *   4. Role restriction           — A non-commissioner (manager) cannot see the
 *      Commissioner tab on the league detail page.
 *
 * Flow:
 *   Phase 1 — Commissioner creates a new league.
 *   Phase 2 — Commissioner opens League Settings, changes roster limits and playoff
 *             toggles, saves, and the API confirms the persisted values.
 *   Phase 3 — Commissioner opens the Scoring section and verifies all stat groups.
 *   Phase 4 — Manager joins the league and cannot access the Commissioner tab.
 *
 * Run:
 *   cd apps/web-e2e
 *   pnpm exec playwright test --config playwright.integration.config.ts \
 *     src/integration/tests/commissioner-settings-ui.integration.spec.ts
 */

import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { test } from '../fixtures/ui';

// ---------------------------------------------------------------------------
// Shared state accumulated across serial phases.
// ---------------------------------------------------------------------------

interface SettingsState {
  leagueId: number;
  inviteCode: string;
  leagueName: string;
}

let state: SettingsState;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Switch the logged-in user by writing a new JWT into localStorage. */
async function switchUser(
  page: Page,
  jwt: string,
  url?: string,
): Promise<void> {
  if (url) {
    await page.goto(url);
    await page.waitForLoadState('domcontentloaded');
    await page.evaluate(
      (token) => localStorage.setItem('auth_jwt', token),
      jwt,
    );
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
  } else {
    await page.evaluate(
      (token) => localStorage.setItem('auth_jwt', token),
      jwt,
    );
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
  }
}

const GQL_URL =
  (
    process.env.INTEGRATION_BASE_URL ??
    'https://bd1opa1yv7.execute-api.us-east-1.amazonaws.com/dev/'
  ).replace(/\/?$/, '/') + 'graphql';

/** Fire a raw GraphQL query against the live backend (Node fetch, no browser). */
async function gqlFetch<T>(
  jwt: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(GQL_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as {
    data?: T;
    errors?: Array<{ message: string }>;
  };
  if (json.errors?.length) {
    throw new Error(`GraphQL error: ${json.errors[0].message}`);
  }
  if (!json.data) throw new Error('GraphQL response contained no data');
  return json.data;
}

const GET_LEAGUE_SETTINGS = `
  query GetLeagueSettings($id: Int!) {
    league(id: $id) {
      id
      minCareerGames
      minCareerSeasons
      playoffEnabled
      playoffFormat
      playoffMultiWeek
      gamesPerMatchup
      spStartsPerMatchup
      totalMatchups
    }
  }
`;

/** Navigate to the commissioner tab and expand the named accordion section. */
async function openCommissionerSection(
  page: Page,
  leagueId: number,
  sectionName: string,
): Promise<void> {
  await page.goto(`/baseball/league/${leagueId}/commissioner`);
  await page.waitForLoadState('load');
  const sectionHeader = page.getByRole('button', {
    name: sectionName,
    exact: true,
  });
  await expect(sectionHeader).toBeVisible({ timeout: 15_000 });
  await sectionHeader.click();
}

// ---------------------------------------------------------------------------
// Serial test suite — phases share `state` and must run in order.
// ---------------------------------------------------------------------------

test.describe
  .serial('Commissioner Settings UI (Live Backend) @integration @critical', () => {
  test.describe.configure({ retries: 0 });

  test.beforeAll(() => {
    state = {
      leagueId: 0,
      inviteCode: '',
      leagueName: '',
    };
  });

  // -----------------------------------------------------------------------
  // PHASE 1 — CREATE LEAGUE
  // -----------------------------------------------------------------------

  test('Phase 1: Commissioner creates a league', async ({
    commissionerPage: page,
  }) => {
    await test.step('Navigate to create league page', async () => {
      await page.goto('/baseball/league/create');
      await page.waitForLoadState('domcontentloaded');
      await expect(
        page.getByRole('heading', { name: /Create Baseball League/i }),
      ).toBeVisible({ timeout: 30_000 });
    });

    await test.step('Fill in league name, choose 4 teams, and submit', async () => {
      state.leagueName = `Settings E2E ${Date.now()}`;
      await page
        .getByPlaceholder('Enter your league name')
        .fill(state.leagueName);
      await page
        .getByRole('button', { name: '4', exact: true })
        .first()
        .click();
      await page.getByRole('button', { name: /create league/i }).click();
      await expect(page).toHaveURL(/\/baseball\/league\/\d+/, {
        timeout: 30_000,
      });
    });

    await test.step('Extract league ID from the URL', () => {
      const match = page.url().match(/\/baseball\/league\/(\d+)/);
      expect(match).toBeTruthy();
      state.leagueId = Number(match![1]);
      expect(state.leagueId).toBeGreaterThan(0);
    });

    await test.step('Read invite code from the overview page', async () => {
      await page.goto(`/baseball/league/${state.leagueId}/overview`);
      await page.waitForLoadState('load');
      await expect(page.getByText('Manual Code', { exact: false })).toBeVisible(
        { timeout: 15_000 },
      );
      const codeLocator = page.locator('text=/^[A-Z0-9]{8}$/').first();
      await expect(codeLocator).toBeVisible({ timeout: 10_000 });
      state.inviteCode = (await codeLocator.textContent()) ?? '';
      expect(state.inviteCode).toBeTruthy();
    });
  });

  // -----------------------------------------------------------------------
  // PHASE 2 — LEAGUE SETTINGS: ROSTER LIMITS + TOGGLES
  // -----------------------------------------------------------------------

  test('Phase 2: Commissioner edits roster limits and playoff toggles, persists to backend', async ({
    commissionerPage: page,
    commissionerJwt,
  }) => {
    await test.step('Open League Settings accordion', async () => {
      await openCommissionerSection(page, state.leagueId, 'League Settings');
      await expect(page.getByText('League Settings')).toBeVisible({
        timeout: 10_000,
      });
    });

    await test.step('Verify Minimum Career Games section is visible', async () => {
      await expect(page.getByText('Minimum Career Games')).toBeVisible({
        timeout: 10_000,
      });
    });

    await test.step('Change Minimum Career Games to 100', async () => {
      // Default is 50 — select 100
      await page
        .getByRole('button', { name: 'Minimum career games: 100', exact: true })
        .click();
    });

    await test.step('Change Minimum Career Seasons to 5', async () => {
      // Default is 3 — select 5
      await page
        .getByRole('button', {
          name: 'Minimum career seasons: 5',
          exact: true,
        })
        .click();
    });

    await test.step('Disable Playoffs', async () => {
      await page
        .getByRole('button', { name: 'Playoffs: Disabled', exact: true })
        .click();
    });

    await test.step('Re-enable Playoffs and change format to 6-team', async () => {
      await page
        .getByRole('button', { name: 'Playoffs: Enabled', exact: true })
        .click();
      // Wait for playoff format to appear
      await expect(page.getByText('Playoff Format')).toBeVisible({
        timeout: 5_000,
      });
      await page
        .getByRole('button', { name: 'Playoff format: 6-team', exact: true })
        .click();
    });

    await test.step('Enable multi-week playoff matchups', async () => {
      await page
        .getByRole('button', {
          name: 'Multi-week playoffs: Two weeks',
          exact: true,
        })
        .click();
    });

    await test.step('Save settings and wait for success', async () => {
      await page.getByRole('button', { name: 'Save Settings' }).click();
      // Success message or spinner disappearing indicates save completed
      await expect(page.getByText(/saved successfully/i)).toBeVisible({
        timeout: 15_000,
      });
    });

    await test.step('API confirms roster limit changes persisted', async () => {
      const data = await gqlFetch<{
        league: {
          minCareerGames: number;
          minCareerSeasons: number;
          playoffEnabled: boolean;
          playoffFormat: string;
          playoffMultiWeek: boolean;
        };
      }>(commissionerJwt, GET_LEAGUE_SETTINGS, { id: state.leagueId });

      expect(data.league.minCareerGames).toBe(100);
      expect(data.league.minCareerSeasons).toBe(5);
      expect(data.league.playoffEnabled).toBe(true);
      expect(data.league.playoffFormat).toBe('6-team');
      expect(data.league.playoffMultiWeek).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // PHASE 3 — SCORING PROFILE SECTION SMOKE CHECK
  // -----------------------------------------------------------------------

  test('Phase 3: Commissioner opens the Scoring section and sees all stat groups', async ({
    commissionerPage: page,
  }) => {
    await test.step('Open Scoring accordion', async () => {
      await openCommissionerSection(page, state.leagueId, 'Scoring');
      await expect(page.getByText('Scoring Settings')).toBeVisible({
        timeout: 10_000,
      });
    });

    await test.step('All three stat groups are visible', async () => {
      await expect(page.getByText('Batting')).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText('Pitching')).toBeVisible({
        timeout: 5_000,
      });
      await expect(page.getByText('Fielding')).toBeVisible({ timeout: 5_000 });
    });

    await test.step('Scoring profile name is displayed', async () => {
      // The default profile name renders inside the scoring section
      await expect(page.getByText(/default|standard/i).first()).toBeVisible({
        timeout: 5_000,
      });
    });
  });

  // -----------------------------------------------------------------------
  // PHASE 4 — ROLE RESTRICTION: MANAGER CANNOT SEE COMMISSIONER TAB
  // -----------------------------------------------------------------------

  test('Phase 4: Manager joins league and sees no Commissioner tab', async ({
    commissionerPage: page,
    commissionerJwt,
    managerJwt1,
  }) => {
    await test.step('Manager joins the league', async () => {
      const joinUrl = `/baseball/league/join/${state.inviteCode}`;
      await switchUser(page, managerJwt1, joinUrl);
      await page.waitForLoadState('load');
      await expect(page.getByText(/spot(s)?\s+available/i).first()).toBeVisible(
        { timeout: 15_000 },
      );
      await page.locator('#team-name').fill('Settings Tester');
      const joinBtn = page.getByRole('button', { name: /Join League/i });
      await expect(joinBtn).toBeEnabled({ timeout: 5_000 });
      await joinBtn.click();
      await expect(page).toHaveURL(/\/baseball\/league\/\d+/, {
        timeout: 15_000,
      });
    });

    await test.step('Manager cannot see the Commissioner navigation tab', async () => {
      await page.goto(`/baseball/league/${state.leagueId}`);
      await page.waitForLoadState('load');
      // Wait for league overview to render
      await expect(page.getByText(state.leagueName)).toBeVisible({
        timeout: 15_000,
      });
      // Commissioner tab should not exist for a non-commissioner
      await expect(
        page.getByRole('button', { name: /Commissioner/i }),
      ).not.toBeVisible({ timeout: 5_000 });
    });

    await test.step('Navigating directly to commissioner URL shows no commissioner content', async () => {
      await page.goto(`/baseball/league/${state.leagueId}/commissioner`);
      await page.waitForLoadState('load');
      // Should be redirected or show an access-denied message, not show commissioner tabs
      await expect(
        page.getByRole('button', { name: 'League Settings', exact: true }),
      ).not.toBeVisible({ timeout: 5_000 });
    });

    // Restore commissioner identity
    await switchUser(page, commissionerJwt);
  });
});
