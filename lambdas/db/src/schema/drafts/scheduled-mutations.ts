/**
 * Draft domain — scheduled (system) mutation for auto-picking expired draft picks.
 *
 * Triggered every minute by EventBridge. Each invocation chains through all
 * consecutively-expired deadlines per draft (inner retry loop) so short pick
 * timers (e.g. 30s) aren't bottlenecked by the 1-minute polling interval.
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

import { PublicSchema } from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import { and, count, eq, sql } from 'drizzle-orm';
import { GraphQLError } from 'graphql';

import {
  commitDraftPick,
  enableAutoPickForUnmanagedTeams,
  getCurrentDraftPickInfo,
  getUnfilledPositionTypes,
} from './helpers';
import { fetchCandidatePool } from './candidate-pool';
import { selectAutoPickPlayer } from './auto-pick-scorer';
import { executePickEffects } from './draft-pick-effects';
import { builder, type Context } from '../builder';
import { AuthenticationError, ForbiddenError } from '../graphql-errors';

/**
 * Lighter auth check for the draft auto-pick nudge.
 * ANY authenticated league member can trigger this, not just commissioners/GMs.
 * The mutation itself is fully idempotent — it only processes picks whose
 * deadline has actually passed, so there is no abuse vector.
 */
async function assertLeagueMemberOrSystem(
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
    },
    description:
      'Process expired draft pick deadlines. Idempotent — safe to call from any client as a nudge. EventBridge also calls this every minute as a fallback.',
    resolve: async (_parent, args, context) => {
      const leagueId = args.leagueId ?? null;

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
        await assertLeagueMemberOrSystem(context, leagueId);
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
        const expiredDraftsQuery = sql`
          SELECT d.id AS draft_id, d.league_id, d.current_pick,
                 d.draft_order, d.selection_method, d.pick_time_limit_seconds
          FROM drafts d
          INNER JOIN leagues l ON l.id = d.league_id
          WHERE l.draft_status = 'in-progress'
            AND d.current_pick_deadline IS NOT NULL
            AND d.current_pick_deadline <= ${now}
            AND d.auto_pick_disabled = FALSE
            ${leagueId ? sql`AND d.league_id = ${leagueId}` : sql``}
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
              SELECT d.id, d.current_pick_deadline, d.auto_pick_disabled, l.draft_status
              FROM drafts d
              INNER JOIN leagues l ON l.id = d.league_id
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
          const draftLeagueId = row.league_id as number;
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
                draftLeagueId,
              );
              if (!candidatePool) break;

              const { league } = candidatePool;

              // ─── Phase 2: Short locked write transaction ──────────────────
              const pickResult = await context.db.transaction(async (tx) => {
                // Surface lock waits as errors rather than silent hangs
                await tx.execute(sql`SET LOCAL statement_timeout = '5000'`);

                // Acquire row-level lock
                const draftRows = await tx.execute(
                  sql`SELECT id, league_id, current_pick, current_pick_deadline FROM drafts WHERE id = ${draftId} FOR UPDATE`,
                );
                const draft = draftRows.rows[0] as
                  | {
                      id: number;
                      league_id: number;
                      current_pick: number;
                      current_pick_deadline: Date | null;
                    }
                  | undefined;

                if (!draft) {
                  throw new Error(`Draft ${draftId} not found`);
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

                // Re-validate league status inside the transaction
                const [txLeague] = await tx
                  .select()
                  .from(PublicSchema.leagues)
                  .where(eq(PublicSchema.leagues.id, draftLeagueId))
                  .limit(1);

                if (!txLeague || txLeague.draftStatus !== 'in-progress') {
                  LOGGER.info(
                    `[autoProcessDraftPicks] League ${draftLeagueId} is not in-progress, skipping draft ${draftId}`,
                  );
                  return null;
                }

                // Get authoritative pick info from the locked draft row
                const currentPickInfo = await getCurrentDraftPickInfo(
                  tx,
                  draftId,
                );

                if (!currentPickInfo || currentPickInfo.isComplete) {
                  LOGGER.info(
                    `[autoProcessDraftPicks] Draft ${draftId} is already complete`,
                  );
                  return null;
                }

                // Determine unfilled roster positions for the current team
                const unfilledPositionTypes = await getUnfilledPositionTypes(
                  tx,
                  draftId,
                  currentPickInfo.teamId,
                  draftLeagueId,
                );

                LOGGER.info(
                  '[autoProcessDraftPicks] Unfilled position types for team',
                  {
                    draftId,
                    teamId: currentPickInfo.teamId,
                    unfilledPositionTypes,
                    eligibleCount: candidatePool.rankedEligibleIds.length,
                    eligibilityFilters: {
                      playerPool: league.playerPool,
                      minCareerGames: league.minCareerGames,
                      minCareerSeasons: league.minCareerSeasons,
                      hofOnly: league.hofOnly,
                      eraFilter: league.eraFilter,
                    },
                  },
                );

                // Select the best player via the scoring module
                const { playerId: autoPlayerId, reason: autoPickReason } =
                  await selectAutoPickPlayer({
                    tx,
                    draftId,
                    eligibleIds: candidatePool.eligibleIds,
                    playerDraftInfo: candidatePool.playerDraftInfo,
                    rankedEligibleIds: candidatePool.rankedEligibleIds,
                    bestBenchPick: candidatePool.bestBenchPick,
                    currentPickInfo,
                    unfilledPositionTypes,
                  });

                // Validate roster limit
                const [rosterCount] = await tx
                  .select({ count: count() })
                  .from(PublicSchema.teamMembers)
                  .where(
                    and(
                      eq(
                        PublicSchema.teamMembers.teamId,
                        currentPickInfo.teamId,
                      ),
                      eq(PublicSchema.teamMembers.leagueId, draftLeagueId),
                    ),
                  );

                if (
                  rosterCount &&
                  Number(rosterCount.count) >= league.maxRosterSize
                ) {
                  throw new Error(
                    `Team ${currentPickInfo.teamId} roster is full in draft ${draftId}`,
                  );
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
                  maxRosterSize: league.maxRosterSize,
                  pickTimeLimitSeconds,
                  deadlineBaseTime: expiredDeadline,
                  isMockDraft: league.isMockDraft,
                });

                // Mark this team as auto-pick going forward, but only if
                // unmanaged (no GM or commissioner). Reuses the same guard as
                // initialization-time enableAutoPickForUnmanagedTeams (LS-4286).
                await enableAutoPickForUnmanagedTeams(
                  tx,
                  draftLeagueId,
                  draftId,
                  [currentPickInfo.teamId],
                );

                // If the next team has auto-pick enabled, immediately expire
                // their deadline so the inner loop chains right away (LS-427).
                let effectiveNextDeadline = nextDeadline;
                if (nextPickInfo && !isDraftComplete) {
                  const [nextTeamEntry] = await tx
                    .select({ autoPick: PublicSchema.draftTeams.autoPick })
                    .from(PublicSchema.draftTeams)
                    .where(
                      and(
                        eq(PublicSchema.draftTeams.draftId, draftId),
                        eq(PublicSchema.draftTeams.teamId, nextPickInfo.teamId),
                      ),
                    )
                    .limit(1);
                  if (nextTeamEntry?.autoPick) {
                    effectiveNextDeadline = new Date(pickNow.getTime() - 1);
                    await tx
                      .update(PublicSchema.drafts)
                      .set({ currentPickDeadline: effectiveNextDeadline })
                      .where(eq(PublicSchema.drafts.id, draftId));
                    LOGGER.info(
                      '[autoProcessDraftPicks] Next team has auto-pick — expiring deadline immediately',
                      { draftId, nextTeamId: nextPickInfo.teamId },
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

              if (!pickResult) {
                break; // Deadline not expired or cleared — exit inner loop
              }

              result.picksAutoMade++;
              picksThisDraft++;

              LOGGER.info('[autoProcessDraftPicks] Auto-pick made', {
                draftId,
                leagueId: draftLeagueId,
                playerId: pickResult.autoPlayerId,
                teamId: pickResult.currentPickInfo.teamId,
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
                isMockDraft: league.isMockDraft,
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
