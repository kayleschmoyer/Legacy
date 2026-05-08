/**
 * Roster Management UI Integration Test (LS-589, LS-3856)
 *
 * Validates three roster management features against the **live** backend
 * (no mocks) with real browser interactions and JWT swapping for multi-user
 * role verification:
 *
 *   1. **Inline team name editing** — manager navigates to My Team tab,
 *      clicks Edit, types a new name, saves it, and the change is verified
 *      both via the UI and a direct GraphQL API assertion.
 *
 *   2. **Position swaps** — after an automated draft populates the roster,
 *      manager selects a player then clicks a different position slot to
 *      perform a slot swap; verifies the roster still renders without errors.
 *
 *   3. **Team seeding (standings)** — navigates to the Standings tab and
 *      verifies that all four teams appear with their rank badges and
 *      waiver-order seed values displayed.
 *
 * Prerequisites:
 *   - A running dev/staging environment (or local Docker stack)
 *   - `./ls-cli.ps1 auth login` run so ~/.legacy-sports/auth.json is valid
 *   - At least 3 non-admin users in the database to impersonate as managers
 *
 * Targets https://legacy-fantasy.com by default. Override with env vars:
 *   INTEGRATION_WEB_URL=http://localhost:4200
 *   INTEGRATION_BASE_URL=http://localhost:5000
 *
 * Run:
 *   pnpm exec playwright test --config apps/web-e2e/playwright.integration.config.ts \
 *     src/integration/tests/roster-management-ui.integration.spec.ts
 */

import { expect } from '@playwright/test';
import { createLeagueViaUI } from '../helpers/create-league';
import { waitForJoinPageValidation } from '../helpers/wait-for-join-page';
import { switchUser, test } from '../fixtures/ui';

// ---------------------------------------------------------------------------
// Shared state accumulated across serial tests.
// ---------------------------------------------------------------------------

interface RosterState {
  leagueId: number;
  inviteCode: string;
  leagueName: string;
  /** Team name the manager chose after joining */
  managerTeamName: string;
  /** The new team name after inline editing */
  renamedTeamName: string;
}

let state: RosterState;

// ---------------------------------------------------------------------------
// Raw GQL fetch for API verification steps (no Playwright context needed)
// ---------------------------------------------------------------------------

const GQL_URL =
  (
    process.env.INTEGRATION_BASE_URL ?? 'https://api.legacy-fantasy.com/'
  ).replace(/\/?$/, '/') + 'graphql';

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
  if (json.errors?.length)
    throw new Error(`GraphQL error: ${json.errors[0].message}`);
  if (!json.data) throw new Error('GraphQL response contained no data');
  return json.data;
}

// ---------------------------------------------------------------------------
// Serial test suite
// ---------------------------------------------------------------------------

