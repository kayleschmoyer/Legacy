/**
 * Draft domain — scheduled (system) mutation for auto-picking expired draft picks.
 *
 * Triggered every minute by EventBridge (`draft_scheduler_tick` rule in
 * terraform/main/eventbridge.tf), sent as a sibling field alongside
 * `autoStartScheduledDrafts` in the same GraphQL request/invocation
 * (LS-8907). Each invocation chains through all consecutively-expired
 * deadlines per draft (inner retry loop) so short pick timers (e.g. 30s)
 * aren't bottlenecked by the 1-minute polling interval.
 *
 * Finds all in-progress drafts where `current_pick_deadline` has passed,
 * then auto-picks the best available player for the timed-out team,
 * preferring players that fill still-open league roster position slots
 * (minimum requirements).
 *
 * Uses the same 3-tier auth pattern as other scheduled mutations:
 *   - System API key (EventBridge) → allowed for ALL leagues
 *   - Admin user → allowed for ALL leagues
 *   - Commissioner / General Manager → allowed for their league only
 */

import { type PublicDb, PublicSchema } from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import { and, count, eq, sql } from 'drizzle-orm';
import { GraphQLError } from 'graphql';

import {
  commitDraftPick,
  enableAutoPickForUnmanagedTeams,
  getCurrentDraftPickInfo,
  getUnfilledPositionTypes,
} from './helpers';
import { type CandidatePool, fetchCandidatePool } from './candidate-pool';
import { getSeatById } from './participants';
import { guardConcurrentPick, selectAutoPickPlayer } from './auto-pick-scorer';
import { executePickEffects } from './draft-pick-effects';
import { builder, type Context } from '../builder';
import { AuthenticationError, ForbiddenError } from '../graphql-errors';
import {
  describeDbError,
  formatDbError,
  isRetryablePgError,
  withTransientRetry,
} from '../leagues/delete-resilience';

/**
 * True when `error` is the Postgres `57014` (`query_canceled`) raised by the
 * `SET LOCAL statement_timeout` guard around the `drafts` row lock (LS-8398).
 * EventBridge's every-minute tick and the LS-8107 makeDraftPick nudge can
 * both invoke `autoProcessDraftPicks` for the same draft within milliseconds
 * of each other; the mutation is documented as idempotent for exactly this
 * reason, so the losing invocation timing out on the lock is an expected
 * race, not an application defect — the winner (or the next EventBridge
 * tick, ≤60 s later) already covers the pick.
 */
export function isLockWaitTimeout(error: unknown): boolean {
  return describeDbError(error).code === '57014';
}

/**
 * True when `error` is a transient Postgres race that the dual-trigger
 * auto-pick design (EventBridge tick + LS-8107 nudge) is expected to hit
 * from time to time and can safely skip: a lock-wait timeout ({@link
 * isLockWaitTimeout}, 57014) or an actual deadlock/serialization failure
 * (40P01/40001/55P03 — LS-9691: two concurrent invocations acquiring the
 * `drafts` row lock and the `draft_picks` FK-driven lock in different
 * orders). Either way this is the same "someone else already covers this
 * pick" outcome as the lock-wait case, not an application defect, so the
 * per-draft catch below skips it instead of surfacing to Rollbar.
 */
export function isBenignAutoPickRace(error: unknown): boolean {
  return isLockWaitTimeout(error) || isRetryablePgError(error);
}

/**
 * True when `error` is the "No teams configured for this draft" thrown by
 * `getCurrentDraftPickInfo` (helpers.ts) for a draft whose `draft_teams`
 * hasn't been populated yet — the same expected, transient window between
 * league creation and `initializeDraft`'s transaction completing that the
 * `getCurrentDraftPick` query resolver already classifies as client-visible
 * rather than a server defect (LS-4853, graphql-error-codes.ts). The
 * every-minute EventBridge sweep scans for expired deadlines across every
 * league, so it can catch this exact window on an unrelated draft; the next
 * tick retries once `initializeDraft` finishes, so this is safe to skip
 * rather than report to Rollbar via `LOGGER.error`.
 */
export function isDraftNotYetInitialized(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message === 'No teams configured for this draft'
  );
}

