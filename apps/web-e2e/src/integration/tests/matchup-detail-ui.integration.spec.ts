/**
 * Matchup Detail Page — UI Integration Test (LS-595)
 *
 * Validates the MatchupDetailPage components against the live backend.
 * No GraphQL mocking — all browser interactions and assertions use real API
 * responses and a real browser session with valid JWTs.
 *
 * Components covered:
 *   - MatchupScoreboard (team names, scores, status badge, week badge)
 *   - MatchupWinProbabilityPanel (WIN PROBABILITY label, percentages, bar)
 *   - GamesRemaining (progress panel — shown once gamesPerMatchup is set)
 *   - MatchupNavigationControls (week stepper, matchup cards, You badge)
 *   - MatchupRosterComparison (BATTERS / PITCHERS side-by-side lineups)
 *
 * Flow:
 *   1. Commissioner creates a 4-team league
 *   2. Three managers join via invite code
 *   3. Commissioner switches draft mode to Automated and starts the draft
 *   4. Wait for "Season Active" — matchups are now live
 *   5. API call resolves the Week 1 matchup IDs for the new league
 *   6. Navigate to /baseball/league/:id/matchups/:matchupId
 *   7. Assert each component renders correctly
 *   8. Test week navigation controls (prev/next stepper, matchup cards)
 *   9. Test manager-role view of the same page
 *
 * Run:
 *   cd apps/web-e2e
 *   pnpm exec playwright test --config playwright.integration.config.ts \
 *     src/integration/tests/matchup-detail-ui.integration.spec.ts
 */

import { expect } from '@playwright/test';
import { cleanupLeague } from '../helpers/cleanup-league';
import { createLeagueViaUI } from '../helpers/create-league';
import { joinLeagueAsManager } from '../helpers/wait-for-join-page';
import {
  AUTOMATED_DRAFT_TEST_TIMEOUT_MS,
  waitForSeasonActive,
} from '../helpers/wait-for-season-active';
import { reloadUntilVisible } from '../helpers/reload-until-visible';
import { test } from '../fixtures/ui';
import { gqlFetch } from '../helpers/gql-fetch';

import { testLeagueName } from '../league-run-scope';
// ---------------------------------------------------------------------------
// Shared state accumulated across serial phases.
// ---------------------------------------------------------------------------

interface MatchupDetailState {
  leagueId: number;
  inviteCode: string;
  leagueName: string;
  /** ID of the commissioner's week-1 matchup. */
  matchupId: number;
}

