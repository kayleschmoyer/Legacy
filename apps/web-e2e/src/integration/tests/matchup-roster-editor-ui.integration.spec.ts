/**
 * Matchup Roster Editor — UI Integration Test (LS-596)
 *
 * True end-to-end integration test hitting the live backend.
 * No GraphQL mocking — all interactions use real API calls and a real browser.
 *
 * Covers the MatchupRosterEditor component on the MatchupDetailPage:
 *   - commissioner can see "Edit Lineup" section while matchup is Scheduled
 *   - bench a starter via the "Bench" action button
 *   - assign a bench player to an empty slot via position buttons
 *   - swap two starters by tapping each in succession
 *   - changes persist to the backend (verified via API)
 *
 * Setup flow:
 *   Phase 1: Create league (4 teams)
 *   Phase 2: Three managers join via invite code
 *   Phase 3: Automated draft and season activation
 *   Phase 4: Identify current matchup via GraphQL API
 *   Phase 5: Navigate to matchup detail page — verify roster editor visible
 *   Phase 6: Bench a starter — verify change via UI + API
 *   Phase 7: Assign bench player to position slot — verify change
 *   Phase 8: Swap two starters — verify swap
 *
 * Run:
 *   cd apps/web-e2e
 *   pnpm exec playwright test --config playwright.integration.config.ts \
 *     src/integration/tests/matchup-roster-editor-ui.integration.spec.ts
 */

import { expect, type Page } from '@playwright/test';
import { cleanupLeague } from '../helpers/cleanup-league';
import { createLeagueViaUI } from '../helpers/create-league';
import { joinLeagueAsManager } from '../helpers/wait-for-join-page';
import { reloadUntilVisible } from '../helpers/reload-until-visible';
import { test } from '../fixtures/ui';
import { gqlFetch } from '../helpers/gql-fetch';

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

interface RosterEditorState {
  leagueId: number;
  inviteCode: string;
  leagueName: string;
  matchupId: number;
  /** Commissioner's team ID — currently used to scope the Phase 5 GraphQL matchup gate. */
  commissionerTeamId: number;
  /** Player that was benched in Phase 6 */
  benchedPlayerName: string;
  /** positionId that was freed when player was benched */
  freedPositionId: number | null;
}

let state: RosterEditorState;

/**
 * Regex matching player names ("First Last") while excluding UI header text
 * like "Edit Lineup" or "Current Lineup" that also match the two-word pattern.
 *
 * Handles common MLB name formats: initials ("A.J. Burnett"), hyphens
 * ("Shin-Soo Choo"), and apostrophes ("O'Brien").
 */
const PLAYER_NAME_RE = /^(?!Edit |Current )[A-Z][-\w.']* [A-Z][-\w.']*/;

/**
 * Wait for a specific GraphQL operation by name. The bench/assign/swap flows in
 * MatchupRosterEditor fire multiple GraphQL POSTs per click (a network-only
 * pre-flight matchup-status fetch, then the mutation, then a refetch). A bare
 * url + POST predicate resolves on the FIRST POST — the pre-flight — and lets
 * the test proceed to its API verify before the mutation has actually fired
 * (LS-5052).
 */
