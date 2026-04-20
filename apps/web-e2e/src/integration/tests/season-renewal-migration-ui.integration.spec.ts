/**
 * Season Renewal & League Migration UI — Integration Test (LS-755)
 *
 * Validates the full season-renewal UI flow and post-renewal league migration
 * against a live backend. No GraphQL mocks — all mutations hit real services.
 *
 * Flow:
 *   1. Commissioner creates a 4-team league via the UI and immediately sets
 *      totalMatchups = 1 via API so the season can be completed quickly.
 *   2. Three managers join via the invite-code UI (token swap).
 *   3. Commissioner runs an automated random draft → wait for Season Active.
 *   4. Via API: auto-select games for week 1 and auto-advance the matchup.
 *      Poll until season is fully complete (currentMatchup = null).
 *   5. Commissioner panel — verify "Season Complete" copy and "Start New
 *      Season" button are both rendered.
 *   6. Renewal dialog: open, toggle roster options and verify copy updates,
 *      then cancel (dry run).
 *   7. Re-open dialog, choose "Hold a new draft", confirm renewal →
 *      verify navigation to new league URL.
 *   8. New league verification: season number = 2, not frozen, members
 *      present, "Pre-Draft" badge.
 *   9. Old league verification: frozen (via API), "Start New Season" button
 *      absent from commissioner panel.
 *  10. Manager migration: token-swap to manager 1, navigate to new league —
 *      membership was carried forward.
 *
 * Run:
 *   cd apps/web-e2e
 *   pnpm exec playwright test --config playwright.integration.config.ts \
 *     src/integration/tests/season-renewal-migration-ui.integration.spec.ts
 */

import { expect } from '@playwright/test';
import { createLeagueViaUI } from '../helpers/create-league';
import { waitForJoinPageValidation } from '../helpers/wait-for-join-page';
import { switchUser, test } from '../fixtures/ui';

// ---------------------------------------------------------------------------
// Shared state accumulated across serial phases.
// ---------------------------------------------------------------------------

interface RenewalState {
  leagueId: number;
  inviteCode: string;
  leagueName: string;
  /** ID of the newly created season-2 league after renewal. */
  newLeagueId: number;
}

let state: RenewalState;

// ---------------------------------------------------------------------------
// GQL helper (API calls used to bypass slow UI steps)
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
  if (json.errors?.length) {
    throw new Error(`GraphQL error: ${json.errors[0].message}`);
  }
  if (!json.data) throw new Error('GraphQL response contained no data');
  return json.data;
}

// ---------------------------------------------------------------------------
// Serial test suite
// ---------------------------------------------------------------------------

