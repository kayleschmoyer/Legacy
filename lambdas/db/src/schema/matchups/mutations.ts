/**
 * Matchups domain — mutation fields
 */

import { PublicSchema } from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import { isNegroLeague } from '@legacy-sports/utils';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';

import {
  AdvanceLeagueWeekResponse,
  CreateMatchupInput,
  Matchup,
  MatchupPlayer,
  MatchupStatus,
} from './types';
import { builder, Context } from '../builder';
import { selectSeasonsForPlayers } from '../../services/season-selector';

// Mutation: createMatchup
builder.mutationField('createMatchup', (t) =>
  t.field({
    type: Matchup,
    args: {
      input: t.arg({ type: CreateMatchupInput, required: true }),
    },
    resolve: async (parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      // Get league configuration for defaults
      const league = await context.db
        .select({
          gamesPerMatchup: PublicSchema.leagues.gamesPerMatchup,
          minGamesPerSeason: PublicSchema.leagues.minGamesPerSeason,
          spStartsPerMatchup: PublicSchema.leagues.spStartsPerMatchup,
        })
        .from(PublicSchema.leagues)
        .where(eq(PublicSchema.leagues.id, args.input.leagueId))
        .limit(1);

      if (!league[0]) {
        throw new Error('League not found');
      }

      const gamesPerMatchup =
        args.input.gamesPerMatchup ?? league[0].gamesPerMatchup ?? 5;
      const spStartsPerMatchup = league[0].spStartsPerMatchup ?? 1;

      // Insert the matchup
      const results = await context.db
        .insert(PublicSchema.matchups)
        .values({
          leagueId: args.input.leagueId,
          weekNumber: args.input.weekNumber,
          team1Id: args.input.team1Id ?? null,
          team2Id: args.input.team2Id ?? null,
          gamesPerMatchup,
          spStartsPerMatchup,
          startTime: args.input.startTime ?? null,
          endTime: args.input.endTime ?? null,
          status: 'scheduled',
        })
        .returning();

      return results[0];
    },
  }),
);

// Mutation: updateMatchupScore
builder.mutationField('updateMatchupScore', (t) =>
  t.field({
    type: Matchup,
    args: {
      matchupId: t.arg.int({ required: true }),
      team1Score: t.arg.float({ required: false }),
      team2Score: t.arg.float({ required: false }),
    },
    resolve: async (parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      const updateData: { team1Score?: string; team2Score?: string } = {};

      if (args.team1Score !== null && args.team1Score !== undefined) {
        updateData.team1Score = args.team1Score.toString();
      }
      if (args.team2Score !== null && args.team2Score !== undefined) {
        updateData.team2Score = args.team2Score.toString();
      }

      const results = await context.db
        .update(PublicSchema.matchups)
        .set(updateData)
        .where(eq(PublicSchema.matchups.id, args.matchupId))
        .returning();

      if (!results[0]) {
        throw new Error('Matchup not found');
      }

      return results[0];
    },
  }),
);

// Mutation: updateMatchupStatus
builder.mutationField('updateMatchupStatus', (t) =>
  t.field({
    type: Matchup,
    args: {
      matchupId: t.arg.int({ required: true }),
      status: t.arg({ type: MatchupStatus, required: true }),
    },
    resolve: async (parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      const results = await context.db
        .update(PublicSchema.matchups)
        .set({ status: args.status })
        .where(eq(PublicSchema.matchups.id, args.matchupId))
        .returning();

      if (!results[0]) {
        throw new Error('Matchup not found');
      }

      return results[0];
    },
  }),
);

