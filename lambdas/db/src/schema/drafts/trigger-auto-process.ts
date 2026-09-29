/**
 * Draft domain — set-and-forget trigger for asynchronous auto-pick processing.
 *
 * When a manual draft pick is followed by one or more auto-pick teams, the
 * picks used to be chained synchronously inside the makeDraftPick resolver
 * (LS-440), which could block the response for up to 20 s. Instead, the
 * resolver now returns the human's pick immediately and fires a
 * set-and-forget HTTP request to the `autoProcessDraftPicks` mutation — the
 * same system mutation EventBridge invokes every minute — so the auto-picks
 * are processed in a *separate* Lambda invocation (LS-8107).
 *
 * The request is dispatched but intentionally not awaited by the resolver:
 * the human's pick is already committed, and the EventBridge schedule remains
 * the safety net that processes the picks within its ≤60 s cycle if this
 * request is ever dropped (e.g. the Lambda execution environment freezes
 * before the request completes). All failures are non-fatal and logged.
 */

import { LOGGER } from '@legacy-sports/logging';

import { getSystemApiKey } from '../../server/context';

/**
 * Public URL of this service's own GraphQL endpoint (API Gateway). Set in
 * Terraform (lambda-graphql.tf). Unset in local dev and unit tests, in which
 * case the trigger is a no-op and EventBridge remains the fallback.
 */
const GRAPHQL_SELF_URL = process.env['GRAPHQL_SELF_URL'] || '';

const AUTO_PROCESS_MUTATION =
  'mutation AutoProcess($leagueId: Int, $draftId: Int) { autoProcessDraftPicks(leagueId: $leagueId, draftId: $draftId) { draftsProcessed picksAutoMade draftsCompleted errors } }';

/** Which draft(s) the nudge should process. */
export interface AutoProcessNudgeTarget {
  /** `null` for a mock draft, which belongs to no league (LS-10076). */
  leagueId: number | null;
  /** The draft to process — the only handle a league-less draft has. */
  draftId: number;
}

/**
 * Fire a set-and-forget HTTP request that nudges `autoProcessDraftPicks` for
 * the given league. Returns immediately — the underlying request is not
 * awaited by the caller (LS-8107).
 *
 * No-ops when `GRAPHQL_SELF_URL` is not configured so local dev and unit
 * tests do not attempt a network call.
 */
export function triggerAutoProcessDraftPicks(
  target: AutoProcessNudgeTarget,
): void {
  if (!GRAPHQL_SELF_URL) {
    LOGGER.info(
      '[LS-8107] GRAPHQL_SELF_URL unset — skipping auto-process nudge (EventBridge fallback handles it)',
      target,
    );
    return;
  }

  void dispatchNudge(target);
}

async function dispatchNudge(target: AutoProcessNudgeTarget): Promise<void> {
  const { leagueId, draftId } = target;
  try {
    const systemApiKey = await getSystemApiKey();
    if (!systemApiKey) {
      LOGGER.warn(
        '[LS-8107] System API key unavailable — skipping auto-process nudge (EventBridge fallback handles it)',
        { leagueId, draftId },
      );
      return;
    }

    await fetch(GRAPHQL_SELF_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-system-api-key': systemApiKey,
      },
      body: JSON.stringify({
        query: AUTO_PROCESS_MUTATION,
        variables: { leagueId, draftId },
      }),
    });

    LOGGER.info('[LS-8107] Auto-process nudge dispatched', {
      leagueId,
      draftId,
    });
  } catch (err) {
    // Non-fatal: the human's pick is already committed and EventBridge will
    // process the auto-picks within its ≤60 s cycle.
    LOGGER.warn(
      '[LS-8107] Auto-process nudge request failed (non-fatal)',
      err instanceof Error ? err : new Error(String(err)),
      { leagueId, draftId },
    );
  }
}
