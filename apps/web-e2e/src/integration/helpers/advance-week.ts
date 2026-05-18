import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

export interface AdvanceWeekOptions {
  /**
   * Timeout (ms) waiting for the WS-driven button-label transition after each
   * `Select Game` cycle. Sized to cover cold-cache stats hydration — see the
   * LS-4514 ticket comment for the underlying CloudWatch p90 (~78 s) plus
   * Lambda invocation overhead.
   * @default 120_000
   */
  perCycleTimeoutMs?: number;
}

/**
 * Drive one week's worth of commissioner UI actions on the commissioner panel:
 *
 *   1. Click `Select Game N of M`
 *   2. Confirm the dialog
 *   3. Wait for the WS-driven `NextStepControl` button-label transition
 *      (next `Select Game` cycle, or `Advance League Week` on the final game)
 *   4. Repeat 1–3 until all games are selected
 *   5. Click `Advance League Week`, confirm, wait for the dialog to close
 *
 * The commissioner panel must be the current page — call
 * `page.goto('/baseball/league/{id}/commissioner')` first.
 *
 * **No `page.reload()`** is used. `LeagueDetailPage` (v1) and `Commish.tsx`
 * (v2, after LS-4515) both subscribe to `MATCHUP_STATS_COMPLETE` and refetch
 * matchups + current-week, so the button label updates automatically once
 * stats hydration finishes server-side.
 */
export async function advanceWeek(
  page: Page,
  gamesPerMatchup: number,
  options: AdvanceWeekOptions = {},
): Promise<void> {
  const { perCycleTimeoutMs = 120_000 } = options;

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

    // Wait for the WS-driven UI refresh — the button label transitions to
    // either the next `Select Game` cycle or `Advance League Week` once all
    // games are selected. If this times out, the WebSocket pathway is broken
    // and the test fails with a clear actionable signal rather than the
    // ambiguous "Advance not visible" mode that masked the underlying issue.
    const nextLabel =
      g < gamesPerMatchup
        ? new RegExp(`Select Game ${g + 1} of ${gamesPerMatchup}`, 'i')
        : /Advance League Week/i;
    await expect(page.getByRole('button', { name: nextLabel })).toBeVisible({
      timeout: perCycleTimeoutMs,
    });
  }

  const advanceBtn = page.getByRole('button', { name: /Advance League Week/i });
  await advanceBtn.click();

  const advanceConfirm = page.getByTestId('confirm-next-step');
  await expect(advanceConfirm).toBeVisible({ timeout: 5_000 });
  await advanceConfirm.click();
  await expect(advanceConfirm).toBeHidden({ timeout: 30_000 });
}