// Mutation: triggerGameSelection - triggers the game-selection lambda via SQS
builder.mutationField('triggerGameSelection', (t) =>
  t.field({
    type: 'Boolean',
    args: {
      matchupId: t.arg.int({ required: true }),
      gameNumber: t.arg.int({ required: true }),
    },
    resolve: async (parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      // Validate the matchup exists
      const matchup = await context.db
        .select()
        .from(PublicSchema.matchups)
        .where(eq(PublicSchema.matchups.id, args.matchupId))
        .limit(1);

      if (!matchup[0]) {
        throw new Error('Matchup not found');
      }

      const { leagueId, weekNumber } = matchup[0];

      // Find ALL matchups for the same league and week so we trigger
      // game selection across the entire week, not just one matchup
      const allMatchups = await context.db
        .select({ id: PublicSchema.matchups.id })
        .from(PublicSchema.matchups)
        .where(
          and(
            eq(PublicSchema.matchups.leagueId, leagueId),
            eq(PublicSchema.matchups.weekNumber, weekNumber),
          ),
        );

      const matchupIds = allMatchups.map((m) => m.id);

      // Update status to 'queued' for ALL matchups in the week
      await context.db
        .update(PublicSchema.matchups)
        .set({ statsLoadingStatus: 'queued' })
        .where(inArray(PublicSchema.matchups.id, matchupIds));

      // Trigger the game-selection lambda via SQS
      const sqsQueueUrl = process.env.SQS_SELECT_GAME_URL;
      if (!sqsQueueUrl) {
        LOGGER.error('SQS_SELECT_GAME_URL not configured');
        throw new Error('Game selection service not configured');
      }

      const sqsClient = new SQSClient({
        region: process.env.AWS_REGION || 'us-east-1',
      });

      try {
        // Send an SQS message for each matchup in the week
        for (const matchupId of matchupIds) {
          const message = {
            matchupId,
            game: args.gameNumber,
          };

          const command = new SendMessageCommand({
            QueueUrl: sqsQueueUrl,
            MessageBody: JSON.stringify(message),
            MessageGroupId: `matchup-${matchupId}`,
            MessageDeduplicationId: `${matchupId}-${args.gameNumber}-${Date.now()}`,
          });

          await sqsClient.send(command);
        }

        LOGGER.info('Game selection triggered for all matchups in week', {
          leagueId,
          weekNumber,
          matchupIds,
          gameNumber: args.gameNumber,
        });

        return true;
      } catch (error) {
        LOGGER.error('Failed to trigger game selection', {
          error: error instanceof Error ? error.message : String(error),
          leagueId,
          weekNumber,
          matchupIds,
          gameNumber: args.gameNumber,
        });
        throw new Error('Failed to trigger game selection');
      }
    },
  }),
);

