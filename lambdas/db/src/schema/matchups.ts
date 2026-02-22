import { PublicSchema } from '@legacy-sports/db-client';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { LOGGER } from '@legacy-sports/logging';
import { isNegroLeague } from '@legacy-sports/utils';
import { builder } from './builder';
import { Team } from './leagues';
import {
  GameBattingRef,
  GameFieldingRef,
  GamePitchingRef,
  SeasonBattingRef,
  SeasonFieldingRef,
  SeasonPitchingRef,
} from './statistics';
import { selectSeasonsForPlayers } from '../services/season-selector';

// Matchup status enum
const MatchupStatus = builder.enumType('MatchupStatus', {
  values: ['scheduled', 'in_progress', 'completed', 'cancelled'] as const,
});

// Stats loading status enum
const StatsLoadingStatus = builder.enumType('StatsLoadingStatus', {
  values: [
    'not_started',
    'queued',
    'loading',
    'completed',
    'failed',
    'retry',
  ] as const,
});

// Extended Matchup type with all new fields
const Matchup = builder.objectRef<{
  id: number;
  weekNumber: number;
  leagueId: number;
  team1Id: number | null;
  team2Id: number | null;
  team1Score: string | null; // Decimal stored as string
  team2Score: string | null; // Decimal stored as string
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  statsLoadingStatus:
    | 'not_started'
    | 'queued'
    | 'loading'
    | 'completed'
    | 'failed'
    | 'retry';
  gamesPerMatchup: number | null;
  startTime: string | null;
  endTime: string | null;
}>('Matchup');

builder.objectType(Matchup, {
  description: 'A head-to-head matchup between two teams in a league',
  fields: (t) => ({
    id: t.exposeID('id'),
    weekNumber: t.exposeInt('weekNumber'),
    leagueId: t.exposeInt('leagueId'),
    team1Id: t.exposeInt('team1Id', { nullable: true }),
    team2Id: t.exposeInt('team2Id', { nullable: true }),
    team1Score: t.float({
      nullable: true,
      resolve: (matchup) =>
        matchup.team1Score ? parseFloat(matchup.team1Score) : null,
    }),
    team2Score: t.float({
      nullable: true,
      resolve: (matchup) =>
        matchup.team2Score ? parseFloat(matchup.team2Score) : null,
    }),
    status: t.field({
      type: MatchupStatus,
      resolve: (matchup) => matchup.status,
    }),
    statsLoadingStatus: t.field({
      type: StatsLoadingStatus,
      resolve: (matchup) => matchup.statsLoadingStatus,
    }),
    gamesPerMatchup: t.exposeInt('gamesPerMatchup', { nullable: true }),
    startTime: t.exposeString('startTime', { nullable: true }),
    endTime: t.exposeString('endTime', { nullable: true }),
    // Relational fields - using Team type imported from leagues.ts
    team1: t.field({
      type: Team,
      nullable: true,
      resolve: async (matchup, _args, context) => {
        if (!matchup.team1Id) return null;
        return context.loaders.teams.load(matchup.team1Id);
      },
    }),
    team2: t.field({
      type: Team,
      nullable: true,
      resolve: async (matchup, _args, context) => {
        if (!matchup.team2Id) return null;
        return context.loaders.teams.load(matchup.team2Id);
      },
    }),
    selectedGamesCount: t.int({
      description: 'Number of unique games selected for this matchup',
      resolve: async (matchup, _args, context) => {
        return context.loaders.selectedGamesCount.load(matchup.id);
      },
    }),
  }),
});

// Query: getMatchupById
builder.queryField('getMatchupById', (t) =>
  t.field({
    type: Matchup,
    nullable: true,
    args: {
      id: t.arg.int({ required: true }),
    },
    resolve: async (parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      const results = await context.db
        .select()
        .from(PublicSchema.matchups)
        .where(eq(PublicSchema.matchups.id, args.id))
        .limit(1);

      return results[0] || null;
    },
  }),
);

