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
 *   - LS-10179: one justified budget for every automated-draft spec (see
 *              AUTOMATED_DRAFT_COMPLETION_BUDGET_MS) plus a draftStatus
 *              timeline in the failure message.
 *   - LS-10315: budget follows the automatic-drafts visibility timeout
 *              (300 → 360 s): 420 → 480 s.
 */

/**
 * How long the backend may legitimately take to finish an automated draft,
 * measured from the commissioner confirming "Start Draft" (LS-10179).
 *
 * An automated draft is not run by the request: `initializeDraft` sends a
 * START_DRAFT message to SQS and the draft-processor lambda runs the picks.
 * On the happy path that lands in well under a minute (Rollbar breadcrumbs
 * for league 13709 on 2026-09-26: whole draft + matchups + finalize in
 * seconds). But when the processor hits a transient error it resets the
 * league to 'not-started' and reports a batch-item failure; the only retry is
 * SQS redelivery, which waits out the queue's visibility timeout —
 * `visibility_timeout_seconds = 360` on the automatic-drafts queue
 * (terraform/main/sqs.tf; raised from 300 by LS-10315 so it exceeds the
 * 300 s lambda timeout). No other job completes a stalled automated draft.
 * Since LS-10315 the processor retries transient DB errors (deadlock /
 * serialization) in-process first, so redelivery is now the rarer path.
 *
 * That is not hypothetical. matchup-roster-editor-ui (league 13360, 180 s
 * budget) and matchup-detail-ui (league 13724, 2026-09-26 nightly
 * 36265110320) both failed because the processor's first
 * `draft_status='in-progress'` write lost a Postgres "deadlock detected"
 * against `initializeDraft`'s own post-SQS `'queued'` write (Rollbar items
 * 263/264, 270; lock order fixed by LS-10176). Every per-spec budget in use
 * then (180–360 s) was shorter than, or within seconds of, one redelivery.
 *
 * So: 360 s for one redelivery + 120 s for queue lag, lambda cold start and
 * the draft itself under a loaded integration shard. Tolerating one retry is
 * the server's designed recovery path, not masking it — a second failure goes
 * to the DLQ and still fails here. Budget as of LS-10179; if sqs.tf's
 * visibility timeout changes, change this with it.
 */
export const AUTOMATED_DRAFT_COMPLETION_BUDGET_MS = 480_000;

/**
 * Minimum `test.setTimeout` for a test that starts an automated draft through
 * the commissioner UI and then calls {@link waitForSeasonActive}: the draft
 * budget plus ~2 min for the navigate / Draft Settings / Start Draft steps
 * before it and the Season Active badge assertion after it.
 */
export const AUTOMATED_DRAFT_TEST_TIMEOUT_MS =
  AUTOMATED_DRAFT_COMPLETION_BUDGET_MS + 120_000;

export async function waitForSeasonActive(
  page: Page,
  leagueId: number,
  {
    deadlineMs = AUTOMATED_DRAFT_COMPLETION_BUDGET_MS,
    api,
  }: { deadlineMs?: number; api?: APIRequestContext } = {},
): Promise<void> {
  const commissionerUrl = `/baseball/league/${leagueId}/commissioner`;
  const seasonActive = page.getByText('Season Active');

  if (api) {
    // Deterministic path: gate on server state, then assert UI once.
    // Every distinct draftStatus seen is recorded with its offset so a timeout
    // says *where* the draft stalled: stuck at 'not-started'/'queued' means
    // the draft-processor never ran it or failed and reset it (check Rollbar
    // for the league id); stuck at 'in-progress' means it is running slow.
    const startedAt = Date.now();
    const timeline: string[] = [];
    let lastStatus: string | null | undefined;
    const message = `league.draftStatus never reached active/completed within ${deadlineMs}ms for league ${leagueId}`;
    await expect
      .poll(
        async () => {
          // A throw inside the poll callback escapes expect.poll and aborts
          // the whole wait, so a transient GraphQL error is recorded in the
          // timeline and polled again (antipattern #1 in e2e-determinism.md).
          const status = await graphqlOk<{
            league: { draftStatus: string } | null;
          }>(api, `query { league(id: ${leagueId}) { draftStatus } }`).then(
            // league can be null before it's visible/committed — treat as "not ready yet"
            (r) => r.league?.draftStatus ?? null,
            () => 'error',
          );
          if (status !== lastStatus) {
            timeline.push(
              `${String(status)}@${Math.round((Date.now() - startedAt) / 1000)}s`,
            );
            lastStatus = status;
          }
          return status;
        },
        {
          timeout: deadlineMs,
          intervals: [2_000, 5_000],
          message,
        },
      )
      .toMatch(/^(active|completed)$/)
      .catch((error: unknown) => {
        // The timeline only exists once polling has run, so it cannot go in
        // the upfront `message`; append it to the assertion failure instead.
        const detail = `draftStatus timeline for league ${leagueId}: ${timeline.join(' → ') || 'no response'}`;
        if (error instanceof Error) {
          error.message = `${error.message}\n${detail}`;
          throw error;
        }
        throw new Error(`${message}\n${detail}`);
      });

    await page.goto(commissionerUrl);
    await page.waitForLoadState('domcontentloaded');
    // Backend already reports active/completed (gated above) — the badge is the
    // last paint to land; auto-retrying visibility absorbs Apollo round-trip.
    await expect(seasonActive).toBeVisible({ timeout: 30_000 });
    return;
  }

  // Legacy fallback: UI-polling loop (kept for unmigrated callers). Use
  // `expect.poll` to drive the re-navigation loop — each tick re-enters the
  // commissioner page and re-checks the badge until the overall deadline.
  await expect
    .poll(
      async () => {
        if (await seasonActive.isVisible().catch(() => false)) return true;
        await page.goto(commissionerUrl);
        await page.waitForLoadState('domcontentloaded');
        return seasonActive.isVisible().catch(() => false);
      },
      {
        timeout: deadlineMs,
        intervals: [5_000],
        message: `Season Active badge never appeared within ${deadlineMs}ms (legacy UI-polling path)`,
      },
    )
    .toBe(true);

  await expect(seasonActive).toBeVisible({ timeout: 15_000 });
}