// Mutation: advanceLeagueWeek - Complete current week and create next week matchups
builder.mutationField('advanceLeagueWeek', (t) =>
  t.field({
    type: AdvanceLeagueWeekResponse,
    args: {
      leagueId: t.arg.int({ required: true }),
    },
    resolve: async (parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      // 1. Get league configuration and check advance status
      const leagueResult = await context.db
        .select({
          id: PublicSchema.leagues.id,
          gamesPerMatchup: PublicSchema.leagues.gamesPerMatchup,
          weekAdvanceStatus: PublicSchema.leagues.weekAdvanceStatus,
          spStartsPerMatchup: PublicSchema.leagues.spStartsPerMatchup,
        })
        .from(PublicSchema.leagues)
        .where(eq(PublicSchema.leagues.id, args.leagueId))
        .limit(1);

      if (!leagueResult[0]) {
        throw new Error('League not found');
      }

      const league = leagueResult[0];

      // Check if league is already processing
      if (
        league.weekAdvanceStatus === 'processing' ||
        league.weekAdvanceStatus === 'queued'
      ) {
        throw new Error(
          `League week advancement is already ${league.weekAdvanceStatus}. Please wait for the current operation to complete.`,
        );
      }

      // Set status to processing
      await context.db
        .update(PublicSchema.leagues)
        .set({ weekAdvanceStatus: 'processing' })
        .where(eq(PublicSchema.leagues.id, args.leagueId));

      try {
        const gamesPerMatchup = league.gamesPerMatchup ?? 5;
        const spStartsPerMatchup = league.spStartsPerMatchup ?? 1;

        // 2. Get all teams in the league
        const teams = await context.db
          .select({
            id: PublicSchema.teams.id,
            name: PublicSchema.teams.name,
            leagueId: PublicSchema.teams.leagueId,
            createdAt: PublicSchema.teams.createdAt,
            updatedAt: PublicSchema.teams.updatedAt,
            waiverOrder: PublicSchema.teams.waiverOrder,
            faabBudget: PublicSchema.teams.faabBudget,
          })
          .from(PublicSchema.teams)
          .where(eq(PublicSchema.teams.leagueId, args.leagueId));

        if (teams.length < 2) {
          throw new Error(
            'League must have at least 2 teams to create matchups',
          );
        }

        // 3. Find the highest week number that exists
        const existingMatchups = await context.db
          .select({
            weekNumber: PublicSchema.matchups.weekNumber,
            status: PublicSchema.matchups.status,
          })
          .from(PublicSchema.matchups)
          .where(eq(PublicSchema.matchups.leagueId, args.leagueId));

        const currentWeek =
          existingMatchups.reduce(
            (max, m) => Math.max(max, m.weekNumber ?? 0),
            0,
          ) || 0;
        const nextWeek = currentWeek + 1;

        // 4. Complete all current week matchups (if any exist)
        if (currentWeek > 0) {
          await context.db
            .update(PublicSchema.matchups)
            .set({ status: 'completed' })
            .where(
              and(
                eq(PublicSchema.matchups.leagueId, args.leagueId),
                eq(PublicSchema.matchups.weekNumber, currentWeek),
              ),
            );
        }

        // 5. Create matchups for next week (round-robin pairing)
        // Simple algorithm: pair teams sequentially, handling odd number of teams
        const teamPairs: Array<{ team1Id: number; team2Id: number }> = [];

        if (teams.length % 2 === 0) {
          // Even number of teams - pair them all
          for (let i = 0; i < teams.length; i += 2) {
            teamPairs.push({
              team1Id: teams[i].id,
              team2Id: teams[i + 1].id,
            });
          }
        } else {
          // Odd number - last team gets a bye week (no matchup)
          for (let i = 0; i < teams.length - 1; i += 2) {
            teamPairs.push({
              team1Id: teams[i].id,
              team2Id: teams[i + 1].id,
            });
          }
        }

        // 6. Insert matchups for the new week
        const newMatchups: Array<{ id: number; teamIndex: number }> = [];
        for (let i = 0; i < teamPairs.length; i++) {
          const pair = teamPairs[i];
          const result = await context.db
            .insert(PublicSchema.matchups)
            .values({
              leagueId: args.leagueId,
              weekNumber: nextWeek,
              team1Id: pair.team1Id,
              team2Id: pair.team2Id,
              gamesPerMatchup,
              spStartsPerMatchup,
              status: 'scheduled',
              team1Score: null,
              team2Score: null,
              startTime: null,
              endTime: null,
            })
            .returning({ id: PublicSchema.matchups.id });

          newMatchups.push({ id: result[0].id, teamIndex: i });
        }

        // 7. Auto-populate matchup players for each new matchup
        // Carry forward positions from the most recent prior matchup when available,
        // falling back to team_members positions for new players
        // Build a map of prior matchup positions per team (from current week's matchups)
        const priorPositionsByTeam = new Map<
          number,
          Map<number, number | null>
        >();
        if (currentWeek > 0) {
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
                eq(PublicSchema.matchups.leagueId, args.leagueId),
                eq(PublicSchema.matchups.weekNumber, currentWeek),
              ),
            );

          for (const mp of priorMatchupPlayers) {
            if (!priorPositionsByTeam.has(mp.teamId)) {
              priorPositionsByTeam.set(mp.teamId, new Map());
            }
            priorPositionsByTeam
              .get(mp.teamId)!
              .set(mp.playerId, mp.positionId);
          }
        }

        for (const matchup of newMatchups) {
          const pair = teamPairs[matchup.teamIndex];

          // Get current team_members for both teams
          const team1Players = await context.db
            .select({
              playerId: PublicSchema.teamMembers.playerId,
              positionId: PublicSchema.teamMembers.positionId,
            })
            .from(PublicSchema.teamMembers)
            .where(
              and(
                eq(PublicSchema.teamMembers.leagueId, args.leagueId),
                eq(PublicSchema.teamMembers.teamId, pair.team1Id),
              ),
            );

          const team2Players = await context.db
            .select({
              playerId: PublicSchema.teamMembers.playerId,
              positionId: PublicSchema.teamMembers.positionId,
            })
            .from(PublicSchema.teamMembers)
            .where(
              and(
                eq(PublicSchema.teamMembers.leagueId, args.leagueId),
                eq(PublicSchema.teamMembers.teamId, pair.team2Id),
              ),
            );

          // Resolve positions: prefer prior matchup positions, fall back to team_members
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

          // Insert matchup players with positions
          const allPlayers = [
            ...team1Players.map((p) => ({
              matchupId: matchup.id,
              playerId: p.playerId,
              teamId: pair.team1Id,
              positionId: resolvePosition(
                pair.team1Id,
                p.playerId,
                p.positionId,
              ),
            })),
            ...team2Players.map((p) => ({
              matchupId: matchup.id,
              playerId: p.playerId,
              teamId: pair.team2Id,
              positionId: resolvePosition(
                pair.team2Id,
                p.playerId,
                p.positionId,
              ),
            })),
          ];

          if (allPlayers.length > 0) {
            await context.db
              .insert(PublicSchema.matchupPlayers)
              .values(allPlayers);
          }
        }

        // Assign random seasons for all players in the new week
        // Get all players in the new week's matchups
        const weekPlayers = await context.db
          .select({ playerId: PublicSchema.matchupPlayers.playerId })
          .from(PublicSchema.matchupPlayers)
          .where(
            inArray(
              PublicSchema.matchupPlayers.matchupId,
              newMatchups.map((m) => m.id),
            ),
          );

        const playerIds = Array.from(
          new Set(weekPlayers.map((p) => p.playerId)),
        );

        LOGGER.info('Assigning seasons to players', {
          leagueId: args.leagueId,
          weekNumber: nextWeek,
          playerCount: playerIds.length,
        });

        // Get available seasons for all players (batting, pitching, and fielding)
        // Filter to seasons with at least 2x games as matchup requires
        const minGames = (league.gamesPerMatchup ?? 7) * 2;
        LOGGER.info(`Filtering seasons with at least ${minGames} games`);

        const [allBattingSeasons, allPitchingSeasons, allFieldingSeasons] =
          await Promise.all([
            context.db
              .select({
                playerId: PublicSchema.seasonBatting.playerId,
                season: PublicSchema.seasonBatting.season,
                g: PublicSchema.seasonBatting.g,
                lgId: PublicSchema.seasonBatting.lgId,
              })
              .from(PublicSchema.seasonBatting)
              .where(
                and(
                  inArray(PublicSchema.seasonBatting.playerId, playerIds),
                  isNotNull(PublicSchema.seasonBatting.g),
                ),
              )
              .then((rows) => rows.filter((row) => !isNegroLeague(row.lgId))),
            context.db
              .select({
                playerId: PublicSchema.seasonPitching.playerId,
                season: PublicSchema.seasonPitching.season,
                g: PublicSchema.seasonPitching.g,
                lgId: PublicSchema.seasonPitching.lgId,
              })
              .from(PublicSchema.seasonPitching)
              .where(
                and(
                  inArray(PublicSchema.seasonPitching.playerId, playerIds),
                  isNotNull(PublicSchema.seasonPitching.g),
                ),
              )
              .then((rows) => rows.filter((row) => !isNegroLeague(row.lgId))),
            context.db
              .select({
                playerId: PublicSchema.seasonFielding.playerId,
                season: PublicSchema.seasonFielding.season,
                g: PublicSchema.seasonFielding.g,
                lgId: PublicSchema.seasonFielding.lgId,
              })
              .from(PublicSchema.seasonFielding)
              .where(
                and(
                  inArray(PublicSchema.seasonFielding.playerId, playerIds),
                  isNotNull(PublicSchema.seasonFielding.g),
                ),
              )
              .then((rows) => rows.filter((row) => !isNegroLeague(row.lgId))),
          ]);

        LOGGER.info('Season query results', {
          battingSeasons: allBattingSeasons.length,
          pitchingSeasons: allPitchingSeasons.length,
          fieldingSeasons: allFieldingSeasons.length,
          minGames,
        });

        // Use extracted season selection service
        const selectionResult = selectSeasonsForPlayers(
          playerIds,
          allBattingSeasons,
          allPitchingSeasons,
          allFieldingSeasons,
          minGames,
          args.leagueId,
          nextWeek,
        );

        // Log skipped players for debugging
        if (selectionResult.skippedPlayers.length > 0) {
          LOGGER.warn('Some players could not be assigned seasons', {
            skippedCount: selectionResult.skippedPlayers.length,
            skippedPlayers: selectionResult.skippedPlayers,
          });
        }

        // Insert season selections
        if (selectionResult.selections.length > 0) {
          await context.db
            .insert(PublicSchema.leagueWeekPlayerSeasons)
            .values(selectionResult.selections);

          LOGGER.info('Season selections completed', {
            leagueId: args.leagueId,
            weekNumber: nextWeek,
            selectionsCreated: selectionResult.selections.length,
          });
        }

        LOGGER.info('Advanced league week', {
          leagueId: args.leagueId,
          fromWeek: currentWeek,
          toWeek: nextWeek,
          matchupsCreated: newMatchups.length,
          seasonSelectionsCreated: selectionResult.selections.length,
        });

        // Set status to success and update currentMatchup to first matchup of new week
        const currentMatchupId =
          newMatchups.length > 0 ? newMatchups[0].id : null;

        await context.db
          .update(PublicSchema.leagues)
          .set({
            weekAdvanceStatus: 'success',
            currentMatchup: currentMatchupId ?? undefined,
          })
          .where(eq(PublicSchema.leagues.id, args.leagueId));

        // Fetch full matchup data to return
        const createdMatchups = await context.db
          .select()
          .from(PublicSchema.matchups)
          .where(
            inArray(
              PublicSchema.matchups.id,
              newMatchups.map((m) => m.id),
            ),
          );

        return {
          matchups: createdMatchups,
          currentMatchupId,
        };
      } catch (error) {
        // Set status to failed on error
        await context.db
          .update(PublicSchema.leagues)
          .set({ weekAdvanceStatus: 'failed' })
          .where(eq(PublicSchema.leagues.id, args.leagueId));

        LOGGER.error('Failed to advance league week', {
          leagueId: args.leagueId,
          error: error instanceof Error ? error.message : String(error),
        });

        // Re-throw the error
        throw error;
      }
    },
  }),
);

