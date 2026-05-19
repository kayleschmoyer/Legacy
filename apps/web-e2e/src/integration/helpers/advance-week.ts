import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

export interface AdvanceWeekOptions {
  /**
   * Total budget (ms) for the post-confirm wait per Select-Game cycle. Split
   * internally into a WS-driven fast path and a reload-driven fallback path
   * (see `wsWaitMs`). Sized to cover cold-cache stats hydration — CloudWatch
   * p90 is ~78 s plus Lambda invocation overhead.
   * @default 150_000
   */
  perCycleTimeoutMs?: number;
  /**
   * Within `perCycleTimeoutMs`, how long to wait for the WS-driven label
   * transition before falling back to a reload + fresh GraphQL fetch. Keeps
   * the warm-cycle fast path (typical: ~30 s) cheap, while guaranteeing the
   * cycle still completes if a `MATCHUP_STATS_COMPLETE` notification is
   * dropped (transient socket disconnect during the 30–80 s hydration window,
   * missed leagueId-scoped broadcast — root cause of LS-4534).
   * @default 90_000
   */
  wsWaitMs?: number;
}

/**
 * Drive one week's worth of commissioner UI actions on the commissioner panel:
 *
 *   1. Click `Select Game N of M`
 *   2. Confirm the dialog
 *   3. Wait for the `NextStepControl` button-label transition (next
 *      `Select Game` cycle, or `Advance League Week` on the final game). The
 *      fast path is WS-driven: `LeagueDetailPage` (v1) and `Commish.tsx`
 *      (v2, after LS-4515) subscribe to `MATCHUP_STATS_COMPLETE` and refetch
 *      matchups + current-week, so the button relabels in place.
 *   4. If the WS-driven transition doesn't surface within `wsWaitMs`, fall
 *      back to `page.reload()` + a fresh GraphQL fetch. This is belt-and-
 *      suspenders for missed/dropped WS broadcasts — the failure mode that
 *      manifested as `LS-4534` (Game 2 button never appearing) after LS-4514
 *      stripped the unconditional pre-cycle reload. The fast path is unchanged
 *      for warm cycles.
 *   5. Repeat 1–4 until all games are selected.
 *   6. Click `Advance League Week`, confirm, wait for the dialog to close.
 *
 * The commissioner panel must be the current page — call
 * `page.goto('/baseball/league/{id}/commissioner')` first.
 */
export async function advanceWeek(
  page: Page,
  gamesPerMatchup: number,
  options: AdvanceWeekOptions = {},
): Promise<void> {
  const { perCycleTimeoutMs = 150_000, wsWaitMs = 90_000 } = options;
  const fallbackWaitMs = Math.max(15_000, perCycleTimeoutMs - wsWaitMs);

  for (let g = 1; g <= gamesPerMatchup; g++) {
    const selectBtn = page.getByRole('button', {
      name: new RegExp(`Select Game ${g} of ${gamesPerMatchup}`, 'i'),
    });
    await expect(selectBtn).toBeVisible({ timeout: 15_000 });
    await selectBtn.click();

    const confirmBtn = page.getByTestId('confirm-next-step');
    await expect(confirmBtn).toBeVisible({ timeout: 5_000 });
    await confirmBtn.click();
    await expect(confirmBtn).toBeHidden({ timeout: 30_000 });

    const nextLabel =
      g < gamesPerMatchup
        ? new RegExp(`Select Game ${g + 1} of ${gamesPerMatchup}`, 'i')
        : /Advance League Week/i;
    const nextBtn = page.getByRole('button', { name: nextLabel });

    // Fast path: wait for the WS-driven refetch to relabel the button in place.
    try {
      await expect(nextBtn).toBeVisible({ timeout: wsWaitMs });
    } catch {
      // Fallback: reload to force a fresh GetMatchupsForLeague +
      // GetCurrentWeekForLeague fetch. Covers the case where the
      // MATCHUP_STATS_COMPLETE broadcast was dropped between server-side
      // hydration completion and the client's WS subscription.
      await page.reload({ waitUntil: 'load' });
      await expect(nextBtn).toBeVisible({ timeout: fallbackWaitMs });
    }
  }

  const advanceBtn = page.getByRole('button', { name: /Advance League Week/i });
  await advanceBtn.click();

  const advanceConfirm = page.getByTestId('confirm-next-step');
  await expect(advanceConfirm).toBeVisible({ timeout: 5_000 });
  await advanceConfirm.click();
  await expect(advanceConfirm).toBeHidden({ timeout: 30_000 });
}