// ── LS-9319: Phase 1 / Phase 2 split for the per-draft auto-pick loop ───────
//
// Mirrors the pattern LS-4692 (PR #4146) already proved out for makeDraftPick
// / commissionerPick: speculatively compute the pick outside any row lock
// (Phase 1), then re-verify and reuse it inside a short locked transaction
// (Phase 2), falling back to a full in-lock recomputation only on the rare
// TOCTOU race where a concurrent invocation (another EventBridge tick, the
// LS-8107 nudge, or a human's own makeDraftPick) already advanced the pick.
// This is the one drafts-row lock call site LS-4692 deliberately left
// unrestructured — its own PR description says only the lock-strength swap
// (FOR UPDATE -> FOR NO KEY UPDATE) was applied here.

/** Result of {@link predictAutoPick} — a speculative, non-authoritative guess
 *  at what Phase 2 will need, computed entirely outside the row lock. */
export interface PredictedAutoPick {
  currentPickInfo: NonNullable<
    Awaited<ReturnType<typeof getCurrentDraftPickInfo>>
  >;
  unfilledPositionTypes: string[];
  autoPlayerId: number;
  autoPickReason: string;
}

/**
 * LS-9319 Phase 1 extension: speculatively predict the current pick, its
 * unfilled roster position types, and the auto-pick player selection using
 * non-locked reads — the same pattern `fetchCandidatePool` already uses for
 * the candidate pool itself. When the Phase 2 TOCTOU check (in
 * {@link runAutoPickLockedTransaction}) confirms nothing raced ahead of this
 * prediction, it's reused instead of recomputed under the lock, which is
 * what shrinks the locked critical section from ~15-20 sequential round
 * trips down to a handful.
 *
 * Best-effort only: this call never runs under a lock, so a concurrent pick
 * can always render it stale between here and Phase 2. Any failure —
 * including "draft already complete" or "no players available" — resolves
 * to `null` rather than throwing, so a prediction failure can never break
 * auto-picking; it only costs Phase 2 the full in-lock computation it would
 * have done anyway before this ticket.
 */
export async function predictAutoPick(
  db: PublicDb,
  draftId: number,
  candidatePool: CandidatePool,
): Promise<PredictedAutoPick | null> {
  try {
    const currentPickInfo = await getCurrentDraftPickInfo(db, draftId);
    if (!currentPickInfo || currentPickInfo.isComplete) return null;

    const unfilledPositionTypes = await getUnfilledPositionTypes(
      db,
      draftId,
      currentPickInfo.participantId,
      candidatePool.rules,
    );

    const { playerId: autoPlayerId, reason: autoPickReason } =
      await selectAutoPickPlayer({
        tx: db,
        draftId,
        eligibleIds: candidatePool.eligibleIds,
        playerDraftInfo: candidatePool.playerDraftInfo,
        rankedEligibleIds: candidatePool.rankedEligibleIds,
        bestBenchPick: candidatePool.bestBenchPick,
        currentPickInfo,
        unfilledPositionTypes,
        sport: candidatePool.rules.sport,
      });

    return {
      currentPickInfo,
      unfilledPositionTypes,
      autoPlayerId,
      autoPickReason,
    };
  } catch (predictionError) {
    LOGGER.warn(
      '[autoProcessDraftPicks] Phase 1 prediction failed — Phase 2 will fall back to full in-lock computation',
      {
        draftId,
        err:
          predictionError instanceof Error
            ? predictionError
            : new Error(String(predictionError)),
      },
    );
    return null;
  }
}

/** Result of {@link runAutoPickLockedTransaction} — `null` when there was
 *  nothing to pick (deadline no longer expired, draft/league state changed,
 *  or the draft is already complete). */
export type AutoPickCommitResult = {
  draftPick: typeof PublicSchema.draftPicks.$inferSelect;
  autoPlayerId: number;
  autoPickReason: string;
  isDraftComplete: boolean;
  currentPickInfo: NonNullable<
    Awaited<ReturnType<typeof getCurrentDraftPickInfo>>
  >;
  nextPickInfo: Awaited<ReturnType<typeof getCurrentDraftPickInfo>>;
  nextDeadline: Date | null;
} | null;