test.describe
  .serial('Season Renewal and League Migration UI (Live Backend) @integration @regression', () => {
  test.describe.configure({ retries: 0 });

  test.beforeAll(() => {
    state = {
      leagueId: 0,
      inviteCode: '',
      leagueName: '',
      newLeagueId: 0,
    };
  });

  // -----------------------------------------------------------------------
  // PHASE 1 — CREATE LEAGUE (UI) + SHORTEN SEASON (API)
  // -----------------------------------------------------------------------

  test('Phase 1: Commissioner creates a 4-team league and sets 1-week season', async ({
    commissionerPage: page,
    commissionerJwt,
  }) => {
    test.setTimeout(60_000);

    state.leagueName = `Season Renewal E2E ${Date.now()}`;
    const result = await createLeagueViaUI(page, {
      leagueName: state.leagueName,
    });
    state.leagueId = result.leagueId;
    state.inviteCode = result.inviteCode;

    await test.step('Reduce season to 1 matchup, 1 game/matchup, and disable playoffs via API (fast-complete)', async () => {
      // Setting totalMatchups = 1 and gamesPerMatchup = 1 before the draft
      // ensures the automated draft will call createAllMatchupsForLeague
      // with only 1 week and 1 game, so we can advance the entire season
      // in a single autoSelectGames + autoAdvanceMatchups call.
      // Disabling playoffs ensures the season completes cleanly
      // (currentMatchup → null) instead of transitioning to a playoff bracket.
      const data = await gqlFetch<{
        updateLeagueSettings: {
          id: number;
          totalMatchups: number | null;
          gamesPerMatchup: number | null;
          playoffEnabled: boolean;
        };
      }>(
        commissionerJwt,
        `mutation SetSeasonConfig($input: UpdateLeagueSettingsInput!) {
             updateLeagueSettings(input: $input) {
               id totalMatchups gamesPerMatchup playoffEnabled
             }
           }`,
        {
          input: {
            leagueId: state.leagueId,
            totalMatchups: 1,
            gamesPerMatchup: 1,
            playoffEnabled: false,
          },
        },
      );
      expect(data.updateLeagueSettings.totalMatchups).toBe(1);
      expect(data.updateLeagueSettings.gamesPerMatchup).toBe(1);
      expect(data.updateLeagueSettings.playoffEnabled).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // PHASE 2 — MANAGERS JOIN (UI: token swap)
  // -----------------------------------------------------------------------

  test('Phase 2: Three managers join the league', async ({
    commissionerPage: page,
    commissionerJwt,
    managerJwt1,
    managerJwt2,
    managerJwt3,
  }) => {
    test.setTimeout(60_000);

    const joinUrl = `/baseball/league/join/${state.inviteCode}`;
    const managers = [
      { jwt: managerJwt1, teamName: 'The Sluggers' },
      { jwt: managerJwt2, teamName: 'The Aces' },
      { jwt: managerJwt3, teamName: 'The Rockets' },
    ];

    for (const { jwt, teamName } of managers) {
      await test.step(`Manager joins as "${teamName}"`, async () => {
        await switchUser(page, jwt, joinUrl);
        await page.waitForLoadState('load');

        await waitForJoinPageValidation(page);

        const teamNameInput = page.getByTestId('team-name');
        await expect(teamNameInput).toBeVisible({ timeout: 5_000 });
        await teamNameInput.fill(teamName);
        const joinBtn = page.getByRole('button', { name: /Join League/i });
        await expect(joinBtn).toBeEnabled({ timeout: 5_000 });
        await joinBtn.click();

        await expect(page).toHaveURL(/\/baseball\/league\/\d+/, {
          timeout: 15_000,
        });
      });
    }

    // Restore commissioner identity.
    await switchUser(
      page,
      commissionerJwt,
      `/baseball/league/${state.leagueId}/commissioner`,
    );
    await page.waitForLoadState('load');
  });

  // -----------------------------------------------------------------------
  // PHASE 3 — AUTOMATED DRAFT → SEASON ACTIVE (UI)
  // -----------------------------------------------------------------------

  test('Phase 3: Automated draft runs to completion', async ({
    commissionerPage: page,
  }) => {
    // Automated random drafts complete in seconds (single Lambda batch).
    // This phase also triggers createAllMatchupsForLeague, which now creates
    // exactly 1 week because we set totalMatchups = 1 in Phase 1.
    test.setTimeout(180_000);

    await test.step('Navigate to commissioner panel', async () => {
      await page.goto(`/baseball/league/${state.leagueId}/commissioner`);
      await page.waitForLoadState('load');
      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
        { timeout: 30_000 },
      );
    });

    await test.step('Switch draft mode to Automated', async () => {
      const draftSettingsBtn = page.getByRole('button', {
        name: /Draft Settings/i,
      });
      await expect(draftSettingsBtn).toBeVisible({ timeout: 10_000 });
      await draftSettingsBtn.click();

      const automatedBtn = page.getByRole('button', {
        name: /Automated Draft/i,
      });
      await expect(automatedBtn).toBeVisible({ timeout: 5_000 });
      await automatedBtn.click();

      const saveBtn = page.getByRole('button', {
        name: /Save Draft Settings/i,
      });
      await expect(saveBtn).toBeEnabled({ timeout: 5_000 });
      await saveBtn.click();
      await page.waitForTimeout(1_000);
    });

    await test.step('Start the draft', async () => {
      const startBtn = page.getByRole('button', { name: /Start Draft/i });
      await expect(startBtn).toBeVisible({ timeout: 15_000 });
      await startBtn.click();

      const confirmBtn = page.getByRole('button', {
        name: /Start Draft|Confirm/i,
      });
      await expect(confirmBtn.last()).toBeVisible({ timeout: 5_000 });
      await confirmBtn.last().click();
    });

    await test.step('Wait for Season Active badge', async () => {
      const deadline = Date.now() + 90_000;
      while (Date.now() < deadline) {
        const isActive = await page
          .getByText('Season Active')
          .isVisible()
          .catch(() => false);
        if (isActive) break;
        await page.waitForTimeout(5_000);
        await page.reload();
        await page.waitForLoadState('load');
      }
      await expect(page.getByText('Season Active')).toBeVisible({
        timeout: 15_000,
      });
    });
  });

  // -----------------------------------------------------------------------
  // PHASE 4 — FAST-COMPLETE SINGLE-WEEK SEASON (API)
  // -----------------------------------------------------------------------

  test('Phase 4: Complete the 1-week season via API', async ({
    commissionerJwt,
  }) => {
    test.setTimeout(60_000);

    await test.step('Auto-select games for week 1', async () => {
      await gqlFetch<{
        autoSelectGames: { gamesTriggered: number } | null;
      }>(
        commissionerJwt,
        `mutation AutoSelect($leagueId: Int) {
             autoSelectGames(leagueId: $leagueId) { gamesTriggered }
           }`,
        { leagueId: state.leagueId },
      );
    });

    await test.step('Auto-advance and poll until season is complete', async () => {
      // autoSelectGames sends an SQS message and returns immediately.
      // The Lambda processing game selection may not finish before we call
      // autoAdvanceMatchups, so we call autoAdvanceMatchups inside the poll
      // loop — it is idempotent and will succeed once games are selected.
      await expect
        .poll(
          async () => {
            // Try to advance (idempotent — safe to call repeatedly)
            await gqlFetch<{
              autoAdvanceMatchups: { leaguesAdvanced: number } | null;
            }>(
              commissionerJwt,
              `mutation AutoAdvance($leagueId: Int) {
                   autoAdvanceMatchups(leagueId: $leagueId) { leaguesAdvanced }
                 }`,
              { leagueId: state.leagueId },
            );

            // Check completion
            const result = await gqlFetch<{
              league: {
                draftStatus: string;
                frozenAt: string | null;
                currentMatchup: number | null;
                totalMatchups: number | null;
              };
            }>(
              commissionerJwt,
              `query CheckComplete($id: Int!) {
                   league(id: $id) {
                     draftStatus
                     frozenAt
                     currentMatchup
                     totalMatchups
                   }
                 }`,
              { id: state.leagueId },
            );
            const lg = result.league;
            // Season complete when draft is done and no active current matchup.
            // frozenAt may still be set while processing completes; don't check it.
            return lg.draftStatus === 'completed' && lg.currentMatchup == null;
          },
          {
            timeout: 60_000,
            intervals: [3_000, 5_000],
            message: 'Season did not reach completion state',
          },
        )
        .toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // PHASE 5 — SEASON COMPLETE UI VERIFICATION (Commissioner panel)
  // -----------------------------------------------------------------------

  test('Phase 5: Commissioner panel shows Season Complete and Start New Season', async ({
    commissionerPage: page,
  }) => {
    test.setTimeout(60_000);

    await test.step('Navigate to commissioner panel and reload to pick up latest state', async () => {
      await page.goto(`/baseball/league/${state.leagueId}/commissioner`);
      await page.waitForLoadState('load');
      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
        { timeout: 30_000 },
      );
    });

    await test.step('Verify "Season Complete" copy is visible', async () => {
      // The NextStepControl renders a "Season Complete" text when
      // isSeasonComplete is true (all weeks played, no active matchup).
      await expect(
        page.getByText('Season Complete', { exact: false }).first(),
      ).toBeVisible({ timeout: 30_000 });
    });

    await test.step('Verify "Start New Season" button is rendered', async () => {
      await expect(
        page.getByRole('button', { name: /Start New Season/i }),
      ).toBeVisible({ timeout: 10_000 });
    });

    await test.step('Verify season-complete description copy', async () => {
      await expect(
        page.getByText(/All weeks have been played/i).first(),
      ).toBeVisible({ timeout: 5_000 });
    });
  });

  // -----------------------------------------------------------------------
  // PHASE 6 — RENEWAL DIALOG INTERACTION (dry run — cancel)
  // -----------------------------------------------------------------------

  test('Phase 6: Renewal dialog opens with roster options', async ({
    commissionerPage: page,
  }) => {
    test.setTimeout(30_000);

    await test.step('Navigate to commissioner panel', async () => {
      await page.goto(`/baseball/league/${state.leagueId}/commissioner`);
      await page.waitForLoadState('load');
      await expect(
        page.getByRole('button', { name: /Start New Season/i }),
      ).toBeVisible({ timeout: 30_000 });
    });

    await test.step('Open the renewal dialog', async () => {
      await page.getByRole('button', { name: /Start New Season/i }).click();

      // Dialog title should include the league name
      await expect(page.getByText(/Start New Season for/i).first()).toBeVisible(
        { timeout: 10_000 },
      );
    });

    await test.step('Verify dialog description copy', async () => {
      await expect(
        page
          .getByText(
            /A new league will be created with all settings and members/i,
          )
          .first(),
      ).toBeVisible({ timeout: 5_000 });
      await expect(
        page.getByText(/frozen and kept as a historical record/i).first(),
      ).toBeVisible();
    });

    await test.step('Verify "Hold a new draft" option is selected by default', async () => {
      // The default selection is 'draft' — empty rosters, new draft needed.
      await expect(
        page
          .getByText(
            /All team rosters will be cleared.*commissioner can configure/i,
          )
          .first(),
      ).toBeVisible({ timeout: 5_000 });
    });

    await test.step('Switch to "Keep same rosters" and verify copy updates', async () => {
      const keepLabel = page.getByText(/Keep same rosters/i).first();
      await expect(keepLabel).toBeVisible({ timeout: 5_000 });
      await keepLabel.click();

      // Hint text should reflect the "keep" selection
      await expect(
        page
          .getByText(/All current player assignments will be copied/i)
          .first(),
      ).toBeVisible({ timeout: 5_000 });
    });

    await test.step('Switch back to "Hold a new draft" and verify copy resets', async () => {
      const draftLabel = page.getByText(/Hold a new draft/i).first();
      await expect(draftLabel).toBeVisible();
      await draftLabel.click();

      await expect(
        page.getByText(/All team rosters will be cleared/i).first(),
      ).toBeVisible({ timeout: 5_000 });
    });

    await test.step('Cancel dialog without confirming', async () => {
      // Scope to the dialog: getByRole on the page can pick up Tamagui's
      // adapted-sheet close button or other Cancel controls outside the dialog.
      const dialog = page.getByRole('alertdialog');
      const cancelBtn = dialog.getByRole('button', { name: /Cancel/i }).first();
      await expect(cancelBtn).toBeVisible({ timeout: 5_000 });
      await cancelBtn.click();

      // Dialog should close
      await expect(page.getByText(/Start New Season for/i)).not.toBeVisible({
        timeout: 5_000,
      });
    });
  });

  // -----------------------------------------------------------------------
  // PHASE 7 — CONFIRM RENEWAL (Hold new draft)
  // -----------------------------------------------------------------------

  test('Phase 7: Confirm season renewal and navigate to new league', async ({
    commissionerPage: page,
  }) => {
    test.setTimeout(60_000);

    await test.step('Navigate to commissioner panel', async () => {
      await page.goto(`/baseball/league/${state.leagueId}/commissioner`);
      await page.waitForLoadState('load');
      await expect(
        page.getByRole('button', { name: /Start New Season/i }),
      ).toBeVisible({ timeout: 30_000 });
    });

    await test.step('Open renewal dialog', async () => {
      await page.getByRole('button', { name: /Start New Season/i }).click();
      await expect(page.getByText(/Start New Season for/i).first()).toBeVisible(
        { timeout: 10_000 },
      );
    });

    await test.step('Confirm with "Hold a new draft" selected', async () => {
      // Ensure "Hold a new draft" is selected (default)
      const draftLabel = page.getByText(/Hold a new draft/i).first();
      await expect(draftLabel).toBeVisible({ timeout: 5_000 });
      await draftLabel.click();

      const confirmBtn = page.getByRole('button', {
        name: /Confirm New Season/i,
      });
      await expect(confirmBtn).toBeVisible({ timeout: 5_000 });
      await confirmBtn.click();
    });

    await test.step('Verify navigation to new league URL', async () => {
      // After renewal, the commissioner is navigated to the new league page.
      await expect(page).toHaveURL(/\/baseball\/league\/\d+/, {
        timeout: 30_000,
      });

      // The new league ID must differ from the original (old) league.
      const match = page.url().match(/\/baseball\/league\/(\d+)/);
      expect(match).toBeTruthy();
      if (match) state.newLeagueId = Number(match[1]);
      expect(state.newLeagueId).toBeGreaterThan(0);
      expect(state.newLeagueId).not.toBe(state.leagueId);
    });
  });

  // -----------------------------------------------------------------------
  // PHASE 8 — NEW LEAGUE VERIFICATION (UI + API)
  // -----------------------------------------------------------------------

  test('Phase 8: New league shows Season 2 state and migrated members', async ({
    commissionerPage: page,
    commissionerJwt,
  }) => {
    test.setTimeout(30_000);

    await test.step('New league page loads without errors', async () => {
      await page.goto(`/baseball/league/${state.newLeagueId}/overview`);
      await page.waitForLoadState('load');
      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
        { timeout: 15_000 },
      );
    });

    await test.step('New league shows "Pre-Draft" status badge', async () => {
      // keepRosters=false → draftStatus = 'not-started' → "Pre-Draft" badge
      await expect(page.getByText('Pre-Draft').first()).toBeVisible({
        timeout: 15_000,
      });
    });

    await test.step('Via API: verify season lineage and state', async () => {
      const result = await gqlFetch<{
        league: {
          id: number;
          seasonNumber: number | null;
          previousLeagueId: number | null;
          draftStatus: string;
          frozenAt: string | null;
        };
      }>(
        commissionerJwt,
        `query VerifyNewLeague($id: Int!) {
             league(id: $id) {
               id
               seasonNumber
               previousLeagueId
               draftStatus
               frozenAt
             }
           }`,
        { id: state.newLeagueId },
      );
      const lg = result.league;
      expect(lg.seasonNumber).toBeGreaterThanOrEqual(2);
      expect(lg.previousLeagueId).toBe(state.leagueId);
      expect(lg.draftStatus).toBe('not-started');
      expect(lg.frozenAt).toBeNull();
    });

    await test.step('Via API: verify all 4 members were migrated', async () => {
      const result = await gqlFetch<{
        getLeagueMembers: Array<{ userId: number; permissionLevel: string }>;
      }>(
        commissionerJwt,
        `query Members($leagueId: Int!) {
             getLeagueMembers(leagueId: $leagueId) {
               userId
               permissionLevel
             }
           }`,
        { leagueId: state.newLeagueId },
      );
      // 4-team league: commissioner + 3 managers = 4 members
      expect(result.getLeagueMembers.length).toBe(4);
      const commissioner = result.getLeagueMembers.find(
        (m) => m.permissionLevel === 'commissioner',
      );
      expect(commissioner).toBeTruthy();
    });

    await test.step('Via API: verify team names were preserved', async () => {
      const result = await gqlFetch<{
        getLeagueTeams: Array<{ id: number; name: string }>;
      }>(
        commissionerJwt,
        `query Teams($leagueId: Int!) {
             getLeagueTeams(leagueId: $leagueId) {
               id name
             }
           }`,
        { leagueId: state.newLeagueId },
      );
      expect(result.getLeagueTeams.length).toBe(4);
      // Teams from the old league should be represented — at least one
      // manager's team name was carried forward.
      const teamNames = result.getLeagueTeams.map((t) => t.name);
      const hasKnownTeam = teamNames.some((n) =>
        ['The Sluggers', 'The Aces', 'The Rockets'].includes(n),
      );
      expect(hasKnownTeam).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // PHASE 9 — OLD LEAGUE FROZEN STATE VERIFICATION
  // -----------------------------------------------------------------------

  test('Phase 9: Old league shows as frozen — no renewal option', async ({
    commissionerPage: page,
    commissionerJwt,
  }) => {
    test.setTimeout(30_000);

    await test.step('Via API: verify old league is frozen', async () => {
      const result = await gqlFetch<{
        league: {
          id: number;
          frozenAt: string | null;
          draftStatus: string;
        };
      }>(
        commissionerJwt,
        `query VerifyOldLeague($id: Int!) {
             league(id: $id) {
               id
               frozenAt
               draftStatus
             }
           }`,
        { id: state.leagueId },
      );
      const lg = result.league;
      // The old league must have a frozenAt timestamp set.
      expect(lg.frozenAt).not.toBeNull();
      // Draft was completed (season ran to completion).
      expect(lg.draftStatus).toBe('completed');
    });

    await test.step('Old league commissioner panel loads without errors', async () => {
      await page.goto(`/baseball/league/${state.leagueId}/commissioner`);
      await page.waitForLoadState('load');
      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
        { timeout: 15_000 },
      );
    });

    await test.step('"Start New Season" button is absent on frozen league', async () => {
      // When frozenAt is set, isSeasonComplete = false, so the renewal
      // button is never rendered in the NextStepControl.
      await expect(
        page.getByRole('button', { name: /Start New Season/i }),
      ).not.toBeVisible({ timeout: 5_000 });
    });

    await test.step('Old league overview still loads historical data', async () => {
      await page.goto(`/baseball/league/${state.leagueId}/overview`);
      await page.waitForLoadState('load');
      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
        { timeout: 15_000 },
      );
      // The overview page should still be accessible (league data preserved).
      await expect(page.locator('body')).toBeVisible();
    });
  });

  // -----------------------------------------------------------------------
  // PHASE 10 — MANAGER MIGRATION: access new league
  // -----------------------------------------------------------------------

  test('Phase 10: Manager membership was migrated to new league', async ({
    managerPage1: page,
  }) => {
    test.setTimeout(30_000);

    await test.step('Manager 1 navigates to new league', async () => {
      // Use a dedicated manager browser context rather than switchUser on
      // commissionerPage. switchUser has a race condition (LS-3672, LS-3705):
      // background JWT refresh can dispatch AUTH_LOGOUT and clear localStorage
      // after page.evaluate() sets the manager profile.
      await page.goto(`/baseball/league/${state.newLeagueId}/overview`);
      await page.waitForLoadState('load');
    });

    await test.step('Manager can access new league without errors', async () => {
      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
        { timeout: 15_000 },
      );
      // Manager's team "The Sluggers" should appear somewhere on the overview.
      await expect(
        page.getByText('The Sluggers', { exact: false }).first(),
      ).toBeVisible({ timeout: 15_000 });
    });

    await test.step('New league shows "Pre-Draft" status to manager', async () => {
      await expect(page.getByText('Pre-Draft').first()).toBeVisible({
        timeout: 10_000,
      });
    });
  });
});