function waitForGqlOperation(
  page: Page,
  operationName: string,
  timeoutMs = 15_000,
) {
  return page.waitForResponse(
    (resp) => {
      if (!resp.url().includes('/graphql')) return false;
      if (resp.request().method() !== 'POST') return false;
      try {
        const body = resp.request().postData();
        if (!body) return false;
        const parsed = JSON.parse(body) as { operationName?: string };
        return parsed.operationName === operationName;
      } catch {
        return false;
      }
    },
    { timeout: timeoutMs },
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Serial test suite
// ---------------------------------------------------------------------------

test.describe
  .serial('Matchup Roster Editor UI (Live Backend) @integration @critical', () => {
  test.describe.configure({ retries: 0 });

  test.beforeAll(() => {
    state = {
      leagueId: 0,
      inviteCode: '',
      leagueName: '',
      matchupId: 0,
      commissionerTeamId: 0,
      benchedPlayerName: '',
      freedPositionId: null,
    };
  });

  // Layer-2 per-test league cleanup (LS-4539). Removes orphans even when the
  // test body throws — Playwright still runs afterAll on test failure. Process
  // crashes are caught by global-teardown (Layer 3) and the next run's
  // pre-run sweep in global-setup (Layer 1).
  test.afterAll(async ({ apiCommissioner }) => {
    await cleanupLeague(apiCommissioner, state.leagueId);
  });

  // -------------------------------------------------------------------------
  // PHASE 1 — CREATE LEAGUE
  // -------------------------------------------------------------------------

  test('Phase 1: Commissioner creates a league', async ({
    commissionerPage: page,
  }) => {
    state.leagueName = `Roster Editor E2E ${Date.now()}`;
    const result = await createLeagueViaUI(page, {
      leagueName: state.leagueName,
    });
    state.leagueId = result.leagueId;
    state.inviteCode = result.inviteCode;
  });

  // -------------------------------------------------------------------------
  // PHASE 2 — MANAGERS JOIN
  // -------------------------------------------------------------------------

  // Phase 2 uses dedicated manager fixture pages instead of switchUser() to
  // avoid the AUTH_LOGOUT race (LS-3672, LS-3705, LS-4385). The full join
  // orchestration lives in joinLeagueAsManager (LS-4447).
  test('Phase 2: Managers join the league', async ({
    managerJwt1,
    managerJwt2,
    managerJwt3,
    managerPage1,
    managerPage2,
    managerPage3,
  }) => {
    const managers = [
      { page: managerPage1, jwt: managerJwt1, teamName: 'The Sluggers' },
      { page: managerPage2, jwt: managerJwt2, teamName: 'The Aces' },
      { page: managerPage3, jwt: managerJwt3, teamName: 'The Rockets' },
    ];

    await test.step('Each manager joins via invite code', async () => {
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

  // -------------------------------------------------------------------------
  // PHASE 3 — AUTOMATED RANDOM DRAFT → SEASON ACTIVE
  // -------------------------------------------------------------------------

  test('Phase 3: Automated draft and season activation', async ({
    commissionerPage: page,
    commissionerJwt,
  }) => {
    test.setTimeout(300_000);

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

      // Use data-testid rather than aria-label matching: the button's accessible
      // name is "Draft Mode: Automated Draft" (set by OptionSelector), which
      // requires partial-regex matching and is fragile. The testid is explicit.
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
      const startBtn = page.getByRole('button', { name: /Start Draft/i });
      await expect(startBtn).toBeVisible({ timeout: 15_000 });
      await startBtn.click();

      const confirmBtn = page.getByTestId('confirm-next-step');
      await expect(confirmBtn).toBeVisible({ timeout: 15_000 });
      await confirmBtn.click();
    });

    await test.step('Wait for draft to complete via API poll', async () => {
      // Poll the GraphQL API directly for draftStatus === 'completed' rather
      // than navigating the browser to the commissioner URL on every iteration.
      // Browser-based polling was unreliable because the SPA occasionally
      // renders "This league does not exist" during the automated draft's async
      // status transition — the getLeagueById query returns null transiently
      // while the backend is updating the league record.  A direct API poll
      // avoids that rendering race condition entirely.
      //
      // The poll callback returns null on errors so expect.poll retries on
      // assertion failure rather than throwing (antipattern #1 in
      // e2e-determinism.md). LS-4457 replaced the hand-rolled
      // Date.now()+while-loop with this expect.poll formulation.
      await expect
        .poll(
          async () => {
            const data = await gqlFetch<{
              league: { draftStatus: string } | null;
            }>(
              commissionerJwt,
              `query GetLeagueDraftStatus($id: Int!) {
                league(id: $id) { draftStatus }
              }`,
              { id: state.leagueId },
            ).catch(() => null);
            return data?.league?.draftStatus ?? null;
          },
          {
            timeout: 180_000,
            intervals: [5_000],
            message: `league.draftStatus did not reach 'completed' within 3 minutes for league ${state.leagueId}`,
          },
        )
        .toBe('completed');
    });

    await test.step('Season Active chip is visible in UI', async () => {
      // Navigate to the commissioner panel exactly once after the API confirms
      // the draft is complete.  The "Season Active" chip is rendered by
      // LeagueHero (top of LeagueDetailPageV2) whenever draftStatus is
      // 'active' or 'completed', so it is visible on any tab.
      await page.goto(`/baseball/league/${state.leagueId}/commissioner`);
      await page
        .waitForLoadState('networkidle', { timeout: 20_000 })
        .catch(() => undefined);
      await expect(page.getByText('Season Active')).toBeVisible({
        timeout: 15_000,
      });
    });
  });

  // -------------------------------------------------------------------------
  // PHASE 4 — FIND COMMISSIONER'S WEEK 1 MATCHUP VIA API
  // -------------------------------------------------------------------------

  test('Phase 4: Identify the commissioner matchup ID', async ({
    commissionerJwt,
  }) => {
    await test.step('Fetch commissioner team ID', async () => {
      const { userTeamId } = await gqlFetch<{ userTeamId: number }>(
        commissionerJwt,
        `query GetUserTeamId($leagueId: Int!) {
          userTeamId(leagueId: $leagueId)
        }`,
        { leagueId: state.leagueId },
      );
      expect(userTeamId).toBeGreaterThan(0);
      state.commissionerTeamId = userTeamId;

      // Find week-1 matchup for commissioner's team
      const { getMatchupsForLeague } = await gqlFetch<{
        getMatchupsForLeague: Array<{
          id: string;
          weekNumber: number;
          team1Id: number;
          team2Id: number;
          status: string;
        }>;
      }>(
        commissionerJwt,
        `query GetMatchupsForLeague($leagueId: Int!, $weekNumber: Int) {
          getMatchupsForLeague(leagueId: $leagueId, weekNumber: $weekNumber) {
            id
            weekNumber
            team1Id
            team2Id
            status
          }
        }`,
        { leagueId: state.leagueId, weekNumber: 1 },
      );

      expect(getMatchupsForLeague.length).toBeGreaterThan(0);

      const matchup = getMatchupsForLeague.find(
        (m) => m.team1Id === userTeamId || m.team2Id === userTeamId,
      );
      expect(matchup).toBeTruthy();
      if (!matchup) throw new Error('matchup should be defined');
      // Roster edits require the matchup to be in 'scheduled' status —
      // the server rejects updateMatchupPlayerPosition for in_progress/completed.
      // autoSelectGames is intentionally NOT called here so the matchup stays
      // scheduled and Phases 6-8 can modify the lineup.
      expect(matchup.status).toBe('scheduled');

      state.matchupId = Number(matchup.id);
      expect(state.matchupId).toBeGreaterThan(0);
    });

    await test.step('Assert league positions are seeded and lineup is populated', async () => {
      // Verify leaguePositions returns slots — required for STARTERS section to
      // render player cards. MatchupRosterEditor skips the positions query when
      // leaguePositions is empty or leagueId is unresolved, leaving STARTERS (0/0)
      // with no player rows even when matchup_players has starters (LS-4192).
      const { leaguePositions } = await gqlFetch<{
        leaguePositions: Array<{ id: number; positionType: string }> | null;
      }>(
        commissionerJwt,
        `query GetLeaguePositions($leagueId: Int!) {
          leaguePositions(leagueId: $leagueId) {
            id
            positionType
          }
        }`,
        { leagueId: state.leagueId },
      );
      expect(
        leaguePositions?.length ?? 0,
        `League ${state.leagueId} must have position slots seeded — roster editor needs leaguePositions to map starters to STARTERS slots`,
      ).toBeGreaterThan(0);

      // Poll until at least one of the commissioner's matchup players has a
      // non-null positionId. autoPopulateFirstMatchupLineup runs asynchronously
      // after draft completion and may not have committed when Phase 4 runs.
      // Gate here (before Phase 5 page navigation) so a lineup-population
      // failure surfaces with a clear API assertion message rather than a
      // 60-second UI timeout in Phase 5. Migrated from a Date.now()+while
      // loop to expect.poll in LS-4457.
      await expect
        .poll(
          async () => {
            const data = await gqlFetch<{
              getMatchupPlayers: Array<{
                id: string;
                teamId: number;
                positionId: number | null;
              }>;
            }>(
              commissionerJwt,
              `query GetMatchupPlayers($matchupId: Int!) {
                getMatchupPlayers(matchupId: $matchupId) {
                  id
                  teamId
                  positionId
                }
              }`,
              { matchupId: state.matchupId },
            ).catch(() => null);
            const players = data?.getMatchupPlayers ?? null;
            if (!players) return false;
            return players
              .filter((mp) => mp.teamId === state.commissionerTeamId)
              .some((mp) => mp.positionId !== null);
          },
          {
            timeout: 60_000,
            intervals: [4_000],
            message: `Commissioner team (${state.commissionerTeamId}) must have at least one starter in matchup ${state.matchupId} — autoPopulateFirstMatchupLineup must complete before the UI test`,
          },
        )
        .toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // PHASE 5 — NAVIGATE TO MATCHUP DETAIL — VERIFY ROSTER EDITOR VISIBLE
  // -------------------------------------------------------------------------

  test('Phase 5: Matchup detail page shows Edit Lineup section', async ({
    commissionerPage: page,
    commissionerJwt,
  }) => {
    // Two independent reload loops (Edit Lineup + starters) can each run up to
    // 30–60 s; add headroom beyond the default integration timeout.
    test.setTimeout(180_000);

    await test.step('GQL consistency gate: wait for commissioner team starters to be set', async () => {
      // autoPopulateFirstMatchupLineup runs asynchronously after draft completion
      // and may not have committed when Phase 5 starts. Poll the direct API until
      // at least one matchup_player for the commissioner's team has a non-null
      // positionId — filtering to the commissioner's team prevents a false pass
      // where only the opponent's players are assigned (LS-3834). Migrated from
      // a Date.now()+while loop to expect.poll in LS-4457.
      await expect
        .poll(
          async () => {
            const data = await gqlFetch<{
              getMatchupPlayers: Array<{
                id: string;
                teamId: number;
                positionId: number | null;
              }>;
            }>(
              commissionerJwt,
              `query GetMatchupPlayers($matchupId: Int!) {
                getMatchupPlayers(matchupId: $matchupId) {
                  id
                  teamId
                  positionId
                }
              }`,
              { matchupId: state.matchupId },
            ).catch(() => null);
            const players = data?.getMatchupPlayers ?? null;
            if (!players) return false;
            return players
              .filter((mp) => mp.teamId === state.commissionerTeamId)
              .some((mp) => mp.positionId !== null);
          },
          {
            timeout: 60_000,
            intervals: [4_000],
            message: `Commissioner team (${state.commissionerTeamId}) must have at least one starter before UI check`,
          },
        )
        .toBe(true);
    });

    await test.step('Navigate to matchup detail page and wait for Edit Lineup', async () => {
      const matchupUrl = `/baseball/league/${state.leagueId}/matchups/${state.matchupId}`;
      await page.goto(matchupUrl);
      await page.waitForLoadState('load');
      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
        { timeout: 15_000 },
      );

      // MatchupDetailPage renders the roster editor only after useGetUserTeamIdQuery
      // resolves (its result gates the render condition). waitForLoadState('load')
      // fires when page resources finish loading, but Apollo GraphQL queries
      // (userTeamId, getMatchupPlayers, getPositionsForLeague) are still in-flight
      // at that point. Waiting for networkidle ensures those queries complete and
      // React has re-rendered with the resolved data before we check visibility
      // (State B regression guard — LS-4283).
      const editLineup = page.getByText('Edit Lineup', { exact: true }).first();
      await page
        .waitForLoadState('networkidle', { timeout: 15_000 })
        .catch(() => undefined);

      // Force Apollo refetches by reloading until the editor appears, then
      // assert strictly. `reloadUntilVisible` is the canonical helper for
      // this pattern (LS-4458, LS-4457).
      await reloadUntilVisible(page, editLineup, {
        attempts: 30,
        pollTimeoutMs: 1_000,
        cooldownMs: 2_000,
        finalTimeoutMs: 20_000,
        afterReload: async () => {
          await page
            .waitForLoadState('networkidle', { timeout: 20_000 })
            .catch(() => undefined);
        },
      });
    });

    await test.step('Roster editor shows Unlocked badge', async () => {
      await expect(
        page.getByText('Unlocked', { exact: true }).first(),
      ).toBeVisible({ timeout: 10_000 });
    });

    await test.step('STARTERS section header is visible', async () => {
      await expect(page.getByText(/STARTERS/i).first()).toBeVisible({
        timeout: 10_000,
      });
    });

    await test.step('At least one player is in the starters section', async () => {
      const editorCard = page
        .locator('div, section')
        .filter({ hasText: 'Edit Lineup' })
        .filter({ hasText: 'STARTERS' })
        .first();

      // The previous step already asserts "STARTERS (N/N)" is visible, which
      // means the slot count is correct. Here we additionally verify that the
      // player rows carry their `data-testid` attribute (needed by Phases 6-8
      // for bench/swap interactions). We scope to `editorCard` rather than a
      // starters-only sub-locator because the `filter({ hasNotText: /BENCH/ })`
      // chain can resolve to the starters HEADER element rather than the full
      // container, leaving player rows outside its scope. Since the previous
      // step gates on STARTERS (N/N), false-positives from bench rows are not
      // possible — if the step passed, starters are assigned.
      const playerRows = editorCard.getByTestId(/^matchup-player-row-/);
      // Reload inside expect.poll to force fresh Apollo queries until at
      // least one player row renders (replaces a Date.now()+while loop
      // with waitForTimeout — LS-4457).
      await expect
        .poll(
          async () => {
            const visible = await playerRows
              .first()
              .isVisible()
              .catch(() => false);
            if (visible) return true;
            await page.reload();
            await page.waitForLoadState('load');
            await page
              .getByText('Edit Lineup', { exact: true })
              .first()
              .waitFor({ state: 'visible', timeout: 15_000 })
              .catch(() => undefined);
            return false;
          },
          {
            timeout: 60_000,
            intervals: [5_000],
            message: 'No matchup-player-row rendered within 60s',
          },
        )
        .toBe(true);

      await expect(playerRows.first()).toBeVisible({ timeout: 10_000 });
    });
  });

  // -------------------------------------------------------------------------
  // PHASE 6 — BENCH A STARTER
  // -------------------------------------------------------------------------

  test('Phase 6: Bench a starter', async ({
    commissionerPage: page,
    commissionerJwt,
  }) => {
    await test.step('Navigate to matchup detail page', async () => {
      await page.goto(
        `/baseball/league/${state.leagueId}/matchups/${state.matchupId}`,
      );
      await page.waitForLoadState('load');
      await expect(
        page.getByText('Edit Lineup', { exact: true }).first(),
      ).toBeVisible({ timeout: 30_000 });
    });

    await test.step('Click a starter to select it', async () => {
      // Find the roster editor container
      const editorCard = page
        .locator('div, section')
        .filter({ hasText: 'Edit Lineup' })
        .filter({ hasText: 'STARTERS' })
        .first();

      // Capture a visible starter name from within the first player row, not
      // from the broader editorCard. Scoping to the row prevents PLAYER_NAME_RE
      // from matching the league name (e.g. "Roster Editor E2E …"), whose first
      // two words happen to pass the regex's negative lookahead (LS-3781).
      const firstStarterRow = editorCard
        .getByTestId(/^matchup-player-row-/)
        .first();
      await expect(firstStarterRow).toBeVisible({ timeout: 15_000 });
      const playerNameEl = firstStarterRow.getByText(PLAYER_NAME_RE).first();
      await expect(playerNameEl).toBeVisible({ timeout: 5_000 });
      state.benchedPlayerName = ((await playerNameEl.textContent()) ?? '')
        .replace(/\s+/g, ' ')
        .trim();
      expect(state.benchedPlayerName).toBeTruthy();

      // Target the pressable row via its testID, not the inner Text node.
      // Clicking the inner <Text> doesn't reliably propagate to the XStack's
      // onPress handler on web (LS-3754). hasText with a string does
      // case-insensitive substring matching on the row's combined text, which
      // reliably finds the row even when the text starts with a position badge.
      const starterRow = editorCard
        .getByTestId(/^matchup-player-row-/)
        .filter({ hasText: state.benchedPlayerName })
        .first();
      await expect(starterRow).toBeVisible({ timeout: 15_000 });
      await starterRow.click();
      // The Bench action button rendering is the deterministic signal that
      // the row is in its selected state; the next test.step asserts it.
    });

    await test.step('"Bench" action button appears when a starter is selected', async () => {
      // After clicking a starter, the "Bench" button should appear on its row
      const benchBtn = page.getByRole('button', { name: /^Bench$/i }).first();
      await expect(benchBtn).toBeVisible({ timeout: 5_000 });
    });

    await test.step('Click Bench to move player to bench', async () => {
      const benchBtn = page.getByRole('button', { name: /^Bench$/i }).first();
      // The bench click fires THREE GraphQL POSTs in sequence: a network-only
      // GetMatchupById pre-flight, then UpdateMatchupPlayerPosition, then a
      // GetMatchupPlayers refetch. Filter strictly on the mutation
      // operationName — a generic POST predicate would resolve on the
      // pre-flight and let the API verify run before the mutation fires
      // (LS-5052).
      const mutationSettled = waitForGqlOperation(
        page,
        'UpdateMatchupPlayerPosition',
      );
      await benchBtn.click();
      await mutationSettled;
      // Wait for the subsequent refetch to also settle
      await page
        .waitForLoadState('networkidle', { timeout: 10_000 })
        .catch(() => undefined);
    });

    await test.step('Player now appears in Bench section with BN badge', async () => {
      // After benching, the player should appear in the bench section,
      // which shows "BN" as the position badge.
      const editorCard = page
        .locator('div, section')
        .filter({ hasText: 'Edit Lineup' })
        .first();
      await expect(
        editorCard.getByText(state.benchedPlayerName).first(),
      ).toBeVisible({ timeout: 10_000 });
    });

    await test.step('Verify change persisted via API', async () => {
      const { getMatchupPlayers } = await gqlFetch<{
        getMatchupPlayers: Array<{
          id: string;
          positionId: number | null;
          player: { firstName: string; lastName: string };
        }>;
      }>(
        commissionerJwt,
        `query GetMatchupPlayers($matchupId: Int!) {
          getMatchupPlayers(matchupId: $matchupId) {
            id
            positionId
            player {
              firstName
              lastName
            }
          }
        }`,
        { matchupId: state.matchupId },
      );

      expect(getMatchupPlayers.length).toBeGreaterThan(0);
      const [firstName, lastName] = state.benchedPlayerName.split(' ');
      const benchedRecord = getMatchupPlayers.find(
        (mp) =>
          mp.player.firstName === firstName && mp.player.lastName === lastName,
      );
      expect(benchedRecord).toBeTruthy();
      if (!benchedRecord) throw new Error('benchedRecord should be defined');
      // positionId should be null (on bench)
      expect(benchedRecord.positionId).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // PHASE 7 — ASSIGN BENCH PLAYER BACK TO A POSITION SLOT
  // -------------------------------------------------------------------------

  test('Phase 7: Assign bench player to a position slot', async ({
    commissionerPage: page,
    commissionerJwt,
  }) => {
    await test.step('Navigate to matchup detail page', async () => {
      await page.goto(
        `/baseball/league/${state.leagueId}/matchups/${state.matchupId}`,
      );
      await page.waitForLoadState('load');
      await expect(
        page.getByText('Edit Lineup', { exact: true }).first(),
      ).toBeVisible({ timeout: 30_000 });
    });

    await test.step('Click the benched player in the bench section', async () => {
      const editorCard = page
        .locator('div, section')
        .filter({ hasText: 'Edit Lineup' })
        .first();
      const benchedPlayerRow = editorCard
        .getByTestId(/^matchup-player-row-/)
        .filter({ hasText: state.benchedPlayerName })
        .first();
      await expect(benchedPlayerRow).toBeVisible({ timeout: 10_000 });
      await benchedPlayerRow.click();
      // Position option buttons rendering is the deterministic signal that
      // the row is in its selected state; the next test.step asserts it.
    });

    await test.step('Position option buttons appear for the selected bench player', async () => {
      // When a bench player is selected, position option buttons appear on their row
      // These are small buttons with position type labels like "SP", "C", "1B", etc.
      const positionButtons = page
        .getByRole('button', {
          name: /^(SP|RP|C|1B|2B|3B|SS|OF|DH|P)$/i,
        })
        .first();
      await expect(positionButtons).toBeVisible({ timeout: 5_000 });

      // Filter on the mutation operationName — see LS-5052: a generic POST
      // predicate would resolve on the pre-flight GetMatchupById query.
      const mutationSettled = waitForGqlOperation(
        page,
        'UpdateMatchupPlayerPosition',
      );
      // Click the first available position option to assign the player
      await positionButtons.click();
      await mutationSettled;
      // Wait for the subsequent refetch to also settle
      await page
        .waitForLoadState('networkidle', { timeout: 10_000 })
        .catch(() => undefined);
    });

    await test.step('Player removed from bench section after assignment', async () => {
      // After assigning, the player should no longer show a BN badge for that row —
      // it should appear in the STARTERS section with a position badge.
      const editorCard = page
        .locator('div, section')
        .filter({ hasText: 'Edit Lineup' })
        .first();
      // The player should still be visible in the editor (now as a starter)
      await expect(
        editorCard.getByText(state.benchedPlayerName).first(),
      ).toBeVisible({ timeout: 10_000 });
    });

    await test.step('Verify position assignment persisted via API', async () => {
      const { getMatchupPlayers } = await gqlFetch<{
        getMatchupPlayers: Array<{
          id: string;
          positionId: number | null;
          player: { firstName: string; lastName: string };
        }>;
      }>(
        commissionerJwt,
        `query GetMatchupPlayers($matchupId: Int!) {
          getMatchupPlayers(matchupId: $matchupId) {
            id
            positionId
            player {
              firstName
              lastName
            }
          }
        }`,
        { matchupId: state.matchupId },
      );

      const [firstName, lastName] = state.benchedPlayerName.split(' ');
      const playerRecord = getMatchupPlayers.find(
        (mp) =>
          mp.player.firstName === firstName && mp.player.lastName === lastName,
      );
      expect(playerRecord).toBeTruthy();
      if (!playerRecord) throw new Error('playerRecord should be defined');
      // positionId should now be non-null (assigned to a position)
      expect(playerRecord.positionId).not.toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // PHASE 8 — SWAP TWO STARTERS
  // -------------------------------------------------------------------------

  test('Phase 8: Swap two starters', async ({
    commissionerPage: page,
    commissionerJwt,
  }) => {
    await test.step('Navigate to matchup detail page', async () => {
      await page.goto(
        `/baseball/league/${state.leagueId}/matchups/${state.matchupId}`,
      );
      await page.waitForLoadState('load');
      await expect(
        page.getByText('Edit Lineup', { exact: true }).first(),
      ).toBeVisible({ timeout: 30_000 });
    });

    // Capture initial positions of the first two starters via API
    let player1Name = '';
    let player2Name = '';
    let player1FirstName = '';
    let player1LastName = '';
    let player2FirstName = '';
    let player2LastName = '';
    let player1InitialPositionId: number | null = null;
    let player2InitialPositionId: number | null = null;

    await test.step('Record initial positions of two starters via API', async () => {
      const { getMatchupPlayers } = await gqlFetch<{
        getMatchupPlayers: Array<{
          id: string;
          positionId: number | null;
          teamId: number;
          player: { firstName: string; lastName: string };
        }>;
      }>(
        commissionerJwt,
        `query GetMatchupPlayers($matchupId: Int!) {
          getMatchupPlayers(matchupId: $matchupId) {
            id
            positionId
            teamId
            player {
              firstName
              lastName
            }
          }
        }`,
        { matchupId: state.matchupId },
      );

      // Get commissioner's team ID
      const { userTeamId: commTeamId } = await gqlFetch<{
        userTeamId: number;
      }>(
        commissionerJwt,
        `query GetUserTeamId($leagueId: Int!) { userTeamId(leagueId: $leagueId) }`,
        { leagueId: state.leagueId },
      );

      // Find two starters (positionId non-null) for commissioner's team
      const starters = getMatchupPlayers.filter(
        (mp) => mp.teamId === commTeamId && mp.positionId !== null,
      );
      expect(starters.length).toBeGreaterThanOrEqual(2);

      const [first, second] = starters;
      player1FirstName = first.player.firstName;
      player1LastName = first.player.lastName;
      player2FirstName = second.player.firstName;
      player2LastName = second.player.lastName;
      player1Name = `${player1FirstName} ${player1LastName}`;
      player2Name = `${player2FirstName} ${player2LastName}`;
      player1InitialPositionId = first.positionId;
      player2InitialPositionId = second.positionId;
    });

    await test.step('Click first starter to select it', async () => {
      const editorCard = page
        .locator('div, section')
        .filter({ hasText: 'Edit Lineup' })
        .first();
      const firstPlayerRow = editorCard
        .getByTestId(/^matchup-player-row-/)
        .filter({ hasText: player1Name })
        .first();
      await expect(firstPlayerRow).toBeVisible({ timeout: 10_000 });
      await firstPlayerRow.click();

      // "Tap to swap" hint appearing is the deterministic signal that the
      // row is in its selected state — replaces a 500ms wait.
      await expect(page.getByText('Tap to swap').first()).toBeVisible({
        timeout: 5_000,
      });
    });

    await test.step('Click second starter to complete the swap', async () => {
      const editorCard = page
        .locator('div, section')
        .filter({ hasText: 'Edit Lineup' })
        .first();
      const secondPlayerRow = editorCard
        .getByTestId(/^matchup-player-row-/)
        .filter({ hasText: player2Name })
        .first();
      await expect(secondPlayerRow).toBeVisible({ timeout: 5_000 });
      // Filter on the swap mutation operationName — see LS-5052: a generic POST
      // predicate would resolve on the pre-flight GetMatchupById query.
      const mutationSettled = waitForGqlOperation(
        page,
        'SwapMatchupPlayerPositions',
      );
      await secondPlayerRow.click();
      await mutationSettled;
      // Wait for the subsequent refetch to also settle
      await page
        .waitForLoadState('networkidle', { timeout: 10_000 })
        .catch(() => undefined);
    });

    await test.step('Verify swap persisted via API — players exchanged positions', async () => {
      const { getMatchupPlayers } = await gqlFetch<{
        getMatchupPlayers: Array<{
          id: string;
          positionId: number | null;
          player: { firstName: string; lastName: string };
        }>;
      }>(
        commissionerJwt,
        `query GetMatchupPlayers($matchupId: Int!) {
          getMatchupPlayers(matchupId: $matchupId) {
            id
            positionId
            player {
              firstName
              lastName
            }
          }
        }`,
        { matchupId: state.matchupId },
      );

      const player1Record = getMatchupPlayers.find(
        (mp) =>
          mp.player.firstName === player1FirstName &&
          mp.player.lastName === player1LastName,
      );
      const player2Record = getMatchupPlayers.find(
        (mp) =>
          mp.player.firstName === player2FirstName &&
          mp.player.lastName === player2LastName,
      );

      expect(player1Record).toBeTruthy();
      if (!player1Record) throw new Error('player1Record should be defined');
      expect(player2Record).toBeTruthy();
      if (!player2Record) throw new Error('player2Record should be defined');

      // After swap: player 1 should now have player 2's original position
      expect(player1Record.positionId).toBe(player2InitialPositionId);
      // After swap: player 2 should now have player 1's original position
      expect(player2Record.positionId).toBe(player1InitialPositionId);
    });
  });
});