/**
 * LS-9319 Phase 2: acquire the `drafts` row lock (FOR NO KEY UPDATE — LS-4692
 * established this is already the correct, minimal lock mode; this ticket
 * only shrinks how long it's held) and commit exactly one auto-pick.
 *
 * Re-fetches `currentPickInfo` under the lock — this determines whose turn
 * it truly is and cannot be removed — and uses it as the TOCTOU check against
 * `predicted`: if the team and overall pick still match, the Phase 1
 * prediction's `unfilledPositionTypes`/`autoPlayerId` are reused as-is
 * (skipping their recomputation under the lock); otherwise this falls back to
 * the same full in-lock computation the mutation always did before this
 * ticket. Either way, `guardConcurrentPick` re-verifies `draft_picks` state
 * under `tx` before committing — the actual correctness guard against
 * double-drafting a player, which must run regardless of which path was
 * taken (AC2).
 */
export async function runAutoPickLockedTransaction(params: {
  db: PublicDb;
  draftId: number;
  pickTimeLimitSeconds: number;
  candidatePool: CandidatePool;
  predicted: PredictedAutoPick | null;
}): Promise<AutoPickCommitResult> {
  const { db, draftId, pickTimeLimitSeconds, candidatePool, predicted } =
    params;
  const { rules } = candidatePool;
  const draftLeagueId = rules.leagueId;

  return db.transaction(async (tx) => {
    // Surface lock waits as errors rather than silent hangs
    await tx.execute(sql`SET LOCAL statement_timeout = '5000'`);

    // Acquire row-level lock. FOR NO KEY UPDATE (LS-4692)
    // serializes concurrent pick writers without blocking
    // FK-referencing draft_picks INSERTs from other transactions.
    const draftRows = await tx.execute(
      sql`SELECT id, league_id, status, current_pick, current_pick_deadline FROM drafts WHERE id = ${draftId} FOR NO KEY UPDATE`,
    );
    const draft = draftRows.rows[0] as
      | {
          id: number;
          league_id: number | null;
          status: string;
          current_pick: number;
          current_pick_deadline: Date | null;
        }
      | undefined;

    if (!draft) {
      // Draft was deleted between the outer query and this transaction
      // (benign race condition — nothing to auto-pick on).
      LOGGER.warn(
        `[autoProcessDraftPicks] Draft ${draftId} not found inside locked transaction — likely deleted mid-flight, skipping`,
        { draftId },
      );
      return null;
    }

    // Re-check deadline inside transaction (TOCTOU guard)
    const checkNow = new Date();
    if (
      !draft.current_pick_deadline ||
      new Date(draft.current_pick_deadline) > checkNow
    ) {
      LOGGER.info(
        `[autoProcessDraftPicks] Draft ${draftId} deadline no longer expired (pick was made), skipping`,
      );
      return null;
    }

    // Capture the expired deadline for chaining
    const expiredDeadline = new Date(draft.current_pick_deadline);

    // Re-validate the draft's status inside the transaction, off the row we
    // just locked. Previously read leagues.draft_status via a second query —
    // drafts.status is the same value (dual-written by every transition since
    // LS-10074) and comes free with the lock read.
    if (draft.status !== 'in-progress') {
      LOGGER.info(
        `[autoProcessDraftPicks] Draft ${draftId} is not in-progress, skipping`,
      );
      return null;
    }

    // Get authoritative pick info from the locked draft row. This is the
    // TOCTOU check for the Phase 1 prediction below — it determines whose
    // turn it truly is and cannot be removed or replaced by the prediction.
    const currentPickInfo = await getCurrentDraftPickInfo(tx, draftId);

    if (!currentPickInfo || currentPickInfo.isComplete) {
      LOGGER.info(
        `[autoProcessDraftPicks] Draft ${draftId} is already complete`,
      );
      return null;
    }

    const predictionStillValid =
      predicted !== null &&
      predicted.currentPickInfo.participantId ===
        currentPickInfo.participantId &&
      predicted.currentPickInfo.overallPick === currentPickInfo.overallPick;

    let unfilledPositionTypes: string[];
    let autoPlayerId: number;
    let autoPickReason: string;

    if (predictionStillValid && predicted) {
      unfilledPositionTypes = predicted.unfilledPositionTypes;

      // guardConcurrentPick must still re-verify draft_picks availability
      // under the lock even on the reuse path (AC2) — Phase 1's own guard
      // check ran outside the lock and is not authoritative.
      const guardedPlayerId = await guardConcurrentPick(
        tx,
        draftId,
        predicted.autoPlayerId,
        candidatePool.rankedEligibleIds,
      );
      if (guardedPlayerId === undefined) {
        throw new Error(`No available players for draft ${draftId}`);
      }
      autoPlayerId = guardedPlayerId;
      autoPickReason = predicted.autoPickReason;

      LOGGER.info(
        '[autoProcessDraftPicks] Reusing Phase 1 prediction (LS-9319)',
        {
          draftId,
          participantId: currentPickInfo.participantId,
          overallPick: currentPickInfo.overallPick,
        },
      );
    } else {
      if (predicted) {
        LOGGER.info(
          '[autoProcessDraftPicks] Phase 1 prediction stale — falling back to full in-lock computation (LS-9319)',
          {
            draftId,
            predictedParticipantId: predicted.currentPickInfo.participantId,
            predictedOverallPick: predicted.currentPickInfo.overallPick,
            actualParticipantId: currentPickInfo.participantId,
            actualOverallPick: currentPickInfo.overallPick,
          },
        );
      }

      // Determine unfilled roster positions for the current team
      unfilledPositionTypes = await getUnfilledPositionTypes(
        tx,
        draftId,
        currentPickInfo.participantId,
        candidatePool.rules,
      );

      LOGGER.info('[autoProcessDraftPicks] Unfilled position types for seat', {
        draftId,
        participantId: currentPickInfo.participantId,
        unfilledPositionTypes,
        eligibleCount: candidatePool.rankedEligibleIds.length,
        eligibilityFilters: {
          playerPool: rules.playerPool,
          minCareerGames: rules.minCareerGames,
          minCareerSeasons: rules.minCareerSeasons,
          baseballHofOnly: rules.baseballHofOnly,
          eraFilter: rules.baseballEraFilter,
        },
      });

      // Select the best player via the scoring module
      const selected = await selectAutoPickPlayer({
        tx,
        draftId,
        eligibleIds: candidatePool.eligibleIds,
        playerDraftInfo: candidatePool.playerDraftInfo,
        rankedEligibleIds: candidatePool.rankedEligibleIds,
        bestBenchPick: candidatePool.bestBenchPick,
        currentPickInfo,
        unfilledPositionTypes,
        sport: rules.sport,
      });
      autoPlayerId = selected.playerId;
      autoPickReason = selected.reason;
    }

    // Validate roster limit. League drafts only — a mock draft persists no
    // roster rows to count, and its seats are bounded by the draft's own
    // total-picks arithmetic (LS-10076).
    if (draftLeagueId !== null && currentPickInfo.teamId !== null) {
      const [rosterCount] = await tx
        .select({ count: count() })
        .from(PublicSchema.teamMembers)
        .where(
          and(
            eq(PublicSchema.teamMembers.teamId, currentPickInfo.teamId),
            eq(PublicSchema.teamMembers.leagueId, draftLeagueId),
          ),
        );

      if (
        rosterCount &&
        Number(rosterCount.count) >= candidatePool.rules.maxRosterSize
      ) {
        throw new Error(
          `Team ${currentPickInfo.teamId} roster is full in draft ${draftId}`,
        );
      }
    }

    // Commit the pick: insert pick row, advance draft state, add player to roster.
    const {
      draftPick,
      isDraftComplete,
      nextDeadline,
      nextPickInfo,
      now: pickNow,
    } = await commitDraftPick({
      tx,
      draftId,
      leagueId: draftLeagueId,
      pickInfo: currentPickInfo,
      playerId: autoPlayerId,
      maxRosterSize: candidatePool.rules.maxRosterSize,
      pickTimeLimitSeconds,
      deadlineBaseTime: expiredDeadline,
    });

    // Mark this team as auto-pick going forward, but only if
    // unmanaged (no GM or commissioner). Reuses the same guard as
    // initialization-time enableAutoPickForUnmanagedTeams (LS-4286).
    // League drafts only: a mock draft's seats are either AI already or held
    // by a human who is simply away from the board (LS-10076).
    if (draftLeagueId !== null && currentPickInfo.teamId !== null) {
      await enableAutoPickForUnmanagedTeams(tx, draftLeagueId, draftId, [
        currentPickInfo.teamId,
      ]);
    }

    // If the next team has auto-pick enabled, immediately expire
    // their deadline so the inner loop chains right away (LS-427).
    let effectiveNextDeadline = nextDeadline;
    if (nextPickInfo && !isDraftComplete) {
      const nextSeat = await getSeatById(tx, nextPickInfo.participantId);
      if (nextSeat?.autoPick) {
        effectiveNextDeadline = new Date(pickNow.getTime() - 1);
        await tx
          .update(PublicSchema.drafts)
          .set({ currentPickDeadline: effectiveNextDeadline })
          .where(eq(PublicSchema.drafts.id, draftId));
        LOGGER.info(
          '[autoProcessDraftPicks] Next seat has auto-pick — expiring deadline immediately',
          { draftId, nextParticipantId: nextPickInfo.participantId },
        );
      }
    }

    return {
      draftPick,
      autoPlayerId,
      autoPickReason,
      isDraftComplete,
      currentPickInfo,
      nextPickInfo,
      nextDeadline: effectiveNextDeadline,
    };
  });
}

