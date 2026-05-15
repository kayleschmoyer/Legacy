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
import { joinLeagueAsManager } from '../helpers/wait-for-join-page';
import { awsRequestContext } from '../helpers/graphql';
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
    throw new Error(
      `GraphQL error: ${json.errors[0].message}${awsRequestContext(res.headers)}`,
    );
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
  // Wait for CommishTab to mount: the Announcements accordion is always the
  // first section rendered and is a reliable sentinel that the league data
  // and auth checks have settled (without it, the GraphQL-gated render can
  // silently redirect to /overview before the 15 s toBeVisible window opens).
  await expect(
    page.getByRole('button', { name: 'Announcements', exact: true }),
  ).toBeVisible({ timeout: 30_000 });
  const sectionHeader = page.getByRole('button', {
    name: sectionName,
    exact: true,
  });
  await expect(sectionHeader).toBeVisible({ timeout: 5_000 });
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
      await expect(
        page.getByRole('status').filter({ hasText: /saved successfully/i }),
      ).toBeVisible({
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
      await openCommissionerSection(page, state.leagueId, 'Scoring Rules');
      await expect(page.getByText('Scoring Settings')).toBeVisible({
        timeout: 10_000,
      });
    });

    await test.step('All three stat groups are visible', async () => {
      // Groups only render when scoring data finishes loading; allow up to 20s each.
      // The Commissioner tab renders LeagueScoringEditor (not LeagueScoringSummary),
      // which displays group titles as plain text headings, not ARIA region landmarks.
      await expect(
        page.getByText('Batting', { exact: true }).first(),
      ).toBeVisible({ timeout: 20_000 });
      await expect(
        page.getByText('Pitching', { exact: true }).first(),
      ).toBeVisible({ timeout: 20_000 });
      await expect(
        page.getByText('Fielding', { exact: true }).first(),
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
    managerPage1,
    commissionerJwt,
    managerJwt1,
  }) => {
    await test.step('Manager joins the league', async () => {
      // Full join orchestration lives in joinLeagueAsManager (LS-4447) — any
      // race window on the join flow is fixed once at the helper level.
      await joinLeagueAsManager(managerPage1, {
        jwt: managerJwt1,
        inviteCode: state.inviteCode,
        teamName: 'Settings Tester',
      });

      // Ensure the leagueMembers row is queryable before asserting role
      // restrictions — without this the league page can show "League not
      // found" when the membership row hasn't propagated yet (LS-4350 pattern).
      await expect
        .poll(
          async () => {
            const data = await gqlFetch<{ userTeamId: number | null }>(
              managerJwt1,
              `query GetUserTeamIdForJoin($leagueId: Int!) {
                 userTeamId(leagueId: $leagueId)
               }`,
              { leagueId: state.leagueId },
            );
            return data.userTeamId;
          },
          {
            timeout: 15_000,
            intervals: [500, 1_000, 2_000],
            message: `Manager join did not persist a leagueMembers row in league ${state.leagueId} within 15s`,
          },
        )
        .not.toBeNull();
    });

    await test.step('Manager cannot see the Commissioner navigation tab', async () => {
      await managerPage1.goto(`/baseball/league/${state.leagueId}`);
      await managerPage1.waitForLoadState('load');
      // Wait for league overview to render
      await expect(managerPage1.getByTestId('league-title')).toHaveText(
        state.leagueName,
        { timeout: 15_000 },
      );
      // Commissioner tab should not exist for a non-commissioner.
      // Scope to main so the nav league-switcher
      // "Current league: ..." button is not matched.
      await expect(
        managerPage1
          .getByRole('main')
          .getByRole('button', { name: /Commissioner/i }),
      ).not.toBeVisible({ timeout: 5_000 });
    });

    await test.step('Navigating directly to commissioner URL shows no commissioner content', async () => {
      await managerPage1.goto(
        `/baseball/league/${state.leagueId}/commissioner`,
      );
      await managerPage1.waitForLoadState('load');
      // Should be redirected or show an access-denied message, not show commissioner tabs
      await expect(
        managerPage1.getByRole('button', {
          name: 'League Settings',
          exact: true,
        }),
      ).not.toBeVisible({ timeout: 5_000 });
    });
  });
});
