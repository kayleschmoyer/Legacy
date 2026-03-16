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
  getSelectedGamesCountBatch,
  PublicSchema,
} from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils/node';
import { LOGGER } from '@legacy-sports/logging';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { and, eq, inArray } from 'drizzle-orm';

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
// getSelectedGamesCountBatch is imported from
// @legacy-sports/db-client (matchup-queries-optimized).

// ── Mutation: autoSelectGames ────────────────────────────────────────────────
// Triggered nightly at midnight EST by EventBridge.
// For every active league with in-progress or scheduled (current-week) matchups,
// determines the next game number and triggers game selection via SQS.
// Also used by the commissioner UI button (leagueId provided).

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

        // 2. Bulk-fetch all actionable matchups (in_progress OR scheduled) for all
        //    active leagues in a single query. Scheduled matchups are included so that
        //    commissioner-triggered game selection works before the week is advanced.
        const activeLeagueIds = activeLeagues.map((l) => l.id);
        const allActionableMatchups =
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
                    inArray(PublicSchema.matchups.status, [
                      'in_progress',
                      'scheduled',
                    ]),
                  ),
                )
            : [];

        // Group matchups by league, then keep only the minimum (current) week so
        // future scheduled weeks are never accidentally processed.
        const allMatchupsByLeague = new Map<
          number,
          typeof allActionableMatchups
        >();
        for (const m of allActionableMatchups) {
          let leagueMatchups = allMatchupsByLeague.get(m.leagueId);
          if (!leagueMatchups) {
            leagueMatchups = [];
            allMatchupsByLeague.set(m.leagueId, leagueMatchups);
          }
          leagueMatchups.push(m);
        }

        // Resolve the current-week matchups per league (lowest week number)
        const matchupsByLeague = new Map<
          number,
          typeof allActionableMatchups
        >();
        for (const [lid, matchups] of allMatchupsByLeague) {
          const minWeek = Math.min(...matchups.map((m) => m.weekNumber));
          matchupsByLeague.set(
            lid,
            matchups.filter((m) => m.weekNumber === minWeek),
          );
        }

        // 3. Batch selectedGamesCount for all reference matchups in one query
        const referenceMatchupIds = activeLeagueIds
          .map((id) => matchupsByLeague.get(id)?.[0]?.id)
          .filter((id): id is number => id !== undefined);
        const selectedCountByMatchup = await getSelectedGamesCountBatch(
          context.db,
          referenceMatchupIds,
        );

        for (const league of activeLeagues) {
          try {
            // Use pre-fetched matchups for this league
            const currentMatchups = matchupsByLeague.get(league.id) ?? [];

            if (currentMatchups.length === 0) {
              LOGGER.debug(
                `[autoSelectGames] League ${league.id} (${league.name}) has no actionable matchups (in_progress or scheduled), skipping`,
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

            // Batch all selected-game counts in one query (GROUP BY)
            const selectedCountMap = await getSelectedGamesCountBatch(
              context.db,
              currentMatchups.map((m) => m.id),
            );

            let allGamesComplete = true;
            for (const matchup of currentMatchups) {
              const selectedCount = selectedCountMap.get(matchup.id) ?? 0;

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
                  .set({ currentMatchup: null, weekAdvanceStatus: 'idle' })
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
                let teamPositions = priorPositionsByTeam.get(mp.teamId);
                if (!teamPositions) {
                  teamPositions = new Map();
                  priorPositionsByTeam.set(mp.teamId, teamPositions);
                }
                teamPositions.set(mp.playerId, mp.positionId);
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
                let teamMembers = playoffMembersByTeam.get(m.teamId);
                if (!teamMembers) {
                  teamMembers = [];
                  playoffMembersByTeam.set(m.teamId, teamMembers);
                }
                teamMembers.push({
                  playerId: m.playerId,
                  positionId: m.positionId,
                });
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
              const { notificationService } = context;
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

            // 5. Advance the league week using the current week index so we
            //    operate on the correct pre-created matchup rather than
            //    recalculating from max(weekNumber) (which would be wrong when
            //    all weeks are pre-created by createAllMatchupsForLeague).
            await advanceLeagueWeekInternal(context.db, league.id, currentWeek);

            // Notify connected clients so they refetch matchup data without
            // requiring a manual page refresh.
            const weekAdvanceNotifier = context.notificationService;
            if (weekAdvanceNotifier) {
              try {
                await weekAdvanceNotifier.notifyWeekAdvanced(league.id, {
                  leagueId: league.id,
                  previousWeek: currentWeek,
                  newWeek: currentWeek + 1,
                  advancedAt: new Date().toISOString(),
                });
              } catch (err: unknown) {
                LOGGER.warn(
                  '[autoAdvanceMatchups] Failed to send week-advanced WebSocket notification (non-fatal)',
                  { leagueId: league.id, err },
                );
              }
            }

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
// Advances a league from `currentWeek` to `currentWeek + 1`.
//
// Assumes all weeks were pre-created by createAllMatchupsForLeague when the
// draft completed. This function:
//   1. Marks the current week's matchups as completed.
//   2. Looks up the pre-existing scheduled matchup for the next week.
//   3. Activates those matchups (status → in_progress) so autoSelectGames
//      can start selecting games for them.
//
// The currentWeek parameter MUST come from the in-progress matchup row that
// triggered the advance — NOT from max(weekNumber) — because all future weeks
// are already stored in the DB.

async function advanceLeagueWeekInternal(
  db: Db,
  leagueId: number,
  currentWeek: number,
): Promise<void> {
  // Set status to processing
  await db
    .update(PublicSchema.leagues)
    .set({ weekAdvanceStatus: 'processing' })
    .where(eq(PublicSchema.leagues.id, leagueId));

  try {
    const nextWeek = currentWeek + 1;

    // Complete all current week matchups and award badges
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

    // Activate the pre-created matchups for next week.
    // createAllMatchupsForLeague already inserted all weeks with status
    // 'scheduled' and populated matchup_players + leagueWeekPlayerSeasons.
    // All we need to do is flip them to 'in_progress' so autoSelectGames
    // will start picking games for them.
    const activatedMatchups = await db
      .update(PublicSchema.matchups)
      .set({ status: 'in_progress' })
      .where(
        and(
          eq(PublicSchema.matchups.leagueId, leagueId),
          eq(PublicSchema.matchups.weekNumber, nextWeek),
          eq(PublicSchema.matchups.status, 'scheduled'),
        ),
      )
      .returning({
        id: PublicSchema.matchups.id,
        team1Id: PublicSchema.matchups.team1Id,
        team2Id: PublicSchema.matchups.team2Id,
      });

    if (activatedMatchups.length === 0) {
      LOGGER.warn(
        '[advanceLeagueWeekInternal] No scheduled matchups found for next week — season may be over',
        { leagueId, nextWeek },
      );
      await db
        .update(PublicSchema.leagues)
        .set({ weekAdvanceStatus: 'idle' })
        .where(eq(PublicSchema.leagues.id, leagueId));
      return;
    }

    // Sync matchup_players positions from current teamMembers so roster changes
    // made during the prior week are reflected in the new week's lineup.
    // All future matchups are pre-created at draft time using positions that
    // were correct then; this step keeps them up-to-date as teams evolve.
    const activatedMatchupIds = activatedMatchups.map((m) => m.id);
    const teamIds = Array.from(
      new Set(
        activatedMatchups.flatMap((m) =>
          [m.team1Id, m.team2Id].filter((id): id is number => id !== null),
        ),
      ),
    );

    if (teamIds.length > 0) {
      const currentMembers = await db
        .select({
          teamId: PublicSchema.teamMembers.teamId,
          playerId: PublicSchema.teamMembers.playerId,
          positionId: PublicSchema.teamMembers.positionId,
        })
        .from(PublicSchema.teamMembers)
        .where(
          and(
            eq(PublicSchema.teamMembers.leagueId, leagueId),
            inArray(PublicSchema.teamMembers.teamId, teamIds),
          ),
        );

      const memberPositionMap = new Map<string, number | null>();
      for (const m of currentMembers) {
        if (m.teamId !== null) {
          memberPositionMap.set(`${m.teamId}-${m.playerId}`, m.positionId);
        }
      }

      const matchupPlayerRows = await db
        .select({
          id: PublicSchema.matchupPlayers.id,
          teamId: PublicSchema.matchupPlayers.teamId,
          playerId: PublicSchema.matchupPlayers.playerId,
        })
        .from(PublicSchema.matchupPlayers)
        .where(
          inArray(PublicSchema.matchupPlayers.matchupId, activatedMatchupIds),
        );

      for (const mp of matchupPlayerRows) {
        const key = `${mp.teamId}-${mp.playerId}`;
        if (memberPositionMap.has(key)) {
          await db
            .update(PublicSchema.matchupPlayers)
            .set({ positionId: memberPositionMap.get(key) ?? null })
            .where(eq(PublicSchema.matchupPlayers.id, mp.id));
        }
      }
    }

    // Update league current matchup/week and reset advance status
    await db
      .update(PublicSchema.leagues)
      .set({
        currentMatchup: activatedMatchups[0].id,
        currentWeek: nextWeek,
        weekAdvanceStatus: 'idle',
      })
      .where(eq(PublicSchema.leagues.id, leagueId));
  } catch (error) {
    // Reset status on failure
    await db
      .update(PublicSchema.leagues)
      .set({ weekAdvanceStatus: 'idle' })
      .where(eq(PublicSchema.leagues.id, leagueId));
    throw error;
  }
}
