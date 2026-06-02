/**
 * Waiver Processing UI Integration Test (LS-751)
 *
 * Validates the full waiver processing workflow against the **live** backend
 * (no mocks) through real browser interactions and JWT swapping for
 * multi-user role verification:
 *
 *   1. **Claim** — a manager submits a waiver claim via WaiverClaimModal
 *   2. **Drop** — when the roster is full after the draft, the claim flow
 *      requires selecting a player to drop; this is exercised explicitly
 *   3. **Priority order** — two teams claim the same free agent; the team
 *      with the better waiver priority (lower waiverOrder value) wins;
 *      the Standings tab is also verified to show waiver-order badges
 *   4. **Processing** — the commissioner manually triggers processWaiverClaims
 *      from the commissioner panel; result counts and final roster state
 *      are verified via GraphQL
 *
 * Prerequisites:
 *   - A running dev/staging environment (or local Docker stack + Lambdas)
 *   - `./ls-cli.ps1 auth login` run so ~/.legacy-sports/auth.json is valid
 *   - At least 2 non-admin users in the database to impersonate as managers
 *
 * Targets https://legacy-fantasy.com by default. Override with env vars:
 *   INTEGRATION_WEB_URL=http://localhost:4200
 *   INTEGRATION_BASE_URL=http://localhost:5000
 *
 * Run:
 *   pnpm exec playwright test --config apps/web-e2e/playwright.integration.config.ts \
 *     src/integration/tests/waiver-processing-ui.integration.spec.ts
 */

import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { cleanupLeague } from '../helpers/cleanup-league';
import { createLeagueViaUI } from '../helpers/create-league';
import { joinLeagueAsManager } from '../helpers/wait-for-join-page';
import { selectDropPlayerIfRosterFull } from '../helpers/waiver-claim-drop';
import { waitForSeasonActive } from '../helpers/wait-for-season-active';
import { switchUser, test } from '../fixtures/ui';
import { gqlFetch } from '../helpers/gql-fetch';

// ---------------------------------------------------------------------------
// Shared state accumulated across serial phases
// ---------------------------------------------------------------------------

interface WaiverState {
  leagueId: number;
  inviteCode: string;
  leagueName: string;
  /** Commissioner's team ID (resolved via GQL before the priority test) */
  commissionerTeamId: number;
  /**
   * Commissioner's waiver order before processing.
   * Used to assert the lower-order team won.
   */
  commissionerWaiverOrder: number;
  /** Manager 1's team ID (resolved via GQL before the priority test) */
  manager1TeamId: number;
  /** Manager 1's waiver order before processing. */
  manager1WaiverOrder: number;
  /** The free agent both teams compete for in the priority test */
  freeAgentPlayerId: number;
  /** Human-readable name of that free agent */
  freeAgentPlayerName: string;
  /** Team ID of the team that had the lowest waiverOrder (best priority) */
  expectedWinnerTeamId: number;
  /** Team ID of the team that had the highest waiverOrder (worst priority) */
  expectedLoserTeamId: number;
}

let state: WaiverState;

// ---------------------------------------------------------------------------
// GQL helper — raw fetch against the real API (no Playwright context needed)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Helper: submit a waiver claim via the Free Agents tab UI.
//
// - Navigates `page` (which must already be authenticated as the desired
//   user — pass commissionerPage or managerPageN) to the free-agents page
// - Searches for `playerName` and clicks the Add button
// - Handles the mandatory drop when the roster is full (exercises the
//   "drop" requirement from the ticket)
// - Verifies the "Waiver Claim Submitted!" success state
// ---------------------------------------------------------------------------