// ── Matchup Roster Mutations ───────────────────────────────────────────────

/**
 * Helper: Verify that the calling user owns the team in this matchup.
 * Returns the matchup row so callers can check status.
 */
async function verifyMatchupTeamOwnership(
  context: Context,
  matchupPlayerId: number,
): Promise<{
  matchupPlayer: {
    id: number;
    matchupId: number;
    playerId: number;
    teamId: number;
    positionId: number | null;
  };
  matchup: {
    id: number;
    leagueId: number;
    weekNumber: number;
    status: string;
  };
}> {
  if (!context.user) {
    throw new Error('Authentication required');
  }

  // Get the matchup player
  const mpResult = await context.db
    .select({
      id: PublicSchema.matchupPlayers.id,
      matchupId: PublicSchema.matchupPlayers.matchupId,
      playerId: PublicSchema.matchupPlayers.playerId,
      teamId: PublicSchema.matchupPlayers.teamId,
      positionId: PublicSchema.matchupPlayers.positionId,
    })
    .from(PublicSchema.matchupPlayers)
    .where(eq(PublicSchema.matchupPlayers.id, matchupPlayerId))
    .limit(1);

  if (mpResult.length === 0) {
    throw new Error('Matchup player not found');
  }

  const matchupPlayer = mpResult[0];

  // Get the matchup
  const matchupResult = await context.db
    .select({
      id: PublicSchema.matchups.id,
      leagueId: PublicSchema.matchups.leagueId,
      weekNumber: PublicSchema.matchups.weekNumber,
      status: PublicSchema.matchups.status,
    })
    .from(PublicSchema.matchups)
    .where(eq(PublicSchema.matchups.id, matchupPlayer.matchupId))
    .limit(1);

  if (matchupResult.length === 0) {
    throw new Error('Matchup not found');
  }

  const matchup = matchupResult[0];

  // Verify the user owns this team via league_members
  const memberResult = await context.db
    .select({
      teamId: PublicSchema.leagueMembers.teamId,
      permissionLevel: PublicSchema.leagueMembers.permissionLevel,
    })
    .from(PublicSchema.leagueMembers)
    .where(
      and(
        eq(PublicSchema.leagueMembers.leagueId, matchup.leagueId),
        eq(PublicSchema.leagueMembers.userId, context.user.id),
      ),
    )
    .limit(1);

  if (memberResult.length === 0) {
    throw new Error('Not a member of this league');
  }

  const isCommissioner =
    memberResult[0].permissionLevel === 'commissioner' ||
    memberResult[0].permissionLevel === 'owner';

  if (!isCommissioner && memberResult[0].teamId !== matchupPlayer.teamId) {
    throw new Error('You can only modify your own team roster');
  }

  return { matchupPlayer, matchup };
}

