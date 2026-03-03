/**
 * Scheduled (system) mutations for automated game selection and matchup advancement.
 *
 * These mutations are designed to be triggered by EventBridge cron rules
 * invoking the GraphQL Lambda directly — no user authentication required.
 *
 * Pattern follows the existing `processWaiverClaims` mutation.
 */

import {
  createBadgeService,
  type GenericDatabase,
  PublicSchema,
} from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils';
import { LOGGER } from '@legacy-sports/logging';
import { createNotificationService } from '@legacy-sports/aws-utils';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { and, eq, inArray, sql } from 'drizzle-orm';

import { builder, type Context } from '../builder';
import { PlayoffService } from '../../services/playoff-service';
import { AuthenticationError, ForbiddenError } from '../graphql-errors';

const badgeService = createBadgeService(getDbOptions());

type Db = GenericDatabase<typeof PublicSchema>;

// ── Response Types ───────────────────────────────────────────────────────────

interface AutoSelectGamesResultShape {
  leaguesProcessed: number;
  gamesTriggered: number;
  errors: string[];
}

const AutoSelectGamesResult = builder.objectRef<AutoSelectGamesResultShape>(
  'AutoSelectGamesResult',
);

builder.objectType(AutoSelectGamesResult, {
  description:
    'Result of the automated nightly game selection across all active leagues',
  fields: (t) => ({
    leaguesProcessed: t.exposeInt('leaguesProcessed'),
    gamesTriggered: t.exposeInt('gamesTriggered'),
    errors: t.exposeStringList('errors'),
  }),
});

interface AutoAdvanceMatchupsResultShape {
  leaguesProcessed: number;
  leaguesAdvanced: number;
  leaguesSkipped: number;
  errors: string[];
}

const AutoAdvanceMatchupsResult =
  builder.objectRef<AutoAdvanceMatchupsResultShape>(
    'AutoAdvanceMatchupsResult',
  );

builder.objectType(AutoAdvanceMatchupsResult, {
  description:
    'Result of the automated weekly matchup advancement across all active leagues',
  fields: (t) => ({
    leaguesProcessed: t.exposeInt('leaguesProcessed'),
    leaguesAdvanced: t.exposeInt('leaguesAdvanced'),
    leaguesSkipped: t.exposeInt('leaguesSkipped'),
    errors: t.exposeStringList('errors'),
  }),
});

// ── Authorization Helper ─────────────────────────────────────────────────────

/**
 * Verify that the caller is authorized to trigger system mutations.
 *
 * Access rules:
 *  - System API key (EventBridge / admin CLI) → allowed for ALL leagues.
 *  - Authenticated admin user → allowed for ALL leagues.
 *  - League commissioner / General Manager → allowed only when a specific `leagueId` is
 *    provided (single-league scope).
 *  - Anyone else → rejected.
 */