// Query: getMatchupsForLeague
builder.queryField('getMatchupsForLeague', (t) =>
  t.field({
    type: [Matchup],
    args: {
      leagueId: t.arg.int({ required: true }),
      weekNumber: t.arg.int({ required: false }),
    },
    resolve: async (parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      const conditions = [eq(PublicSchema.matchups.leagueId, args.leagueId)];

      if (args.weekNumber !== null && args.weekNumber !== undefined) {
        conditions.push(eq(PublicSchema.matchups.weekNumber, args.weekNumber));
      }

      return await context.db
        .select()
        .from(PublicSchema.matchups)
        .where(and(...conditions));
    },
  }),
);

// Query: getCurrentMatchupForLeague
builder.queryField('getCurrentMatchupForLeague', (t) =>
  t.field({
    type: Matchup,
    nullable: true,
    args: {
      leagueId: t.arg.int({ required: true }),
    },
    resolve: async (parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      // Get the current matchup ID from the league
      const leagueResults = await context.db
        .select({ currentMatchup: PublicSchema.leagues.currentMatchup })
        .from(PublicSchema.leagues)
        .where(eq(PublicSchema.leagues.id, args.leagueId))
        .limit(1);

      if (!leagueResults[0]?.currentMatchup) {
        return null;
      }

      const matchupResults = await context.db
        .select()
        .from(PublicSchema.matchups)
        .where(eq(PublicSchema.matchups.id, leagueResults[0].currentMatchup))
        .limit(1);

      return matchupResults[0] || null;
    },
  }),
);

// Query: getMatchupsByWeek
builder.queryField('getMatchupsByWeek', (t) =>
  t.field({
    type: [Matchup],
    args: {
      leagueId: t.arg.int({ required: true }),
      weekNumber: t.arg.int({ required: true }),
    },
    resolve: async (parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      return await context.db
        .select()
        .from(PublicSchema.matchups)
        .where(
          and(
            eq(PublicSchema.matchups.leagueId, args.leagueId),
            eq(PublicSchema.matchups.weekNumber, args.weekNumber),
          ),
        );
    },
  }),
);

// Input types for mutations
const CreateMatchupInput = builder.inputType('CreateMatchupInput', {
  fields: (t) => ({
    leagueId: t.int({ required: true }),
    weekNumber: t.int({ required: true }),
    team1Id: t.int({ required: false }),
    team2Id: t.int({ required: false }),
    gamesPerMatchup: t.int({ required: false }),
    startTime: t.string({ required: false }),
    endTime: t.string({ required: false }),
  }),
});

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
        })
        .from(PublicSchema.leagues)
        .where(eq(PublicSchema.leagues.id, args.input.leagueId))
        .limit(1);

      if (!league[0]) {
        throw new Error('League not found');
      }

      const gamesPerMatchup =
        args.input.gamesPerMatchup ?? league[0].gamesPerMatchup ?? 5;

      // Insert the matchup
      const results = await context.db
        .insert(PublicSchema.matchups)
        .values({
          leagueId: args.input.leagueId,
          weekNumber: args.input.weekNumber,
          team1Id: args.input.team1Id ?? null,
          team2Id: args.input.team2Id ?? null,
          gamesPerMatchup,
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

      // Update status to 'queued' before triggering game selection
      await context.db
        .update(PublicSchema.matchups)
        .set({ statsLoadingStatus: 'queued' })
        .where(eq(PublicSchema.matchups.id, args.matchupId));

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
        const message = {
          matchupId: args.matchupId,
          game: args.gameNumber,
        };

        const command = new SendMessageCommand({
          QueueUrl: sqsQueueUrl,
          MessageBody: JSON.stringify(message),
          MessageGroupId: `matchup-${args.matchupId}`,
          MessageDeduplicationId: `${args.matchupId}-${args.gameNumber}-${Date.now()}`,
        });

        await sqsClient.send(command);

        LOGGER.info('Game selection triggered', {
          matchupId: args.matchupId,
          gameNumber: args.gameNumber,
        });

        return true;
      } catch (error) {
        LOGGER.error('Failed to trigger game selection', {
          error: error instanceof Error ? error.message : String(error),
          matchupId: args.matchupId,
          gameNumber: args.gameNumber,
        });
        throw new Error('Failed to trigger game selection');
      }
    },
  }),
);

