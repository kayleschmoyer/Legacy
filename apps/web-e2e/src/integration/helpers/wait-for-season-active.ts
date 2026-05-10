import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Poll the commissioner panel until the "Season Active" badge appears.
 *
 * After an automated draft starts, the backend Lambda processes picks
 * asynchronously. The frontend does not push updates — the spec must poll
 * by navigating back to the commissioner page on each cycle.
 *
 * Using page.goto() (not page.reload()) is critical: starting an automated
 * draft may trigger a client-side route change. reload() would re-fetch the
 * transient URL rather than the commissioner panel, and "Season Active" would
 * never appear there. This helper always navigates to a stable URL.
 *
 * Regression history (LS-4237 → LS-4261 → LS-4278 → LS-4282 → LS-4287):
 *   - LS-4237: matchup-detail, 120 s deadline
 *   - LS-4261: roster-management 200 s, season-renewal 150 s
 *   - LS-4278: playoff-bracket reload→goto + 150 s, roster-management 300 s,
 *              season-renewal 240 s
 *   - LS-4282: full-season-ui reload→goto + 180 s, roster-management 480 s;
 *              extracted into this shared helper so all specs share one
 *              implementation and deadline drift can't re-emerge silently.
 *   - LS-4287: trade-flow-ui never migrated (still used page.reload() + 120 s);
 *              matchup-detail 120 s → 360 s (144 s observed), roster-management
 *              480 s → 900 s (504 s observed, growing trend); trade-flow migrated
 *              here with 240 s deadline.
 *   - LS-4296: 'load' event fires before Apollo XHR completes — isVisible() check
 *              ran on a page where React had not yet received draftStatus from the
 *              server, so the badge was never detected. Fixed: 'load' → 'networkidle'
 *              so the loop only checks after the GetLeagueById query has returned.
 *   - LS-4306: league-activity-feed-ui Phase 3 had an inline copy of this loop
 *              using page.reload() + 'load' — the exact pre-LS-4296 pattern. After
 *              draft start, the app can navigate away from the commissioner URL;
 *              reload() re-fetches the transient URL, so "Season Active" is never
 *              visible on the commissioner panel. Fixed: migrated the spec to use
 *              this shared helper (goto + networkidle) with a 180 s deadline.
 */
export async function waitForSeasonActive(
  page: Page,
  leagueId: number,
  { deadlineMs = 300_000 }: { deadlineMs?: number } = {},
): Promise<void> {
  const commissionerUrl = `/baseball/league/${leagueId}/commissioner`;
  const seasonActive = page.getByText('Season Active');
  const deadline = Date.now() + deadlineMs;

  while (Date.now() < deadline) {
    if (await seasonActive.isVisible().catch(() => false)) break;
    await page.waitForTimeout(5_000);
    await page.goto(commissionerUrl);
    await page.waitForLoadState('networkidle');
  }

  await expect(seasonActive).toBeVisible({ timeout: 15_000 });
}
