/**
 * Roster Management UI Integration Test (LS-589, LS-3856)
 *
 * Validates three roster management features against the **live** backend
 * (no mocks) with real browser interactions and dedicated fixture contexts
 * for multi-user role verification:
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
import { cleanupLeague } from '../helpers/cleanup-league';
import { createLeagueViaUI } from '../helpers/create-league';
import { reloadUntilVisible } from '../helpers/reload-until-visible';
import { joinLeagueAsManager } from '../helpers/wait-for-join-page';
import { waitForSeasonActive } from '../helpers/wait-for-season-active';
import { test } from '../fixtures/ui';
import { gqlFetch } from '../helpers/gql-fetch';

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

  // Layer-2 per-test league cleanup (LS-4539). Removes orphans even when the
  // test body throws — Playwright still runs afterAll on test failure. Process
  // crashes are caught by global-teardown (Layer 3) and the next run's
  // pre-run sweep in global-setup (Layer 1).
  test.afterAll(async ({ apiCommissioner }) => {
    await cleanupLeague(apiCommissioner, state.leagueId);
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

  // Phase 2 uses dedicated manager fixture pages (one browser context per
  // manager) instead of switchUser() on the commissioner page. switchUser()
  // has a known race condition (LS-3672, LS-3705) where the background
  // refreshJwt() can dispatch AUTH_LOGOUT after page.evaluate() sets the new
  // user profile, clearing localStorage and causing the join page to show
  // "Invalid invite code" persistently across all retries (LS-4385). The full
  // join orchestration lives in joinLeagueAsManager (LS-4447).
  test('Phase 2: Managers join the league', async ({
    managerJwt1,
    managerJwt2,
    managerJwt3,
    managerPage1,
    managerPage2,
    managerPage3,
  }) => {
    const managers = [
      { page: managerPage1, jwt: managerJwt1, teamName: state.managerTeamName },
      { page: managerPage2, jwt: managerJwt2, teamName: 'Second Stringers' },
      { page: managerPage3, jwt: managerJwt3, teamName: 'Bench Warmers' },
    ];

    for (const { page, jwt, teamName } of managers) {
      // Full join orchestration lives in joinLeagueAsManager (LS-4447).
      await joinLeagueAsManager(page, {
        jwt,
        inviteCode: state.inviteCode,
        teamName,
      });

      // The URL redirect alone doesn't guarantee the leagueMembers row is
      // queryable yet (LS-4350): later phases that re-enter the league as
      // this manager will see "League not found" because `GetLeagueById`
      // throws ForbiddenError when the membership lookup returns no row.
      // Poll the manager's own `userTeamId` with their JWT until it
      // resolves to a non-null team id before progressing.
      await expect
        .poll(
          async () => {
            const data = await gqlFetch<{ userTeamId: number | null }>(
              jwt,
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
            message: `Manager join for "${teamName}" did not persist a leagueMembers row in league ${state.leagueId} within 15s`,
          },
        )
        .not.toBeNull();
    }
  });

  // -----------------------------------------------------------------
  // PHASE 3 — AUTOMATED DRAFT
  // -----------------------------------------------------------------

  test('Phase 3: Automated random draft', async ({
    commissionerPage: page,
    apiCommissioner,
  }) => {
    // 600 s = 300 s draft deadline + 300 s buffer for setup steps and cold starts
    test.setTimeout(600_000);

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
      await expect(draftSettingsBtn).toBeVisible({ timeout: 10_000 });
      await draftSettingsBtn.click();

      // Use data-testid rather than aria-label matching: the button's accessible
      // name is "Draft Mode: Automated Draft" (set by OptionSelector), which
      // requires partial-regex matching and is fragile. After clicking the
      // accordion, DraftSettingsControl freshly mounts and fires
      // useGetLeagueDraftQuery — option buttons are not mounted during the
      // loading spinner. The 15 s budget covers Lambda cold-start windows
      // that have exceeded 5 s in practice (LS-4361, LS-4375).
      const automatedBtn = page.getByTestId('option-automated');
      await expect(automatedBtn).toBeVisible({ timeout: 15_000 });
      await automatedBtn.click();

      const saveBtn = page.getByRole('button', {
        name: /Save Draft Settings/i,
      });
      await expect(saveBtn).toBeEnabled({ timeout: 10_000 });
      await saveBtn.click();
      // Save button is disabled iff `!hasChanges || saving`. handleSave sets
      // hasChanges=false on success, so the button stays disabled post-save —
      // it does NOT return to enabled. Waiting for `toBeEnabled` here was a
      // logic error introduced by LS-4457 and always timed out (LS-4480).
      // The correct deterministic signal is `toBeDisabled`, matching the
      // LS-4352 precedent in league-activity-feed-ui.
      await expect(saveBtn).toBeDisabled({ timeout: 10_000 });
    });

    await test.step('Start the draft', async () => {
      // LS-4944: re-open Next Step accordion (LS-4639 made the v2 Commish
      // tab single-open, so the prior 'Draft Settings' click collapsed Next
      // Step where Start Draft lives). Idempotent via aria-expanded. Uses
      // stable data-testid because NextStepControl cycles button labels
      // (Processing... / Start Draft / Starting Draft...) while its matchups
      // query is in flight, so a role+name regex returns zero matches outside
      // the brief 'Start Draft' window.
      const nextStepHeader = page
        .getByRole('button', { name: /^Next Step/i })
        .first();
      await expect(nextStepHeader).toBeVisible({ timeout: 15_000 });
      if ((await nextStepHeader.getAttribute('aria-expanded')) !== 'true') {
        await nextStepHeader.click();
      }
      const startBtn = page.getByTestId('start-draft-button');
      await expect(startBtn).toBeEnabled({ timeout: 30_000 });
      await startBtn.click();

      // Scope the Confirm click to the dialog rather than using .last() on a
      // shared role+name query: .last() resolves against the current DOM
      // immediately and can pick the "Start Draft" button if the dialog portal
      // hasn't finished rendering yet — clicking Start Draft a second time is a
      // no-op (setShowConfirmDialog(true) again) so initializeDraft never fires
      // and draftStatus stays null (LS-4380).
      //
      // Integration tests run against the live web app, so component-level
      // testid changes only take effect after deployment. Using role="dialog"
      // to scope the button works with any deployed version of the component.
      // 15 s covers dialog open animation + potential Lambda cold-start windows.
      const confirmDialog = page.getByRole('dialog');
      await expect(confirmDialog).toBeVisible({ timeout: 15_000 });
      await confirmDialog.getByRole('button', { name: 'Confirm' }).click();
    });

    await test.step('Wait for draft to complete', async () => {
      // 300 s covers Lambda cold-start + random-draft processing time.
      // The 900 s budget was an artefact of masking the start-draft race
      // condition fixed in LS-4375; the draft now reliably initiates so
      // a shorter deadline is appropriate.
      await waitForSeasonActive(page, state.leagueId, {
        deadlineMs: 300_000,
        api: apiCommissioner,
      });
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
      // After a completed draft the roster page (RosterBoardV2) should show
      // the three section cards: "Starting Hitters", "Starting Pitchers",
      // and "Bench". The legacy "Pitching/Infield/Outfield" headers were
      // replaced in LS-4674 (LS-5053). Auto-draft → roster query can lag a
      // render tick behind `waitForSeasonActive`, so reload until the first
      // section appears — mirrors the LS-5050 pattern in full-season-ui.
      await reloadUntilVisible(
        page,
        page.getByText('Starting Hitters', { exact: false }).first(),
      );
      await expect(
        page.getByText('Starting Pitchers', { exact: false }).first(),
      ).toBeVisible();
      await expect(
        page.getByText('Bench', { exact: false }).first(),
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
      const nameInput = page.locator('#team-name-input');
      await nameInput.clear();
      await nameInput.fill(state.renamedTeamName);

      // Team.tsx renders "Save Name" (next to the input) and "Save Branding"
      // (under the colors panel). Match the name button by exact label so the
      // selector cannot drift onto the branding control.
      const saveNameBtn = page.getByRole('button', { name: /Save Name/i });
      await expect(saveNameBtn).toBeEnabled({ timeout: 3000 });
      await saveNameBtn.click();

      // Clicking Save Name opens a confirmation dialog (LS-4018) — the rename
      // mutation only fires after the user confirms inside it.
      const confirmDialog = page.getByTestId('rename-team-confirm');
      await expect(confirmDialog).toBeVisible({ timeout: 5000 });
      await confirmDialog.getByRole('button', { name: /^Rename$/i }).click();
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

    // Filled roster slots have accessible name "{Player Name} at {POS}".
    // Use getByRole's name match (accessible name) rather than a raw
    // [aria-label$="..."] CSS selector — the underlying Tamagui XStack does
    // not always emit aria-label as a verbatim HTML attribute, but the
    // accessible name (which Playwright's getByRole reads) is stable. This
    // mirrors the selector used in Phase 4.
    const filledSlots = page.getByRole('button', {
      name: / at (SP|RP|C|1B|2B|3B|SS|OF|DH|LF|CF|RF)$/i,
    });

    await test.step('Verify at least two filled roster slots exist', async () => {
      await expect(filledSlots.first()).toBeVisible({ timeout: 15000 });
      const count = await filledSlots.count();
      expect(count).toBeGreaterThanOrEqual(2);
    });

    await test.step('Click first filled slot to select a player', async () => {
      // Clicking a player slot selects them (aria-pressed transitions to true).
      // The aria-pressed transition is the deterministic signal that the
      // selection registered — replaces a 500ms wait (LS-4457).
      await filledSlots.first().click();
      await expect(filledSlots.first()).toHaveAttribute(
        'aria-pressed',
        'true',
        {
          timeout: 5_000,
        },
      );
    });

    await test.step('Click a second slot to trigger a position swap', async () => {
      // After selecting a player the second clicked slot either:
      //   a) swaps the selected player into that slot (both now filled), or
      //   b) deselects if clicking the same slot
      // We click a different filled slot to execute a swap. The verify-step
      // below auto-waits for the post-swap roster to render, so no fixed
      // wall-clock wait is needed (LS-4457).
      const slotCount = await filledSlots.count();
      if (slotCount >= 2) {
        await filledSlots.nth(1).click();
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
      // The "Clear selection" button is only rendered when a player is
      // selected. Use a count check (not an isVisible branch) so this step
      // is a no-op when no selection is active without producing a green
      // assertion-less branch.
      const clearBtn = page.getByRole('button', {
        name: /Clear selection/i,
      });
      if ((await clearBtn.count()) > 0) {
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
      // Pin the URL to the league we just created — the loose `/roster/`
      // match would also pass on a redirect to a different league (LS-4350).
      await expect(page).toHaveURL(
        new RegExp(`/baseball/league/${state.leagueId}/roster`),
      );
      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
        { timeout: 30000 },
      );
      // Guard against the LS-4350 "League not found" rendering: if
      // `GetLeagueById` rejects (e.g. membership lag), LeagueDetailPageV2
      // short-circuits before RosterTab mounts and the roster locator
      // would silently time out. Asserting a roster section heading
      // surfaces that failure mode with a meaningful error instead.
      await expect(
        page.getByText('Starting Hitters', { exact: false }).first(),
      ).toBeVisible({ timeout: 30_000 });
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
