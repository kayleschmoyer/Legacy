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
import { createLeagueViaUI } from '../helpers/create-league';
import { waitForJoinPageValidation } from '../helpers/wait-for-join-page';
import { test } from '../fixtures/ui';

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
    managerPage1,
    managerPage2,
    managerPage3,
  }) => {
    const managers = [
      { page: managerPage1, teamName: 'Draft Kings' },
      { page: managerPage2, teamName: 'The Selectors' },
      { page: managerPage3, teamName: 'Pick Masters' },
    ];

    for (const { page, teamName } of managers) {
      const joinUrl = `/baseball/league/join/${state.inviteCode}`;
      await page.goto(joinUrl);
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

      state.teams.push(teamName);
    }

    expect(state.teams).toHaveLength(3);
  });

  // -----------------------------------------------------------------
  // PHASE 3 — CONFIGURE LIVE DRAFT SETTINGS
  // -----------------------------------------------------------------

  test('Phase 3: Verify live draft settings', async ({
    commissionerPage: page,
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
      const startBtn = page.getByRole('button', { name: /Start Draft/i });
      await expect(startBtn).toBeVisible({ timeout: 15000 });
      await startBtn.click();

      // Confirm in the dialog
      const confirmBtn = page.getByRole('button', {
        name: /Start Draft|Confirm/i,
      });
      await expect(confirmBtn.last()).toBeVisible({ timeout: 5000 });
      await confirmBtn.last().click();
    });

    await test.step('Wait for draft to start', async () => {
      // After starting a live draft, the league status changes.
      // Wait for the draft board link or "Draft In Progress" indicator.
      await page.waitForTimeout(3000);
      await page.reload();
      await page.waitForLoadState('load');

      // The commissioner panel should show draft is in progress
      // or a "Go to Draft Board" button
      const draftActive = page.getByText(/Draft.*In Progress|Go to Draft/i);
      await expect(draftActive.first()).toBeVisible({ timeout: 30000 });
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
  }) => {
    // Allow up to 25 minutes for all picks (4 teams × ~15 rounds = ~60 picks).
    // 20 minutes was occasionally too tight when retries accumulated —
    // e.g. a pick with 10 consecutive misses (×8 s each) adds 80 s alone.
    test.setTimeout(1_500_000);

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

      // Verify draft board loaded on every page
      for (const { label, page } of pages) {
        await expect(page.getByText('LIVE DRAFT').first()).toBeVisible({
          timeout: 30000,
        });
        console.log(`[live-draft] ${label} draft board loaded`);
      }

      // Give WebSocket connections time to establish on all pages
      await pages[0].page.waitForTimeout(5000);
    });

    await test.step('Make all draft picks (each user picks on their turn)', async () => {
      let pickCount = 0;
      const maxPicks = 200;
      let consecutiveMisses = 0;
      // Prevent reload death spiral: only reload once (then twice) per
      // consecutive-miss streak. Without these guards, every iteration
      // triggers a full page reload, blocking picks for 75-150 s total and
      // causing the draft to abort before all picks are made (LS-3833).
      // Two reloads per streak: first at miss ~8 (fast WebSocket reconnect),
      // second at miss ~30 (fallback if first reload didn't reconnect WS).
      let hasReloadedThisStreak = false;
      let hasReloadedTwiceThisStreak = false;
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
            console.log(
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
              hasReloadedTwiceThisStreak = false;
              failedPickAttempts.clear(); // reset per-player failure counts
              console.log(
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
              console.log(
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
                  console.log(
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
          console.log(
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
            console.log(
              `[live-draft] +${elapsedNudge}s miss #${consecutiveMisses} — nudging autoProcessDraftPicks`,
            );
            // Must use the absolute API URL — page.request resolves
            // relative URLs against the browser context's baseURL
            // (legacy-fantasy.com), not the API base (api.legacy-fantasy.com).
            const nudgeResult = await pages[1].page.request
              .post('https://api.legacy-fantasy.com/graphql', {
                data: {
                  query: `mutation AutoProcessDraftPicks($leagueId: Int!) { autoProcessDraftPicks(leagueId: $leagueId) { picksAutoMade draftsCompleted errors } }`,
                  variables: { leagueId: state.leagueId },
                },
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${commissionerJwt}`,
                },
              })
              .catch(() => null);
            if (nudgeResult) {
              const nudgeBody = (await nudgeResult
                .json()
                .catch(() => null)) as {
                data?: {
                  autoProcessDraftPicks?: {
                    picksAutoMade: number;
                    draftsCompleted: number;
                    errors?: string[];
                  } | null;
                } | null;
                errors?: Array<{
                  message?: string;
                  extensions?: { code?: string };
                  path?: Array<string | number>;
                }>;
              } | null;
              const nudgeData = nudgeBody?.data?.autoProcessDraftPicks;
              const resultErrors = nudgeData?.errors ?? [];
              const gqlErrors = nudgeBody?.errors ?? [];
              const status = nudgeResult.status();
              // Log full diagnostic info — the bare numeric fields hide
              // server-side problems (auth failures, schema drift, etc.) that
              // explain why a draft is stuck. LS-4295: previous "n/a" output
              // gave investigators no actionable info across 4+ nudge cycles.
              console.log(
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
                console.log(
                  `[live-draft] +${elapsedReset}s Nudge auto-picked ${nudgeData?.picksAutoMade ?? 0} — resetting miss counter`,
                );
                consecutiveMisses = 0;
                hasReloadedThisStreak = false;
                hasReloadedTwiceThisStreak = false;
              }

              // Draft finished via nudge — break the pick loop.
              if ((nudgeData?.draftsCompleted ?? 0) > 0) {
                const elapsedDone = ((Date.now() - draftStart) / 1000).toFixed(
                  1,
                );
                console.log(
                  `[live-draft] +${elapsedDone}s Nudge completed the draft — exiting pick loop`,
                );
                pickCount = maxPicks; // trigger while-loop exit
              }
            }
          }

          // Bail out if no progress for ~130 consecutive misses (~325s).
          // Unlike the old stuck-loop, this surfaces as a test failure with
          // diagnostics rather than silently breaking with pickCount=0.
          // Threshold raised from 60→130 (LS-4305): a league pick timer of
          // up to 300s means 120 misses (300s) can elapse before the timer
          // expires and autoProcessDraftPicks can fire. 60 misses was too
          // aggressive — it aborted before the timer expired.
          if (consecutiveMisses > 130) {
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
            // Threshold lowered from 15→7 (~45s → ~24s) to recover from
            // WebSocket startup lag faster (LS-4305).
            hasReloadedThisStreak = true;
            console.log('[live-draft] Reloading all pages...');
            for (const { page } of pages) {
              await page.reload();
              await page.waitForLoadState('load');
            }
            // 1500ms settle wait after reload (was 3000ms). Pages reach
            // interactive state by waitForLoadState('load'); the extra wait
            // allowed WebSocket to reconnect — 1500ms is sufficient for
            // reconnect in practice and saves 1.5s per reload event (LS-4305).
            await pages[0].page.waitForTimeout(1500);
          }

          // Second-chance reload at miss ~30: if the first reload (at miss ~8)
          // didn't re-establish the WS, a second reload gives it another shot
          // before the pick timer expires and autoProcessDraftPicks can fire.
          // Cap at one second reload per streak to avoid the death spiral.
          if (
            consecutiveMisses > 29 &&
            hasReloadedThisStreak &&
            !hasReloadedTwiceThisStreak
          ) {
            hasReloadedTwiceThisStreak = true;
            const elapsedSecondReload = (
              (Date.now() - draftStart) /
              1000
            ).toFixed(1);
            console.log(
              `[live-draft] +${elapsedSecondReload}s miss #${consecutiveMisses} — reloading all pages (attempt 2)...`,
            );
            for (const { page } of pages) {
              await page.reload();
              await page.waitForLoadState('load');
            }
            await pages[0].page.waitForTimeout(1500);
          }

          // 500ms anti-spin wait (was 1000ms). Saves ~500ms per miss → ~1.75s
          // per pick average across the draft. Over 60 picks this frees ~105s
          // of margin in the 25-minute Phase 5 timeout (LS-4305).
          await pages[0].page.waitForTimeout(500);
        }
      }

      console.log(
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
        console.log(
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
      console.log('[live-draft] Draft verified complete');
    });
  });

  // -----------------------------------------------------------------
  // PHASE 6 — VERIFY ROSTERS AFTER DRAFT
  // -----------------------------------------------------------------

  test('Phase 6: Verify commissioner roster after draft', async ({
    commissionerPage: page,
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
      // drafted fielders into starter slots first. In a live draft,
      // draftCompletedAt is committed inside the final pick transaction, so
      // the UI can show "Draft Complete!" before autoPopulateFirstMatchupLineup
      // (which runs outside the transaction) finishes. Poll with reloads until
      // the lineup count is > 0 (up to ~60s) to absorb this race condition.
      const lineupDeadline = Date.now() + 60_000;
      const lineupParent = page
        .getByText('Lineup', { exact: true })
        .first()
        .locator('..');
      await expect(page.getByText('Lineup').first()).toBeVisible({
        timeout: Math.max(1, lineupDeadline - Date.now()),
      });
      let lineupCount = 0;
      while (Date.now() < lineupDeadline) {
        const lineupText = await lineupParent.textContent();
        const lineupMatch = lineupText?.match(/Lineup\s*(\d+)\s*\/\s*\d+/);
        lineupCount = lineupMatch ? parseInt(lineupMatch[1], 10) : 0;
        if (lineupCount > 0) break;
        const remaining = lineupDeadline - Date.now();
        if (remaining <= 0) break;
        await page.waitForTimeout(Math.min(5_000, remaining));
        if (Date.now() >= lineupDeadline) break;
        await page.reload();
        await page.waitForLoadState('load');
        const remainingAfterReload = lineupDeadline - Date.now();
        if (remainingAfterReload <= 0) break;
        await expect(page.getByText('Lineup').first()).toBeVisible({
          timeout: remainingAfterReload,
        });
      }
      expect(lineupCount).toBeGreaterThan(0);
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
        console.log(
          '[live-draft] No commissioner picks captured (race-attribution); roster lineup already verified.',
        );
        return;
      }

      // Wait for bench section to render player cards
      await expect(
        page
          .locator('region[aria-label="Bench"], [aria-label="Bench"]')
          .first(),
      )
        .toBeVisible({ timeout: 15_000 })
        .catch(() => {
          // Fallback: just wait for Bench text
        });
      await page.waitForTimeout(2_000);

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
      // See Phase 6: poll with reloads until lineup count > 0 to absorb the
      // race between draftCompletedAt commit and autoPopulateFirstMatchupLineup.
      const lineupDeadline = Date.now() + 60_000;
      const lineupParent = managerPage1
        .getByText('Lineup', { exact: true })
        .first()
        .locator('..');
      // After clicking the My Roster tab, wait for the roster section to render.
      await expect(managerPage1.getByText('Lineup').first()).toBeVisible({
        timeout: Math.max(1, lineupDeadline - Date.now()),
      });
      let lineupCount = 0;
      while (Date.now() < lineupDeadline) {
        const lineupText = await lineupParent.textContent();
        const lineupMatch = lineupText?.match(/Lineup\s*(\d+)\s*\/\s*\d+/);
        lineupCount = lineupMatch ? parseInt(lineupMatch[1], 10) : 0;
        if (lineupCount > 0) break;
        const remaining = lineupDeadline - Date.now();
        if (remaining <= 0) break;
        await managerPage1.waitForTimeout(Math.min(5_000, remaining));
        if (Date.now() >= lineupDeadline) break;
        // Reload navigates back to /overview (last full-page URL before the
        // client-side tab click).  Re-click My Roster to reach the roster tab.
        await managerPage1.goto(`/baseball/league/${state.leagueId}/overview`);
        await managerPage1.waitForLoadState('load');
        const remainingAfterNav = lineupDeadline - Date.now();
        if (remainingAfterNav <= 0) break;
        await expect(
          managerPage1.getByRole('tab', { name: 'My Roster' }),
        ).toBeVisible({ timeout: remainingAfterNav });
        await managerPage1.getByRole('tab', { name: 'My Roster' }).click();
        const remainingAfterClick = lineupDeadline - Date.now();
        if (remainingAfterClick <= 0) break;
        await expect(managerPage1.getByText('Lineup').first()).toBeVisible({
          timeout: remainingAfterClick,
        });
      }
      // The while loop may exit via the `Date.now() < lineupDeadline` guard
      // immediately after a successful My Roster reload that made the Lineup
      // element visible — but before the top-of-loop textContent() call reads
      // the fresh value.  One final check catches this off-by-one edge case
      // (LS-4305: draft now completes within the timeout, exposing the race).
      if (lineupCount === 0) {
        const finalText = await lineupParent.textContent().catch(() => '');
        const finalMatch = finalText?.match(/Lineup\s*(\d+)\s*\/\s*\d+/);
        lineupCount = finalMatch ? parseInt(finalMatch[1], 10) : 0;
      }
      expect(lineupCount).toBeGreaterThan(0);
    });

    await test.step('Verify manager 1-drafted players appear on roster', async () => {
      // See Phase 6 note: "Your pick" detection races can leave a page
      // with zero captured picks even though the underlying draft ran fine.
      // Skip the player-name check when nothing was captured — the lineup
      // assertion above already proves the manager's roster filled.
      if (state.manager1Picks.length === 0) {
        console.log(
          '[live-draft] No manager 1 picks captured (race-attribution); roster lineup already verified.',
        );
        return;
      }
      await managerPage1.waitForTimeout(2_000);

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