/**
 * Lighter auth check for the draft auto-pick nudge.
 * ANY authenticated league member can trigger this, not just commissioners/GMs.
 * The mutation itself is fully idempotent — it only processes picks whose
 * deadline has actually passed, so there is no abuse vector.
 */
/**
 * Authorize a nudge that may name a draft rather than a league (LS-10076).
 *
 * A mock draft has no `league_members` row to check, so a seat holder in the
 * named draft is the equivalent check. Everything else defers to
 * {@link assertLeagueMemberOrSystem}.
 */
export async function assertDraftNudgeAllowed(
  context: Context,
  leagueId: number | null | undefined,
  draftId: number | null | undefined,
): Promise<void> {
  if (context.isSystemRequest || context.user?.isAdmin) return;

  if (!context.user) {
    throw AuthenticationError();
  }

  if (!leagueId && draftId) {
    const [seat] = await context.db
      .select({ id: PublicSchema.draftParticipants.id })
      .from(PublicSchema.draftParticipants)
      .where(
        and(
          eq(PublicSchema.draftParticipants.draftId, draftId),
          eq(PublicSchema.draftParticipants.userId, context.user.id),
        ),
      )
      .limit(1);

    if (!seat) {
      throw ForbiddenError('You do not have a seat in this draft');
    }
    return;
  }

  await assertLeagueMemberOrSystem(context, leagueId);
}