export async function assertAuthorized(
  context: Context,
  leagueId: number | null | undefined,
): Promise<void> {
  // System requests (EventBridge) can always operate on all leagues
  if (context.isSystemRequest) {
    return;
  }

  // Admin users can always operate on all leagues
  if (context.user?.isAdmin) {
    return;
  }

  // For non-admin authenticated users, a specific leagueId is required
  if (!context.user) {
    throw AuthenticationError('System mutations require authentication');
  }

  if (!leagueId) {
    throw ForbiddenError(
      'Only admins or system processes can trigger mutations for all leagues. Provide a leagueId to operate on your own league.',
    );
  }

  // Check the user is a commissioner or owner of the specified league
  const [membership] = await context.db
    .select({
      permissionLevel: PublicSchema.leagueMembers.permissionLevel,
    })
    .from(PublicSchema.leagueMembers)
    .where(
      and(
        eq(PublicSchema.leagueMembers.leagueId, leagueId),
        eq(PublicSchema.leagueMembers.userId, context.user.id),
      ),
    )
    .limit(1);

  if (
    !membership ||
    (membership.permissionLevel !== 'general_manager' &&
      membership.permissionLevel !== 'assistant_manager' &&
      membership.permissionLevel !== 'commissioner')
  ) {
    throw ForbiddenError(
      'Only the league General Manager or commissioner can trigger this mutation for their league.',
    );
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Get the count of distinct game_num values already selected for a matchup.
 */
async function getSelectedGamesCount(
  db: Db,
  matchupId: number,
): Promise<number> {
  const rows = await db
    .select({
      count: sql<number>`COUNT(DISTINCT ${PublicSchema.matchupPlayerGames.gameNum})`,
    })
    .from(PublicSchema.matchupPlayerGames)
    .innerJoin(
      PublicSchema.matchupPlayers,
      eq(
        PublicSchema.matchupPlayerGames.matchupPlayerId,
        PublicSchema.matchupPlayers.id,
      ),
    )
    .where(eq(PublicSchema.matchupPlayers.matchupId, matchupId));

  return rows[0]?.count ?? 0;
}

// ── Mutation: autoSelectGames ────────────────────────────────────────────────
// Triggered nightly at midnight EST by EventBridge.
// For every active league with in-progress matchups, determines the next game
// number and triggers game selection via SQS (same path as the UI flow).

builder.mutationField('autoSelectGames', (t) =>
  t.field({
    type: AutoSelectGamesResult,
    args: {
      leagueId: t.arg.int({
        required: false,
        description:
          'Optional: restrict to a single league. Required for commissioner-level access.',
      }),
    },
    description:
      'Automatically select the next game for active leagues. When leagueId is provided, processes only that league (commissioner access). Without leagueId, processes all leagues (admin / system only). Triggered nightly at midnight EST by EventBridge.',
    resolve: async (_parent, args, context) => {
      const leagueId = args.leagueId ?? null;
      await assertAuthorized(context, leagueId);

      LOGGER.info('[autoSelectGames] Starting nightly game selection');

      const result: AutoSelectGamesResultShape = {
        leaguesProcessed: 0,
        gamesTriggered: 0,
        errors: [],
      };

      try {
        // 1. Find active leagues (draft completed), filtered by leagueId if provided
        const leagueConditions = [
          eq(PublicSchema.leagues.draftStatus, 'completed'),
        ];
        if (leagueId) {
          leagueConditions.push(eq(PublicSchema.leagues.id, leagueId));
        }

        const activeLeagues = await context.db
          .select({
            id: PublicSchema.leagues.id,
            name: PublicSchema.leagues.name,
            gamesPerMatchup: PublicSchema.leagues.gamesPerMatchup,
          })
          .from(PublicSchema.leagues)
          .where(and(...leagueConditions));

        LOGGER.info(
          `[autoSelectGames] Found ${activeLeagues.length} active leagues`,
        );

        // 2. Bulk-fetch all in-progress matchups for all active leagues (1 query)
        const activeLeagueIds = activeLeagues.map((l) => l.id);
        const allInProgressMatchups =
          activeLeagueIds.length > 0
            ? await context.db
                .select({
                  id: PublicSchema.matchups.id,
                  leagueId: PublicSchema.matchups.leagueId,
                  weekNumber: PublicSchema.matchups.weekNumber,
                  gamesPerMatchup: PublicSchema.matchups.gamesPerMatchup,
                  status: PublicSchema.matchups.status,
                })
                .from(PublicSchema.matchups)
                .where(
                  and(
                    inArray(PublicSchema.matchups.leagueId, activeLeagueIds),
                    eq(PublicSchema.matchups.status, 'in_progress'),
                  ),
                )
            : [];

        const matchupsByLeague = new Map<
          number,
          typeof allInProgressMatchups
        >();
        for (const m of allInProgressMatchups) {
          if (!matchupsByLeague.has(m.leagueId)) {
            matchupsByLeague.set(m.leagueId, []);
          }
          matchupsByLeague.get(m.leagueId)!.push(m);
        }

        // 3. Batch selectedGamesCount for all reference matchups in parallel
        const referenceMatchupIds = activeLeagueIds
          .map((id) => matchupsByLeague.get(id)?.[0]?.id)
          .filter((id): id is number => id !== undefined);
        const selectedCountEntries = await Promise.all(
          referenceMatchupIds.map(
            async (id) =>
              [id, await getSelectedGamesCount(context.db, id)] as const,
          ),
        );
        const selectedCountByMatchup = new Map<number, number>(
          selectedCountEntries,
        );

        for (const league of activeLeagues) {
          try {
            // Use pre-fetched matchups for this league
            const currentMatchups = matchupsByLeague.get(league.id) ?? [];

            if (currentMatchups.length === 0) {
              LOGGER.debug(
                `[autoSelectGames] League ${league.id} (${league.name}) has no in-progress matchups, skipping`,
              );
              continue;
            }

            result.leaguesProcessed++;

            // Determine the next game number from the reference matchup
            //    (all matchups in the same week share the same game progression)
            const referenceMatchup = currentMatchups[0];
            const gamesPerMatchup =
              referenceMatchup.gamesPerMatchup ?? league.gamesPerMatchup ?? 5;
            const selectedCount =
              selectedCountByMatchup.get(referenceMatchup.id) ?? 0;
            const nextGameNumber = selectedCount + 1;

            if (nextGameNumber > gamesPerMatchup) {
              LOGGER.info(
                `[autoSelectGames] League ${league.id} (${league.name}) already has all ${gamesPerMatchup} games selected, skipping`,
              );
              continue;
            }

            LOGGER.info(
              `[autoSelectGames] League ${league.id} (${league.name}): selecting game ${nextGameNumber}/${gamesPerMatchup}`,
            );

            // 4. Trigger game selection via SQS for all matchups in the week
            const sqsQueueUrl = process.env.SQS_SELECT_GAME_URL;
            if (!sqsQueueUrl) {
              const errMsg =
                'SQS_SELECT_GAME_URL not configured, cannot trigger game selection';
              LOGGER.error(`[autoSelectGames] ${errMsg}`);
              result.errors.push(errMsg);
              continue;
            }

            const sqsClient = new SQSClient({
              region: process.env.AWS_REGION || 'us-east-1',
            });

            const matchupIds = currentMatchups.map((m) => m.id);

            // Update status to 'queued' for all matchups in the week
            await context.db
              .update(PublicSchema.matchups)
              .set({ statsLoadingStatus: 'queued' })
              .where(inArray(PublicSchema.matchups.id, matchupIds));

            for (const matchupId of matchupIds) {
              const message = {
                matchupId,
                game: nextGameNumber,
              };

              const command = new SendMessageCommand({
                QueueUrl: sqsQueueUrl,
                MessageBody: JSON.stringify(message),
                MessageGroupId: `matchup-${matchupId}`,
                MessageDeduplicationId: `auto-${matchupId}-${nextGameNumber}-${Date.now()}`,
              });

              await sqsClient.send(command);
            }

            result.gamesTriggered += matchupIds.length;

            LOGGER.info(
              `[autoSelectGames] Triggered game ${nextGameNumber} for league ${league.id}, ${matchupIds.length} matchups`,
            );
          } catch (leagueError) {
            const errMsg = `League ${league.id} (${league.name}): ${leagueError instanceof Error ? leagueError.message : String(leagueError)}`;
            LOGGER.error(
              `[autoSelectGames] Error processing league: ${errMsg}`,
            );
            result.errors.push(errMsg);
          }
        }
      } catch (error) {
        const errMsg = `Fatal error: ${error instanceof Error ? error.message : String(error)}`;
        LOGGER.error(`[autoSelectGames] ${errMsg}`);
        result.errors.push(errMsg);
      }

      LOGGER.info('[autoSelectGames] Completed', {
        leaguesProcessed: result.leaguesProcessed,
        gamesTriggered: result.gamesTriggered,
        errorCount: result.errors.length,
      });

      return result;
    },
  }),
);

// ── Mutation: autoAdvanceMatchups ────────────────────────────────────────────
// Triggered Sunday at 3am EST by EventBridge.
// For every active league where all games in the current matchup have been
// completed, advances to the next week (same logic as the UI advanceLeagueWeek).

builder.mutationField('autoAdvanceMatchups', (t) =>
  t.field({
    type: AutoAdvanceMatchupsResult,
    args: {
      leagueId: t.arg.int({
        required: false,
        description:
          'Optional: restrict to a single league. Required for commissioner-level access.',
      }),
    },
    description:
      'Automatically advance matchups for leagues where all games are complete. When leagueId is provided, processes only that league (commissioner access). Without leagueId, processes all leagues (admin / system only). Triggered Sundays at 3am EST by EventBridge.',
    resolve: async (_parent, args, context) => {
      const leagueId = args.leagueId ?? null;
      await assertAuthorized(context, leagueId);

      LOGGER.info('[autoAdvanceMatchups] Starting weekly matchup advancement');

      const result: AutoAdvanceMatchupsResultShape = {
        leaguesProcessed: 0,
        leaguesAdvanced: 0,
        leaguesSkipped: 0,
        errors: [],
      };

      try {
        // 1. Find active leagues (draft completed), filtered by leagueId if provided
        const leagueConditions = [
          eq(PublicSchema.leagues.draftStatus, 'completed'),
        ];
        if (leagueId) {
          leagueConditions.push(eq(PublicSchema.leagues.id, leagueId));
        }

        const activeLeagues = await context.db
          .select({
            id: PublicSchema.leagues.id,
            name: PublicSchema.leagues.name,
            gamesPerMatchup: PublicSchema.leagues.gamesPerMatchup,
            weekAdvanceStatus: PublicSchema.leagues.weekAdvanceStatus,
            totalMatchups: PublicSchema.leagues.totalMatchups,
            playoffEnabled: PublicSchema.leagues.playoffEnabled,
            playoffFormat: PublicSchema.leagues.playoffFormat,
            playoffMultiWeek: PublicSchema.leagues.playoffMultiWeek,
          })
          .from(PublicSchema.leagues)
          .where(and(...leagueConditions));

        LOGGER.info(
          `[autoAdvanceMatchups] Found ${activeLeagues.length} active leagues`,
        );

        for (const league of activeLeagues) {
          try {
            result.leaguesProcessed++;

            // Skip leagues already processing
            if (
              league.weekAdvanceStatus === 'processing' ||
              league.weekAdvanceStatus === 'queued'
            ) {
              LOGGER.info(
                `[autoAdvanceMatchups] League ${league.id} (${league.name}) is already ${league.weekAdvanceStatus}, skipping`,
              );
              result.leaguesSkipped++;
              continue;
            }

            // 2. Find current in-progress matchups
            const currentMatchups = await context.db
              .select({
                id: PublicSchema.matchups.id,
                weekNumber: PublicSchema.matchups.weekNumber,
                gamesPerMatchup: PublicSchema.matchups.gamesPerMatchup,
              })
              .from(PublicSchema.matchups)
              .where(
                and(
                  eq(PublicSchema.matchups.leagueId, league.id),
                  eq(PublicSchema.matchups.status, 'in_progress'),
                ),
              );

            if (currentMatchups.length === 0) {
              LOGGER.debug(
                `[autoAdvanceMatchups] League ${league.id} (${league.name}) has no in-progress matchups, skipping`,
              );
              result.leaguesSkipped++;
              continue;
            }

            // 3. Check if all games have been selected for each matchup
            const gamesPerMatchup =
              currentMatchups[0].gamesPerMatchup ?? league.gamesPerMatchup ?? 5;

            // Batch all selected-game counts in parallel — one DB round-trip total
            const selectedCounts = await Promise.all(
              currentMatchups.map((m) =>
                getSelectedGamesCount(context.db, m.id),
              ),
            );

            let allGamesComplete = true;
            for (let i = 0; i < currentMatchups.length; i++) {
              const selectedCount = selectedCounts[i];
              const matchup = currentMatchups[i];

              if (selectedCount < gamesPerMatchup) {
                LOGGER.info(
                  `[autoAdvanceMatchups] League ${league.id} (${league.name}): matchup ${matchup.id} has ${selectedCount}/${gamesPerMatchup} games, not ready`,
                );
                allGamesComplete = false;
                break;
              }
            }

            if (!allGamesComplete) {
              result.leaguesSkipped++;
              continue;
            }

            // 4. Check the current week against totalMatchups to see if the season is over
            const currentWeek = currentMatchups[0].weekNumber;
            if (currentWeek >= league.totalMatchups) {
              if (league.playoffEnabled === false) {
                // Playoffs disabled — just mark current week complete and stop
                LOGGER.info(
                  `[autoAdvanceMatchups] League ${league.id} (${league.name}) season complete, playoffs disabled`,
                );
                await context.db
                  .update(PublicSchema.matchups)
                  .set({ status: 'completed' })
                  .where(
                    and(
                      eq(PublicSchema.matchups.leagueId, league.id),
                      eq(PublicSchema.matchups.status, 'in_progress'),
                    ),
                  );
                await context.db
                  .update(PublicSchema.leagues)
                  .set({ weekAdvanceStatus: 'idle' })
                  .where(eq(PublicSchema.leagues.id, league.id));
                result.leaguesAdvanced++;
                continue;
              }

              // Check whether a bracket already exists for this season
              const existingBracket = await context.db
                .select({ id: PublicSchema.playoffBrackets.id })
                .from(PublicSchema.playoffBrackets)
                .where(
                  and(
                    eq(PublicSchema.playoffBrackets.leagueId, league.id),
                    eq(
                      PublicSchema.playoffBrackets.season,
                      new Date().getFullYear(),
                    ),
                  ),
                )
                .limit(1);

              if (existingBracket.length > 0) {
                LOGGER.info(
                  `[autoAdvanceMatchups] League ${league.id} (${league.name}) playoff bracket already exists, skipping`,
                );
                result.leaguesSkipped++;
                continue;
              }

              LOGGER.info(
                `[autoAdvanceMatchups] League ${league.id} (${league.name}) season complete at week ${currentWeek}, creating playoff bracket`,
              );

              // Mark regular season matchups as completed
              await context.db
                .update(PublicSchema.matchups)
                .set({ status: 'completed' })
                .where(
                  and(
                    eq(PublicSchema.matchups.leagueId, league.id),
                    eq(PublicSchema.matchups.status, 'in_progress'),
                  ),
                );

              // Create the playoff bracket
              const playoffStartWeek = currentWeek + 1;
              const format = (league.playoffFormat ?? '4-team') as
                | '4-team'
                | '6-team'
                | '8-team';
              const multiWeek = league.playoffMultiWeek ?? false;

              const bracket = await PlayoffService.createBracket(context.db, {
                leagueId: league.id,
                season: new Date().getFullYear(),
                format,
                startWeek: playoffStartWeek,
                multiWeekMatchups: multiWeek,
              });

              // Fetch the round-1 playoff_matchups to create regular matchups for scoring
              const round1PlayoffMatchups = await context.db
                .select()
                .from(PublicSchema.playoffMatchups)
                .where(
                  and(
                    eq(PublicSchema.playoffMatchups.bracketId, bracket.id),
                    eq(
                      PublicSchema.playoffMatchups.weekNumber,
                      playoffStartWeek,
                    ),
                  ),
                );

              const leagueSettingsResult = await context.db
                .select({
                  gamesPerMatchup: PublicSchema.leagues.gamesPerMatchup,
                  spStartsPerMatchup: PublicSchema.leagues.spStartsPerMatchup,
                })
                .from(PublicSchema.leagues)
                .where(eq(PublicSchema.leagues.id, league.id))
                .limit(1);

              const gamesPerMatchup =
                leagueSettingsResult[0]?.gamesPerMatchup ?? 5;
              const spStartsPerMatchup =
                leagueSettingsResult[0]?.spStartsPerMatchup ?? 1;

              // Prior week roster positions for carry-forward
              const priorMatchupPlayers = await context.db
                .select({
                  playerId: PublicSchema.matchupPlayers.playerId,
                  teamId: PublicSchema.matchupPlayers.teamId,
                  positionId: PublicSchema.matchupPlayers.positionId,
                })
                .from(PublicSchema.matchupPlayers)
                .innerJoin(
                  PublicSchema.matchups,
                  eq(
                    PublicSchema.matchupPlayers.matchupId,
                    PublicSchema.matchups.id,
                  ),
                )
                .where(
                  and(
                    eq(PublicSchema.matchups.leagueId, league.id),
                    eq(PublicSchema.matchups.weekNumber, currentWeek),
                  ),
                );

              const priorPositionsByTeam = new Map<
                number,
                Map<number, number | null>
              >();
              for (const mp of priorMatchupPlayers) {
                if (!priorPositionsByTeam.has(mp.teamId)) {
                  priorPositionsByTeam.set(mp.teamId, new Map());
                }
                priorPositionsByTeam
                  .get(mp.teamId)!
                  .set(mp.playerId, mp.positionId);
              }

              // Bulk-fetch all team members for all playoff teams (one query instead of 2×N)
              const allPlayoffTeamIds = round1PlayoffMatchups
                .flatMap((pm) => [pm.highSeedTeamId, pm.lowSeedTeamId])
                .filter((id): id is number => id !== null);

              const allPlayoffTeamMembers =
                allPlayoffTeamIds.length > 0
                  ? await context.db
                      .select({
                        teamId: PublicSchema.teamMembers.teamId,
                        playerId: PublicSchema.teamMembers.playerId,
                        positionId: PublicSchema.teamMembers.positionId,
                      })
                      .from(PublicSchema.teamMembers)
                      .where(
                        and(
                          eq(PublicSchema.teamMembers.leagueId, league.id),
                          inArray(
                            PublicSchema.teamMembers.teamId,
                            allPlayoffTeamIds,
                          ),
                        ),
                      )
                  : [];

              const playoffMembersByTeam = new Map<
                number,
                Array<{ playerId: number; positionId: number | null }>
              >();
              for (const m of allPlayoffTeamMembers) {
                if (m.teamId === null || m.playerId === null) continue;
                if (!playoffMembersByTeam.has(m.teamId)) {
                  playoffMembersByTeam.set(m.teamId, []);
                }
                playoffMembersByTeam
                  .get(m.teamId)!
                  .push({ playerId: m.playerId, positionId: m.positionId });
              }

              let firstMatchupId: number | null = null;
              for (const pm of round1PlayoffMatchups) {
                if (pm.highSeedTeamId === null || pm.lowSeedTeamId === null) {
                  continue;
                }

                const [inserted] = await context.db
                  .insert(PublicSchema.matchups)
                  .values({
                    leagueId: league.id,
                    weekNumber: playoffStartWeek,
                    team1Id: pm.highSeedTeamId,
                    team2Id: pm.lowSeedTeamId,
                    gamesPerMatchup,
                    spStartsPerMatchup,
                    status: 'scheduled' as const,
                    team1Score: null,
                    team2Score: null,
                    startTime: null,
                    endTime: null,
                  })
                  .returning({ id: PublicSchema.matchups.id });

                if (firstMatchupId === null) {
                  firstMatchupId = inserted.id;
                }

                // Populate matchup players with position carry-forward
                for (const teamId of [pm.highSeedTeamId, pm.lowSeedTeamId]) {
                  const teamMembers = playoffMembersByTeam.get(teamId) ?? [];
                  if (teamMembers.length > 0) {
                    const priorPositions = priorPositionsByTeam.get(teamId);
                    await context.db.insert(PublicSchema.matchupPlayers).values(
                      teamMembers.map((p) => ({
                        matchupId: inserted.id,
                        playerId: p.playerId,
                        teamId,
                        positionId: priorPositions?.has(p.playerId)
                          ? (priorPositions.get(p.playerId) ?? null)
                          : p.positionId,
                      })),
                    );
                  }
                }
              }

              // Update league current matchup
              await context.db
                .update(PublicSchema.leagues)
                .set({
                  currentMatchup: firstMatchupId,
                  weekAdvanceStatus: 'idle',
                })
                .where(eq(PublicSchema.leagues.id, league.id));

              // Notify league members via WebSocket
              const notificationService = createNotificationService();
              if (notificationService) {
                try {
                  await notificationService.notifyPlayoffBracketCreated(
                    league.id,
                    {
                      leagueId: league.id,
                      bracketId: bracket.id,
                      season: bracket.season,
                      format: bracket.format,
                      startWeek: bracket.startWeek,
                      createdAt: new Date().toISOString(),
                    },
                  );
                } catch (err: unknown) {
                  LOGGER.warn(
                    '[autoAdvanceMatchups] Failed to send playoff bracket notification (non-fatal)',
                    { err },
                  );
                }
              }

              // Award playoff appearance badges to all qualifying teams (fire-and-forget)
              const qualifiedTeamIds = round1PlayoffMatchups
                .flatMap((m) => [m.highSeedTeamId, m.lowSeedTeamId])
                .filter((id): id is number => id !== null);
              if (qualifiedTeamIds.length > 0) {
                badgeService
                  .awardPlayoffAppearances(league.id, qualifiedTeamIds)
                  .catch((err: unknown) => {
                    LOGGER.warn(
                      '[autoAdvanceMatchups] Playoff badge award failed (non-fatal)',
                      { leagueId: league.id, err },
                    );
                  });
              }

              result.leaguesAdvanced++;
              LOGGER.info(
                `[autoAdvanceMatchups] Successfully created playoff bracket ${bracket.id} for league ${league.id} (${league.name}), starting week ${playoffStartWeek}`,
              );
              continue;
            }

            LOGGER.info(
              `[autoAdvanceMatchups] League ${league.id} (${league.name}): all ${gamesPerMatchup} games complete in week ${currentWeek}, advancing`,
            );

            // 5. Advance the league week by invoking the advanceLeagueWeek mutation logic
            //    We replicate the core logic here to avoid the auth check, but we could
            //    also call the mutation resolver directly with a synthetic context.
            //    For now, we use the GraphQL mutation via internal invocation.
            await advanceLeagueWeekInternal(context.db, league.id);

            result.leaguesAdvanced++;

            LOGGER.info(
              `[autoAdvanceMatchups] Successfully advanced league ${league.id} (${league.name}) from week ${currentWeek} to ${currentWeek + 1}`,
            );
          } catch (leagueError) {
            const errMsg = `League ${league.id} (${league.name}): ${leagueError instanceof Error ? leagueError.message : String(leagueError)}`;
            LOGGER.error(
              `[autoAdvanceMatchups] Error processing league: ${errMsg}`,
            );
            result.errors.push(errMsg);

            // Reset weekAdvanceStatus on failure
            try {
              await context.db
                .update(PublicSchema.leagues)
                .set({ weekAdvanceStatus: 'idle' })
                .where(eq(PublicSchema.leagues.id, league.id));
            } catch {
              // best-effort reset
            }
          }
        }
      } catch (error) {
        const errMsg = `Fatal error: ${error instanceof Error ? error.message : String(error)}`;
        LOGGER.error(`[autoAdvanceMatchups] ${errMsg}`);
        result.errors.push(errMsg);
      }

      LOGGER.info('[autoAdvanceMatchups] Completed', {
        leaguesProcessed: result.leaguesProcessed,
        leaguesAdvanced: result.leaguesAdvanced,
        leaguesSkipped: result.leaguesSkipped,
        errorCount: result.errors.length,
      });

      return result;
    },
  }),
);

// ── Internal advance logic ───────────────────────────────────────────────────
// Extracted from the advanceLeagueWeek mutation to be reusable without auth.

async function advanceLeagueWeekInternal(
  db: Db,
  leagueId: number,
): Promise<void> {
  // Set status to processing
  await db
    .update(PublicSchema.leagues)
    .set({ weekAdvanceStatus: 'processing' })
    .where(eq(PublicSchema.leagues.id, leagueId));

  try {
    const leagueResult = await db
      .select({
        id: PublicSchema.leagues.id,
        gamesPerMatchup: PublicSchema.leagues.gamesPerMatchup,
        spStartsPerMatchup: PublicSchema.leagues.spStartsPerMatchup,
      })
      .from(PublicSchema.leagues)
      .where(eq(PublicSchema.leagues.id, leagueId))
      .limit(1);

    if (!leagueResult[0]) {
      throw new Error('League not found');
    }

    const league = leagueResult[0];
    const gamesPerMatchup = league.gamesPerMatchup ?? 5;
    const spStartsPerMatchup = league.spStartsPerMatchup ?? 1;

    // Get all teams in the league
    const teams = await db
      .select({
        id: PublicSchema.teams.id,
        name: PublicSchema.teams.name,
        leagueId: PublicSchema.teams.leagueId,
      })
      .from(PublicSchema.teams)
      .where(eq(PublicSchema.teams.leagueId, leagueId));

    if (teams.length < 2) {
      throw new Error('League must have at least 2 teams to create matchups');
    }

    // Find the highest week number
    const existingMatchups = await db
      .select({
        weekNumber: PublicSchema.matchups.weekNumber,
      })
      .from(PublicSchema.matchups)
      .where(eq(PublicSchema.matchups.leagueId, leagueId));

    const currentWeek =
      existingMatchups.reduce(
        (max, m) => Math.max(max, m.weekNumber ?? 0),
        0,
      ) || 0;
    const nextWeek = currentWeek + 1;

    // Complete all current week matchups
    if (currentWeek > 0) {
      const completedMatchups = await db
        .update(PublicSchema.matchups)
        .set({ status: 'completed' })
        .where(
          and(
            eq(PublicSchema.matchups.leagueId, leagueId),
            eq(PublicSchema.matchups.weekNumber, currentWeek),
          ),
        )
        .returning({ id: PublicSchema.matchups.id });

      // Evaluate badges for each completed matchup (fire-and-forget, non-fatal)
      for (const matchup of completedMatchups) {
        badgeService.evaluateMatchupBadges(matchup.id).catch((err: unknown) => {
          LOGGER.warn(
            '[advanceLeagueWeekInternal] Badge evaluation failed (non-fatal)',
            { matchupId: matchup.id, err },
          );
        });
      }
    }

    // Create matchups for next week (round-robin pairing)
    const teamPairs: Array<{ team1Id: number; team2Id: number }> = [];

    if (teams.length % 2 === 0) {
      for (let i = 0; i < teams.length; i += 2) {
        teamPairs.push({
          team1Id: teams[i].id,
          team2Id: teams[i + 1].id,
        });
      }
    } else {
      for (let i = 0; i < teams.length - 1; i += 2) {
        teamPairs.push({
          team1Id: teams[i].id,
          team2Id: teams[i + 1].id,
        });
      }
    }

    // Insert matchups for the new week (bulk insert)
    const insertedIds = await db
      .insert(PublicSchema.matchups)
      .values(
        teamPairs.map((pair) => ({
          leagueId,
          weekNumber: nextWeek,
          team1Id: pair.team1Id,
          team2Id: pair.team2Id,
          gamesPerMatchup,
          spStartsPerMatchup,
          status: 'scheduled' as const,
          team1Score: null,
          team2Score: null,
          startTime: null,
          endTime: null,
        })),
      )
      .returning({ id: PublicSchema.matchups.id });

    const newMatchups = insertedIds.map((r, i) => ({ id: r.id, teamIndex: i }));

    // Auto-populate matchup players with position carry-forward
    const priorPositionsByTeam = new Map<number, Map<number, number | null>>();

    if (currentWeek > 0) {
      const priorMatchupPlayers = await db
        .select({
          playerId: PublicSchema.matchupPlayers.playerId,
          teamId: PublicSchema.matchupPlayers.teamId,
          positionId: PublicSchema.matchupPlayers.positionId,
        })
        .from(PublicSchema.matchupPlayers)
        .innerJoin(
          PublicSchema.matchups,
          eq(PublicSchema.matchupPlayers.matchupId, PublicSchema.matchups.id),
        )
        .where(
          and(
            eq(PublicSchema.matchups.leagueId, leagueId),
            eq(PublicSchema.matchups.weekNumber, currentWeek),
          ),
        );

      for (const mp of priorMatchupPlayers) {
        if (!priorPositionsByTeam.has(mp.teamId)) {
          priorPositionsByTeam.set(mp.teamId, new Map());
        }
        const teamMap = priorPositionsByTeam.get(mp.teamId);
        if (teamMap) {
          teamMap.set(mp.playerId, mp.positionId);
        }
      }
    }

    // Bulk-fetch all team members for all teams in the new week (one query instead of 2×N)
    const allTeamIds = [
      ...new Set(teamPairs.flatMap((p) => [p.team1Id, p.team2Id])),
    ];
    const allTeamMembersForWeek =
      allTeamIds.length > 0
        ? await db
            .select({
              teamId: PublicSchema.teamMembers.teamId,
              playerId: PublicSchema.teamMembers.playerId,
              positionId: PublicSchema.teamMembers.positionId,
            })
            .from(PublicSchema.teamMembers)
            .where(
              and(
                eq(PublicSchema.teamMembers.leagueId, leagueId),
                inArray(PublicSchema.teamMembers.teamId, allTeamIds),
              ),
            )
        : [];

    const membersByTeamId = new Map<
      number,
      Array<{ playerId: number; positionId: number | null }>
    >();
    for (const m of allTeamMembersForWeek) {
      if (m.teamId === null || m.playerId === null) continue;
      if (!membersByTeamId.has(m.teamId)) {
        membersByTeamId.set(m.teamId, []);
      }
      membersByTeamId
        .get(m.teamId)!
        .push({ playerId: m.playerId, positionId: m.positionId });
    }

    const resolvePosition = (
      teamId: number,
      playerId: number,
      teamMembersPositionId: number | null,
    ): number | null => {
      const priorPositions = priorPositionsByTeam.get(teamId);
      if (priorPositions?.has(playerId)) {
        return priorPositions.get(playerId) ?? null;
      }
      return teamMembersPositionId;
    };

    for (const matchup of newMatchups) {
      const pair = teamPairs[matchup.teamIndex];

      const team1Players = membersByTeamId.get(pair.team1Id) ?? [];
      const team2Players = membersByTeamId.get(pair.team2Id) ?? [];

      const allPlayers = [
        ...team1Players.map((p) => ({
          matchupId: matchup.id,
          playerId: p.playerId,
          teamId: pair.team1Id,
          positionId: resolvePosition(pair.team1Id, p.playerId, p.positionId),
        })),
        ...team2Players.map((p) => ({
          matchupId: matchup.id,
          playerId: p.playerId,
          teamId: pair.team2Id,
          positionId: resolvePosition(pair.team2Id, p.playerId, p.positionId),
        })),
      ];

      if (allPlayers.length > 0) {
        await db.insert(PublicSchema.matchupPlayers).values(allPlayers);
      }
    }

    // Update league current matchup and reset advance status
    if (newMatchups.length > 0) {
      await db
        .update(PublicSchema.leagues)
        .set({
          currentMatchup: newMatchups[0].id,
          weekAdvanceStatus: 'idle',
        })
        .where(eq(PublicSchema.leagues.id, leagueId));
    } else {
      await db
        .update(PublicSchema.leagues)
        .set({ weekAdvanceStatus: 'idle' })
        .where(eq(PublicSchema.leagues.id, leagueId));
    }
  } catch (error) {
    // Reset status on failure
    await db
      .update(PublicSchema.leagues)
      .set({ weekAdvanceStatus: 'idle' })
      .where(eq(PublicSchema.leagues.id, leagueId));
    throw error;
  }
}