let state: MatchupDetailState;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Poll the backend until `Matchup.winProbability` is non-null (LS-8684).
 *
 * Phase 6's panel has a *data* precondition the spec never waited on.
 * `Matchup.winProbability` is computed server-side and returns null whenever
 * every rostered player's projected+actual total is still 0
 * (`lambdas/db/src/schema/matchups/winProbability.ts` —
 * `if (team1Total === 0 && team2Total === 0) return null`). Those totals come
 * from per-player season stats, which are downloaded from Baseball Reference
 * under a 15-req/min single-concurrency throttle and cached globally per
 * player-season. This spec runs an *automated random* draft, so which players
 * it lands on — and therefore how much of that data is already cached — varies
 * run to run.
 *
 * When the field is null the client renders nothing at all for a non-Scheduled
 * matchup (`MatchupWinProbabilityPanel`'s `if (!winProb) ... return null`), so
 * "WIN PROBABILITY" is simply absent from the DOM. No amount of browser
 * reloading changes that, which is why Phase 6 flaked on a cold run and passed
 * on the failed-only rerun once the same players were cached.
 *
 * Gating on the field itself — rather than on a proxy like the matchup's
 * `statsLoadingStatus`, which only advances when the scheduled `autoSelectGames`
 * mutation runs and this spec never invokes it — keeps the wait tied to exactly
 * the precondition the assertion needs. On timeout it fails naming the real
 * cause instead of surfacing as an opaque UI visibility timeout.
 */
async function waitForWinProbability(
  jwt: string,
  matchupId: number,
  timeoutMs: number,
): Promise<void> {
  const start = Date.now();
  let lastSeen = 'never queried';

  while (Date.now() - start < timeoutMs) {
    const data = await gqlFetch<{
      getMatchupById: {
        status: string;
        winProbability: { team1ProjectedScore: number } | null;
      } | null;
    }>(
      jwt,
      `query WinProbabilityReady($id: Int!) {
         getMatchupById(id: $id) {
           status
           winProbability { team1ProjectedScore }
         }
       }`,
      { id: matchupId },
    ).catch(() => null);

    if (data?.getMatchupById?.winProbability != null) return;
    lastSeen = data?.getMatchupById
      ? `status=${data.getMatchupById.status}, winProbability=null`
      : 'getMatchupById returned null';
    await delay(5_000);
  }

  throw new Error(
    `[matchup-detail] Matchup.winProbability never became available for matchup ` +
      `${matchupId} within ${timeoutMs}ms (last seen: ${lastSeen}). The panel ` +
      `cannot render without it — see waitForWinProbability above. This is a ` +
      `backend/data-availability failure, not a UI timing one.`,
  );
}

// ---------------------------------------------------------------------------
// Serial test suite
// ---------------------------------------------------------------------------

test.describe
  .serial('Matchup Detail Page UI (Live Backend) @integration @critical', () => {
  test.describe.configure({ retries: 0 });

  test.beforeAll(() => {
    state = {
      leagueId: 0,
      inviteCode: '',
      leagueName: '',
      matchupId: 0,
    };
  });

  // Layer-2 per-test league cleanup (LS-4539). Removes orphans even when the
  // test body throws — Playwright still runs afterAll on test failure. Process
  // crashes are caught by global-teardown (Layer 3) and the next run's
  // pre-run sweep in global-setup (Layer 1).
  test.afterAll(async ({ apiCommissioner }) => {
    await cleanupLeague(apiCommissioner, state.leagueId);
  });

  // -----------------------------------------------------------------------
  // PHASE 1 — CREATE LEAGUE
  // -----------------------------------------------------------------------

  test('Phase 1: Commissioner creates a league', async ({
    commissionerPage: page,
  }) => {
    state.leagueName = testLeagueName('Matchup Detail');
    const result = await createLeagueViaUI(page, {
      leagueName: state.leagueName,
    });
    state.leagueId = result.leagueId;
    state.inviteCode = result.inviteCode;
  });

  // -----------------------------------------------------------------------
  // PHASE 2 — MANAGERS JOIN LEAGUE
  // -----------------------------------------------------------------------

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
    const managers = [
      { page: managerPage1, jwt: managerJwt1, teamName: 'The Sluggers' },
      { page: managerPage2, jwt: managerJwt2, teamName: 'The Aces' },
      { page: managerPage3, jwt: managerJwt3, teamName: 'The Rockets' },
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

  // -----------------------------------------------------------------------
  // PHASE 3 — AUTOMATED DRAFT → SEASON ACTIVE
  // -----------------------------------------------------------------------

  test('Phase 3: Automated random draft runs to completion', async ({
    commissionerPage: page,
    apiCommissioner,
  }) => {
    // Draft budget + setup/badge headroom, justified in wait-for-season-active.ts (LS-10179).
    test.setTimeout(AUTOMATED_DRAFT_TEST_TIMEOUT_MS);

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

      // Confirmation dialog
      const confirmBtn = page.getByTestId('confirm-next-step');
      await expect(confirmBtn).toBeVisible({ timeout: 15_000 });
      await confirmBtn.click();
    });

    await test.step('Wait for Season Active status', async () => {
      await waitForSeasonActive(page, state.leagueId, {
        api: apiCommissioner,
      });
    });
  });

  // -----------------------------------------------------------------------
  // PHASE 4 — RESOLVE MATCHUP ID & NAVIGATE TO DETAIL PAGE
  // -----------------------------------------------------------------------

  test('Phase 4: Fetch Week 1 matchup ID and navigate to detail page', async ({
    commissionerPage: page,
    commissionerJwt,
  }) => {
    await test.step('Query API for week-1 matchups', async () => {
      const data = await gqlFetch<{
        getMatchupsForLeague: Array<{ id: number; weekNumber: number }>;
      }>(
        commissionerJwt,
        `query GetMatchupsForLeague($leagueId: Int!) {
            getMatchupsForLeague(leagueId: $leagueId) {
              id
              weekNumber
            }
          }`,
        { leagueId: state.leagueId },
      );

      const week1 = data.getMatchupsForLeague.filter((m) => m.weekNumber === 1);
      expect(week1.length).toBeGreaterThan(0);
      state.matchupId = Number(week1[0].id);
      expect(state.matchupId).toBeGreaterThan(0);
    });

    await test.step('Navigate to the matchup detail page', async () => {
      await page.goto(
        `/baseball/league/${state.leagueId}/matchups/${state.matchupId}`,
      );
      await page.waitForLoadState('load');
      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
        { timeout: 15_000 },
      );
    });

    await test.step('"Matchup Details" heading is visible', async () => {
      await expect(
        page.getByRole('heading', { name: /Matchup Details/i }),
      ).toBeVisible({ timeout: 15_000 });
    });

    await test.step('"Back to League" navigation button is present', async () => {
      await expect(
        page.getByRole('button', { name: /Back to League/i }),
      ).toBeVisible({ timeout: 10_000 });
    });
  });

  // -----------------------------------------------------------------------
  // PHASE 5 — SCOREBOARD
  // -----------------------------------------------------------------------

  test('Phase 5: Scoreboard renders correctly', async ({
    commissionerPage: page,
  }) => {
    await page.goto(
      `/baseball/league/${state.leagueId}/matchups/${state.matchupId}`,
    );
    await page.waitForLoadState('load');

    await test.step('VS badge is visible', async () => {
      await expect(page.getByText('VS').first()).toBeVisible({
        timeout: 15_000,
      });
    });

    await test.step('Week number badge is shown', async () => {
      await expect(page.getByText(/Week\s+\d+/i).first()).toBeVisible({
        timeout: 10_000,
      });
    });

    await test.step('Both team score values are rendered', async () => {
      // Scores are formatted as "0.00", "12.34", etc.
      const scoreLocators = page.locator('text=/^\\d+\\.\\d{2}$/');
      await expect(scoreLocators.first()).toBeVisible({ timeout: 15_000 });
      const count = await scoreLocators.count();
      expect(count).toBeGreaterThanOrEqual(2);
    });

    await test.step('Matchup status chip is visible', async () => {
      // Status is one of: Scheduled, Active, Completed, LIVE (in-progress)
      await expect(
        page.getByText(/^(Scheduled|Active|Completed|LIVE)$/i).first(),
      ).toBeVisible({ timeout: 10_000 });
    });
  });

  // -----------------------------------------------------------------------
  // PHASE 6 — WIN PROBABILITY PANEL
  // -----------------------------------------------------------------------

  test('Phase 6: Win probability panel renders', async ({
    commissionerPage: page,
    commissionerJwt,
  }) => {
    // Budgeted for the data gate below, which owns most of this phase's wall
    // time when the drafted players' season stats are not yet cached.
    test.setTimeout(180_000);

    await test.step('Wait for win probability to be computable', async () => {
      // Deterministic backend gate for the panel's data precondition — see
      // waitForWinProbability's docstring for why this is the right signal and
      // why reloading the browser cannot substitute for it (LS-8684).
      await waitForWinProbability(commissionerJwt, state.matchupId, 120_000);
    });

    await page.goto(
      `/baseball/league/${state.leagueId}/matchups/${state.matchupId}`,
    );
    await page.waitForLoadState('load');

    await test.step('WIN PROBABILITY label is visible', async () => {
      // The panel's *data* precondition — a non-null server-computed
      // Matchup.winProbability — is guaranteed by the gate above (LS-8684).
      // What remains here is the ordinary browser-side
      // race: the panel mounts only once this page's Apollo query resolves, and
      // under nightly load that first request can be throttled (429), leaving
      // it unmounted (LS-8138 — backend 429s now retry in apollo-client; this
      // is the belt-and-suspenders UI gate).
      //
      // The defaults are deliberate now that `pollTimeoutMs` is honoured
      // (LS-8684): three genuine 5s waits with a reload between them, then the
      // closing 15s assertion. Previously the poll was an ignored-timeout
      // `isVisible()` check, so this call reloaded three times in quick
      // succession — cancelling the very query it was waiting on — and the
      // panel had only that final 15s window to appear. "not visible after 15s"
      // in the LS-8684 report is exactly that window expiring.
      await reloadUntilVisible(page, page.getByText('WIN PROBABILITY').first());
    });

    // Scope percentage assertions to the win-probability panel. The previous
    // page-wide `text=/^\d+%$/` locator was brittle: under the Tamagui/RNW span
    // structure it failed to match the two team values ("98%" / "2%") and instead
    // matched an unrelated "0%" elsewhere on the page (count=1). Reading the
    // panel's own text and extracting `\d+%` tokens is robust to that.
    const winProbPanel = page.getByTestId('win-probability-panel');
    const panelPercents = async (): Promise<number[]> =>
      ((await winProbPanel.innerText()).match(/\d+%/g) ?? []).map((t) =>
        parseInt(t, 10),
      );

    await test.step('Probability percentages are shown', async () => {
      await expect(winProbPanel).toBeVisible({ timeout: 15_000 });
      await expect
        .poll(async () => (await panelPercents()).length, {
          timeout: 10_000,
          intervals: [500, 1_000, 2_000],
        })
        .toBeGreaterThanOrEqual(2);
    });

    await test.step('Probability percentages sum to 100', async () => {
      // The panel's percentages are team1 / team2 / tie — mutually exclusive
      // and exhaustive — so ALL of them sum to 100, not some pair of them.
      // The previous assertion looked for a pair summing to exactly 100, which
      // fails outright whenever the Monte Carlo simulation returns a
      // non-negligible tie share (t1 + t2 = 100 - tie). Data-dependent, so it
      // passed most runs (LS-9838).
      //
      // The +/-1 tolerance is required, not slack: the integration suite always
      // runs against the already-deployed frontend, which rounds the three
      // values independently and so can render a 99 or 101 total. Largest-
      // remainder rounding (LS-9838) makes the total exactly 100 once deployed,
      // and that still satisfies this assertion.
      const nums = await panelPercents();
      const sum = nums.reduce((acc, n) => acc + n, 0);
      const detail = `panel percentages: [${nums.join(', ')}]`;
      expect(sum, detail).toBeGreaterThanOrEqual(99);
      expect(sum, detail).toBeLessThanOrEqual(101);
    });
  });

  // -----------------------------------------------------------------------
  // PHASE 7 — GAMES REMAINING
  // -----------------------------------------------------------------------

  test('Phase 7: Games remaining panel renders when gamesPerMatchup is set', async ({
    commissionerPage: page,
    commissionerJwt,
  }) => {
    // Check whether the league's week-1 matchup has gamesPerMatchup set.
    // If games have not been selected yet the panel does not render —
    // in that case we skip this phase gracefully.
    const data = await gqlFetch<{
      getMatchupsForLeague: Array<{
        id: number;
        gamesPerMatchup: number | null;
      }>;
    }>(
      commissionerJwt,
      `query GetMatchupsForLeague($leagueId: Int!) {
          getMatchupsForLeague(leagueId: $leagueId) {
            id
            gamesPerMatchup
          }
        }`,
      { leagueId: state.leagueId },
    );

    const matchupData = data.getMatchupsForLeague.find(
      (m) => m.id === state.matchupId,
    );

    if (!matchupData?.gamesPerMatchup) {
      // Games not yet selected — skip gracefully without failing.
      // This is expected immediately after a fresh automated draft.
      return;
    }

    await page.goto(
      `/baseball/league/${state.leagueId}/matchups/${state.matchupId}`,
    );
    await page.waitForLoadState('load');

    await test.step('Games Progress heading is visible', async () => {
      await expect(
        page.getByText('Games Progress', { exact: false }),
      ).toBeVisible({ timeout: 15_000 });
    });

    await test.step('Progress indicator renders (dots or text)', async () => {
      // GamesRemaining shows either dot icons or a compact "N games left" /
      // "Complete" text.  Either variant satisfies this assertion.
      const indicator = page.getByText(/games? left|Complete/i).first();
      await expect(indicator).toBeVisible({ timeout: 10_000 });
    });
  });

  // -----------------------------------------------------------------------
  // PHASE 8 — WEEK NAVIGATION CONTROLS
  // -----------------------------------------------------------------------

  test('Phase 8: Week navigation controls function correctly', async ({
    commissionerPage: page,
  }) => {
    await page.goto(
      `/baseball/league/${state.leagueId}/matchups/${state.matchupId}`,
    );
    await page.waitForLoadState('load');

    await test.step('Week stepper shows "Week 1"', async () => {
      await expect(page.getByText('Week 1').first()).toBeVisible({
        timeout: 15_000,
      });
    });

    await test.step('Previous-week button is inert at Week 1', async () => {
      // The StepperButton is a Tamagui-styled div with aria-label.  The
      // "disabled" variant sets opacity:0.3 and aria-disabled="true" but not
      // the native HTML disabled attribute.  Playwright's default .click()
      // actionability check treats aria-disabled="true" as not-enabled and
      // waits for it to become actionable — which never happens at Week 1 —
      // so a plain click() hangs until the test timeout (LS-8419).  We assert
      // inertness directly instead: the control reports aria-disabled and the
      // displayed week does not change.  Mirrors the hermetic pattern in
      // matchup-week-navigation.spec.ts.
      const weekTextBefore = await page
        .getByText(/^Week \d+$/)
        .first()
        .textContent();

      const prevBtn = page.locator('[aria-label="Previous week"]');
      await expect(prevBtn).toBeVisible({ timeout: 10_000 });
      await expect(prevBtn).toHaveAttribute('aria-disabled', 'true');

      // Week display is unchanged (the disabled control is a no-op).
      const weekTextAfter = await page
        .getByText(/^Week \d+$/)
        .first()
        .textContent();
      expect(weekTextAfter).toBe(weekTextBefore);
    });

    await test.step('Next-week button and Previous-week button are visible', async () => {
      await expect(page.locator('[aria-label="Previous week"]')).toBeVisible();
      await expect(page.locator('[aria-label="Next week"]')).toBeVisible();
    });

    await test.step('Matchup cards for the current week are shown', async () => {
      // A 4-team league has 2 matchups per week.  At minimum 1 card is shown.
      // The navigation card renders matchup info (team names) as clickable rows.
      await expect(page.locator('body')).not.toContainText('No matchups found');
      // The "YOU" badge appears for the commissioner's own matchup —
      // it may take a moment for the sidebar matchup list to populate.
      // NOTE: the badge renders all-caps "YOU" — exact: true is case-sensitive.
      const youBadge = page.getByText('YOU', { exact: true }).first();
      // The sidebar matchup list can be slow to populate; reload up to 3
      // times to refresh stale Apollo cache, then assert strictly. The
      // helper internally has no fixed-duration sleeps in the iteration
      // body — the cooldown is its only timed wait (LS-4457 compatible).
      await reloadUntilVisible(page, youBadge, {
        attempts: 3,
        pollTimeoutMs: 5_000,
        cooldownMs: 2_000,
        finalTimeoutMs: 15_000,
      });
    });

    await test.step('"Current" week badge is displayed for Week 1', async () => {
      // The week that matches the league's current week shows a green "Current" badge.
      await expect(page.getByText('Current').first()).toBeVisible({
        timeout: 5_000,
      });
    });
  });

  // -----------------------------------------------------------------------
  // PHASE 9 — ROSTER COMPARISON
  // -----------------------------------------------------------------------

  test('Phase 9: Roster comparison panel shows BATTERS and PITCHERS', async ({
    commissionerPage: page,
  }) => {
    await page.goto(
      `/baseball/league/${state.leagueId}/matchups/${state.matchupId}`,
    );
    await page.waitForLoadState('load');

    await test.step('BATTERS section header is present', async () => {
      await expect(page.getByText('BATTERS').first()).toBeVisible({
        timeout: 20_000,
      });
    });

    await test.step('PITCHERS section header is present', async () => {
      await expect(page.getByText('PITCHERS').first()).toBeVisible({
        timeout: 10_000,
      });
    });

    await test.step('"Actual" column header confirms lineup is populated', async () => {
      await expect(
        page.getByText('Actual', { exact: true }).first(),
      ).toBeVisible({ timeout: 10_000 });
    });
  });

  // -----------------------------------------------------------------------
  // PHASE 10 — MANAGER ROLE VIEW
  // -----------------------------------------------------------------------

  test('Phase 10: Manager can view the matchup detail page', async ({
    managerPage1: page,
  }) => {
    // Use a dedicated manager browser context rather than switchUser on
    // commissionerPage. switchUser has a race condition (LS-3672, LS-3705):
    // background JWT refresh can dispatch AUTH_LOGOUT and clear localStorage
    // after page.evaluate() sets the manager profile.
    await page.goto(
      `/baseball/league/${state.leagueId}/matchups/${state.matchupId}`,
    );

    await test.step('Page loads without error for manager', async () => {
      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
        { timeout: 15_000 },
      );
    });

    await test.step('VS badge is visible for manager', async () => {
      await expect(page.getByText('VS').first()).toBeVisible({
        timeout: 15_000,
      });
    });

    await test.step('"Matchup Details" heading is visible for manager', async () => {
      await expect(
        page.getByRole('heading', { name: /Matchup Details/i }),
      ).toBeVisible({ timeout: 10_000 });
    });
  });
});