// Mutation: updateMatchupPlayerPosition
// Allows changing a player's position within a matchup before it starts
builder.mutationField('updateMatchupPlayerPosition', (t) =>
  t.field({
    type: MatchupPlayer,
    args: {
      matchupPlayerId: t.arg.int({ required: true }),
      positionId: t.arg.int({ required: false }),
    },
    resolve: async (_parent, args, context) => {
      const { matchup } = await verifyMatchupTeamOwnership(
        context,
        args.matchupPlayerId,
      );

      // Only allow edits when matchup is scheduled (not yet locked)
      if (matchup.status !== 'scheduled') {
        throw new Error(
          'Cannot modify roster after the matchup has started or completed',
        );
      }

      const db = context.db;

      // Update the position
      const updated = await db
        .update(PublicSchema.matchupPlayers)
        .set({ positionId: args.positionId ?? null })
        .where(eq(PublicSchema.matchupPlayers.id, args.matchupPlayerId))
        .returning({
          id: PublicSchema.matchupPlayers.id,
          matchupId: PublicSchema.matchupPlayers.matchupId,
          playerId: PublicSchema.matchupPlayers.playerId,
          teamId: PublicSchema.matchupPlayers.teamId,
          positionId: PublicSchema.matchupPlayers.positionId,
        });

      if (updated.length === 0) {
        throw new Error('Failed to update matchup player position');
      }

      // Resolve season for response
      const seasonsResult = await db
        .select({
          season: PublicSchema.leagueWeekPlayerSeasons.season,
        })
        .from(PublicSchema.leagueWeekPlayerSeasons)
        .where(
          and(
            eq(PublicSchema.leagueWeekPlayerSeasons.leagueId, matchup.leagueId),
            eq(
              PublicSchema.leagueWeekPlayerSeasons.weekNumber,
              matchup.weekNumber,
            ),
            eq(
              PublicSchema.leagueWeekPlayerSeasons.playerId,
              updated[0].playerId,
            ),
          ),
        )
        .limit(1);

      return {
        ...updated[0],
        positionId: updated[0].positionId ?? null,
        season: seasonsResult[0]?.season ?? null,
      };
    },
  }),
);

