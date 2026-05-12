import type { APIRequestContext, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { graphqlOk } from './graphql';

/**
 * Poll until the league reports the draft as completed, then assert the
 * commissioner panel shows the "Season Active" badge.
 *
 * When `api` is provided (preferred), this polls the backend GraphQL
 * `league.draftStatus` directly. That field is the same source of truth the
 * UI binds to, so once it reports `active` or `completed` we know the
 * transition has fully landed server-side — eliminating the UI-render race
 * that has caused this assertion to flake repeatedly across specs
 * (LS-4237 → LS-4321). The UI assertion afterwards has a generous timeout
 * to absorb Apollo round-trip time on a cold cache; it is not a polling
 * loop.
 *
 * When `api` is omitted, falls back to the legacy UI-polling behavior
 * (re-navigate, wait for `networkidle`, re-check). Kept for compatibility
 * with spec files not yet migrated to the deterministic path.
 *
 * Regression history (full context):
 *   - LS-4237: matchup-detail, 120 s deadline
 *   - LS-4261: roster-management 200 s, season-renewal 150 s
 *   - LS-4278: playoff-bracket reload→goto + 150 s, roster-management 300 s,
 *              season-renewal 240 s
 *   - LS-4282: full-season-ui reload→goto + 180 s, roster-management 480 s;
 *              extracted into this shared helper.
 *   - LS-4287: trade-flow migrated to helper; deadlines extended.
 *   - LS-4296: 'load' → 'networkidle' to wait for the Apollo XHR before checks.
 *   - LS-4306: league-activity-feed migrated to helper (had inline reload loop).
 *   - LS-4321: deterministic backend signal via direct GraphQL poll. The UI
 *              re-navigate loop is timing-sensitive because Apollo cache update
 *              must propagate within the `networkidle` window; backend polling
 *              removes the race entirely by gating on `draftStatus` server-side.
 */
export async function waitForSeasonActive(
  page: Page,
  leagueId: number,
  {
    deadlineMs = 300_000,
    api,
  }: { deadlineMs?: number; api?: APIRequestContext } = {},
): Promise<void> {
  const commissionerUrl = `/baseball/league/${leagueId}/commissioner`;
  const seasonActive = page.getByText('Season Active');

  if (api) {
    // Deterministic path: gate on server state, then assert UI once.
    await expect
      .poll(
        async () => {
          const r = await graphqlOk<{
            league: { draftStatus: string } | null;
          }>(api, `query { league(id: ${leagueId}) { draftStatus } }`);
          // league can be null before it's visible/committed — treat as "not ready yet"
          return r.league?.draftStatus ?? null;
        },
        {
          timeout: deadlineMs,
          intervals: [2_000, 5_000],
          message: `league.draftStatus never reached active/completed within ${deadlineMs}ms`,
        },
      )
      .toMatch(/^(active|completed)$/);

    await page.goto(commissionerUrl);
    await page.waitForLoadState('networkidle');
    await expect(seasonActive).toBeVisible({ timeout: 30_000 });
    return;
  }

  // Legacy fallback: UI-polling loop (kept for unmigrated callers).
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    if (await seasonActive.isVisible().catch(() => false)) break;
    await page.waitForTimeout(5_000);
    await page.goto(commissionerUrl);
    await page.waitForLoadState('networkidle');
  }

  await expect(seasonActive).toBeVisible({ timeout: 15_000 });
}