// Response type for advanceLeagueWeek
const AdvanceLeagueWeekResponse = builder.objectRef<{
  matchups: Array<{
    id: number;
    weekNumber: number;
    leagueId: number;
    team1Id: number | null;
    team2Id: number | null;
    team1Score: string | null;
    team2Score: string | null;
    status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
    statsLoadingStatus:
      | 'not_started'
      | 'queued'
      | 'loading'
      | 'completed'
      | 'failed'
      | 'retry';
    gamesPerMatchup: number | null;
    startTime: string | null;
    endTime: string | null;
  }>;
  currentMatchupId: number | null;
}>('AdvanceLeagueWeekResponse');

builder.objectType(AdvanceLeagueWeekResponse, {
  fields: (t) => ({
    matchups: t.field({
      type: [Matchup],
      resolve: (parent) => parent.matchups,
    }),
    currentMatchupId: t.exposeInt('currentMatchupId', { nullable: true }),
  }),
});

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
        for (const matchup of newMatchups) {
          const pair = teamPairs[matchup.teamIndex];

          // Get pair.team1Id players
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

          // Get pair.team2Id players
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

          // Insert matchup players
          const allPlayers = [
            ...team1Players.map((p) => ({
              matchupId: matchup.id,
              playerId: p.playerId,
              teamId: pair.team1Id,
            })),
            ...team2Players.map((p) => ({
              matchupId: matchup.id,
              playerId: p.playerId,
              teamId: pair.team2Id,
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

// ============================================================================
// HISTORY AND STANDINGS QUERIES (LS-22)
// ============================================================================

// TeamStanding type for standings queries
const TeamStanding = builder.objectRef<{
  teamId: number;
  teamName: string;
  wins: number;
  losses: number;
  ties: number;
  totalMatchups: number;
  pointsFor: number;
  pointsAgainst: number;
  winPercentage: number;
  averagePointsFor: number;
  averagePointsAgainst: number;
  rank: number | undefined;
}>('TeamStanding');

builder.objectType(TeamStanding, {
  description: 'Team standing information with wins, losses, and scoring stats',
  fields: (t) => ({
    teamId: t.exposeID('teamId'),
    teamName: t.exposeString('teamName'),
    wins: t.exposeInt('wins'),
    losses: t.exposeInt('losses'),
    ties: t.exposeInt('ties'),
    totalMatchups: t.exposeInt('totalMatchups'),
    pointsFor: t.exposeFloat('pointsFor'),
    pointsAgainst: t.exposeFloat('pointsAgainst'),
    winPercentage: t.exposeFloat('winPercentage'),
    averagePointsFor: t.exposeFloat('averagePointsFor'),
    averagePointsAgainst: t.exposeFloat('averagePointsAgainst'),
    rank: t.exposeInt('rank'),
  }),
});

// HeadToHeadRecord type
const HeadToHeadRecord = builder.objectRef<{
  team1Id: number;
  team2Id: number;
  team1Wins: number;
  team2Wins: number;
  ties: number;
  totalMatchups: number;
  team1TotalPoints: number;
  team2TotalPoints: number;
  averageTeam1Score: number;
  averageTeam2Score: number;
}>('HeadToHeadRecord');

builder.objectType(HeadToHeadRecord, {
  description: 'Head-to-head record between two teams',
  fields: (t) => ({
    team1Id: t.exposeID('team1Id'),
    team2Id: t.exposeID('team2Id'),
    team1Wins: t.exposeInt('team1Wins'),
    team2Wins: t.exposeInt('team2Wins'),
    ties: t.exposeInt('ties'),
    totalMatchups: t.exposeInt('totalMatchups'),
    team1TotalPoints: t.exposeFloat('team1TotalPoints'),
    team2TotalPoints: t.exposeFloat('team2TotalPoints'),
    averageTeam1Score: t.exposeFloat('averageTeam1Score'),
    averageTeam2Score: t.exposeFloat('averageTeam2Score'),
  }),
});

// SeasonResults type
const SeasonResults = builder.objectRef<{
  leagueId: number;
  season: number | null;
  totalMatchups: number;
  completedMatchups: number;
  standings: Array<{
    teamId: number;
    teamName: string;
    wins: number;
    losses: number;
    ties: number;
    totalMatchups: number;
    pointsFor: number;
    pointsAgainst: number;
    winPercentage: number;
    averagePointsFor: number;
    averagePointsAgainst: number;
    rank: number | undefined;
  }>;
}>('SeasonResults');

builder.objectType(SeasonResults, {
  description: 'Complete season results with standings',
  fields: (t) => ({
    leagueId: t.exposeID('leagueId'),
    season: t.exposeInt('season', { nullable: true }),
    totalMatchups: t.exposeInt('totalMatchups'),
    completedMatchups: t.exposeInt('completedMatchups'),
    standings: t.field({
      type: [TeamStanding],
      resolve: (parent) => parent.standings,
    }),
  }),
});

// PlayoffQualification type
const PlayoffQualification = builder.objectRef<{
  teamId: number;
  teamName: string;
  isQualified: boolean;
  seedNumber: number | null;
  standing: {
    teamId: number;
    teamName: string;
    wins: number;
    losses: number;
    ties: number;
    totalMatchups: number;
    pointsFor: number;
    pointsAgainst: number;
    winPercentage: number;
    averagePointsFor: number;
    averagePointsAgainst: number;
    rank: number | undefined;
  };
}>('PlayoffQualification');

builder.objectType(PlayoffQualification, {
  description: 'Playoff qualification status for a team',
  fields: (t) => ({
    teamId: t.exposeID('teamId'),
    teamName: t.exposeString('teamName'),
    isQualified: t.exposeBoolean('isQualified'),
    seedNumber: t.exposeInt('seedNumber', { nullable: true }),
    standing: t.field({
      type: TeamStanding,
      resolve: (parent) => parent.standing,
    }),
  }),
});

// MatchupStatusCounts type
const MatchupStatusCounts = builder.objectRef<{
  scheduled: number;
  inProgress: number;
  completed: number;
  cancelled: number;
  total: number;
}>('MatchupStatusCounts');

builder.objectType(MatchupStatusCounts, {
  description: 'Count of matchups by status',
  fields: (t) => ({
    scheduled: t.exposeInt('scheduled'),
    inProgress: t.exposeInt('inProgress'),
    completed: t.exposeInt('completed'),
    cancelled: t.exposeInt('cancelled'),
    total: t.exposeInt('total'),
  }),
});

// Query: getLeagueStandings
builder.queryField('getLeagueStandings', (t) =>
  t.field({
    type: [TeamStanding],
    args: {
      leagueId: t.arg.int({ required: true }),
      season: t.arg.int({ required: false }),
    },
    resolve: async (parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      const { StandingsService } =
        await import('../services/standings-service');

      const standings = await StandingsService.getStandings(context.db, {
        leagueId: args.leagueId,
        season: args.season,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return -- GraphQL builder type inference issue with optional rank field
      return standings as any;
    },
  }),
);

// Query: getHeadToHeadRecord
builder.queryField('getHeadToHeadRecord', (t) =>
  t.field({
    type: HeadToHeadRecord,
    args: {
      leagueId: t.arg.int({ required: true }),
      team1Id: t.arg.int({ required: true }),
      team2Id: t.arg.int({ required: true }),
    },
    resolve: async (parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      const { StandingsService } =
        await import('../services/standings-service');

      return await StandingsService.getHeadToHead(context.db, {
        leagueId: args.leagueId,
        team1Id: args.team1Id,
        team2Id: args.team2Id,
      });
    },
  }),
);

// Query: getSeasonResults
builder.queryField('getSeasonResults', (t) =>
  t.field({
    type: SeasonResults,
    args: {
      leagueId: t.arg.int({ required: true }),
      season: t.arg.int({ required: false }),
    },
    resolve: async (parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      const { StandingsService } =
        await import('../services/standings-service');

      const results = await StandingsService.getSeasonSummary(
        context.db,
        args.leagueId,
        args.season ?? null,
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return -- GraphQL builder type inference issue with optional rank field
      return results as any;
    },
  }),
);

// Query: getPlayoffRace
builder.queryField('getPlayoffRace', (t) =>
  t.field({
    type: [PlayoffQualification],
    args: {
      leagueId: t.arg.int({ required: true }),
      season: t.arg.int({ required: false }),
      playoffSpots: t.arg.int({ required: true }),
    },
    resolve: async (parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      const { StandingsService } =
        await import('../services/standings-service');

      const qualifications = await StandingsService.getPlayoffRace(context.db, {
        leagueId: args.leagueId,
        season: args.season ?? null,
        playoffSpots: args.playoffSpots,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return -- GraphQL builder type inference issue with optional rank field
      return qualifications as any;
    },
  }),
);

// Query: getMatchupHistory
builder.queryField('getMatchupHistory', (t) =>
  t.field({
    type: [Matchup],
    args: {
      leagueId: t.arg.int({ required: true }),
      season: t.arg.int({ required: false }),
      teamId: t.arg.int({ required: false }),
      status: t.arg({ type: MatchupStatus, required: false }),
      limit: t.arg.int({ required: false }),
    },
    resolve: async (parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      const { StandingsService } =
        await import('../services/standings-service');

      return await StandingsService.getMatchupHistory(context.db, {
        leagueId: args.leagueId,
        season: args.season,
        teamId: args.teamId ?? undefined,
        status: args.status ?? undefined,
        limit: args.limit ?? undefined,
      });
    },
  }),
);

// Query: getTeamRecentMatchups
builder.queryField('getTeamRecentMatchups', (t) =>
  t.field({
    type: [Matchup],
    args: {
      teamId: t.arg.int({ required: true }),
      limit: t.arg.int({ required: false }),
    },
    resolve: async (parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      const { StandingsService } =
        await import('../services/standings-service');

      return await StandingsService.getTeamRecentMatchups(
        context.db,
        args.teamId,
        args.limit ?? 10,
      );
    },
  }),
);

// Query: getMatchupStatusCounts
builder.queryField('getMatchupStatusCounts', (t) =>
  t.field({
    type: MatchupStatusCounts,
    args: {
      leagueId: t.arg.int({ required: true }),
      season: t.arg.int({ required: false }),
    },
    resolve: async (parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      const { StandingsService } =
        await import('../services/standings-service');

      return await StandingsService.getMatchupStats(
        context.db,
        args.leagueId,
        args.season ?? undefined,
      );
    },
  }),
);

// Query: getPowerRankings
builder.queryField('getPowerRankings', (t) =>
  t.field({
    type: [TeamStanding],
    args: {
      leagueId: t.arg.int({ required: true }),
      season: t.arg.int({ required: false }),
    },
    resolve: async (parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      const { StandingsService } =
        await import('../services/standings-service');

      const powerRankings = await StandingsService.getPowerRankings(
        context.db,
        args.leagueId,
        args.season ?? undefined,
      );

      // Return with powerRank as rank for consistency
      return powerRankings.map((pr) => ({
        ...pr,
        rank: pr.powerRank,
      }));
    },
  }),
);

// MatchupPlayer type
const MatchupPlayer = builder.objectRef<{
  id: number;
  matchupId: number;
  playerId: number;
  teamId: number;
  positionId: number | null;
  season: number | null;
}>('MatchupPlayer');

builder.objectType(MatchupPlayer, {
  description: 'A player selected for a specific matchup',
  fields: (t) => ({
    id: t.exposeID('id'),
    matchupId: t.exposeInt('matchupId'),
    playerId: t.exposeInt('playerId'),
    teamId: t.exposeInt('teamId'),
    positionId: t.exposeInt('positionId', { nullable: true }),
    season: t.exposeInt('season', { nullable: true }),
    // Player details
    player: t.field({
      type: 'Player',
      nullable: true,
      resolve: async (matchupPlayer, _args, context) => {
        return context.loaders.players.load(matchupPlayer.playerId);
      },
    }),
    // Season stats
    seasonBatting: t.field({
      type: SeasonBattingRef,
      nullable: true,
      resolve: async (matchupPlayer, _args, context) => {
        if (!matchupPlayer.season) return null;
        const key = `${matchupPlayer.playerId}-${matchupPlayer.season}`;
        return context.loaders.seasonBatting.load(key);
      },
    }),
    seasonPitching: t.field({
      type: SeasonPitchingRef,
      nullable: true,
      resolve: async (matchupPlayer, _args, context) => {
        if (!matchupPlayer.season) return null;
        const key = `${matchupPlayer.playerId}-${matchupPlayer.season}`;
        return context.loaders.seasonPitching.load(key);
      },
    }),
    seasonFielding: t.field({
      type: SeasonFieldingRef,
      nullable: true,
      resolve: async (matchupPlayer, _args, context) => {
        if (!matchupPlayer.season) return null;
        const key = `${matchupPlayer.playerId}-${matchupPlayer.season}`;
        return context.loaders.seasonFielding.load(key);
      },
    }),

    // Games selected for this matchup player
    games: t.field({
      type: [MatchupPlayerGameRef],
      resolve: async (matchupPlayer, _args, context) => {
        return context.loaders.matchupPlayerGames.load(matchupPlayer.id);
      },
    }),
  }),
});

// MatchupPlayerGame type - represents a selected game for a matchup player
export const MatchupPlayerGameRef = builder.objectRef<{
  id: number;
  matchupPlayerId: number;
  gameNum: number;
  gameIdentifier: string | null;
  fieldingGamePos: string | null;
  statsLoadingStatus: string | null;
}>('MatchupPlayerGame');

MatchupPlayerGameRef.implement({
  fields: (t) => ({
    id: t.exposeInt('id'),
    matchupPlayerId: t.exposeInt('matchupPlayerId'),
    gameNum: t.exposeInt('gameNum'),
    gameIdentifier: t.exposeString('gameIdentifier', { nullable: true }),
    fieldingGamePos: t.exposeString('fieldingGamePos', { nullable: true }),
    statsLoadingStatus: t.exposeString('statsLoadingStatus', {
      nullable: true,
    }),

    // Resolve the actual game stats for this selected game
    battingGame: t.field({
      type: GameBattingRef,
      nullable: true,
      resolve: async (game, _args, context) => {
        if (!game.gameIdentifier) return null;

        // Use DataLoaders to resolve the 3-step chain (MP → matchup → season)
        const mp = await context.loaders.matchupPlayersById.load(
          game.matchupPlayerId,
        );
        if (!mp) return null;

        const matchup = await context.loaders.matchupsById.load(mp.matchupId);
        if (!matchup) return null;

        const seasonKey = `${matchup.leagueId}-${matchup.weekNumber}-${mp.playerId}`;
        const season =
          await context.loaders.leagueWeekPlayerSeasons.load(seasonKey);
        if (season === null) return null;

        const statKey = `${mp.playerId}-${season}-${game.gameIdentifier}`;
        return context.loaders.gameBatting.load(statKey);
      },
    }),

    pitchingGame: t.field({
      type: GamePitchingRef,
      nullable: true,
      resolve: async (game, _args, context) => {
        // Pitchers only throw one game per week (game slot 1)
        if (game.gameNum !== 1) return null;
        if (!game.gameIdentifier) return null;

        const mp = await context.loaders.matchupPlayersById.load(
          game.matchupPlayerId,
        );
        if (!mp) return null;

        const matchup = await context.loaders.matchupsById.load(mp.matchupId);
        if (!matchup) return null;

        const seasonKey = `${matchup.leagueId}-${matchup.weekNumber}-${mp.playerId}`;
        const season =
          await context.loaders.leagueWeekPlayerSeasons.load(seasonKey);
        if (season === null) return null;

        const statKey = `${mp.playerId}-${season}-${game.gameIdentifier}`;
        return context.loaders.gamePitching.load(statKey);
      },
    }),

    fieldingGame: t.field({
      type: GameFieldingRef,
      nullable: true,
      resolve: async (game, _args, context) => {
        if (!game.gameIdentifier) return null;

        const mp = await context.loaders.matchupPlayersById.load(
          game.matchupPlayerId,
        );
        if (!mp) return null;

        const matchup = await context.loaders.matchupsById.load(mp.matchupId);
        if (!matchup) return null;

        const seasonKey = `${matchup.leagueId}-${matchup.weekNumber}-${mp.playerId}`;
        const season =
          await context.loaders.leagueWeekPlayerSeasons.load(seasonKey);
        if (season === null) return null;

        // Use the raw game fielding loader; augment with fieldingGamePos after
        const statKey = `${mp.playerId}-${season}-${game.gameIdentifier}`;
        const fieldingStat = await context.loaders.gameFielding.load(statKey);
        if (!fieldingStat) return null;

        // Map DB column names to the GraphQL GameFielding type shape
        return {
          playerId: fieldingStat.playerId,
          season: fieldingStat.season,
          gameNum: fieldingStat.gameNum,
          gameIdentifier: fieldingStat.gameIdentifier,
          pos: game.fieldingGamePos ?? 'UT',
          g: null,
          gs: null,
          inn: fieldingStat.innDef,
          po: fieldingStat.po,
          a: fieldingStat.a,
          e: fieldingStat.eDef,
          dp: fieldingStat.dpDef,
          pb: null,
          sb: null,
          cs: null,
        };
      },
    }),
  }),
});

// Query: getMatchupPlayers
builder.queryField('getMatchupPlayers', (t) =>
  t.field({
    type: [MatchupPlayer],
    args: {
      matchupId: t.arg.int({ required: true }),
    },
    resolve: async (parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      // Get matchup players with their selected seasons from league_week_player_seasons
      const matchupResults = await context.db
        .select({
          matchupId: PublicSchema.matchups.id,
          leagueId: PublicSchema.matchups.leagueId,
          weekNumber: PublicSchema.matchups.weekNumber,
        })
        .from(PublicSchema.matchups)
        .where(eq(PublicSchema.matchups.id, args.matchupId))
        .limit(1);

      if (!matchupResults[0]) {
        return [];
      }

      const { leagueId, weekNumber } = matchupResults[0];

      // Get matchup players
      const playersResults = await context.db
        .select({
          id: PublicSchema.matchupPlayers.id,
          matchupId: PublicSchema.matchupPlayers.matchupId,
          playerId: PublicSchema.matchupPlayers.playerId,
          teamId: PublicSchema.matchupPlayers.teamId,
        })
        .from(PublicSchema.matchupPlayers)
        .where(eq(PublicSchema.matchupPlayers.matchupId, args.matchupId));

      // Get team members to find position assignments
      const playerIds = playersResults.map((p) => p.playerId);

      if (playerIds.length === 0) {
        return [];
      }

      const teamMembersResults = await context.db
        .select({
          playerId: PublicSchema.teamMembers.playerId,
          positionId: PublicSchema.teamMembers.positionId,
        })
        .from(PublicSchema.teamMembers)
        .where(
          and(
            eq(PublicSchema.teamMembers.leagueId, leagueId),
            inArray(PublicSchema.teamMembers.playerId, playerIds),
          ),
        );

      const positionMap = new Map(
        teamMembersResults.map((tm) => [tm.playerId, tm.positionId]),
      );

      // Get selected seasons from league_week_player_seasons
      const seasonsResults = await context.db
        .select({
          playerId: PublicSchema.leagueWeekPlayerSeasons.playerId,
          season: PublicSchema.leagueWeekPlayerSeasons.season,
        })
        .from(PublicSchema.leagueWeekPlayerSeasons)
        .where(
          and(
            eq(PublicSchema.leagueWeekPlayerSeasons.leagueId, leagueId),
            eq(PublicSchema.leagueWeekPlayerSeasons.weekNumber, weekNumber),
          ),
        );

      const seasonMap = new Map(
        seasonsResults.map((s) => [s.playerId, s.season]),
      );

      // Combine the data
      return playersResults.map((player) => ({
        ...player,
        positionId: positionMap.get(player.playerId) ?? null,
        season: seasonMap.get(player.playerId) ?? null,
      }));
    },
  }),
);
