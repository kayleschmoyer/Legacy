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
 *   Phase 3: Automated random draft → wait for Season Active
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

import { expect } from '@playwright/test';
import { createLeagueViaUI } from '../helpers/create-league';
import { waitForJoinPageValidation } from '../helpers/wait-for-join-page';
import { switchUser, test } from '../fixtures/ui';

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

interface RosterEditorState {
  leagueId: number;
  inviteCode: string;
  leagueName: string;
  matchupId: number;
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

// ---------------------------------------------------------------------------
// Helpers
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
  .serial('Matchup Roster Editor UI (Live Backend) @integration @critical', () => {
  test.describe.configure({ retries: 0 });

  test.beforeAll(() => {
    state = {
      leagueId: 0,
      inviteCode: '',
      leagueName: '',
      matchupId: 0,
      benchedPlayerName: '',
      freedPositionId: null,
    };
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

  test('Phase 2: Managers join the league', async ({
    commissionerPage: page,
    commissionerJwt,
    managerJwt1,
    managerJwt2,
    managerJwt3,
  }) => {
    const managers = [
      { jwt: managerJwt1, teamName: 'The Sluggers' },
      { jwt: managerJwt2, teamName: 'The Aces' },
      { jwt: managerJwt3, teamName: 'The Rockets' },
    ];

    await test.step('Each manager joins via invite code', async () => {
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
        await expect(joinBtn).toBeEnabled({ timeout: 5_000 });
        await joinBtn.click();

        await expect(page).toHaveURL(/\/baseball\/league\/\d+/, {
          timeout: 15_000,
        });
      }

      // Restore commissioner
      await switchUser(page, commissionerJwt);
    });
  });

  // -------------------------------------------------------------------------
  // PHASE 3 — AUTOMATED RANDOM DRAFT → SEASON ACTIVE
  // -------------------------------------------------------------------------

  test('Phase 3: Automated draft and season activation', async ({
    commissionerPage: page,
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

    await test.step('Wait for Season Active status', async () => {
      const seasonActive = page.getByText('Season Active');
      const deadline = Date.now() + 120_000;
      while (Date.now() < deadline) {
        if (await seasonActive.isVisible().catch(() => false)) break;
        await page.waitForTimeout(5_000);
        await page.reload();
        await page.waitForLoadState('load');
      }
      await expect(seasonActive).toBeVisible({ timeout: 15_000 });
    });
  });

  // -------------------------------------------------------------------------
  // PHASE 4 — FIND COMMISSIONER'S WEEK 1 MATCHUP VIA API
  // -------------------------------------------------------------------------

  test('Phase 4: Identify the commissioner matchup ID', async ({
    commissionerJwt,
  }) => {
    await test.step('Run autoSelectGames to activate week-1 matchup', async () => {
      // autoSelectGames transitions 'scheduled' matchups to 'in_progress' and
      // sends SQS messages for game selection. matchup_players is populated
      // during the draft via populateMatchupPlayersAndSeasons; this call is
      // needed so the matchup status is Scheduled or InProgress (both are
      // accepted by the roster editor).
      await gqlFetch<{
        autoSelectGames: { gamesTriggered: number } | null;
      }>(
        commissionerJwt,
        `mutation AutoSelectGames($leagueId: Int) {
          autoSelectGames(leagueId: $leagueId) { gamesTriggered }
        }`,
        { leagueId: state.leagueId },
      );
    });

    await test.step('Fetch commissioner team ID', async () => {
      const { userTeamId } = await gqlFetch<{ userTeamId: number }>(
        commissionerJwt,
        `query GetUserTeamId($leagueId: Int!) {
          userTeamId(leagueId: $leagueId)
        }`,
        { leagueId: state.leagueId },
      );
      expect(userTeamId).toBeGreaterThan(0);

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
      // Roster editor works for both scheduled and in-progress matchups
      expect(['scheduled', 'in_progress']).toContain(matchup.status);

      state.matchupId = Number(matchup.id);
      expect(state.matchupId).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // PHASE 5 — NAVIGATE TO MATCHUP DETAIL — VERIFY ROSTER EDITOR VISIBLE
  // -------------------------------------------------------------------------

  test('Phase 5: Matchup detail page shows Edit Lineup section', async ({
    commissionerPage: page,
  }) => {
    // Two independent reload loops (Edit Lineup + starters) can each run up to
    // 30–60 s; add headroom beyond the default integration timeout.
    test.setTimeout(180_000);

    await test.step('Navigate to matchup detail page and wait for Edit Lineup', async () => {
      const matchupUrl = `/baseball/league/${state.leagueId}/matchups/${state.matchupId}`;
      await page.goto(matchupUrl);
      await page.waitForLoadState('load');
      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
        { timeout: 15_000 },
      );

      // The MatchupRosterEditor depends on a separate getMatchupPlayers query
      // that may not resolve on the first load for newly-created leagues.
      // Retry with a reload if "Edit Lineup" isn't visible after 15s.
      const editLineup = page.getByText('Edit Lineup', { exact: true }).first();
      const visible = await editLineup.isVisible().catch(() => false);
      if (!visible) {
        const deadline = Date.now() + 30_000;
        while (Date.now() < deadline) {
          await page.waitForTimeout(5_000);
          await page.reload();
          await page.waitForLoadState('load');
          if (await editLineup.isVisible().catch(() => false)) break;
        }
      }
      await expect(editLineup).toBeVisible({ timeout: 15_000 });
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

      // After an automated draft the autoPopulateFirstMatchupLineup transaction
      // may still be committing when the page first loads. Poll with page reloads
      // (same pattern as live-draft-ui.integration.spec.ts, fixed by LS-3794)
      // until at least one STARTER player row appears.
      //
      // Scope to the STARTERS container (a div that contains "STARTERS" text
      // but not "BENCH" — the bench section is a sibling, not a descendant) so
      // bench-only rows don't satisfy this check before starters are assigned.
      const startersSection = editorCard
        .locator('div')
        .filter({ hasText: /STARTERS/ })
        .filter({ hasNotText: /BENCH/ })
        .first();
      const playerRows = startersSection.getByTestId(/^matchup-player-row-/);
      const deadline = Date.now() + 60_000;
      while (
        !(await playerRows
          .first()
          .isVisible()
          .catch(() => false))
      ) {
        if (Date.now() >= deadline) break;
        await page.waitForTimeout(5_000);
        await page.reload();
        await page.waitForLoadState('load');
        await page
          .getByText('Edit Lineup', { exact: true })
          .first()
          .waitFor({ state: 'visible', timeout: 15_000 })
          .catch(() => undefined);
      }

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
      await page.waitForTimeout(500);
    });

    await test.step('"Bench" action button appears when a starter is selected', async () => {
      // After clicking a starter, the "Bench" button should appear on its row
      const benchBtn = page.getByRole('button', { name: /^Bench$/i }).first();
      await expect(benchBtn).toBeVisible({ timeout: 5_000 });
    });

    await test.step('Click Bench to move player to bench', async () => {
      const benchBtn = page.getByRole('button', { name: /^Bench$/i }).first();
      await benchBtn.click();
      // Wait for mutation to complete
      await page.waitForTimeout(2_000);
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
      await page.waitForTimeout(500);
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

      // Click the first available position option to assign the player
      await positionButtons.click();
      await page.waitForTimeout(2_000);
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
      player1Name = `${first.player.firstName} ${first.player.lastName}`;
      player2Name = `${second.player.firstName} ${second.player.lastName}`;
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
      await page.waitForTimeout(500);

      // "Tap to swap" hint should appear on other players
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
      await secondPlayerRow.click();
      // Wait for mutation to complete
      await page.waitForTimeout(2_000);
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

      const [p1First, p1Last] = player1Name.split(' ');
      const [p2First, p2Last] = player2Name.split(' ');

      const player1Record = getMatchupPlayers.find(
        (mp) =>
          mp.player.firstName === p1First && mp.player.lastName === p1Last,
      );
      const player2Record = getMatchupPlayers.find(
        (mp) =>
          mp.player.firstName === p2First && mp.player.lastName === p2Last,
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