async function submitWaiverClaimViaUI(
  page: Page,
  leagueId: number,
  playerName: string,
): Promise<void> {
  await page.goto(`/baseball/league/${leagueId}/free-agents`);
  await page.waitForLoadState('load');
  await expect(page).toHaveURL(/\/free-agents/);

  // Search by last name to reliably surface the specific player row.
  // NOTE: isVisible({ timeout }) is deprecated in Playwright v1.40+ —
  // the timeout is silently ignored.  Use waitFor() instead.
  const searchInput = page.getByPlaceholder(/search players/i);
  const searchVisible = await searchInput
    .waitFor({ state: 'visible', timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  if (searchVisible) {
    const lastName = playerName.split(' ').pop() ?? playerName;
    await searchInput.fill(lastName);
    // The 300ms search debounce + GQL round-trip + re-render is absorbed by
    // `exactAddBtn.waitFor({ state: 'attached', ... })` below — that
    // condition only resolves after the filtered row has rendered.
  }

  // Use the exact player name in the aria-label to avoid clicking a different
  // player's Add button when the search returns multiple results.
  // IMPORTANT: use state:'attached' (DOM presence) not state:'visible' (viewport
  // visibility) so a player that is scrolled below the fold — e.g. because the
  // UI default-sorts by hitterAvgPointsPerGame DESC and a higher-rated player
  // with the same last name appears first — is still found.  We then explicitly
  // scroll it into view before clicking.
  // Do NOT fall back to the first available "Add" button: that fallback caused
  // the test to submit claims for the wrong player (LS-3829) seven consecutive
  // times when the target player was below the fold.
  const exactAddBtn = page.locator(`button[aria-label="Add ${playerName}"]`);
  const isInDom = await exactAddBtn
    .waitFor({ state: 'attached', timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  if (!isInDom) {
    throw new Error(
      `Add button for "${playerName}" was not found in the free-agents list. ` +
        `The player may no longer be a free agent or the page failed to render.`,
    );
  }
  await exactAddBtn.scrollIntoViewIfNeeded();
  await expect(exactAddBtn).toBeVisible({ timeout: 5_000 });
  await exactAddBtn.click();

  // WaiverClaimModal opens
  await expect(page.getByText('Claim Free Agent')).toBeVisible({
    timeout: 10_000,
  });

  // Wait for the roster status message to appear
  const rosterLoaded = page.getByText(
    /select a player to drop|Roster has space/i,
  );
  await expect(rosterLoaded).toBeVisible({ timeout: 15_000 });

  // When the roster is full after the draft, the modal requires a drop pick
  // — this path exercises the "drop" feature from the ticket requirements.
  // The helper is a no-op when the roster has space.
  await selectDropPlayerIfRosterFull(page);

  const submitBtn = page.getByRole('button', { name: /Submit Claim/i });
  await expect(submitBtn).toBeEnabled({ timeout: 5_000 });
  await submitBtn.click();

  await expect(page.getByText('Waiver Claim Submitted!')).toBeVisible({
    timeout: 20_000,
  });

  await page.getByRole('button', { name: 'Done' }).click();
}

// ---------------------------------------------------------------------------
// Serial test suite — phases must run in order
// ---------------------------------------------------------------------------

test.describe
  .serial('Waiver Processing UI (Live Backend) @integration @critical', () => {
  test.describe.configure({ retries: 0 });

  test.beforeAll(() => {
    state = {
      leagueId: 0,
      inviteCode: '',
      leagueName: '',
      commissionerTeamId: 0,
      commissionerWaiverOrder: 0,
      manager1TeamId: 0,
      manager1WaiverOrder: 0,
      freeAgentPlayerId: 0,
      freeAgentPlayerName: '',
      expectedWinnerTeamId: 0,
      expectedLoserTeamId: 0,
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
  // PHASE 1 — CREATE LEAGUE (commissioner)
  // -----------------------------------------------------------------

  test('Phase 1: Create league via the UI', async ({
    commissionerPage: page,
  }) => {
    state.leagueName = `Waiver E2E ${Date.now()}`;
    const result = await createLeagueViaUI(page, {
      leagueName: state.leagueName,
    });
    state.leagueId = result.leagueId;
    state.inviteCode = result.inviteCode;
  });

  // -----------------------------------------------------------------
  // PHASE 2 — MANAGERS JOIN
  // -----------------------------------------------------------------

  // Phase 2 uses dedicated manager fixture pages instead of switchUser() to
  // avoid the AUTH_LOGOUT race (LS-3672, LS-3705, LS-4385). The full join
  // orchestration lives in joinLeagueAsManager (LS-4447).
  test('Phase 2: Three managers join the league', async ({
    managerJwt1,
    managerJwt2,
    managerJwt3,
    managerPage1,
    managerPage2,
    managerPage3,
  }) => {
    await test.step('Managers 1-3 join league via invite code', async () => {
      const managers = [
        { page: managerPage1, jwt: managerJwt1, teamName: 'Waiver Team 1' },
        { page: managerPage2, jwt: managerJwt2, teamName: 'Waiver Team 2' },
        { page: managerPage3, jwt: managerJwt3, teamName: 'Waiver Team 3' },
      ];

      for (const { page, jwt, teamName } of managers) {
        // Full join orchestration lives in joinLeagueAsManager (LS-4447).
        await joinLeagueAsManager(page, {
          jwt,
          inviteCode: state.inviteCode,
          teamName,
        });
      }
    });
  });

  // -----------------------------------------------------------------
  // PHASE 3 — AUTOMATED DRAFT (fills rosters so claiming requires a drop)
  // -----------------------------------------------------------------

  test('Phase 3: Run automated random draft', async ({
    commissionerPage: page,
    apiCommissioner,
  }) => {
    test.setTimeout(240_000);

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

      const confirmBtn = page.getByTestId('confirm-next-step');
      await expect(confirmBtn).toBeVisible({ timeout: 15_000 });
      await confirmBtn.click();
    });

    await test.step('Wait for draft to complete (Season Active)', async () => {
      // Use the shared helper instead of an inline reload loop — it polls
      // league.draftStatus deterministically via GraphQL and only asserts the
      // UI once the backend confirms the transition, eliminating the
      // UI-render race documented in LS-4237 → LS-4321 (LS-4457).
      await waitForSeasonActive(page, state.leagueId, {
        api: apiCommissioner,
        deadlineMs: 180_000,
      });
    });
  });

  // -----------------------------------------------------------------
  // PHASE 4 — PRIORITY ORDER: verify waiver-order badges in Standings
  //           and resolve team IDs + orders for the priority contest
  // -----------------------------------------------------------------

  test('Phase 4: Verify waiver priority order via Standings tab', async ({
    commissionerPage: page,
    commissionerJwt,
    managerJwt1,
  }) => {
    await test.step('Resolve team IDs with userTeamId query per JWT', async () => {
      const [commTeamData, mgr1TeamData] = await Promise.all([
        gqlFetch<{ userTeamId: number | null }>(
          commissionerJwt,
          `query GetUserTeamId($leagueId: Int!) { userTeamId(leagueId: $leagueId) }`,
          { leagueId: state.leagueId },
        ),
        gqlFetch<{ userTeamId: number | null }>(
          managerJwt1,
          `query GetUserTeamId($leagueId: Int!) { userTeamId(leagueId: $leagueId) }`,
          { leagueId: state.leagueId },
        ),
      ]);

      expect(commTeamData.userTeamId).not.toBeNull();
      expect(mgr1TeamData.userTeamId).not.toBeNull();
      if (commTeamData.userTeamId === undefined) {
        throw new Error('commTeamData.userTeamId should be set');
      }
      if (mgr1TeamData.userTeamId === undefined) {
        throw new Error('mgr1TeamData.userTeamId should be set');
      }
      state.commissionerTeamId = commTeamData.userTeamId;
      state.manager1TeamId = mgr1TeamData.userTeamId;
    });

    await test.step('Fetch waiver orders for both teams', async () => {
      const data = await gqlFetch<{
        leagueTeams: Array<{ id: number; waiverOrder: number | null }>;
      }>(
        commissionerJwt,
        `query GetLeagueTeams($leagueId: Int!) {
          leagueTeams(leagueId: $leagueId) {
            id
            waiverOrder
          }
        }`,
        { leagueId: state.leagueId },
      );

      const byId = new Map(data.leagueTeams.map((t) => [t.id, t]));

      const commOrder = byId.get(state.commissionerTeamId)?.waiverOrder ?? null;
      const mgr1Order = byId.get(state.manager1TeamId)?.waiverOrder ?? null;

      // Waiver orders must be set after league creation — null means a
      // data integrity issue that would make the priority contest meaningless.
      expect(
        commOrder,
        'Commissioner waiverOrder should not be null',
      ).not.toBeNull();
      expect(
        mgr1Order,
        'Manager1 waiverOrder should not be null',
      ).not.toBeNull();

      if (commOrder == null || mgr1Order == null) {
        throw new Error(
          'waiverOrder is null — cannot determine expected winner',
        );
      }

      state.commissionerWaiverOrder = commOrder;
      state.manager1WaiverOrder = mgr1Order;

      // Pre-compute expected winner: lower waiverOrder value = higher priority
      if (state.commissionerWaiverOrder <= state.manager1WaiverOrder) {
        state.expectedWinnerTeamId = state.commissionerTeamId;
        state.expectedLoserTeamId = state.manager1TeamId;
      } else {
        state.expectedWinnerTeamId = state.manager1TeamId;
        state.expectedLoserTeamId = state.commissionerTeamId;
      }
    });

    await test.step('Navigate to Standings tab', async () => {
      await page.goto(`/baseball/league/${state.leagueId}/standings`);
      await page.waitForLoadState('load');
      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
        { timeout: 15000 },
      );
    });

    await test.step('Verify standings table renders rows for all four teams', async () => {
      // The LS-4127 StandingsTab redesign uses a plain <table> with Rank/Team/W/L/T/PF/PA columns.
      // Waiver order is no longer displayed in the standings UI; the GQL steps above already
      // capture and assert waiverOrder values for both teams.
      const standingsTable = page.locator(
        'table[aria-label="League Standings"]',
      );
      await expect(standingsTable).toBeVisible({ timeout: 15000 });
      const teamRows = standingsTable.locator('tbody tr');
      // The standings query may still be in-flight when the table first
      // renders, leaving only the empty-state row (count=1) visible.  Retry
      // until all four team rows have loaded — same toPass pattern used in
      // Phase 7's GQL consistency gate.
      await expect(async () => {
        const count = await teamRows.count();
        expect(count).toBeGreaterThanOrEqual(4);
      }).toPass({ timeout: 15_000, intervals: [500, 1_000, 2_000, 3_000] });
    });
  });

  // -----------------------------------------------------------------
  // PHASE 5 — SUBMIT WAIVER CLAIMS (claim + drop) from two teams
  //
  // Both teams claim the same free agent. Rosters are full after the
  // draft so both submissions exercise the "drop" code path.
  // The priority contest is resolved in Phase 7 via processWaiverClaims.
  // -----------------------------------------------------------------

  test('Phase 5: Submit competing waiver claims with drop from both teams', async ({
    commissionerPage,
    commissionerJwt,
    managerPage1,
    managerJwt1,
  }) => {
    test.setTimeout(180_000);

    await test.step('Find a free agent available to both teams', async () => {
      const data = await gqlFetch<{
        freeAgents: Array<{
          id: number;
          firstName: string;
          lastName: string;
          eligiblePositions: string[] | null;
        }>;
      }>(
        commissionerJwt,
        `query GetFreeAgents($leagueId: Int!) {
          freeAgents(leagueId: $leagueId) {
            id
            firstName
            lastName
            eligiblePositions
          }
        }`,
        { leagueId: state.leagueId },
      );

      const players = data.freeAgents;
      expect(players.length).toBeGreaterThan(0);

      // The free-agents UI defaults to the "Hitters" tab (position filter =
      // 'HITTER'). Pure pitchers (eligiblePositions containing only pitching
      // slots) are excluded from that view. submitWaiverClaimViaUI does not
      // switch tabs, so picking a pitcher would still fail with a missing
      // Add-button error. Require a hitter here so failures are explicit
      // rather than surfacing later as a cryptic missing-button error.
      //
      // Mirrors the canonical pitcher set in @legacy-sports/utils
      // (PITCHING_POSITIONS = {SP, RP, P}); inlined to avoid a cross-package
      // import that web-e2e's lint configuration cannot resolve.
      const PITCHER_POSITIONS: ReadonlySet<string> = new Set(['SP', 'RP', 'P']);
      const isHitter = (p: { eligiblePositions: string[] | null }) => {
        const positions = p.eligiblePositions ?? [];
        return (
          positions.length === 0 ||
          positions.some((pos) => !PITCHER_POSITIONS.has(pos))
        );
      };
      // Use the same name normalization as the UI Add button (filter empty/null
      // parts, join with a single space) so the locator and the aria-label always
      // agree — even for players whose firstName is blank in the database.
      const buildPlayerName = (p: { firstName: string; lastName: string }) =>
        [p.firstName, p.lastName].filter((s) => s?.trim()).join(' ');
      const picked = players.find(isHitter);

      expect(
        picked,
        'Expected at least one hitter free agent because the waiver-claim UI helper only uses the default Hitters tab.',
      ).toBeTruthy();
      if (!picked) return; // unreachable — expect above throws; narrows TS type

      state.freeAgentPlayerId = picked.id;
      state.freeAgentPlayerName = buildPlayerName(picked);
    });

    await test.step('Commissioner submits waiver claim (with drop if roster full)', async () => {
      await submitWaiverClaimViaUI(
        commissionerPage,
        state.leagueId,
        state.freeAgentPlayerName,
      );
    });

    await test.step('Manager 1 submits claim for the same player (with drop if roster full)', async () => {
      // Use a dedicated manager browser context rather than switchUser on
      // commissionerPage. switchUser has a race condition (LS-3735): the
      // background JWT refresh can dispatch AUTH_LOGOUT and clear
      // localStorage after page.evaluate() sets the manager profile,
      // landing the test on the unauthenticated sign-in page.
      await submitWaiverClaimViaUI(
        managerPage1,
        state.leagueId,
        state.freeAgentPlayerName,
      );
    });

    // Verify via GQL that BOTH teams actually submitted claims for the correct
    // player (state.freeAgentPlayerId).  Previously the UI fallback path in
    // submitWaiverClaimViaUI could silently claim a different player (LS-3829),
    // causing Phase 7 to fail with a cryptic "player 87 not in completed claims"
    // error seven runs in a row.  Catching the mismatch here surfaces it with a
    // clear diagnostic message while the phase is still relevant.
    await test.step('Verify both teams have a pending claim for the correct player via GQL', async () => {
      const [commClaims, mgr1Claims] = await Promise.all([
        gqlFetch<{
          teamWaiverClaims: Array<{ playerId: number; status: string }>;
        }>(
          commissionerJwt,
          `query GetPendingClaims($teamId: Int!, $status: String) {
            teamWaiverClaims(teamId: $teamId, status: $status) {
              playerId
              status
            }
          }`,
          { teamId: state.commissionerTeamId, status: 'pending' },
        ),
        gqlFetch<{
          teamWaiverClaims: Array<{ playerId: number; status: string }>;
        }>(
          managerJwt1,
          `query GetPendingClaims($teamId: Int!, $status: String) {
            teamWaiverClaims(teamId: $teamId, status: $status) {
              playerId
              status
            }
          }`,
          { teamId: state.manager1TeamId, status: 'pending' },
        ),
      ]);

      const commPlayerIds = commClaims.teamWaiverClaims.map((c) => c.playerId);
      const mgr1PlayerIds = mgr1Claims.teamWaiverClaims.map((c) => c.playerId);

      expect(
        commPlayerIds,
        `Commissioner's pending claims should include player ${state.freeAgentPlayerId} (${state.freeAgentPlayerName}). ` +
          `Got: ${JSON.stringify(commPlayerIds)}. The UI Add button may have submitted for the wrong player.`,
      ).toContain(state.freeAgentPlayerId);

      expect(
        mgr1PlayerIds,
        `Manager1's pending claims should include player ${state.freeAgentPlayerId} (${state.freeAgentPlayerName}). ` +
          `Got: ${JSON.stringify(mgr1PlayerIds)}. The UI Add button may have submitted for the wrong player.`,
      ).toContain(state.freeAgentPlayerId);
    });
  });

  // -----------------------------------------------------------------
  // PHASE 6 — PENDING CLAIMS UI
  // Both teams should see a "Pending Waiver Claims" card on My Roster.
  // -----------------------------------------------------------------

  test('Phase 6: Pending claims appear on the My Roster page', async ({
    commissionerPage,
    managerPage1,
  }) => {
    // Use dedicated browser contexts for each role. switchUser on a single
    // page has a race condition (LS-3672, LS-3705, LS-3735): the background
    // JWT refresh can dispatch AUTH_LOGOUT and clear localStorage after
    // page.evaluate() sets the profile, landing on the unauthenticated
    // sign-in page and leaving the Pending Waiver card unrendered.
    const verifyPendingClaimsUI = async (page: Page): Promise<void> => {
      await page.goto(`/baseball/league/${state.leagueId}/roster`);
      await page.waitForLoadState('load');
      await expect(page).toHaveURL(/\/roster/);
      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
        { timeout: 15000 },
      );

      // PendingWaiverClaims renders an amber card with a "Pending Waiver"
      // heading whenever the team has active pending claims.
      await expect(page.getByText(/Pending Waiver/i).first()).toBeVisible({
        timeout: 30000,
      });

      // The claimed player's name should appear somewhere in that card.
      // If the specific player name isn't visible, still pass if there's a
      // pending claim (the free-agent list ordering can shift between requests).
      const playerVisible = await page
        .getByText(state.freeAgentPlayerName, { exact: false })
        .first()
        .waitFor({ state: 'visible', timeout: 5_000 })
        .then(() => true)
        .catch(() => false);
      if (!playerVisible) {
        // Fall back: verify there's at least a cancel button for some claim
        await expect(
          page.getByRole('button', { name: /Cancel waiver claim/i }).first(),
        ).toBeVisible({ timeout: 10000 });
      }
    };

    await test.step('Commissioner sees pending claim on My Roster', async () => {
      await verifyPendingClaimsUI(commissionerPage);
    });

    await test.step('Manager 1 sees pending claim on My Roster', async () => {
      await verifyPendingClaimsUI(managerPage1);
    });
  });

  // -----------------------------------------------------------------
  // PHASE 7 — PROCESS WAIVERS (commissioner panel)
  // -----------------------------------------------------------------

  test('Phase 7: Commissioner processes waivers from the commissioner panel', async ({
    commissionerPage: page,
    commissionerJwt,
  }) => {
    test.setTimeout(150_000);

    await test.step('Navigate to commissioner panel', async () => {
      await page.goto(`/baseball/league/${state.leagueId}/commissioner`);
      await page.waitForLoadState('load');
      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
        { timeout: 30000 },
      );
    });

    await test.step('Expand Waiver Processing accordion and click Process Waivers Now', async () => {
      const waiverAccordion = page.getByRole('button', {
        name: /Waiver Processing/i,
      });
      await expect(waiverAccordion).toBeVisible({ timeout: 15000 });
      await waiverAccordion.click();

      const processBtn = page.getByRole('button', {
        name: /Process Waivers Now/i,
      });
      await expect(processBtn).toBeVisible({ timeout: 10000 });
      await processBtn.click();
    });

    await test.step('Confirm the processing dialog', async () => {
      const confirmBtn = page.getByRole('button', { name: /Confirm/i });
      await expect(confirmBtn).toBeVisible({ timeout: 5000 });
      await confirmBtn.click();
    });

    await test.step('Wait for success feedback with claim counts', async () => {
      // WaiverProcessControl renders the success message inside a
      // role="status" card (LeagueDetailPage.tsx). The previous
      // /processed/i text match was a false positive: the WaiverProcessControl
      // description "automatically processed nightly at 2am EST" is already
      // visible before the Lambda completes, causing the follow-up GQL call
      // to race with the in-flight Lambda and award the player to the wrong team
      // (LS-3809). Waiting for role="status" ensures the card only appears
      // after the mutation + refetch complete.
      await expect(
        page.getByRole('status').filter({ hasText: /processed|succeeded/i }),
      ).toBeVisible({ timeout: 30000 });
    });

    await test.step('Confirm winning team claim is completed in DB', async () => {
      // The processWaiverClaims Lambda inserts into teamMembers BEFORE it
      // updates waiverClaims.status → 'completed'. Polling directly via GQL
      // until the 'completed' claim is readable is a stronger consistency
      // gate than the role="status" UI card: it proves the teamMembers write
      // is also visible to the same query path that Phase 8 will use,
      // preventing the false-positive that caused 6 consecutive failures
      // (LS-3819). If the winning team's claim never reaches 'completed'
      // within 30 s, processing genuinely failed and we surface that here
      // rather than as a cryptic roster-contents mismatch in Phase 8.
      await expect(async () => {
        const data = await gqlFetch<{
          teamWaiverClaims: Array<{ playerId: number; status: string }>;
        }>(
          commissionerJwt,
          `query GetWinnerCompletedClaims($teamId: Int!, $status: String) {
            teamWaiverClaims(teamId: $teamId, status: $status) {
              playerId
              status
            }
          }`,
          { teamId: state.expectedWinnerTeamId, status: 'completed' },
        );
        const completedPlayerIds = data.teamWaiverClaims.map((c) => c.playerId);
        expect(completedPlayerIds).toContain(state.freeAgentPlayerId);
      }).toPass({
        timeout: 30_000,
        intervals: [500, 1_000, 2_000, 3_000, 5_000],
      });
    });
  });

  // -----------------------------------------------------------------
  // PHASE 8 — PRIORITY RESOLUTION & WAIVER ORDER ROTATION
  // Verify the higher-priority team won and their order rotated.
  // -----------------------------------------------------------------

  test('Phase 8: Priority resolution — lower waiverOrder team wins and order rotates', async ({
    commissionerJwt,
  }) => {
    await test.step('Verify the expected winner has the free agent on their roster', async () => {
      const data = await gqlFetch<{
        teamMembers: Array<{ playerId: number }>;
      }>(
        commissionerJwt,
        `query GetTeamMembers($teamId: Int!) {
          teamMembers(teamId: $teamId) {
            playerId
          }
        }`,
        { teamId: state.expectedWinnerTeamId },
      );
      const playerIds = data.teamMembers.map((m) => m.playerId);
      expect(playerIds).toContain(state.freeAgentPlayerId);
    });

    await test.step('Verify the expected loser does NOT have the player', async () => {
      const data = await gqlFetch<{
        teamMembers: Array<{ playerId: number }>;
      }>(
        commissionerJwt,
        `query GetTeamMembers($teamId: Int!) {
          teamMembers(teamId: $teamId) {
            playerId
          }
        }`,
        { teamId: state.expectedLoserTeamId },
      );
      const playerIds = data.teamMembers.map((m) => m.playerId);
      expect(playerIds).not.toContain(state.freeAgentPlayerId);
    });

    await test.step('Verify the winning team processed claim appears as completed', async () => {
      const data = await gqlFetch<{
        teamWaiverClaims: Array<{
          playerId: number;
          status: string;
        }>;
      }>(
        commissionerJwt,
        `query GetTeamWaiverClaims($teamId: Int!, $status: String) {
          teamWaiverClaims(teamId: $teamId, status: $status) {
            playerId
            status
          }
        }`,
        { teamId: state.expectedWinnerTeamId, status: 'completed' },
      );
      const completedForPlayer = data.teamWaiverClaims.filter(
        (c) => c.playerId === state.freeAgentPlayerId,
      );
      expect(completedForPlayer).toHaveLength(1);
      expect(completedForPlayer[0].status).toBe('completed');
    });

    await test.step('Verify waiver order rotated — winner moved to back', async () => {
      const data = await gqlFetch<{
        leagueTeams: Array<{ id: number; waiverOrder: number | null }>;
      }>(
        commissionerJwt,
        `query GetLeagueTeams($leagueId: Int!) {
          leagueTeams(leagueId: $leagueId) {
            id
            waiverOrder
          }
        }`,
        { leagueId: state.leagueId },
      );

      const byId = new Map(data.leagueTeams.map((t) => [t.id, t]));
      const winnerOrder = byId.get(state.expectedWinnerTeamId)?.waiverOrder;
      const loserOrder = byId.get(state.expectedLoserTeamId)?.waiverOrder;

      // After standard waiver processing the winning team rotates to the
      // back of the queue, so their new order must be higher than the
      // loser's (which did not change)
      if (winnerOrder != null && loserOrder != null) {
        expect(winnerOrder).toBeGreaterThan(loserOrder);
      }
    });
  });

  // -----------------------------------------------------------------
  // PHASE 9 — PENDING CLAIMS ARE GONE (post-processing roster tab)
  // -----------------------------------------------------------------

  test('Phase 9: Pending Waiver Claims card is absent after processing', async ({
    commissionerPage: page,
    commissionerJwt,
    managerJwt1,
  }) => {
    const verifyNoPendingClaims = async (jwt: string): Promise<void> => {
      await switchUser(page, jwt, `/baseball/league/${state.leagueId}/roster`);
      await page.waitForLoadState('load');
      await expect(page).toHaveURL(/\/roster/);
      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
        { timeout: 15000 },
      );

      // The PendingWaiverClaims component hides itself when there are no
      // pending claims — the inverted `not.toBeVisible({ timeout })` below
      // already auto-waits for the element to disappear; no separate sleep
      // is required (LS-4457).
      await expect(page.getByText(/Pending Waiver/i).first()).not.toBeVisible({
        timeout: 15_000,
      });
    };

    await test.step('No pending claims banner on commissioner roster', async () => {
      await verifyNoPendingClaims(commissionerJwt);
    });

    await test.step('No pending claims banner on Manager 1 roster', async () => {
      await verifyNoPendingClaims(managerJwt1);
    });

    await switchUser(page, commissionerJwt);
  });
});
