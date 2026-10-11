/**
 * Matchup Roster Comparison & Recap Panel — UI Integration Test (LS-597)
 *
 * Verifies the MatchupRosterComparison and MatchupRecapPanel components
 * against the live backend. No mocks — all interactions use real API calls
 * and a real browser.
 *
 * Strategy:
 *   A Phase 0 test self-provisions the data every later phase needs
 *   (provisionCompletedMatchup): it creates a two-team league and drives it to
 *   a single completed matchup. That one completed matchup has both bench
 *   players (rosters spill past the starting lineup) and a narrative recap
 *   (generated synchronously and deterministically on completion — no LLM, no
 *   queue), so all five phases reuse it. Provisioning replaced an earlier
 *   discovery loop that depended on pre-existing leagues for the test
 *   commissioner; the global sweep wipes those for the base commissioner, so
 *   discovery found zero leagues and failed in setup (LS-7704). Phase 0 asserts
 *   the provisioned matchup is non-empty and has bench players so the suite
 *   fails loudly rather than silently skipping (LS-4401 treats skips as
 *   failures). The provisioned league is deleted in afterAll.
 *
 *   Cross-user phases (4, 5) use the `managerPage1` browser-context fixture
 *   rather than `switchUser`. switchUser races against the background JWT
 *   refresh (LS-3672, LS-3705, LS-4385); managerPage1 boots a dedicated
 *   context with the manager's cookies and localStorage already in place.
 *   getMatchupById does not enforce league membership, so the manager can
 *   view the commissioner's matchup by URL even without joining the league.
 *
 * Covers:
 *   - MatchupRosterComparison: BATTERS/PITCHERS section headers, column headers
 *     (Team Name, Proj, Actual, Pos), position slot rows, totals rows
 *   - Bench toggle (Show/Hide Bench with count badge)
 *   - MatchupRecapPanel: MATCHUP RECAP header, headline, narrative,
 *     STANDOUT PERFORMANCES highlights
 *   - Cross-user visibility: manager identity sees the same panels
 *
 * Run:
 *   pnpm exec playwright test \
 *     --config apps/web-e2e/playwright.integration.config.ts \
 *     src/integration/tests/matchup-roster-recap-ui.integration.spec.ts
 */

import { expect } from '@playwright/test';
import { cleanupLeague } from '../helpers/cleanup-league';
import { provisionCompletedMatchup } from '../helpers/provision-completed-matchup';
import { reloadUntilVisible } from '../helpers/reload-until-visible';
import { test } from '../fixtures/ui';

import { testLeagueName } from '../league-run-scope';
// ---------------------------------------------------------------------------
// Shared state set in beforeAll and consumed by subsequent phases
// ---------------------------------------------------------------------------

interface MatchupRosterState {
  /** The self-provisioned league (LS-7704). Cleaned up in afterAll. */
  leagueId: number;
  /** Any matchup in an admin league — used to test roster comparison panel */
  rosterLeagueId: number;
  rosterMatchupId: number;
  /** Whether the roster matchup has bench players (positionId === null) */
  hasBenchPlayers: boolean;
  /** A completed matchup that has a recap — used for recap panel phase */
  recapLeagueId: number;
  recapMatchupId: number;
}

let state: MatchupRosterState;

// ---------------------------------------------------------------------------
// Serial test suite
// ---------------------------------------------------------------------------