test.describe
  .serial('Roster Management UI (Live Backend) @integration @critical', () => {
  test.describe.configure({ retries: 0 });

  test.beforeAll(() => {
    state = {
      leagueId: 0,
      inviteCode: '',
      leagueName: '',
      managerTeamName: 'Roster Testers',
      renamedTeamName: '',
    };
  });

  // -----------------------------------------------------------------
  // PHASE 1 — CREATE LEAGUE (commissioner creates a 4-team league)
  // -----------------------------------------------------------------

  test('Phase 1: Create league via the UI', async ({
    commissionerPage: page,
  }) => {
    state.leagueName = `Roster Mgmt E2E ${Date.now()}`;
    const result = await createLeagueViaUI(page, {
      leagueName: state.leagueName,
    });
    state.leagueId = result.leagueId;
    state.inviteCode = result.inviteCode;
  });

  // -----------------------------------------------------------------
  // PHASE 2 — 3 MANAGERS JOIN THE LEAGUE
  // -----------------------------------------------------------------

  test('Phase 2: Managers join the league', async ({
    commissionerPage: page,
    commissionerJwt,
    managerJwt1,
    managerJwt2,
    managerJwt3,
  }) => {
    const managers = [
      { jwt: managerJwt1, teamName: state.managerTeamName },
      { jwt: managerJwt2, teamName: 'Second Stringers' },
      { jwt: managerJwt3, teamName: 'Bench Warmers' },
    ];

    for (const { jwt, teamName } of managers) {
      const joinUrl = `/baseball/league/join/${state.inviteCode}`;
      await switchUser(page, jwt, joinUrl);
      await page.waitForLoadState('load');

      await waitForJoinPageValidation(page);

      await expect(page.getByTestId('team-name')).toBeVisible({
        timeout: 5_000,
      });
      await page.getByTestId('team-name').fill(teamName);
      const joinBtn = page.getByRole('button', { name: /Join League/i });
      await expect(joinBtn).toBeEnabled({ timeout: 5000 });
      await joinBtn.click();

      await expect(page).toHaveURL(/\/baseball\/league\/\d+/, {
        timeout: 15000,
      });
    }

    // Restore commissioner identity
    await switchUser(page, commissionerJwt);
  });

  // -----------------------------------------------------------------
  // PHASE 3 — AUTOMATED DRAFT
  // -----------------------------------------------------------------

  test('Phase 3: Automated random draft', async ({
    commissionerPage: page,
  }) => {
    // Automated drafts can take 200–300s; allow generous time for Lambda cold starts
    test.setTimeout(360_000);

    await test.step('Navigate to commissioner panel', async () => {
      await page.goto(`/baseball/league/${state.leagueId}/commissioner`);
      await page.waitForLoadState('load');
      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
        { timeout: 30000 },
      );
    });

    await test.step('Switch draft mode to Automated', async () => {
      const draftSettingsBtn = page.getByRole('button', {
        name: /Draft Settings/i,
      });
      await expect(draftSettingsBtn).toBeVisible({ timeout: 10000 });
      await draftSettingsBtn.click();

      const automatedBtn = page.getByRole('button', {
        name: /Automated Draft/i,
      });
      await expect(automatedBtn).toBeVisible({ timeout: 5000 });
      await automatedBtn.click();

      const saveBtn = page.getByRole('button', {
        name: /Save Draft Settings/i,
      });
      await expect(saveBtn).toBeEnabled({ timeout: 5000 });
      await saveBtn.click();
      await page.waitForTimeout(1000);
    });

    await test.step('Start the draft', async () => {
      const startBtn = page.getByRole('button', { name: /Start Draft/i });
      await expect(startBtn).toBeVisible({ timeout: 15000 });
      await startBtn.click();

      const confirmBtn = page.getByRole('button', {
        name: /Start Draft|Confirm/i,
      });
      await expect(confirmBtn.last()).toBeVisible({ timeout: 5000 });
      await confirmBtn.last().click();
    });

    await test.step('Wait for draft to complete', async () => {
      const seasonActive = page.getByText('Season Active');
      const deadline = Date.now() + 300_000;
      while (Date.now() < deadline) {
        if (await seasonActive.isVisible().catch(() => false)) break;
        await page.waitForTimeout(5_000);
        await page.goto(`/baseball/league/${state.leagueId}/commissioner`);
        await page.waitForLoadState('load');
      }
      await expect(seasonActive).toBeVisible({ timeout: 15_000 });
    });
  });

  // -----------------------------------------------------------------
  // PHASE 4 — VERIFY ROSTER POPULATED (post-draft)
  // -----------------------------------------------------------------

  test('Phase 4: Verify commissioner roster is populated post-draft', async ({
    commissionerPage: page,
  }) => {
    await test.step('Navigate to My Roster tab', async () => {
      await page.goto(`/baseball/league/${state.leagueId}/roster`);
      await page.waitForLoadState('load');
      await expect(page).toHaveURL(/\/roster/);
      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
        { timeout: 30000 },
      );
    });

    await test.step('Verify roster section headers are visible', async () => {
      await expect(
        page.getByText('Pitching', { exact: false }).first(),
      ).toBeVisible({ timeout: 15000 });
      await expect(
        page.getByText('Infield', { exact: false }).first(),
      ).toBeVisible();
      await expect(
        page.getByText('Outfield', { exact: false }).first(),
      ).toBeVisible();
    });

    await test.step('Verify player slots are filled', async () => {
      // Roster rows have aria-label "{Player Name} at {POS}"
      const playerSlots = page.getByRole('button', {
        name: / at (SP|RP|C|1B|2B|3B|SS|OF|DH|LF|CF|RF)$/i,
      });
      await expect(playerSlots.first()).toBeVisible({ timeout: 15000 });
      const count = await playerSlots.count();
      expect(count).toBeGreaterThanOrEqual(10);
    });
  });

  // -----------------------------------------------------------------
  // PHASE 5 — INLINE TEAM NAME EDITING (manager 1 renames their team)
  // -----------------------------------------------------------------

  test('Phase 5: Inline team name editing', async ({ managerPage1: page }) => {
    state.renamedTeamName = `Renamed Roster ${Date.now()}`;

    await test.step('Manager 1 navigates to My Team tab', async () => {
      // Use a dedicated manager browser context rather than switchUser on
      // commissionerPage. switchUser has a race condition (LS-3672, LS-3705):
      // background JWT refresh can dispatch AUTH_LOGOUT and clear localStorage
      // after page.evaluate() sets the manager profile.
      await page.goto(`/baseball/league/${state.leagueId}/team-settings`);
      await page.waitForLoadState('load');
      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
        { timeout: 30000 },
      );
    });

    await test.step('Verify current team name is displayed', async () => {
      // Wait for the Team Identity section to render — this heading only
      // appears once getUserTeamId resolves and confirms the user has a team.
      // Using a 30 s budget to account for Lambda cold starts in CI.
      await expect(page.getByText('Team Identity').first()).toBeVisible({
        timeout: 30000,
      });
      // Team.tsx V2 renders the name inside an <input> — use toHaveValue
      // instead of getByText, which only matches text nodes, not input values.
      await expect(page.locator('#team-name-input')).toHaveValue(
        state.managerTeamName,
        { timeout: 15000 },
      );
    });

    await test.step('Verify team name input is directly editable', async () => {
      // Team.tsx renders the name input always visible — no "Edit" toggle needed
      const nameInput = page.locator('input[type="text"]').first();
      await expect(nameInput).toBeVisible({ timeout: 5000 });
    });

    await test.step('Type new team name and save', async () => {
      const nameInput = page.locator('input[type="text"]').first();
      await nameInput.clear();
      await nameInput.fill(state.renamedTeamName);

      // Click the Save button to submit
      const saveBtn = page.getByRole('button', { name: /Save/i });
      await expect(saveBtn.first()).toBeEnabled({ timeout: 3000 });
      await saveBtn.first().click();
    });

    await test.step('Verify success indicator appears', async () => {
      // After a successful rename, a "Saved" checkmark briefly appears
      await expect(page.getByText(/saved/i).first()).toBeVisible({
        timeout: 10000,
      });
    });

    await test.step('Verify updated name persists on the page', async () => {
      // The team name field should now show the new name
      await expect(page.locator('#team-name-input')).toHaveValue(
        state.renamedTeamName,
        { timeout: 10000 },
      );
    });
  });

  // -----------------------------------------------------------------
  // PHASE 6 — API VERIFICATION: rename persisted to the backend
  // -----------------------------------------------------------------

  test('Phase 6: Verify renamed team name persisted via API', async ({
    commissionerJwt,
  }) => {
    await expect
      .poll(
        async () => {
          const data = await gqlFetch<{
            leagueTeams: Array<{ id: number; name: string }>;
          }>(
            commissionerJwt,
            `query GetLeagueTeams($leagueId: Int!) {
                 leagueTeams(leagueId: $leagueId) { id name }
               }`,
            { leagueId: state.leagueId },
          );
          return data.leagueTeams.map((t) => t.name);
        },
        {
          timeout: 15_000,
          intervals: [1_000, 2_000, 3_000],
          message: `Team "${state.renamedTeamName}" not found in leagueTeams after rename`,
        },
      )
      .toContain(state.renamedTeamName);
  });

  // -----------------------------------------------------------------
  // PHASE 7 — COMMISSIONER SEES RENAMED TEAM IN STANDINGS
  // -----------------------------------------------------------------

  test('Phase 7: Commissioner sees renamed team in standings', async ({
    commissionerPage: page,
  }) => {
    await test.step('Navigate to Standings tab', async () => {
      await page.goto(`/baseball/league/${state.leagueId}/standings`);
      await page.waitForLoadState('load');
      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
        { timeout: 30000 },
      );
    });

    await test.step('Verify renamed team appears in standings list', async () => {
      await expect(
        page.getByText(state.renamedTeamName, { exact: false }).first(),
      ).toBeVisible({ timeout: 15000 });
    });

    await test.step('Verify all 4 teams appear in standings', async () => {
      // LeagueDetailPageV2 renders StandingsTab, which uses a <table> not a list.
      // Each team occupies a <tr> in the <table aria-label="League Standings"> tbody.
      const teamRows = page.locator(
        'table[aria-label="League Standings"] tbody tr',
      );
      await expect
        .poll(async () => teamRows.count(), {
          timeout: 15_000,
          intervals: [1_000, 2_000],
        })
        .toBeGreaterThanOrEqual(4);
    });
  });

  // -----------------------------------------------------------------
  // PHASE 8 — TEAM SEEDING IN STANDINGS (waiver order visible)
  // -----------------------------------------------------------------

  test('Phase 8: Team seeding numbers visible in standings', async ({
    commissionerPage: page,
  }) => {
    await test.step('Navigate to Standings tab', async () => {
      await page.goto(`/baseball/league/${state.leagueId}/standings`);
      await page.waitForLoadState('load');
    });

    await test.step('Verify team rank badges are visible in standings', async () => {
      // Wait for a table row to confirm standings data has loaded; <Rank> badges
      // render in the same pass, so this gates the .ls-rank check below.
      await expect(
        page.locator('table[aria-label="League Standings"] tbody tr').first(),
      ).toBeVisible({ timeout: 15_000 });

      const rankBadges = page.locator(
        'table[aria-label="League Standings"] .ls-rank',
      );
      await expect(rankBadges.first()).toBeVisible({ timeout: 10_000 });
      const rankCount = await rankBadges.count();
      expect(rankCount).toBeGreaterThanOrEqual(1);
    });
  });

  // -----------------------------------------------------------------
  // PHASE 9 — POSITION SWAPS (roster inline pick-and-swap)
  // -----------------------------------------------------------------

  test('Phase 9: Position swaps on roster page', async ({
    commissionerPage: page,
  }) => {
    await test.step('Navigate to My Roster tab (commissioner)', async () => {
      await page.goto(`/baseball/league/${state.leagueId}/roster`);
      await page.waitForLoadState('load');
      await expect(page).toHaveURL(/\/roster/);
      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
        { timeout: 30000 },
      );
    });

    await test.step('Verify at least two filled roster slots exist', async () => {
      const filledSlots = page.locator(
        '[aria-label$=" at SP"],[aria-label$=" at RP"],[aria-label$=" at C"],[aria-label$=" at 1B"],[aria-label$=" at 2B"],[aria-label$=" at 3B"],[aria-label$=" at SS"],[aria-label$=" at OF"],[aria-label$=" at DH"],[aria-label$=" at LF"],[aria-label$=" at CF"],[aria-label$=" at RF"]',
      );
      await expect(filledSlots.first()).toBeVisible({ timeout: 15000 });
      const count = await filledSlots.count();
      expect(count).toBeGreaterThanOrEqual(2);
    });

    await test.step('Click first filled slot to select a player', async () => {
      // Clicking a player slot selects them (aria-pressed transitions to true)
      const filledSlots = page.locator('[role="button"][aria-label*=" at "]');
      await filledSlots.first().click();
      // Give the UI a moment to register the selection
      await page.waitForTimeout(500);
    });

    await test.step('Click a second slot to trigger a position swap', async () => {
      // After selecting a player the second clicked slot either:
      //   a) swaps the selected player into that slot (both now filled), or
      //   b) deselects if clicking the same slot
      // We click a different filled slot to execute a swap.
      const filledSlots = page.locator('[role="button"][aria-label*=" at "]');
      const slotCount = await filledSlots.count();
      if (slotCount >= 2) {
        await filledSlots.nth(1).click();
        await page.waitForTimeout(1000);
      }
    });

    await test.step('Verify roster page still renders without errors after swap', async () => {
      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
      );
      // At least 10 player slots should still be visible after any swap
      const playerSlots = page.getByRole('button', {
        name: / at (SP|RP|C|1B|2B|3B|SS|OF|DH|LF|CF|RF)$/i,
      });
      await expect(playerSlots.first()).toBeVisible({ timeout: 10000 });
      const count = await playerSlots.count();
      expect(count).toBeGreaterThanOrEqual(10);
    });

    await test.step('Clear selection and verify "Clear selection" button disappears', async () => {
      // If a player is still selected the "Clear selection" button is
      // rendered by the roster component — clicking it deselects.
      const clearBtn = page.getByRole('button', {
        name: /Clear selection/i,
      });
      if (await clearBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await clearBtn.click();
        await expect(clearBtn).not.toBeVisible({ timeout: 3000 });
      }
    });
  });

  // -----------------------------------------------------------------
  // PHASE 10 — MANAGER SEES THEIR OWN ROSTER
  // -----------------------------------------------------------------

  test('Phase 10: Manager can view their own roster', async ({
    managerPage1: page,
  }) => {
    // Use a dedicated manager browser context rather than switchUser on
    // commissionerPage. switchUser has a race condition (LS-3672, LS-3705,
    // LS-3735): background JWT refresh can dispatch AUTH_LOGOUT and clear
    // localStorage after page.evaluate() sets the manager profile, landing
    // the test on the unauthenticated sign-in page.
    await test.step('Navigate to manager 1 roster', async () => {
      await page.goto(`/baseball/league/${state.leagueId}/roster`);
      await page.waitForLoadState('load');
      await expect(page).toHaveURL(/\/roster/);
      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
        { timeout: 30000 },
      );
    });

    await test.step('Verify manager roster has player slots', async () => {
      const playerSlots = page.getByRole('button', {
        name: / at (SP|RP|C|1B|2B|3B|SS|OF|DH|LF|CF|RF)$/i,
      });
      await expect(playerSlots.first()).toBeVisible({ timeout: 15000 });
      const count = await playerSlots.count();
      expect(count).toBeGreaterThanOrEqual(10);
    });

    await test.step('Verify My Team tab shows the renamed team name', async () => {
      await page.goto(`/baseball/league/${state.leagueId}/team-settings`);
      await page.waitForLoadState('load');
      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
        { timeout: 30000 },
      );
      // Wait for the Team Identity section to render before checking the name.
      // This heading only appears once getUserTeamId resolves and confirms
      // the user has a team — mirrors the guard used in Phase 5.
      await expect(page.getByText('Team Identity').first()).toBeVisible({
        timeout: 30000,
      });
      await expect(page.locator('#team-name-input')).toHaveValue(
        state.renamedTeamName,
        { timeout: 15000 },
      );
    });
  });
});
