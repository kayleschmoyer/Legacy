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
import { createLeagueViaUI } from '../helpers/create-league';
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
    process.env.INTEGRATION_BASE_URL ?? 'https://api.legacy-fantasy.com/'
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
    state.leagueName = `Settings E2E ${Date.now()}`;
    const result = await createLeagueViaUI(page, {
      leagueName: state.leagueName,
    });
    state.leagueId = result.leagueId;
    state.inviteCode = result.inviteCode;
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
      await expect(page.getByText('League Settings').first()).toBeVisible({
        timeout: 10_000,
      });
    });

    await test.step('Verify Minimum Career Games section is visible', async () => {
      await expect(page.getByText('Minimum Career Games')).toBeVisible({
        timeout: 10_000,
      });
    });

    await test.step('Change Minimum Career Games to 100', async () => {
      // Default is 50 — select 100. Use force:true to bypass sticky header.
      await page
        .getByRole('button', { name: 'Minimum career games: 100', exact: true })
        .click({ force: true });
    });

    await test.step('Change Minimum Career Seasons to 5', async () => {
      // Default is 3 — select 5
      await page
        .getByRole('button', {
          name: 'Minimum career seasons: 5',
          exact: true,
        })
        .click({ force: true });
    });

    await test.step('Disable Playoffs', async () => {
      await page
        .getByRole('button', { name: 'Playoffs: Disabled', exact: true })
        .click({ force: true });
    });

    await test.step('Re-enable Playoffs', async () => {
      await page
        .getByRole('button', { name: 'Playoffs: Enabled', exact: true })
        .click({ force: true });
    });

    await test.step('Enable multi-week playoff matchups', async () => {
      await page
        .getByRole('button', {
          name: 'Multi-week playoffs: Two weeks',
          exact: true,
        })
        .click({ force: true });
    });

    await test.step('Save settings and wait for success', async () => {
      await page
        .getByRole('button', { name: 'Save Settings' })
        .click({ force: true });
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
      expect(data.league.playoffFormat).toBe('4-team');
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
      // Groups only render when scoring data finishes loading; allow up to 20s each.
      // Target the region landmarks rendered by LeagueScoringSummary for deterministic matching.
      await expect(
        page.getByRole('region', { name: 'Batting multipliers' }),
      ).toBeVisible({ timeout: 20_000 });
      await expect(
        page.getByRole('region', { name: 'Pitching multipliers' }),
      ).toBeVisible({ timeout: 20_000 });
      await expect(
        page.getByRole('region', { name: 'Fielding multipliers' }),
      ).toBeVisible({ timeout: 20_000 });
    });

    await test.step('Scoring profile name is displayed', async () => {
      // The default profile name renders inside the scoring section.
      // Allow up to 20s — consistent with the stat-group checks above.
      await expect(page.getByText(/default|standard/i).first()).toBeVisible({
        timeout: 20_000,
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