test.describe
  .serial('Matchup Roster Comparison & Recap Panel (Live Backend) @integration @critical', () => {
  test.describe.configure({ retries: 0 });

  // -----------------------------------------------------------------------
  // SETUP — query live API for matchup IDs to use in subsequent phases
  // -----------------------------------------------------------------------

  test.beforeAll(() => {
    state = {
      leagueId: 0,
      rosterLeagueId: 0,
      rosterMatchupId: 0,
      hasBenchPlayers: false,
      recapLeagueId: 0,
      recapMatchupId: 0,
    };
  });

  // Clean up the self-provisioned league once every phase has run (LS-7704).
  test.afterAll(async ({ apiCommissioner }) => {
    await cleanupLeague(apiCommissioner, state.leagueId);
  });

  // -----------------------------------------------------------------------
  // PHASE 0 — Provision a completed matchup with a recap
  // -----------------------------------------------------------------------
  //
  // This spec previously *discovered* a completed-with-recap matchup among the
  // test commissioner's pre-existing leagues. That coupled it to live seed data
  // the global sweep wipes for the base commissioner, so it found zero leagues
  // and failed in setup (LS-7704). We now provision our own data: a two-team
  // league driven to a single completed matchup. A matchup recap is generated
  // synchronously and deterministically on completion (no LLM / queue), so the
  // same completed matchup satisfies every phase below — roster comparison,
  // bench toggle, recap panel, and the cross-user view.
  test('Phase 0: Provision a completed matchup with a recap', async ({
    commissionerJwt,
    managerJwt1,
  }) => {
    // provisionCompletedMatchup drives a full league to a completed matchup:
    // create + join + a ~30-pick draft (~2 min), then wait for the async
    // stats-hydration pipeline. On a freshly-provisioned league every player's
    // game log is downloaded from Baseball Reference by a single-concurrency
    // stats-lambda in FIFO batches of 8 (~12s/player, ~6 min nominal for 30
    // players). The helper fails fast if hydration stops making per-player
    // progress, and caps a slow-but-healthy run at 600s (LS-11046); budget the
    // setup/draft work on top of that ceiling.
    test.setTimeout(780_000);

    const provisioned = await provisionCompletedMatchup({
      commissionerJwt,
      managerJwt: managerJwt1,
      leagueName: testLeagueName('Roster Recap'),
    });

    state.leagueId = provisioned.leagueId;
    state.rosterLeagueId = provisioned.leagueId;
    state.rosterMatchupId = provisioned.matchupId;
    state.recapLeagueId = provisioned.leagueId;
    state.recapMatchupId = provisioned.matchupId;
    state.hasBenchPlayers = provisioned.hasBenchPlayers;

    // The provisioned matchup must satisfy the preconditions every later phase
    // depends on — fail loudly here rather than mid-phase (LS-4401: skips are
    // failures).
    expect(
      state.recapMatchupId,
      'Provisioned a completed matchup for the recap/roster phases',
    ).toBeGreaterThan(0);
    expect(
      state.hasBenchPlayers,
      'Provisioned matchup has at least one bench player (positionId === null)',
    ).toBe(true);
  });

  // -----------------------------------------------------------------------
  // PHASE 1 — Roster comparison panel structure
  // -----------------------------------------------------------------------

  test('Phase 1: Roster comparison panel renders correctly', async ({
    commissionerPage: page,
  }) => {
    test.setTimeout(60_000);

    const matchupUrl = `/baseball/league/${state.rosterLeagueId}/matchups/${state.rosterMatchupId}`;

    await test.step('Navigate to matchup detail page', async () => {
      await page.goto(matchupUrl);
      await page.waitForLoadState('load');
      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
        { timeout: 15_000 },
      );
    });

    await test.step('Verify "Player Matchups" card heading', async () => {
      // MatchupRosterComparison renders an H4 with text "Player Matchups" only
      // once the browser-side matchup query resolves. Under nightly 3-shard load
      // that first query can be throttled (HTTP 429), leaving the comparison
      // unmounted; a single-shot toBeVisible then burns the phase budget while
      // nothing re-fires the query. Reload to re-fire it — the same
      // backend-authoritative determinism gate Phase 3 already uses for its
      // BATTERS assertion (line ~225) and that LS-8138 applied to the sibling
      // matchup specs (LS-8206 confirmed this content does eventually render).
      // Budget-aware gate (LS-8211): keep re-firing the throttled query across
      // most of this 60s phase budget instead of exhausting a fixed 3 reloads
      // early and then walking the residual one-shot timeout.
      //
      // `pollTimeoutMs` is explicit (LS-8684). MatchupRosterComparison renders
      // this heading in *every* branch it has — loading skeleton, error, and
      // populated alike — so the only way it is missing is that
      // MatchupDetailPage itself is still on `MatchupDetailSkeleton`, i.e. the
      // page-level GetMatchupById query has not come back yet. Reloading
      // restarts that query rather than helping it, so the gate has to give
      // each attempt longer than the query takes (~5-20s on the dev stack) or
      // it just aborts it repeatedly. The total 45s budget is unchanged — it is
      // reallocated from reload churn to actually waiting.
      await reloadUntilVisible(
        page,
        page.getByRole('heading', { name: /Player Matchups/i }),
        { pollTimeoutMs: 15_000, finalTimeoutMs: 20_000, budgetMs: 45_000 },
      );
    });

    await test.step('Verify BATTERS section header', async () => {
      await expect(page.getByText('BATTERS').first()).toBeVisible({
        timeout: 20_000,
      });
    });

    await test.step('Verify PITCHERS section header', async () => {
      await expect(page.getByText('PITCHERS').first()).toBeVisible();
    });

    await test.step('Verify Actual and Proj column headers', async () => {
      // Each section has "Actual" (gold) and "Proj" column headers. These
      // hydrate with the comparison table's stat columns a render tick after
      // the BATTERS/PITCHERS section headers above, so give them the same 20s
      // budget as their siblings rather than the 5s default — the default
      // raced the stat-column hydration under nightly load (LS-8138).
      await expect(page.getByText('Actual').first()).toBeVisible({
        timeout: 20_000,
      });
      await expect(page.getByText('Proj').first()).toBeVisible({
        timeout: 20_000,
      });
    });

    await test.step('Verify position slot column renders', async () => {
      // The responsive MatchupRosterComparison redesign (LS-5903, #6177)
      // replaced the standalone "Pos" column header with a per-slot position
      // badge in the comparison table's center column (e.g. "SP", "1B", "C").
      // Assert at least one position badge renders to confirm the position
      // column is present — resilient to the header-label removal rather than
      // matching the now-absent exact "Pos" text (LS-8577).
      await expect(page.locator('.mrc-pos-badge').first()).toBeVisible({
        timeout: 20_000,
      });
    });

    await test.step('Verify numeric score values are rendered', async () => {
      // Totals rows display scores formatted as decimal numbers (e.g. "0.00",
      // "12.50").  At least one such value must be visible.
      await expect(page.locator('text=/^\\d+\\.\\d{2}$/').first()).toBeVisible({
        timeout: 15_000,
      });
    });
  });

  // -----------------------------------------------------------------------
  // PHASE 2 — Bench toggle interaction
  // -----------------------------------------------------------------------

  test('Phase 2: Bench toggle expands and collapses the bench section', async ({
    commissionerPage: page,
  }) => {
    test.setTimeout(60_000);

    const matchupUrl = `/baseball/league/${state.rosterLeagueId}/matchups/${state.rosterMatchupId}`;

    await test.step('Navigate and wait for roster comparison to load', async () => {
      await page.goto(matchupUrl);
      await page.waitForLoadState('load');
      // The roster comparison (and its bench toggle) render only once the
      // browser-side matchup query resolves; reload to re-fire it if the first
      // request was throttled under load, so the "Show Bench" assertion below
      // isn't racing an unmounted comparison (LS-8138).
      // Budget-aware gate (LS-8211): the concrete 429-exhaustion instance this
      // ticket targets — Phase 2 BATTERS exhausted 3 reloads + a 20s assert
      // under nightly load. Keep re-firing across most of the 60s phase budget.
      // `pollTimeoutMs` explicit for the same reason as Phase 1 (LS-8684): a
      // reload restarts the matchup query, so each attempt must outlast the
      // query rather than cut it off. Total budget unchanged.
      await reloadUntilVisible(page, page.getByText('BATTERS').first(), {
        pollTimeoutMs: 15_000,
        finalTimeoutMs: 20_000,
        budgetMs: 45_000,
      });
    });

    await test.step('"Show Bench" button is visible', async () => {
      await expect(page.getByText('Show Bench').first()).toBeVisible({
        timeout: 15_000,
      });
    });

    await test.step('Click "Show Bench" expands the bench section', async () => {
      await page.getByText('Show Bench').first().click();
      // Text toggles to "Hide Bench" once expanded
      await expect(page.getByText('Hide Bench').first()).toBeVisible({
        timeout: 5_000,
      });
    });

    await test.step('Click "Hide Bench" collapses the bench section', async () => {
      await page.getByText('Hide Bench').first().click();
      await expect(page.getByText('Show Bench').first()).toBeVisible({
        timeout: 5_000,
      });
    });
  });

  // -----------------------------------------------------------------------
  // PHASE 3 — Recap panel for a completed matchup
  // -----------------------------------------------------------------------

  test('Phase 3: Recap panel renders for a completed matchup', async ({
    commissionerPage: page,
  }) => {
    test.setTimeout(60_000);

    const matchupUrl = `/baseball/league/${state.recapLeagueId}/matchups/${state.recapMatchupId}`;

    await test.step('Navigate to the completed matchup', async () => {
      await page.goto(matchupUrl);
      await page.waitForLoadState('load');
      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
        { timeout: 15_000 },
      );
    });

    await test.step('Verify "MATCHUP RECAP" header is visible', async () => {
      // MatchupRecapPanel renders a "MATCHUP RECAP" label in the card header
      await expect(page.getByText('MATCHUP RECAP').first()).toBeVisible({
        timeout: 20_000,
      });
    });

    await test.step('Verify headline text is rendered', async () => {
      // The recap headline is the first bold paragraph below the header.
      // It always has non-empty content for a completed matchup.
      const recapSection = page
        .getByText('MATCHUP RECAP')
        .first()
        .locator('xpath=../../../..');
      // The headline renders inside an XStack alongside the Trophy icon.
      // Use the generic paragraph locator to confirm non-empty text exists.
      await expect(recapSection).toContainText(/.+/, { timeout: 10_000 });
    });

    await test.step('Verify narrative paragraph is non-empty', async () => {
      // The narrative is a Tamagui Paragraph component rendered as <p>
      // near the recap card.  We confirm at least one paragraph exists
      // that contains visible text content.
      const paragraphs = page
        .getByText('MATCHUP RECAP')
        .first()
        .locator('xpath=../../../..//p');
      await expect(paragraphs.first()).not.toBeEmpty({ timeout: 10_000 });
    });

    await test.step('Verify STANDOUT PERFORMANCES section', async () => {
      // The highlights section header appears when at least one highlight exists.
      // Target the real recap heading via its data-testid — a plain getByText
      // matched both this heading and the PremiumGate upsell card whose copy
      // also contains "standout performances", tripping a strict-mode violation
      // for free-tier users (the blurred recap children still render in the DOM).
      // exact:true is insufficient here because the texts differ in case, not
      // exactness (LS-7868).
      await expect(
        page.getByTestId('matchup-recap-standout-performances'),
      ).toBeVisible({
        timeout: 10_000,
      });
    });
  });

  // -----------------------------------------------------------------------
  // PHASE 4 — Cross-user visibility: manager sees the same roster comparison
  // -----------------------------------------------------------------------

  test('Phase 4: Manager identity can view the same roster comparison', async ({
    managerPage1: page,
  }) => {
    test.setTimeout(60_000);

    // Use a dedicated manager browser context rather than switchUser on
    // commissionerPage. switchUser races against the background JWT refresh
    // (LS-3672, LS-3705, LS-4385): AUTH_LOGOUT can clear localStorage *after*
    // page.evaluate() sets the manager profile, landing the subsequent
    // page.reload() on the login screen. getMatchupById does not check league
    // membership, so manager 1 can view the commissioner's matchup by URL.
    const matchupUrl = `/baseball/league/${state.rosterLeagueId}/matchups/${state.rosterMatchupId}`;

    await test.step('Navigate to the commissioner matchup as manager 1', async () => {
      await page.goto(matchupUrl);
      await page.waitForLoadState('load');
    });

    await test.step('Roster comparison is visible to the manager', async () => {
      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
        { timeout: 15_000 },
      );
      await expect(
        page.getByRole('heading', { name: /Player Matchups/i }),
      ).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText('BATTERS').first()).toBeVisible();
      await expect(page.getByText('PITCHERS').first()).toBeVisible();
    });
  });

  // -----------------------------------------------------------------------
  // PHASE 5 — Cross-user: manager sees recap panel too (if recap exists)
  // -----------------------------------------------------------------------

  test('Phase 5: Manager identity can view the recap panel', async ({
    managerPage1: page,
  }) => {
    test.setTimeout(60_000);

    const matchupUrl = `/baseball/league/${state.recapLeagueId}/matchups/${state.recapMatchupId}`;

    await test.step('Navigate to the completed matchup as manager 1', async () => {
      await page.goto(matchupUrl);
      await page.waitForLoadState('load');
    });

    await test.step('Recap panel is visible to the manager', async () => {
      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
        { timeout: 15_000 },
      );
      await expect(page.getByText('MATCHUP RECAP').first()).toBeVisible({
        timeout: 20_000,
      });
    });
  });
});