export async function assertLeagueMemberOrSystem(
  context: Context,
  leagueId: number | null | undefined,
): Promise<void> {
  // System requests (EventBridge) can always operate on all leagues
  if (context.isSystemRequest) return;

  // Admin users can always operate on all leagues
  if (context.user?.isAdmin) return;

  if (!context.user) {
    throw AuthenticationError();
  }

  if (!leagueId) {
    throw ForbiddenError(
      'Only system processes can trigger for all leagues. Provide a leagueId.',
    );
  }

  // Any league member can nudge the auto-pick (the mutation is idempotent)
  LOGGER.info('[assertLeagueMemberOrSystem] Membership check', {
    userId: context.user.id,
    userIdType: typeof context.user.id,
    leagueId,
    authSource: context.authSource,
  });

  const membership = await context.db
    .select({ leagueId: PublicSchema.leagueMembers.leagueId })
    .from(PublicSchema.leagueMembers)
    .where(
      and(
        eq(PublicSchema.leagueMembers.leagueId, leagueId),
        eq(PublicSchema.leagueMembers.userId, context.user.id),
      ),
    )
    .limit(1);

  LOGGER.info('[assertLeagueMemberOrSystem] Membership query result', {
    userId: context.user.id,
    leagueId,
    membershipRowCount: membership.length,
    authSource: context.authSource,
  });

  if (membership.length === 0) {
    throw ForbiddenError('You are not a member of this league');
  }
}

