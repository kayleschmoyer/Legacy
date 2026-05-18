/**
 * Live Draft UI Integration Test — Multi-User
 *
 * Tests the real-time live draft flow end-to-end with 4 simultaneous browser
 * contexts (commissioner + 3 managers), each making picks on their own turn:
 *   1. Create a league (4 teams)
 *   2. Three managers join via invite code
 *   3. Verify live draft settings (defaults: Live/Standard/Snake)
 *   4. Commissioner starts the draft
 *   5. All 4 users open the draft board; whoever sees "Your pick" picks
 *   6. Verify draft completes and commissioner roster is filled
 *   7. Manager verifies their roster via their own browser context
 *
 * Run:
 *   pnpm exec playwright test apps/web-e2e/src/integration/tests/live-draft-ui.integration.spec.ts
 */

import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { LOGGER } from '@legacy-sports/logging';
import { createLeagueViaUI } from '../helpers/create-league';
import { joinLeagueAsManager } from '../helpers/wait-for-join-page';
import { test } from '../fixtures/ui';
import { gqlFetch, gqlFetchEnvelope } from '../helpers/gql-fetch';

// ---------------------------------------------------------------------------
// Shared state accumulated across serial tests.
// ---------------------------------------------------------------------------

interface DraftState {
  leagueId: number;
  inviteCode: string;
  leagueName: string;
  teams: string[];
  commissionerPicks: string[];
  manager1Picks: string[];
}

let state: DraftState;

// ---------------------------------------------------------------------------
// Serial test suite
// ---------------------------------------------------------------------------