// Mutation: swapMatchupPlayerPositions
// Atomically swaps two matchup players' positions within the same matchup
builder.mutationField('swapMatchupPlayerPositions', (t) =>
  t.field({
    type: [MatchupPlayer],
    args: {
      matchupPlayerIdA: t.arg.int({ required: true }),
      positionIdA: t.arg.int({ required: false }),
      matchupPlayerIdB: t.arg.int({ required: true }),
      positionIdB: t.arg.int({ required: false }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      const { matchupPlayerIdA, positionIdA, matchupPlayerIdB, positionIdB } =
        args;

      // Verify ownership of both players
      const { matchup: matchupA } = await verifyMatchupTeamOwnership(
        context,
        matchupPlayerIdA,
      );
      const { matchup: matchupB } = await verifyMatchupTeamOwnership(
        context,
        matchupPlayerIdB,
      );

      if (matchupA.id !== matchupB.id) {
        throw new Error('Both players must be in the same matchup');
      }

      if (matchupA.status !== 'scheduled') {
        throw new Error(
          'Cannot modify roster after the matchup has started or completed',
        );
      }

      const db = context.db;

      // Perform atom swap in a transaction
      const results = await db.transaction(async (tx) => {
        // Clear both positions first to avoid unique constraint violations
        await tx
          .update(PublicSchema.matchupPlayers)
          .set({ positionId: null })
          .where(
            inArray(PublicSchema.matchupPlayers.id, [
              matchupPlayerIdA,
              matchupPlayerIdB,
            ]),
          );

        // Assign new positions
        const updatedA = await tx
          .update(PublicSchema.matchupPlayers)
          .set({ positionId: positionIdA ?? null })
          .where(eq(PublicSchema.matchupPlayers.id, matchupPlayerIdA))
          .returning({
            id: PublicSchema.matchupPlayers.id,
            matchupId: PublicSchema.matchupPlayers.matchupId,
            playerId: PublicSchema.matchupPlayers.playerId,
            teamId: PublicSchema.matchupPlayers.teamId,
            positionId: PublicSchema.matchupPlayers.positionId,
          });

        const updatedB = await tx
          .update(PublicSchema.matchupPlayers)
          .set({ positionId: positionIdB ?? null })
          .where(eq(PublicSchema.matchupPlayers.id, matchupPlayerIdB))
          .returning({
            id: PublicSchema.matchupPlayers.id,
            matchupId: PublicSchema.matchupPlayers.matchupId,
            playerId: PublicSchema.matchupPlayers.playerId,
            teamId: PublicSchema.matchupPlayers.teamId,
            positionId: PublicSchema.matchupPlayers.positionId,
          });

        if (updatedA.length === 0 || updatedB.length === 0) {
          throw new Error('Failed to swap matchup player positions');
        }

        return [updatedA[0], updatedB[0]];
      });

      // Resolve seasons for response
      const seasonsResults = await db
        .select({
          playerId: PublicSchema.leagueWeekPlayerSeasons.playerId,
          season: PublicSchema.leagueWeekPlayerSeasons.season,
        })
        .from(PublicSchema.leagueWeekPlayerSeasons)
        .where(
          and(
            eq(
              PublicSchema.leagueWeekPlayerSeasons.leagueId,
              matchupA.leagueId,
            ),
            eq(
              PublicSchema.leagueWeekPlayerSeasons.weekNumber,
              matchupA.weekNumber,
            ),
            inArray(PublicSchema.leagueWeekPlayerSeasons.playerId, [
              results[0].playerId,
              results[1].playerId,
            ]),
          ),
        );

      const seasonMap = new Map(
        seasonsResults.map((s) => [s.playerId, s.season]),
      );

      return results.map((r) => ({
        ...r,
        positionId: r.positionId ?? null,
        season: seasonMap.get(r.playerId) ?? null,
      }));
    },
  }),
);