// ── Response Type ────────────────────────────────────────────────────────────

interface AutoProcessDraftPicksResultShape {
  draftsProcessed: number;
  picksAutoMade: number;
  draftsCompleted: number;
  errors: string[];
}

const AutoProcessDraftPicksResult =
  builder.objectRef<AutoProcessDraftPicksResultShape>(
    'AutoProcessDraftPicksResult',
  );

builder.objectType(AutoProcessDraftPicksResult, {
  description:
    'Result of the automated draft pick processing for expired deadlines',
  fields: (t) => ({
    draftsProcessed: t.exposeInt('draftsProcessed'),
    picksAutoMade: t.exposeInt('picksAutoMade'),
    draftsCompleted: t.exposeInt('draftsCompleted'),
    errors: t.exposeStringList('errors'),
  }),
});

// ── Mutation: autoProcessDraftPicks ──────────────────────────────────────────
// Triggered every minute by EventBridge. Each invocation chains through ALL
// consecutively-expired deadlines per draft so short pick timers (e.g. 30s)
// don't bottleneck at the 1-minute EventBridge polling interval.
//
// For each expired draft, auto-picks the best available player that passes
// league eligibility (playerPool, minCareerGames, minCareerSeasons) and fills
// an open league position slot first (minimum requirements), then falls back
// to any eligible player. Advances the draft after each pick.