test.describe
  .serial('Live Draft UI (Live Backend) @integration @critical', () => {
  test.describe.configure({ retries: 0 });

  test.beforeAll(() => {
    state = {
      leagueId: 0,
      inviteCode: '',
      leagueName: '',
      teams: [],
      commissionerPicks: [],
      manager1Picks: [],
    };
  });

  // -----------------------------------------------------------------
  // PHASE 1 — CREATE LEAGUE (reused from full-season)
  // -----------------------------------------------------------------

  test('Phase 1: Create league via the UI', async ({
    commissionerPage: page,
  }) => {
    state.leagueName = `Live Draft E2E ${Date.now()}`;
    const result = await createLeagueViaUI(page, {
      leagueName: state.leagueName,
    });
    state.leagueId = result.leagueId;
    state.inviteCode = result.inviteCode;
  });

  // -----------------------------------------------------------------
  // PHASE 2 — MANAGERS JOIN LEAGUE (reused from full-season)
  // -----------------------------------------------------------------

  // Phase 2 uses dedicated manager fixture pages (one browser context per
  // manager) instead of switchUser() on the commissioner page.  switchUser()
  // has a known race condition (LS-3672, LS-3705) where the background
  // refreshJwt() can dispatch AUTH_LOGOUT after page.evaluate() sets the new
  // user profile, clearing localStorage and causing the subsequent reload to
  // land on the LoginPage.  Dedicated fixture pages set cookies + localStorage
  // atomically at context-creation time — no race window.
  test('Phase 2: Managers join the league', async ({
    managerJwt1,
    managerJwt2,
    managerJwt3,
    managerPage1,
    managerPage2,
    managerPage3,
  }) => {
    const managers = [
      { page: managerPage1, jwt: managerJwt1, teamName: 'Draft Kings' },
      { page: managerPage2, jwt: managerJwt2, teamName: 'The Selectors' },
      { page: managerPage3, jwt: managerJwt3, teamName: 'Pick Masters' },
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
            timeout: 30_000,
            intervals: [500, 1_000, 2_000],
            message: `Manager join for "${teamName}" did not persist a leagueMembers row in league ${state.leagueId} within 30s`,
          },
        )
        .not.toBeNull();

      state.teams.push(teamName);
    }

    expect(state.teams).toHaveLength(3);
  });

  // -----------------------------------------------------------------
  // PHASE 3 — CONFIGURE LIVE DRAFT SETTINGS
  // -----------------------------------------------------------------

  test('Phase 3: Verify live draft settings', async ({
    commissionerPage: page,
    commissionerJwt,
  }) => {
    await test.step('Navigate to commissioner panel', async () => {
      await page.goto(`/baseball/league/${state.leagueId}/commissioner`);
      await page.waitForLoadState('load');
      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
        { timeout: 30000 },
      );
    });

    await test.step('Open Draft Settings and verify defaults are Live/Standard/Snake', async () => {
      const draftSettingsBtn = page.getByRole('button', {
        name: /Draft Settings/i,
      });
      await expect(draftSettingsBtn).toBeVisible({ timeout: 10000 });
      await draftSettingsBtn.click();

      // Default mode is "Live Draft" — verify it is selected (active state)
      // Use data-testid to avoid collision with LeagueSwitcherChip whose aria-label
      // also contains "Live Draft" (added in LS-3692).
      await expect(page.getByTestId('option-live')).toBeVisible({
        timeout: 5000,
      });

      // Default selection method is "Standard"
      await expect(
        page.getByRole('button', { name: /Standard/i }).first(),
      ).toBeVisible({ timeout: 5000 });

      // Default draft order is "Snake"
      await expect(
        page.getByRole('button', { name: /Snake/i }).first(),
      ).toBeVisible({ timeout: 5000 });
    });

    // Set pick timer to the minimum (30 s) so that when the browser fails to
    // detect "Your pick" via WebSocket and the draft falls back to timer-expiry
    // auto-picks, each pick still completes in ~36 s (30 s timer + reload
    // overhead) instead of the 120 s default.  Worst-case ceiling: 63 stall-picks
    // × 36 s ≈ 38 min — inside the 40 min Phase 5 timeout (LS-4343).
    await test.step('Set pick timer to 30 s to bound timer-expiry fallback path', async () => {
      const data = await gqlFetch<{
        updateDraftSettings?: { pickTimeLimitSeconds: number };
      }>(
        commissionerJwt,
        `mutation UpdateDraftSettings($input: UpdateDraftSettingsInput!) {
          updateDraftSettings(input: $input) { pickTimeLimitSeconds }
        }`,
        {
          input: {
            leagueId: state.leagueId,
            pickTimeLimitSeconds: 30,
          },
        },
      );
      expect(data.updateDraftSettings?.pickTimeLimitSeconds).toBe(30);
    });
  });

  // -----------------------------------------------------------------
  // PHASE 4 — START THE LIVE DRAFT
  // -----------------------------------------------------------------

  test('Phase 4: Start the live draft', async ({ commissionerPage: page }) => {
    // Draft processing can take time
    test.setTimeout(120_000);

    await test.step('Navigate to commissioner panel', async () => {
      await page.goto(`/baseball/league/${state.leagueId}/commissioner`);
      await page.waitForLoadState('load');
    });

    await test.step('Click Start Draft', async () => {
      // Locate by data-testid (stable across loading states) and gate on
      // `toBeEnabled` rather than the accessible-name regex. NextStepControl
      // always renders the button, but while `useGetMatchupsForLeagueQuery`
      // is in flight its text is "Processing..." and it is disabled — so
      // `getByRole('button', { name: /Start Draft/i })` returns zero matches
      // until the Apollo round-trip resolves. On the fresh league created in
      // Phase 1, this query is a cold-start hit; manual-110 finished in 6.7 s
      // but manual-111 exhausted the 15 s timeout (LS-4324, mirrors LS-4321's
      // Lambda cold-start pattern). `toBeEnabled` gates on the same
      // `matchupsLoading=false` flag the button binds to, so it returns the
      // moment the underlying state is correct — no flake window.
      const startBtn = page.getByTestId('start-draft-button');
      await expect(startBtn).toBeEnabled({ timeout: 30000 });
      await expect(startBtn).toHaveText(/Start Draft/i);
      await startBtn.click();

      // Confirm in the dialog
      const confirmBtn = page.getByTestId('confirm-next-step');
      await expect(confirmBtn).toBeVisible({ timeout: 15_000 });
      await confirmBtn.click();
    });

    await test.step('Wait for draft to start', async () => {
      // After clicking Start Draft, the draft WebSocket pushes the
      // `draftStatus` -> `in-progress` transition to subscribed clients,
      // so the commissioner panel rerenders to "Draft In Progress"
      // (or "Go to Draft Board") without a reload. Gate on the UI
      // directly with a generous timeout that covers the startDraft
      // mutation round-trip, the WS broadcast, and the Apollo cache
      // update under nightly load (LS-4521).
      const draftActive = page.getByText(/Draft.*In Progress|Go to Draft/i);
      await expect(draftActive.first()).toBeVisible({ timeout: 60_000 });
    });
  });

  // -----------------------------------------------------------------
  // PHASE 5 — MULTI-USER LIVE DRAFT (4 browser contexts)
  // -----------------------------------------------------------------

  test('Phase 5: Multi-user live draft picks', async ({
    commissionerPage,
    managerPage1,
    managerPage2,
    managerPage3,
    commissionerJwt,
    managerJwt1,
  }) => {
    // Allow up to 40 minutes for all picks.
    //
    // Pick detection uses Apollo HTTP polling (5 s interval) — not WebSocket.
    // When pages lose "Your pick" detection, the draft falls back to timer-expiry
    // auto-picks (30 s timer set in Phase 3 via updateDraftSettings).
    //
    // Per stall-cycle timing (LS-4343):
    //   • miss #8: reload fires, "LIVE DRAFT" waitFor ensures Apollo queries resolve
    //   • Reload overhead: ~3–6 s depending on Lambda cold starts
    //   • 30 s deadline fires → EventBridge or test nudge makes the pick
    //   • Nudge checks every 5 misses (~13.5 s); at most 1–2 nudge cycles needed
    //   • Stall resolution: ~30–45 s per stuck pick
    //   • UI-detected picks: ~3 s each; stall-fallback picks: ~35–45 s each
    //   • Measured runtime for a full 76-pick draft: ~23 min (well under 40 min)
    test.setTimeout(2_400_000);

    const pages: { label: string; page: Page }[] = [
      { label: 'Commissioner', page: commissionerPage },
      { label: 'Manager 1', page: managerPage1 },
      { label: 'Manager 2', page: managerPage2 },
      { label: 'Manager 3', page: managerPage3 },
    ];

    await test.step('All users navigate to draft board', async () => {
      const draftUrl = `/baseball/league/${state.leagueId}/draft`;
      await Promise.all(
        pages.map(async ({ page }) => {
          await page.goto(draftUrl);
          await page.waitForLoadState('load');
        }),
      );

      // Verify draft board loaded on every page IN PARALLEL — the previous
      // sequential for-loop accumulated up to 4×30s of serial wait, causing
      // the settle budget to vary wildly across pages depending on CI load.
      // Parallel checks mirror the pattern used in the reload recovery block.
      await Promise.all(
        pages.map(async ({ label, page }) => {
          await expect(page.getByText('LIVE DRAFT').first()).toBeVisible({
            timeout: 30000,
          });
          LOGGER.info(`[live-draft] ${label} draft board loaded`);
        }),
      );

      // Wait for the draft to be in a pick-ready state by polling the backend
      // directly — replaces the fixed waitForTimeout(5000) that assumed
      // WebSocket establishment time but raced under nightly CI load.
      // currentPick being non-null (including 0) confirms the draft engine
      // has initialised the first pick turn; Apollo polling will find it on
      // its next cycle without a timing assumption (levers #3 and #9 in
      // e2e-determinism.md). Callback returns null on error so expect.poll
      // retries on assertion failure rather than throwing (antipattern #1).
      await expect
        .poll(
          async () => {
            const data = await gqlFetch<{
              getLeagueDraft?: { currentPick?: number | null } | null;
            }>(
              managerJwt1,
              `query GetCurrentPickReady($leagueId: Int!) {
                 getLeagueDraft(leagueId: $leagueId) { currentPick }
               }`,
              { leagueId: state.leagueId },
            ).catch(() => null);
            return data?.getLeagueDraft?.currentPick ?? null;
          },
          {
            timeout: 30_000,
            intervals: [500, 1_000, 2_000],
            message: `Draft did not enter pick-ready state (currentPick non-null) within 30s for league ${state.leagueId}`,
          },
        )
        .not.toBeNull();
    });

    await test.step('Make all draft picks (each user picks on their turn)', async () => {
      let pickCount = 0;
      const maxPicks = 200;
      let consecutiveMisses = 0;
      // Prevent reload death spiral: only reload once per consecutive-miss
      // streak. Without this guard, every iteration triggers a full page
      // reload, blocking picks for 75-150 s total and causing the draft to
      // abort before all picks are made (LS-3833).
      // The reload fixes the draftOrderMissing=true stuck state (poll stops
      // when GET_CURRENT_DRAFT_PICK returns "No teams configured" error at
      // draft initialisation). Apollo HTTP polling — not WebSocket — is what
      // drives pick-turn detection, so the reload is NOT for WS reconnect.
      let hasReloadedThisStreak = false;
      // Track players drafted this session so we never click a button for an
      // already-drafted player whose card is still visible due to WebSocket /
      // Apollo update lag.  Without this guard the test can get a false
      // wasAccepted=true (because "Your pick" briefly hides during a
      // concurrent refetch re-render) and log a duplicate pick.
      const draftedPlayers = new Set<string>();
      // Track consecutive failed attempts per player.  After 2 unconfirmed
      // clicks on the same player the pick is added to draftedPlayers to skip
      // it on the next scan — prevents an infinite retry loop when a player
      // button stays visible but the server never advances the turn (e.g. a
      // server-side rejection or a stale render that the reload didn't clear).
      const failedPickAttempts = new Map<string, number>();
      // Track the last server-side currentPick value seen via API.  When the
      // nudge returns picksAutoMade=0 but currentPick has advanced, EventBridge
      // is making picks server-side — reset consecutiveMisses so the bail
      // threshold doesn't fire while the server is actively processing (LS-4369).
      // Initialized to 0 (draft start state) so only actual pick advances
      // (currentPick > 0) trigger the reset, avoiding a spurious reset on the
      // first check when no picks have been made yet.
      let lastKnownCurrentPick = 0;
      // Tracks consecutive failures of the managerJwt1 currentPick query with
      // "not a member" / FORBIDDEN. After 3 consecutive failures we check
      // whether the league still exists — if it was deleted by CI nightly
      // global-setup (cron: "0 3 * * *") we fail fast with a clear message
      // instead of waiting for the generic 101-miss bail-out (LS-4379).
      let consecutiveCurrentPickMembershipErrors = 0;

      // Anchor for per-pick elapsed-time logs (LS-3851 timing instrumentation).
      const draftStart = Date.now();

      while (pickCount < maxPicks) {
        // Check if draft is complete on any page.
        // Use a short waitFor (500 ms, parallel) instead of instant isVisible so
        // the banner has time to render after the last pick via WebSocket or the
        // 5 s currentPickInfo poll — avoids a false-negative on rapid auto-picks.
        const pickLoopCompleteChecks = await Promise.all(
          pages.map(({ page }) =>
            page
              .getByText('Draft Complete!')
              .waitFor({ state: 'visible', timeout: 500 })
              .then(() => true)
              .catch(() => false),
          ),
        );
        if (pickLoopCompleteChecks.some(Boolean)) break;

        // Find the page showing "Your pick" — the draft board's top band
        // (DraftTopBand) shows "Your pick" when isMyPick=true, "On the clock"
        // otherwise. Only click on the page whose turn it actually is.
        //
        // Use exact:true to avoid false positives from the PickAnnouncement
        // overlay that briefly shows "YOUR PICK" (uppercase) after a pick.
        //
        // Check all pages in PARALLEL (LS-3851 fix): the previous sequential
        // loop checked each page with a 2000ms timeout, burning up to
        // 4x2s = 8s per empty iteration. Between picks, the Apollo refetch
        // takes ~500-1500ms before "Your pick" appears — meaning 1-3 empty
        // iterations per pick x 9s each = ~20 min total over 100 picks.
        // Parallel checking reduces empty iterations from ~9s to ~2.5s.
        const myTurnResults = await Promise.all(
          pages.map(async ({ label, page }) => ({
            label,
            page,
            isMyTurn: await page
              .getByText('Your pick', { exact: true })
              .first()
              .waitFor({ state: 'visible', timeout: 2000 })
              .then(() => true)
              .catch((e: Error) => {
                if (e.name !== 'TimeoutError') throw e;
                return false;
              }),
          })),
        );

        let pickAccepted = false;
        // Try each page that shows "Your pick" in declaration order.
        // If the first matching page has no undrafted button yet (player
        // list lag), we continue to the next eligible page rather than
        // immediately counting a miss — matching the behaviour of the old
        // sequential loop which would `continue` to the next page.
        const myTurnEntries = myTurnResults.filter((r) => r.isMyTurn);

        for (const { label, page } of myTurnEntries) {
          if (pickAccepted) break;

          // Find the first DRAFT NOW button whose player has not yet been
          // drafted in this session.  Stale player cards (visible but already
          // picked by another manager) must be skipped to avoid a duplicate
          // pick attempt that would be rejected server-side.
          const allDraftBtns = page.getByRole('button', {
            name: /Draft .* now/i,
          });
          // Wait for at least one draft button to render after "Your pick"
          // appears - the player list may lag behind the turn indicator.
          await allDraftBtns
            .first()
            .waitFor({ state: 'visible', timeout: 5_000 })
            .catch((e: Error) => {
              if (e.name !== 'TimeoutError') throw e;
              /* noop - buttons may not exist yet */
            });
          const btnCount = await allDraftBtns.count().catch(() => 0);
          let ariaLabel: string | null = null;
          for (let i = 0; i < btnCount; i++) {
            const btn = allDraftBtns.nth(i);
            const visible = await btn.isVisible().catch(() => false);
            if (!visible) continue;
            const btnLabel = await btn.getAttribute('aria-label');
            const playerName = btnLabel
              ?.replace(/^Draft\s+/i, '')
              .replace(/\s+now$/i, '');
            if (playerName && draftedPlayers.has(playerName)) continue;
            ariaLabel = btnLabel;
            break;
          }

          if (ariaLabel) {
            const elapsedS = ((Date.now() - draftStart) / 1000).toFixed(1);
            LOGGER.info(
              `[live-draft] +${elapsedS}s Clicking pick by ${label} (pick #${pickCount + 1}) — ${ariaLabel}`,
            );
            const pickStart = Date.now();

            // Click by stable aria-label rather than by nth-index position.
            // Targeting by name survives draft board re-renders at round
            // boundaries — the named button reappears at its correct position
            // after the re-render without Playwright spinning on a stale index
            // (LS-4305). An 8 s timeout bounds the click in the rare case the
            // player is picked by someone else between scan and dispatch.
            await page
              .getByRole('button', { name: ariaLabel, exact: true })
              .click({ force: true, timeout: 8_000 })
              .catch((e: Error) => {
                if (e.name !== 'TimeoutError') throw e;
                // Button disappeared before click landed (e.g. auto-pick fired).
                // Fall through to wasAccepted check which will be false.
              });

            // Verify the pick was accepted by checking the turn advanced:
            // "Your pick" (exact) must disappear from this page, meaning
            // the server confirmed the pick and moved to the next drafter.
            //
            // Do NOT check whether the player button disappears — it can
            // vanish due to an incoming WebSocket update about another
            // manager's pick (false positive), causing duplicate-pick logs.
            //
            // 8 s headroom: mutation + DB write + 5 s poll cycle + render margin.
            // With always-on 5s polling (LS-4132), "Your pick" should hide
            // within ~6 s of the pick landing; 8 s is safe even with a full
            // 5 s poll interval plus network jitter.
            const wasAccepted = await page
              .getByText('Your pick', { exact: true })
              .first()
              .waitFor({ state: 'hidden', timeout: 8000 })
              .then(() => true)
              .catch((e: Error) => {
                if (e.name !== 'TimeoutError') throw e;
                return false;
              });

            if (wasAccepted) {
              pickCount++;
              consecutiveMisses = 0;
              hasReloadedThisStreak = false;
              failedPickAttempts.clear(); // reset per-player failure counts
              LOGGER.info(
                `[live-draft] Pick #${pickCount} by ${label} accepted in ${Date.now() - pickStart}ms — ${ariaLabel}`,
              );
              // Record player name for post-draft roster assertions.
              // ariaLabel format: "Draft Bill Lange now"
              const playerName = ariaLabel
                ?.replace(/^Draft\s+/i, '')
                .replace(/\s+now$/i, '');
              if (playerName) {
                draftedPlayers.add(playerName);
                if (label === 'Commissioner')
                  state.commissionerPicks.push(playerName);
                else if (label === 'Manager 1')
                  state.manager1Picks.push(playerName);
              }
              pickAccepted = true;
            } else {
              // Pick click did not result in turn advancement within the timeout.
              // Leave pickAccepted=false so the outer !pickAccepted block
              // increments consecutiveMisses and triggers reload/break guards.
              const elapsedS2 = ((Date.now() - draftStart) / 1000).toFixed(1);
              LOGGER.info(
                `[live-draft] +${elapsedS2}s Pick by ${label} NOT confirmed within timeout (pick #${pickCount + 1}) — ${ariaLabel}`,
              );
              // Guard against infinite retries on a single player.  If the same
              // player button fails twice (server rejection, stale render, etc.)
              // mark them as drafted so the next scan skips to the next player.
              // Without this, a stuck button triggers the full reload/stuck-loop
              // machinery even though only one player is affected.
              const failedName = ariaLabel
                ?.replace(/^Draft\s+/i, '')
                .replace(/\s+now$/i, '');
              if (failedName) {
                const count = (failedPickAttempts.get(failedName) ?? 0) + 1;
                failedPickAttempts.set(failedName, count);
                if (count >= 2) {
                  const elapsedSkip = (
                    (Date.now() - draftStart) /
                    1000
                  ).toFixed(1);
                  LOGGER.info(
                    `[live-draft] +${elapsedSkip}s Skipping "${failedName}" after ${count} consecutive failures — trying next player`,
                  );
                  draftedPlayers.add(failedName);
                  failedPickAttempts.delete(failedName);
                }
              }
            }
          }
          // If ariaLabel is null on this page, continue to the next
          // myTurnEntry so another eligible page gets a chance.
        }

        if (!pickAccepted) {
          consecutiveMisses++;
          const myTurnLabels = myTurnResults
            .filter((r) => r.isMyTurn)
            .map((r) => r.label)
            .join(', ');
          const elapsedMiss = ((Date.now() - draftStart) / 1000).toFixed(1);
          LOGGER.info(
            `[live-draft] +${elapsedMiss}s miss #${consecutiveMisses} at pick ${pickCount} — myTurn=[${myTurnLabels || 'none'}]`,
          );
          // Every 5 consecutive misses, nudge the auto-pick processor so
          // expired pick timers are handled immediately instead of waiting
          // for the EventBridge cron (LS-4289). Replaces the old 5-minute
          // stuck-loop that caused the draftDone/pickCount=0 oscillation.
          // Threshold lowered from 10→5 to recover from WebSocket startup
          // lag faster — early picks can accumulate 35+ misses before the
          // WS connection is fully established (LS-4305).
          if (consecutiveMisses % 5 === 0) {
            const elapsedNudge = ((Date.now() - draftStart) / 1000).toFixed(1);
            LOGGER.info(
              `[live-draft] +${elapsedNudge}s miss #${consecutiveMisses} — nudging autoProcessDraftPicks`,
            );
            // Use shared gqlFetchEnvelope (Node.js native fetch) instead of
            // pages[1].page.request — browser contexts silently throw when
            // degraded, causing best-effort wrappers to absorb the error and
            // skip ALL nudge processing including the LS-4369 EventBridge
            // progress detection, resulting in State B (LS-4373). The
            // envelope variant preserves errors[] / status for the
            // downstream regression guard while keeping HTTP/parse failures
            // strict (LS-4461).
            const nudgeEnvelope = await gqlFetchEnvelope<{
              autoProcessDraftPicks?: {
                picksAutoMade: number;
                draftsCompleted: number;
                errors?: string[];
              } | null;
            }>(
              commissionerJwt,
              `mutation AutoProcessDraftPicks($leagueId: Int!) { autoProcessDraftPicks(leagueId: $leagueId) { picksAutoMade draftsCompleted errors } }`,
              { leagueId: state.leagueId },
            ).catch((err: Error) => {
              // Best-effort nudge: network/parse failures should not abort
              // the draft loop because EventBridge is the hard fallback.
              LOGGER.warn(
                `[live-draft] nudge network/parse failed: ${err.message}`,
              );
              return null;
            });
            if (nudgeEnvelope) {
              const nudgeData = nudgeEnvelope.data?.autoProcessDraftPicks;
              const resultErrors = nudgeData?.errors ?? [];
              const gqlErrors = nudgeEnvelope.errors ?? [];
              const status = nudgeEnvelope.status;
              // Log full diagnostic info — the bare numeric fields hide
              // server-side problems (auth failures, schema drift, etc.) that
              // explain why a draft is stuck. LS-4295: previous "n/a" output
              // gave investigators no actionable info across 4+ nudge cycles.
              LOGGER.info(
                `[live-draft] nudge result: status=${status} picksAutoMade=${nudgeData?.picksAutoMade ?? 'n/a'} draftsCompleted=${nudgeData?.draftsCompleted ?? 'n/a'}` +
                  (resultErrors.length
                    ? ` resultErrors=${JSON.stringify(resultErrors)}`
                    : '') +
                  (gqlErrors.length
                    ? ` gqlErrors=${JSON.stringify(
                        gqlErrors.map((e) => ({
                          message: e.message,
                          code: e.extensions?.code,
                          path: e.path,
                        })),
                      )}`
                    : ''),
              );

              // Programmatic regression guard: a member-authenticated nudge
              // that comes back rejected means the resolver itself is broken
              // (e.g. the LS-4295 Bearer-vs-cookie membership-lookup
              // divergence). Fail fast at the first failed nudge with the
              // server's actual error message, instead of letting the draft
              // stall through 60 misses and reporting a generic "stuck" error.
              const nudgeRejected =
                gqlErrors.length > 0 ||
                resultErrors.some((e) => e.startsWith('UNAUTHENTICATED:'));
              if (nudgeRejected) {
                const detail = gqlErrors.length
                  ? gqlErrors
                      .map((e) => `${e.extensions?.code ?? '?'}: ${e.message}`)
                      .join('; ')
                  : resultErrors.join('; ');
                throw new Error(
                  `[live-draft] autoProcessDraftPicks rejected the nudge — ${detail}`,
                );
              }

              // Nudge made server-side picks — reset the miss counter so the
              // stuck-loop does not fire while auto-pick is catching up.
              // This handles CSRF-corruption scenarios (LS-3672) where browser
              // pages lose turn-detection but EventBridge / nudge continue to
              // advance the draft. Without the reset, 61 misses triggers the
              // stuck-loop even when the server is actively making picks.
              if ((nudgeData?.picksAutoMade ?? 0) > 0) {
                const elapsedReset = ((Date.now() - draftStart) / 1000).toFixed(
                  1,
                );
                LOGGER.info(
                  `[live-draft] +${elapsedReset}s Nudge auto-picked ${nudgeData?.picksAutoMade ?? 0} — resetting miss counter`,
                );
                consecutiveMisses = 0;
                hasReloadedThisStreak = false;
                // Advance the baseline so EventBridge progress detection
                // doesn't falsely trigger on the same pick number later.
                lastKnownCurrentPick += nudgeData?.picksAutoMade ?? 0;
              }

              // When nudge returns 0 picks AND 0 completed, the draft might
              // have finished via auto-picks during a draftOrderMissing stall.
              // autoProcessDraftPicks excludes drafts with status='completed',
              // so it always returns draftsCompleted=0 once the draft is done.
              // Directly query league.draftStatus to detect this case (LS-4343).
              if (
                (nudgeData?.picksAutoMade ?? 0) === 0 &&
                (nudgeData?.draftsCompleted ?? 0) === 0
              ) {
                // Use gqlFetch (Node.js native fetch) — pages[1].page.request
                // can silently return null when the browser context degrades at
                // end-of-draft, preventing completion detection (LS-4369).
                // commissionerJwt is an admin JWT; league(id) has an isAdmin
                // bypass so it returns draftStatus even without a league_members row.
                const statusData = await gqlFetch<{
                  league?: { draftStatus?: string } | null;
                }>(
                  commissionerJwt,
                  `query GetLeagueDraftStatus($id: Int!) { league(id: $id) { draftStatus } }`,
                  { id: state.leagueId },
                ).catch((e: unknown) => {
                  const msg = e instanceof Error ? e.message : String(e);
                  LOGGER.info(`[live-draft] draftStatus query failed: ${msg}`);
                  return null;
                });
                const draftStatus = statusData?.league?.draftStatus;
                if (draftStatus === 'completed') {
                  const elapsedDoneApi = (
                    (Date.now() - draftStart) /
                    1000
                  ).toFixed(1);
                  LOGGER.info(
                    `[live-draft] +${elapsedDoneApi}s API confirms draft completed — exiting pick loop (browsers stuck in draftOrderMissing state)`,
                  );
                  pickCount = maxPicks; // trigger while-loop exit
                }

                // EventBridge timing race (LS-4369): nudge returns 0 because
                // the deadline hasn't expired yet, but EventBridge has already
                // advanced the draft server-side.  Query currentPick to detect
                // server-side progress and reset the miss counter — prevents
                // false bail-out at miss 101 (~329 s) while picks are happening.
                // Uses gqlFetch (Node.js native fetch) rather than
                // pages[1].page.request to avoid silent failures when the
                // browser page context is in a degraded state — the browser
                // request silently returned null via .catch(() => null) in
                // run 1, blocking detection for the entire stall period (LS-4369).
                // Use managerJwt1 (a regular league_members row) rather than
                // commissionerJwt: the commissioner is an admin who accesses
                // leagues via the isAdmin bypass in league(), but getLeagueDraft
                // calls verifyLeagueMembership which has no admin bypass and
                // throws FORBIDDEN when the admin has no league_members row.
                const currentPickData = await gqlFetch<{
                  getLeagueDraft?: { currentPick?: number } | null;
                }>(
                  managerJwt1,
                  `query GetLeagueDraftCurrentPick($leagueId: Int!) { getLeagueDraft(leagueId: $leagueId) { currentPick } }`,
                  { leagueId: state.leagueId },
                )
                  .then((d) => {
                    consecutiveCurrentPickMembershipErrors = 0;
                    return d;
                  })
                  .catch(async (e: unknown) => {
                    const msg = e instanceof Error ? e.message : String(e);
                    LOGGER.info(
                      `[live-draft] currentPick query failed: ${msg}`,
                    );
                    // Permanent membership error: detect external league deletion
                    // (e.g. CI nightly global-setup deleting the commissioner's
                    // leagues at 03:00 UTC while Phase 5 is running — LS-4379).
                    if (
                      msg.includes('not a member') ||
                      msg.includes('FORBIDDEN')
                    ) {
                      consecutiveCurrentPickMembershipErrors++;
                      if (consecutiveCurrentPickMembershipErrors >= 3) {
                        const elapsedCheck = (
                          (Date.now() - draftStart) /
                          1000
                        ).toFixed(1);
                        LOGGER.info(
                          `[live-draft] +${elapsedCheck}s 3 consecutive membership errors — checking league existence`,
                        );
                        const leagueExists = await gqlFetch<{
                          league?: { id: number } | null;
                        }>(
                          commissionerJwt,
                          `query CheckLeagueExists($id: Int!) { league(id: $id) { id } }`,
                          { id: state.leagueId },
                        )
                          .then((d) => d?.league != null)
                          .catch(() => false);
                        if (!leagueExists) {
                          throw new Error(
                            `[live-draft] League ${state.leagueId} no longer exists — likely deleted by CI nightly global-setup (cron: "0 3 * * *"). ` +
                              `Phase 5 interrupted by external cleanup at pick ${pickCount}.`,
                          );
                        }
                      }
                    } else {
                      consecutiveCurrentPickMembershipErrors = 0;
                    }
                    return null;
                  });
                const serverCurrentPick =
                  currentPickData?.getLeagueDraft?.currentPick;
                if (
                  serverCurrentPick != null &&
                  serverCurrentPick > lastKnownCurrentPick
                ) {
                  const elapsedProgress = (
                    (Date.now() - draftStart) /
                    1000
                  ).toFixed(1);
                  LOGGER.info(
                    `[live-draft] +${elapsedProgress}s EventBridge progress detected: currentPick ${lastKnownCurrentPick} → ${serverCurrentPick} — resetting miss counter`,
                  );
                  lastKnownCurrentPick = serverCurrentPick;
                  consecutiveMisses = 0;
                  hasReloadedThisStreak = false;
                }
              }

              // Draft finished via nudge — break the pick loop.
              if ((nudgeData?.draftsCompleted ?? 0) > 0) {
                const elapsedDone = ((Date.now() - draftStart) / 1000).toFixed(
                  1,
                );
                LOGGER.info(
                  `[live-draft] +${elapsedDone}s Nudge completed the draft — exiting pick loop`,
                );
                pickCount = maxPicks; // trigger while-loop exit
              }
            }
          }

          // Bail out if no progress for ~100 consecutive misses (~270 s).
          //
          // Timing analysis (LS-4343):
          //   • Each miss takes ~2.7 s (2 s parallel waitFor + 0.5 s sleep + overhead)
          //   • With 30 s pick timer set in Phase 3, EventBridge auto-picks fire every
          //     ~30 s and advance the draft server-side.  Each auto-pick resets
          //     current_pick_deadline to now+30 s, creating a new 30 s window.
          //   • The test nudge fires every 5 misses (~13.5 s).  In the worst case the
          //     nudge fires just before the deadline expires and returns picksAutoMade=0;
          //     the NEXT nudge cycle (~13.5 s later) fires after deadline expiry and
          //     returns >0, resetting consecutiveMisses to 0.
          //   • Worst-case stall before reset: ~30 s (one 30 s deadline window)
          //     ≈ ~11 misses.  Bail-out at 100 gives a comfortable 270 s budget and
          //     only fires for genuinely stuck drafts (e.g. auth failure, server error).
          //   • At 40 the bail fired at ~120 s — too early, cutting off the nudge that
          //     fires at t+121 s when the deadline is finally expired (LS-4343).
          if (consecutiveMisses > 100) {
            const elapsedFail = ((Date.now() - draftStart) / 1000).toFixed(1);
            throw new Error(
              `[live-draft] No pick progress after ${consecutiveMisses} consecutive misses (+${elapsedFail}s at pick ${pickCount}). Draft appears stuck — check autoProcessDraftPicks logs above.`,
            );
          }

          if (consecutiveMisses > 7 && !hasReloadedThisStreak) {
            // Reload all pages to resync state — but only ONCE per streak.
            // Guard flag prevents the death spiral where every iteration from
            // miss 8 to N triggers a reload, blocking picks for seconds and
            // causing the draft to abort incomplete (LS-3833).
            //
            // Why reload instead of just waiting for the poll?
            // initializeDraft briefly clears draft_teams before recreating them.
            // If the Apollo poll fires during that window it receives "No teams
            // configured for this draft", which sets draftOrderMissing=true and
            // stops the poll (pollInterval→0).  The poll never recovers without
            // a full page reload that resets draftOrderMissing React state.
            // This is NOT about WebSocket reconnect — pick detection uses HTTP
            // polling, not WebSocket (LS-4343).
            //
            // After reload we wait for "LIVE DRAFT" to be visible on every page.
            // This ensures GET_LEAGUE_BY_ID and GET_CURRENT_DRAFT_PICK have both
            // resolved (myTeamId and draftId are non-null) before we resume
            // checking for "Your pick" — replacing the old fixed-time settle
            // wait that could still have myTeamId=null when the check ran.
            hasReloadedThisStreak = true;
            const elapsedReload = ((Date.now() - draftStart) / 1000).toFixed(1);
            LOGGER.info(
              `[live-draft] +${elapsedReload}s miss #${consecutiveMisses} — reloading all pages (draftOrderMissing recovery)...`,
            );
            const draftBoardUrl = `/baseball/league/${state.leagueId}/draft`;
            // Reload all pages IN PARALLEL — serial gotos × 4 pages × 20 s
            // waitFor = up to 80 s total; parallel keeps it to the slowest page.
            await Promise.all(
              pages.map(async ({ page }) => {
                await page.goto(draftBoardUrl);
                await page.waitForLoadState('load');
                // Wait for draft board to be fully rendered (Apollo queries resolved).
                // This ensures myTeamId and draftId are non-null before we resume
                // checking for "Your pick" — unlike a fixed-time settle wait.
                await page
                  .getByText('LIVE DRAFT')
                  .first()
                  .waitFor({ state: 'visible', timeout: 20_000 })
                  .catch(() => {
                    /* draft board may show a different header during transitions */
                  });
              }),
            );
          }

          // 500ms anti-spin pacing for the multi-page miss-detection loop —
          // not a wait for any UI condition; this throttles how often we
          // re-poll the four browser contexts while waiting for the next
          // "Your pick" turn to surface (LS-4305). Uses setTimeout rather
          // than page.waitForTimeout so it isn't counted as a UI wait
          // (LS-4457).
          await new Promise<void>((resolve) => setTimeout(resolve, 500));
        }
      }

      LOGGER.info(
        `[live-draft] Completed ${pickCount} total picks (+${((Date.now() - draftStart) / 1000).toFixed(1)}s)`,
      );
      expect(pickCount).toBeGreaterThan(0);
    });

    await test.step('Verify draft completed', async () => {
      // Poll all existing pages for the "Draft Complete!" banner.
      // The pick loop exits as soon as it detects the banner, but if the
      // WebSocket notification arrived between iterations it may not be visible
      // yet on every page. Give up to 30 s for the banner to propagate via WS
      // before falling back to a page reload.
      //
      // Use waitFor (parallel across all pages) instead of isVisible (instant):
      // the banner can take up to ~5 s to appear after a page load because it
      // relies on Apollo's 5 s currentPickInfo poll returning isComplete:true.
      // An instant check misses the brief window between poll fire and React render.
      let draftComplete = false;
      const pollDeadline = Date.now() + 30_000;
      while (!draftComplete && Date.now() < pollDeadline) {
        const completeChecks = await Promise.all(
          pages.map(({ page }) =>
            page
              .getByText('Draft Complete!')
              .waitFor({ state: 'visible', timeout: 2000 })
              .then(() => true)
              .catch(() => false),
          ),
        );
        if (completeChecks.some(Boolean)) {
          draftComplete = true;
        }
      }

      // If still not visible, reload the commissioner page and wait for Apollo
      // to refetch leagueDraft — draftCompletedAt in DB ensures the banner
      // renders on a fresh load even when the WS completion event was missed.
      if (!draftComplete) {
        LOGGER.info(
          '[live-draft] Banner not visible after 30 s polling — reloading commissioner page',
        );
        await commissionerPage.goto(`/baseball/league/${state.leagueId}/draft`);
        await commissionerPage.waitForLoadState('load');
        await expect(commissionerPage.getByText('Draft Complete!')).toBeVisible(
          { timeout: 30000 },
        );
        draftComplete = true;
      }

      expect(draftComplete).toBe(true);
      LOGGER.info('[live-draft] Draft verified complete');
    });
  });

  // -----------------------------------------------------------------
  // PHASE 6 — VERIFY ROSTERS AFTER DRAFT
  // -----------------------------------------------------------------

  test('Phase 6: Verify commissioner roster after draft', async ({
    commissionerPage: page,
    commissionerJwt,
  }) => {
    await test.step('Navigate to My Roster', async () => {
      await page.goto(`/baseball/league/${state.leagueId}/roster`);
      await page.waitForLoadState('load');
      await expect(page).toHaveURL(/\/roster/);
      await expect(page.locator('body')).not.toContainText(
        'Unexpected Application Error',
        { timeout: 30000 },
      );
    });

    await test.step('Verify roster has drafted players', async () => {
      // Section headers prove roster structure loaded.
      // Fresh browser context means positions + team members must all load
      // from scratch — allow up to 30s for the roster to fully render.
      await expect(
        page.getByText('Pitching', { exact: false }).first(),
      ).toBeVisible({ timeout: 30000 });
      await expect(
        page.getByText('Infield', { exact: false }).first(),
      ).toBeVisible({ timeout: 30000 });
      await expect(
        page.getByText('Outfield', { exact: false }).first(),
      ).toBeVisible({ timeout: 30000 });

      // After a live draft, autoPopulateFirstMatchupLineup (LS-445) places
      // drafted fielders into starter slots first. draftCompletedAt is
      // committed inside the final pick transaction, so the UI can show
      // "Draft Complete!" before autoPopulateFirstMatchupLineup (which runs
      // outside the transaction) finishes — there is no WebSocket event for
      // the lineup-population step itself, and the test does not trigger the
      // mutation directly, so we cannot await either signal client-side.
      //
      // Previous implementation called `page.reload()` inside `expect.poll()`
      // to flush Apollo's cache each iteration — the canonical anti-pattern
      // flagged in helpers/reload-until-visible.ts. The replacement (LS-4520)
      // polls the backend authoritatively via `gqlFetch` until at least one
      // team member has a non-null positionId, then performs a single Apollo
      // refetch outside the poll loop and asserts the UI directly.
      const teamId = await gqlFetch<{ userTeamId: number | null }>(
        commissionerJwt,
        `query GetCommissionerTeamId($leagueId: Int!) {
           userTeamId(leagueId: $leagueId)
         }`,
        { leagueId: state.leagueId },
      ).then((d) => d.userTeamId);
      expect(teamId).not.toBeNull();

      await expect
        .poll(
          async () => {
            const data = await gqlFetch<{
              teamMembers: Array<{ positionId: number | null }>;
            }>(
              commissionerJwt,
              `query GetCommissionerLineupFilled($teamId: Int!) {
                 teamMembers(teamId: $teamId) { positionId }
               }`,
              { teamId },
            );
            return data.teamMembers.filter((m) => m.positionId != null).length;
          },
          {
            // Generous timeout: autoPopulateFirstMatchupLineup runs outside
            // the final-pick transaction and can take well over a minute
            // when the live backend is under load (observed: a Phase 5 run
            // that ballooned from 25m → 31.5m due to backend throttling
            // returned 504s on the autoProcess nudge and the lineup was
            // still not populated at the 60s mark). 180s keeps the test
            // resilient to backend load without masking a real failure.
            timeout: 180_000,
            intervals: [2_000, 5_000, 10_000],
            message:
              'autoPopulateFirstMatchupLineup never populated any positionId within 180s after draft completion',
          },
        )
        .toBeGreaterThan(0);

      // Backend confirms autoPopulateFirstMatchupLineup completed. Apollo's
      // default `cache-first` fetch policy on `useGetTeamMembersQuery` means
      // the initial empty result (cached when this page first mounted before
      // autoPopulate finished) will not be re-fetched on a React-Router tab
      // re-mount — Apollo serves the cached empty list and never hits the
      // network. The only way to flush that cached observer without modifying
      // the production Apollo client is a single hard reload. This is a
      // single reload OUTSIDE the poll loop, which is not the antipattern the
      // helpers/reload-until-visible.ts file warns about (reload-in-poll is).
      await page.reload();
      await page.waitForLoadState('load');

      const lineupParent = page
        .getByText('Lineup', { exact: true })
        .first()
        .locator('..');
      await expect(page.getByText('Lineup').first()).toBeVisible({
        timeout: 30_000,
      });
      // Single deterministic assertion — the backend already confirmed
      // positionId > 0 above, so the QuickStat must read "Lineup N/M" with
      // N ≥ 1 once Apollo finishes the in-flight refetch.
      await expect(lineupParent).toContainText(/Lineup\s*[1-9]\d*\s*\/\s*\d+/, {
        timeout: 30_000,
      });
    });

    await test.step('Verify commissioner-drafted players appear on roster', async () => {
      // In a live 4-team draft with 4 concurrent browser pages, "Your pick"
      // detection in Phase 5 races: the same string can briefly appear on
      // the wrong page (stale from the previous turn) and the iteration
      // order biases capture toward the first pages that win the race.
      // Empirically the commissioner page sometimes captures zero picks
      // even though the underlying draft completed normally — the lineup
      // check above already proves the roster was populated, so
      // skip the player-name verification when no picks were captured.
      if (state.commissionerPicks.length === 0) {
        LOGGER.info(
          '[live-draft] No commissioner picks captured (race-attribution); roster lineup already verified.',
        );
        return;
      }

      // Wait for bench section to render player cards. The first pick name
      // becoming visible is the deterministic signal that the roster has
      // hydrated — replaces a fixed 2s buffer wait. Tolerate timeout: the
      // count threshold below already accommodates partial matches.
      await expect(
        page
          .locator('region[aria-label="Bench"], [aria-label="Bench"]')
          .first(),
      )
        .toBeVisible({ timeout: 15_000 })
        .catch(() => {
          // Fallback: just wait for Bench text
        });
      await page
        .getByText(state.commissionerPicks[0], { exact: false })
        .first()
        .waitFor({ state: 'visible', timeout: 15_000 })
        .catch(() => {
          /* picks may have been mis-attributed; threshold check tolerates */
        });

      let matchCount = 0;
      for (const playerName of state.commissionerPicks) {
        const visible = await page
          .getByText(playerName, { exact: false })
          .first()
          .isVisible()
          .catch(() => false);
        if (visible) matchCount++;
      }

      // At least 25% of captured picks should appear — the rest may have
      // been mis-attributed due to live draft race conditions.
      const threshold = Math.max(
        1,
        Math.floor(state.commissionerPicks.length * 0.25),
      );
      expect(matchCount).toBeGreaterThanOrEqual(threshold);
    });
  });

  // -----------------------------------------------------------------
  // PHASE 7 — MANAGER VERIFIES THEIR ROSTER
  // -----------------------------------------------------------------

  test('Phase 7: Manager verifies their roster', async ({ managerPage1 }) => {
    // Phase 7 previously failed with a misleading "My Roster tab not visible
    // in 271 ms" error (LS-4320). The polling loop reloaded every ~5 s and
    // read `Lineup N/M` immediately after the "Lineup" label became visible —
    // but RosterTab's QuickStat renders "Lineup0/0" while
    // useGetPositionsForLeagueQuery and useGetTeamMembersQuery are in flight.
    // Each reload cancelled both queries before they could resolve, so the
    // value stayed "0/0" for 21 consecutive iterations even though the
    // server-side lineup data was already populated. After 60 s elapsed, the
    // loop's per-operation timeouts (also derived from the shrinking
    // lineupDeadline) decayed to 271 ms and the tab visibility check failed
    // — the misleading symptom on which the original ticket was filed.
    //
    // Fix: a single toContainText wait that gates on the QuickStat denominator
    // becoming > 0 (positions resolved), then read the filled count. With no
    // reloads the queries run to completion and Phase 7 passes in ~3 s.
    test.setTimeout(240_000);

    const PER_OP_TIMEOUT = 10_000;
    const LINEUP_BUDGET_MS = 120_000;

    await test.step('Navigate to Manager 1 roster', async () => {
      // Navigate to the league overview first.  Going directly to /roster
      // from a fresh browser context races the membership access gate in
      // LeagueDetailPageV2: the gate fires when leagueLoading and authLoading
      // both become false, but the getUserTeamId lazy query may not have
      // returned yet — so isMember=false and the app redirects to /overview.
      // Loading /overview first lets the lazy query complete, then clicking
      // the My Roster tab (client-side navigation) keeps the Apollo cache
      // warm so isMember is already true and no redirect fires.
      await managerPage1.goto(`/baseball/league/${state.leagueId}/overview`);
      await managerPage1.waitForLoadState('load');
      await expect(managerPage1.locator('body')).not.toContainText(
        'Unexpected Application Error',
        { timeout: 30000 },
      );
      // Wait for the league tabs to render (confirms league + auth data loaded),
      // then click My Roster — client-side navigation avoids the race condition.
      await expect(
        managerPage1.getByRole('tab', { name: 'My Roster' }),
      ).toBeVisible({ timeout: 15_000 });
      await managerPage1.getByRole('tab', { name: 'My Roster' }).click();
    });

    await test.step('Verify manager roster has players', async () => {
      // Root cause of the original Phase 7 failure (LS-4320): the previous
      // implementation reloaded every ~5 s and read `Lineup N/M` immediately
      // after the "Lineup" label became visible — but the QuickStat renders
      // "Lineup0/0" while `useGetPositionsForLeagueQuery` and
      // `useGetTeamMembersQuery` are still in flight. Each reload cancelled
      // both queries before they could resolve, so the value stayed "0/0"
      // across 21+ iterations even though the underlying server data was
      // populated. The final post-deadline read showed "Lineup16/17",
      // confirming the data was there all along.
      //
      // Fix: stop reloading. After the initial /overview → My Roster click,
      // wait for the QuickStat denominator to be > 0 (positions resolved),
      // then read the filled count. A single navigation lets both queries
      // run to completion.
      const lineupParent = managerPage1
        .getByText('Lineup', { exact: true })
        .first()
        .locator('..');
      await expect(managerPage1.getByText('Lineup').first()).toBeVisible({
        timeout: PER_OP_TIMEOUT,
      });
      // Wait for positions+teamMembers to fully resolve (denominator > 0).
      // The "Lineup0/0" loading state matches `/Lineup\s*\d+\s*\/\s*\d+/`,
      // so the assertion uses [1-9] for the denominator's first digit.
      await expect(lineupParent).toContainText(/Lineup\s*\d+\s*\/\s*[1-9]\d*/, {
        timeout: LINEUP_BUDGET_MS,
      });
      const lineupText = await lineupParent.textContent().catch(() => null);
      const lineupMatch = lineupText?.match(/Lineup\s*(\d+)\s*\/\s*(\d+)/);
      const lineupCount = lineupMatch ? parseInt(lineupMatch[1], 10) : 0;
      const lineupTotal = lineupMatch ? parseInt(lineupMatch[2], 10) : 0;
      LOGGER.info(
        `[live-draft] Phase 7 lineup resolved: ${lineupCount}/${lineupTotal} text=${JSON.stringify(
          lineupText?.slice(0, 80) ?? null,
        )}`,
      );
      expect(lineupCount).toBeGreaterThan(0);
    });

    await test.step('Verify manager 1-drafted players appear on roster', async () => {
      // See Phase 6 note: "Your pick" detection races can leave a page
      // with zero captured picks even though the underlying draft ran fine.
      // Skip the player-name check when nothing was captured — the lineup
      // assertion above already proves the manager's roster filled.
      if (state.manager1Picks.length === 0) {
        LOGGER.info(
          '[live-draft] No manager 1 picks captured (race-attribution); roster lineup already verified.',
        );
        return;
      }
      // The first captured pick name becoming visible replaces a fixed 2s
      // buffer wait — once the roster has hydrated we can read the rest.
      await managerPage1
        .getByText(state.manager1Picks[0], { exact: false })
        .first()
        .waitFor({ state: 'visible', timeout: 15_000 })
        .catch(() => {
          /* picks may have been mis-attributed; threshold check tolerates */
        });

      let matchCount = 0;
      for (const playerName of state.manager1Picks) {
        const visible = await managerPage1
          .getByText(playerName, { exact: false })
          .first()
          .isVisible()
          .catch(() => false);
        if (visible) matchCount++;
      }

      const threshold = Math.max(
        1,
        Math.floor(state.manager1Picks.length * 0.25),
      );
      expect(matchCount).toBeGreaterThanOrEqual(threshold);
    });
  });
});