builder.mutationField('autoProcessDraftPicks', (t) =>
  t.field({
    type: AutoProcessDraftPicksResult,
    args: {
      leagueId: t.arg.int({
        required: false,
        description:
          'Optional: restrict to a single league. Required for non-system callers (any league member can nudge).',
      }),
      draftId: t.arg.int({
        required: false,
        description:
          'Optional: restrict to a single draft. The only handle a mock draft has — it belongs to no league (LS-10076).',
      }),
    },
    description:
      'Process expired draft pick deadlines. Idempotent — safe to call from any client as a nudge. EventBridge also calls this every minute as a fallback.',
    resolve: async (_parent, args, context) => {
      const leagueId = args.leagueId ?? null;
      const onlyDraftId = args.draftId ?? null;

      const result: AutoProcessDraftPicksResultShape = {
        draftsProcessed: 0,
        picksAutoMade: 0,
        draftsCompleted: 0,
        errors: [],
      };

      // UNAUTHENTICATED failures are surfaced via result.errors rather than
      // thrown so the LS-4289 client nudge always gets a structured response
      // it can diagnose against. A thrown GraphQLError nulls out
      // `data.autoProcessDraftPicks`, leaving the test logging "n/a" with no
      // actionable info (LS-4295). FORBIDDEN keeps its top-level GraphQLError
      // semantics — a non-member trying to nudge another league's draft is a
      // genuine authorization failure that callers should see as such.
      try {
        await assertDraftNudgeAllowed(context, leagueId, onlyDraftId);
      } catch (authError) {
        const isUnauthenticated =
          authError instanceof GraphQLError &&
          authError.extensions?.code === 'UNAUTHENTICATED';
        if (!isUnauthenticated) throw authError;
        LOGGER.warn(
          '[autoProcessDraftPicks] Unauthenticated nudge — surfacing via result.errors',
          { errMsg: authError.message, leagueId, hasUser: !!context.user },
        );
        result.errors.push(`UNAUTHENTICATED: ${authError.message}`);
        return result;
      }

      LOGGER.info('[autoProcessDraftPicks] Starting expired draft pick scan');

      try {
        // Find all in-progress drafts with expired deadlines
        const now = new Date();
        // Scans drafts.status directly (LS-10074) — the INNER JOIN leagues
        // this used to need is gone, so a draft-first mock draft with no
        // league row is picked up by the same sweep from slice 4 on.
        const expiredDraftsQuery = sql`
          SELECT d.id AS draft_id, d.league_id, d.current_pick,
                 d.draft_order, d.selection_method, d.pick_time_limit_seconds
          FROM drafts d
          WHERE d.status = 'in-progress'
            AND d.current_pick_deadline IS NOT NULL
            AND d.current_pick_deadline <= ${now}
            AND d.auto_pick_disabled = FALSE
            ${leagueId ? sql`AND d.league_id = ${leagueId}` : sql``}
            ${onlyDraftId ? sql`AND d.id = ${onlyDraftId}` : sql``}
          ORDER BY d.current_pick_deadline ASC
        `;

        const expiredDrafts = await context.db.execute(expiredDraftsQuery);

        if (expiredDrafts.rows.length === 0) {
          LOGGER.info('[autoProcessDraftPicks] No expired draft picks found');

          // Diagnostic: when a specific league was requested, surface its draft state
          // so we can distinguish H3 scenarios (deadline nulled, status changed,
          // auto_pick_disabled set) from "no draft exists" cases.
          if (leagueId) {
            const draftDiag = await context.db.execute(sql`
              SELECT d.id, d.current_pick_deadline, d.auto_pick_disabled, d.status
              FROM drafts d
              WHERE d.league_id = ${leagueId}
            `);
            LOGGER.info('[autoProcessDraftPicks] Draft state diagnostic', {
              leagueId,
              drafts: draftDiag.rows,
            });
          }

          return result;
        }

        LOGGER.info(
          `[autoProcessDraftPicks] Found ${expiredDrafts.rows.length} drafts with expired deadlines`,
        );

        const notificationService = context.notificationService;

        for (const row of expiredDrafts.rows) {
          const draftId = row.draft_id as number;
          const draftLeagueId = row.league_id as number | null;
          const pickTimeLimitSeconds = row.pick_time_limit_seconds as number;

          try {
            result.draftsProcessed++;

            // Inner loop: chain through consecutive expired deadlines.
            // Time-budget guard: each auto-pick spans a DB transaction that
            // can take several seconds. The Lambda timeout is 30 s, so we
            // stop chaining at 20 s to avoid timing out mid-transaction.
            const PICK_LOOP_BUDGET_MS = 20_000;
            const loopStartTime = Date.now();
            const MAX_AUTO_PICKS_PER_DRAFT = 100;
            let picksThisDraft = 0;

            while (picksThisDraft < MAX_AUTO_PICKS_PER_DRAFT) {
              // Bail out before the Lambda timeout rather than dying mid-transaction.
              const elapsedMs = Date.now() - loopStartTime;
              if (elapsedMs > PICK_LOOP_BUDGET_MS) {
                LOGGER.info(
                  `[autoProcessDraftPicks] Time budget exhausted after ${elapsedMs} ms — stopping inner loop for draft ${draftId} (${picksThisDraft} picks this invocation)`,
                );
                break;
              }

              // ─── Phase 1: Non-locking pre-computation ─────────────────────
              const candidatePool = await fetchCandidatePool(
                context.db,
                draftId,
              );
              if (!candidatePool) break;

              // LS-9319: speculatively predict currentPickInfo /
              // unfilledPositionTypes / autoPlayerId outside the lock, so
              // Phase 2 below can skip recomputing them when nothing raced
              // ahead of us in the meantime.
              const predicted = await predictAutoPick(
                context.db,
                draftId,
                candidatePool,
              );

              // ─── Phase 2: Short locked write transaction ──────────────────
              // Wrapped in withTransientRetry (LS-9690): the `drafts` row lock
              // is also taken by makeDraftPick / commissionerPick / setDraftOrder,
              // and a concurrent invocation racing this one for the same row can
              // trip Postgres's deadlock detector (40P01) rather than merely
              // waiting out the lock (which isLockWaitTimeout already handles).
              // The transaction re-verifies everything (deadline, league status,
              // TOCTOU pick check, guardConcurrentPick) under the lock, so
              // retrying it whole after a rolled-back deadlock is safe.
              const pickResult = await withTransientRetry(
                () =>
                  runAutoPickLockedTransaction({
                    db: context.db,
                    draftId,
                    pickTimeLimitSeconds,
                    candidatePool,
                    predicted,
                  }),
                {
                  onRetry: (attempt, detail) =>
                    LOGGER.warn(
                      '[autoProcessDraftPicks] Retrying auto-pick transaction after transient DB error',
                      {
                        draftId,
                        leagueId: draftLeagueId,
                        attempt,
                        dbError: formatDbError(detail),
                      },
                    ),
                },
              );

              if (!pickResult) {
                break; // Deadline not expired or cleared — exit inner loop
              }

              result.picksAutoMade++;
              picksThisDraft++;

              LOGGER.info('[autoProcessDraftPicks] Auto-pick made', {
                draftId,
                leagueId: draftLeagueId,
                playerId: pickResult.autoPlayerId,
                participantId: pickResult.currentPickInfo.participantId,
                overallPick: pickResult.currentPickInfo.overallPick,
                isDraftComplete: pickResult.isDraftComplete,
              });

              // Execute post-pick side effects (notifications, matchups, badges, activity log).
              // Note: draftsCompleted is tracked regardless of notificationService
              // availability — draft completion is a data event, not a notification event.
              const effects = await executePickEffects({
                db: context.db,
                notificationService: notificationService ?? null,
                draftLeagueId,
                draftId,
                selectionMethod: (row.selection_method as string) ?? 'standard',
                isMockDraft: candidatePool.rules.isMock,
                pickResult,
              });
              result.draftsCompleted += effects.draftsCompleted;

              // ── Inner-loop control ──────────────────────────────────
              if (pickResult.isDraftComplete) {
                break; // Draft finished
              }

              // If the chained deadline is already expired, pick again now
              if (
                pickResult.nextDeadline &&
                pickResult.nextDeadline <= new Date()
              ) {
                LOGGER.info(
                  '[autoProcessDraftPicks] Chained deadline already expired, continuing',
                  {
                    draftId,
                    nextDeadline: pickResult.nextDeadline.toISOString(),
                    picksThisDraft,
                  },
                );
                continue;
              }

              break; // Next deadline is in the future
            } // end while (auto-pick chaining)
          } catch (draftError) {
            const errMsg =
              draftError instanceof Error
                ? draftError.message
                : String(draftError);

            // LS-8398 / LS-9691: a lock-wait timeout or an actual deadlock on
            // `drafts` / `draft_picks` is an expected outcome of the
            // dual-trigger design (EventBridge tick + LS-8107 nudge racing
            // for the same draft), not a genuine failure — the concurrent
            // invocation that won the lock (or the next tick) already covers
            // this pick. Log it as a benign skip rather than an application
            // error so it doesn't page/pollute Rollbar, and don't count it
            // against the caller's result.
            if (isBenignAutoPickRace(draftError)) {
              LOGGER.warn(
                `[autoProcessDraftPicks] Draft ${draftId} hit a transient lock/deadlock race — likely a concurrent autoProcessDraftPicks invocation, skipping (will retry next cycle)`,
                {
                  draftId,
                  leagueId: draftLeagueId,
                  dbError: formatDbError(describeDbError(draftError)),
                },
              );
              continue;
            }

            if (isDraftNotYetInitialized(draftError)) {
              LOGGER.warn(
                `[autoProcessDraftPicks] Draft ${draftId} has an expired deadline but draft_teams isn't populated yet — skipping until initializeDraft completes (will retry next cycle)`,
                { draftId, leagueId: draftLeagueId },
              );
              continue;
            }

            LOGGER.error(
              `[autoProcessDraftPicks] Error processing draft ${draftId}`,
              draftError instanceof Error ? draftError : new Error(errMsg),
              { draftId, leagueId: draftLeagueId },
            );
            result.errors.push(`Draft ${draftId}: ${errMsg}`);
          }
        }

        LOGGER.info('[autoProcessDraftPicks] Completed', {
          draftsProcessed: result.draftsProcessed,
          picksAutoMade: result.picksAutoMade,
          draftsCompleted: result.draftsCompleted,
          errorCount: result.errors.length,
        });

        return result;
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        LOGGER.error(
          '[autoProcessDraftPicks] Fatal error',
          error instanceof Error ? error : new Error(errMsg),
        );
        result.errors.push(errMsg);
        return result;
      }
    },
  }),
);
