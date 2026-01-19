import { PublicSchema, runWithPublicClient } from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils';
import { LOGGER } from '@legacy-sports/logging';
import {
  DivisionalStrategy,
  type SchedulingStrategy as ISchedulingStrategy,
  RandomStrategy,
  RoundRobinStrategy,
} from '@legacy-sports/scheduling';
import { and, eq, ne, or } from 'drizzle-orm';
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

// Matchup status enum
const MatchupStatus = builder.enumType('MatchupStatus', {
  values: ['scheduled', 'in_progress', 'completed', 'cancelled'] as const,
});

// Stats loading status enum
const StatsLoadingStatus = builder.enumType('StatsLoadingStatus', {
  values: ['not_started', 'loading', 'completed', 'failed'] as const,
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
  statsLoadingStatus: 'not_started' | 'loading' | 'completed' | 'failed';
  selectedSeason: number | null;
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
    selectedSeason: t.exposeInt('selectedSeason', { nullable: true }),
    gamesPerMatchup: t.exposeInt('gamesPerMatchup', { nullable: true }),
    startTime: t.exposeString('startTime', { nullable: true }),
    endTime: t.exposeString('endTime', { nullable: true }),
    // Relational fields - using Team type imported from leagues.ts
    team1: t.field({
      type: Team,
      nullable: true,
      resolve: async (matchup, _args, context) => {
        if (!matchup.team1Id) return null;
        return await context.loaders.teams.load(matchup.team1Id);
      },
    }),
    team2: t.field({
      type: Team,
      nullable: true,
      resolve: async (matchup, _args, context) => {
        if (!matchup.team2Id) return null;
        return await context.loaders.teams.load(matchup.team2Id);
      },
    }),
  }),
});

// MatchupPlayerGame type - represents a single game's stats for a player in a matchup
const MatchupPlayerGame = builder.objectRef<{
  id: number;
  matchupPlayerId: number;
  gameNum: number;
  battingGameNum: number | null;
  fieldingGameNum: number | null;
  pitchingGameNum: number | null;
  fieldingGamePos: string;
  // NOTE: Scores are NOT stored in DB or returned via API
  // Frontend calculates scores using @legacy-sports/scoring package
  // Parent context for fetching game stats
  __playerId?: number;
  __season?: number;
}>('MatchupPlayerGame');

builder.objectType(MatchupPlayerGame, {
  description: 'Stats from a single game for a player in a matchup',
  fields: (t) => ({
    id: t.exposeID('id'),
    matchupPlayerId: t.exposeInt('matchupPlayerId'),
    gameNum: t.exposeInt('gameNum'),
    battingGameNum: t.exposeInt('battingGameNum', { nullable: true }),
    fieldingGameNum: t.exposeInt('fieldingGameNum', { nullable: true }),
    pitchingGameNum: t.exposeInt('pitchingGameNum', { nullable: true }),
    fieldingGamePos: t.exposeString('fieldingGamePos'),
    // NOTE: Score fields removed - frontend calculates using @legacy-sports/scoring
    battingStats: t.field({
      type: GameBattingRef,
      nullable: true,
      resolve: async (game, _args, context) => {
        LOGGER.debug(
          `[battingStats resolver] game.__playerId: ${game.__playerId}, game.__season: ${game.__season}, game.battingGameNum: ${game.battingGameNum}`,
        );
        if (!game.__playerId || !game.__season || !game.battingGameNum) {
          LOGGER.debug(
            '[battingStats resolver] Returning null - missing required field',
          );
          return null;
        }
        const key = `${game.__playerId}-${game.__season}-${game.battingGameNum}`;
        LOGGER.debug(`[battingStats resolver] Loading with key: ${key}`);
        const result = await context.loaders.gameBatting.load(key);
        LOGGER.debug(
          `[battingStats resolver] Result: ${result ? 'FOUND' : 'NULL'}`,
        );
        return result;
      },
    }),
    pitchingStats: t.field({
      type: GamePitchingRef,
      nullable: true,
      resolve: async (game, _args, context) => {
        if (!game.__playerId || !game.__season || !game.pitchingGameNum)
          return null;
        const key = `${game.__playerId}-${game.__season}-${game.pitchingGameNum}`;
        return await context.loaders.gamePitching.load(key);
      },
    }),
    fieldingStats: t.field({
      type: GameFieldingRef,
      nullable: true,
      resolve: async (game, _args, context) => {
        if (!game.__playerId || !game.__season || !game.fieldingGameNum)
          return null;
        const key = `${game.__playerId}-${game.__season}-${game.fieldingGameNum}`;
        const dbStats = await context.loaders.gameFielding.load(key);

        // Map database fields (innDef, eDef, dpDef) to GraphQL fields (inn, e, dp)
        if (!dbStats) return null;

        return {
          ...dbStats,
          pos: game.fieldingGamePos, // Use position from matchup_player_games
          g: 1, // Each game record represents 1 game played
          gs: null, // game_fielding doesn't track starts
          inn: dbStats.innDef ?? null,
          e: dbStats.eDef ?? null,
          dp: dbStats.dpDef ?? null,
          pb: null, // game_fielding doesn't have these fields
          sb: null,
          cs: null,
        };
      },
    }),
  }),
});

// MatchupPlayer type - represents a player assigned to a matchup
// Season selection is now stored in league_week_player_seasons table
const MatchupPlayer = builder.objectRef<{
  id: number;
  matchupId: number;
  playerId: number;
  season: number | null; // Joined from league_week_player_seasons
  teamId: number | null;
  positionId: number | null;
}>('MatchupPlayer');

builder.objectType(MatchupPlayer, {
  description:
    'A player assigned to a matchup (season from league_week_player_seasons)',
  fields: (t) => ({
    id: t.exposeID('id'),
    matchupId: t.exposeInt('matchupId'),
    playerId: t.exposeInt('playerId'),
    season: t.exposeInt('season', { nullable: true }),
    teamId: t.exposeInt('teamId', { nullable: true }),
    positionId: t.exposeInt('positionId', { nullable: true }),
    player: t.field({
      type: 'Player',
      nullable: true,
      resolve: async (matchupPlayer, _args, context) => {
        return await context.loaders.players.load(matchupPlayer.playerId);
      },
    }),
    games: t.field({
      type: [MatchupPlayerGame],
      resolve: async (matchupPlayer, _args, context) => {
        const games = await context.loaders.matchupPlayerGames.load(
          matchupPlayer.id,
        );

        // Add parent context (playerId and season) to each game for fetching game stats
        return games.map((game) => ({
          ...game,
          __playerId: matchupPlayer.playerId,
          __season: matchupPlayer.season ?? undefined,
        }));
      },
    }),
    seasonBatting: t.field({
      type: SeasonBattingRef,
      nullable: true,
      description: "Season batting stats for this player's selected season",
      resolve: async (matchupPlayer, _args, context) => {
        if (!matchupPlayer.season) return null;
        const key = `${matchupPlayer.playerId}-${matchupPlayer.season}`;
        return await context.loaders.seasonBatting.load(key);
      },
    }),
    seasonPitching: t.field({
      type: SeasonPitchingRef,
      nullable: true,
      description: "Season pitching stats for this player's selected season",
      resolve: async (matchupPlayer, _args, context) => {
        if (!matchupPlayer.season) return null;
        const key = `${matchupPlayer.playerId}-${matchupPlayer.season}`;
        return await context.loaders.seasonPitching.load(key);
      },
    }),
    seasonFielding: t.field({
      type: SeasonFieldingRef,
      nullable: true,
      description: "Season fielding stats for this player's selected season",
      resolve: async (matchupPlayer, _args, context) => {
        if (!matchupPlayer.season) return null;
        const key = `${matchupPlayer.playerId}-${matchupPlayer.season}`;
        return await context.loaders.seasonFielding.load(key);
      },
    }),
  }),
});

// Add matchupPlayers field to Matchup type (add this as a query)
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

      return await runWithPublicClient(getDbOptions(), async (db) => {
        // Get matchup players with their team assignment and position from team_members
        // Get the league_id and week_number from the matchup to lookup seasons
        const matchupInfo = await db
          .select({
            leagueId: PublicSchema.matchups.leagueId,
            weekNumber: PublicSchema.matchups.weekNumber,
          })
          .from(PublicSchema.matchups)
          .where(eq(PublicSchema.matchups.id, args.matchupId))
          .limit(1);

        if (matchupInfo.length === 0) {
          throw new Error(`Matchup ${args.matchupId} not found`);
        }

        const { leagueId, weekNumber } = matchupInfo[0];

        const results = await db
          .select({
            id: PublicSchema.matchupPlayers.id,
            matchupId: PublicSchema.matchupPlayers.matchupId,
            playerId: PublicSchema.matchupPlayers.playerId,
            season: PublicSchema.leagueWeekPlayerSeasons.season,
            teamId: PublicSchema.teamMembers.teamId,
            positionId: PublicSchema.teamMembers.positionId,
          })
          .from(PublicSchema.matchupPlayers)
          .leftJoin(
            PublicSchema.teamMembers,
            eq(
              PublicSchema.matchupPlayers.playerId,
              PublicSchema.teamMembers.playerId,
            ),
          )
          .leftJoin(
            PublicSchema.leagueWeekPlayerSeasons,
            and(
              eq(PublicSchema.leagueWeekPlayerSeasons.leagueId, leagueId),
              eq(PublicSchema.leagueWeekPlayerSeasons.weekNumber, weekNumber),
              eq(
                PublicSchema.leagueWeekPlayerSeasons.playerId,
                PublicSchema.matchupPlayers.playerId,
              ),
            ),
          )
          .where(eq(PublicSchema.matchupPlayers.matchupId, args.matchupId));

        return results;
      });
    },
  }),
);

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

      return await runWithPublicClient(getDbOptions(), async (db) => {
        const results = await db
          .select()
          .from(PublicSchema.matchups)
          .where(eq(PublicSchema.matchups.id, args.id))
          .limit(1);

        return results[0] || null;
      });
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

      return await runWithPublicClient(getDbOptions(), async (db) => {
        const conditions = [eq(PublicSchema.matchups.leagueId, args.leagueId)];

        if (args.weekNumber !== null && args.weekNumber !== undefined) {
          conditions.push(
            eq(PublicSchema.matchups.weekNumber, args.weekNumber),
          );
        }

        return await db
          .select()
          .from(PublicSchema.matchups)
          .where(and(...conditions));
      });
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

      return await runWithPublicClient(getDbOptions(), async (db) => {
        // Get the current matchup ID from the league
        const leagueResults = await db
          .select({ currentMatchup: PublicSchema.leagues.currentMatchup })
          .from(PublicSchema.leagues)
          .where(eq(PublicSchema.leagues.id, args.leagueId))
          .limit(1);

        if (!leagueResults[0]?.currentMatchup) {
          return null;
        }

        const matchupResults = await db
          .select()
          .from(PublicSchema.matchups)
          .where(eq(PublicSchema.matchups.id, leagueResults[0].currentMatchup))
          .limit(1);

        return matchupResults[0] || null;
      });
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

      return await runWithPublicClient(getDbOptions(), async (db) => {
        return await db
          .select()
          .from(PublicSchema.matchups)
          .where(
            and(
              eq(PublicSchema.matchups.leagueId, args.leagueId),
              eq(PublicSchema.matchups.weekNumber, args.weekNumber),
            ),
          );
      });
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
    selectedSeason: t.int({ required: false }),
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
      console.log(
        '[createMatchup] Starting mutation with input:',
        JSON.stringify(args.input, null, 2),
      );

      if (!context.user) {
        console.error(
          '[createMatchup] Authentication failed - no user in context',
        );
        throw new Error('Authentication required');
      }

      console.log('[createMatchup] User authenticated:', context.user.id);

      try {
        return await runWithPublicClient(getDbOptions(), async (db) => {
          // Wrap in transaction to ensure matchup creation, league update, and player population are atomic
          return await db.transaction(async (tx) => {
            console.log(
              '[createMatchup] Fetching league configuration for leagueId:',
              args.input.leagueId,
            );

            // Get league configuration for defaults
            const league = await tx
              .select({
                gamesPerMatchup: PublicSchema.leagues.gamesPerMatchup,
                minGamesPerSeason: PublicSchema.leagues.minGamesPerSeason,
              })
              .from(PublicSchema.leagues)
              .where(eq(PublicSchema.leagues.id, args.input.leagueId))
              .limit(1);

            if (!league[0]) {
              console.error(
                '[createMatchup] League not found:',
                args.input.leagueId,
              );
              throw new Error('League not found');
            }

            console.log(
              '[createMatchup] League found:',
              JSON.stringify(league[0], null, 2),
            );

            const gamesPerMatchup =
              args.input.gamesPerMatchup ?? league[0].gamesPerMatchup ?? 5;
            console.log(
              '[createMatchup] Using gamesPerMatchup:',
              gamesPerMatchup,
            );

            // Build the values object, only including optional fields if they're provided
            const values: {
              leagueId: number;
              weekNumber: number;
              status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
              gamesPerMatchup: number;
              team1Id?: number | null;
              team2Id?: number | null;
              selectedSeason?: number | null;
              startTime?: string | null;
              endTime?: string | null;
            } = {
              leagueId: args.input.leagueId,
              weekNumber: args.input.weekNumber,
              status: 'scheduled',
              gamesPerMatchup,
            };

            // Only add optional fields if they're provided
            if (
              args.input.team1Id !== undefined &&
              args.input.team1Id !== null
            ) {
              console.log(
                '[createMatchup] Adding team1Id:',
                args.input.team1Id,
              );
              values.team1Id = args.input.team1Id;
            }
            if (
              args.input.team2Id !== undefined &&
              args.input.team2Id !== null
            ) {
              console.log(
                '[createMatchup] Adding team2Id:',
                args.input.team2Id,
              );
              values.team2Id = args.input.team2Id;
            }
            if (
              args.input.selectedSeason !== undefined &&
              args.input.selectedSeason !== null
            ) {
              console.log(
                '[createMatchup] Adding selectedSeason:',
                args.input.selectedSeason,
              );
              values.selectedSeason = args.input.selectedSeason;
            }
            if (
              args.input.startTime !== undefined &&
              args.input.startTime !== null
            ) {
              console.log(
                '[createMatchup] Adding startTime:',
                args.input.startTime,
              );
              values.startTime = args.input.startTime;
            }
            if (
              args.input.endTime !== undefined &&
              args.input.endTime !== null
            ) {
              console.log(
                '[createMatchup] Adding endTime:',
                args.input.endTime,
              );
              values.endTime = args.input.endTime;
            }

            console.log(
              '[createMatchup] Final values object:',
              JSON.stringify(values, null, 2),
            );

            // Insert the matchup
            console.log(
              '[createMatchup] Attempting to insert matchup into database...',
            );
            const results = await tx
              .insert(PublicSchema.matchups)
              .values(values)
              .returning();

            console.log(
              '[createMatchup] Insert successful, result:',
              JSON.stringify(results[0], null, 2),
            );

            // Update the league's currentMatchup to point to the new matchup
            const newMatchupId = results[0].id;
            console.log(
              '[createMatchup] Updating league.currentMatchup to:',
              newMatchupId,
            );

            await tx
              .update(PublicSchema.leagues)
              .set({ currentMatchup: newMatchupId })
              .where(eq(PublicSchema.leagues.id, args.input.leagueId));

            console.log('[createMatchup] League updated successfully');

            // Auto-populate matchup players with random seasons
            console.log(
              '[createMatchup] Fetching team members for both teams...',
            );
            const teamMembersForBothTeams = await tx
              .select()
              .from(PublicSchema.teamMembers)
              .where(
                or(
                  eq(PublicSchema.teamMembers.teamId, args.input.team1Id),
                  eq(PublicSchema.teamMembers.teamId, args.input.team2Id),
                ),
              );

            console.log(
              `[createMatchup] Found ${teamMembersForBothTeams.length} team members`,
            );

            // For each team member, select a random season and create matchupPlayer record
            const matchupPlayerInserts: Array<{
              matchupId: number;
              playerId: number;
              season: number;
              teamId: number;
            }> = [];

            for (const member of teamMembersForBothTeams) {
              console.log(
                `[createMatchup] Processing player ${member.playerId} from team ${member.teamId}`,
              );

              // Query all available seasons for this player from season_batting
              const playerSeasons = await tx
                .select({ season: PublicSchema.seasonBatting.season })
                .from(PublicSchema.seasonBatting)
                .where(eq(PublicSchema.seasonBatting.playerId, member.playerId))
                .groupBy(PublicSchema.seasonBatting.season);

              if (playerSeasons.length === 0) {
                console.log(
                  `[createMatchup] No seasons found for player ${member.playerId}, skipping`,
                );
                continue;
              }

              // Randomly select one season
              const randomIndex = Math.floor(
                Math.random() * playerSeasons.length,
              );
              const selectedSeason = playerSeasons[randomIndex].season;
              console.log(
                `[createMatchup] Selected season ${selectedSeason} for player ${member.playerId}`,
              );

              matchupPlayerInserts.push({
                matchupId: newMatchupId,
                playerId: member.playerId,
                season: selectedSeason,
                teamId: member.teamId,
              });
            }

            // Bulk insert matchup players
            if (matchupPlayerInserts.length > 0) {
              console.log(
                `[createMatchup] Inserting ${matchupPlayerInserts.length} matchup players...`,
              );
              await tx
                .insert(PublicSchema.matchupPlayers)
                .values(matchupPlayerInserts);
              console.log(
                '[createMatchup] Matchup players inserted successfully',
              );
            } else {
              console.log('[createMatchup] No matchup players to insert');
            }

            return results[0];
          }); // End transaction
        }); // End runWithPublicClient
      } catch (error) {
        console.error('[createMatchup] Error occurred:', error);
        console.error(
          '[createMatchup] Error stack:',
          error instanceof Error ? error.stack : 'No stack trace',
        );
        console.error(
          '[createMatchup] Error details:',
          JSON.stringify(error, Object.getOwnPropertyNames(error)),
        );
        throw error;
      }
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

      return await runWithPublicClient(getDbOptions(), async (db) => {
        const updateData: { team1Score?: string; team2Score?: string } = {};

        if (args.team1Score !== null && args.team1Score !== undefined) {
          updateData.team1Score = args.team1Score.toString();
        }
        if (args.team2Score !== null && args.team2Score !== undefined) {
          updateData.team2Score = args.team2Score.toString();
        }

        const results = await db
          .update(PublicSchema.matchups)
          .set(updateData)
          .where(eq(PublicSchema.matchups.id, args.matchupId))
          .returning();

        if (!results[0]) {
          throw new Error('Matchup not found');
        }

        return results[0];
      });
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

      return await runWithPublicClient(getDbOptions(), async (db) => {
        const results = await db
          .update(PublicSchema.matchups)
          .set({ status: args.status })
          .where(eq(PublicSchema.matchups.id, args.matchupId))
          .returning();

        if (!results[0]) {
          throw new Error('Matchup not found');
        }

        return results[0];
      });
    },
  }),
);

// Mutation: triggerGameSelection - Triggers automated game selection for a matchup week
builder.mutationField('triggerGameSelection', (t) =>
  t.field({
    type: 'Boolean',
    args: {
      matchupId: t.arg.int({ required: true }),
      weekNumber: t.arg.int({ required: true }),
    },
    resolve: async (parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      return await runWithPublicClient(getDbOptions(), async (db) => {
        // Validate the matchup exists and get gamesPerMatchup
        const matchup = await db
          .select()
          .from(PublicSchema.matchups)
          .where(eq(PublicSchema.matchups.id, args.matchupId))
          .limit(1);

        if (!matchup[0]) {
          throw new Error('Matchup not found');
        }

        const leagueId = matchup[0].leagueId;
        const gamesPerMatchup = matchup[0].gamesPerMatchup || 5;

        // Call the game-selection API Gateway endpoint
        try {
          const apiBaseUrl = process.env.INTERNAL_API_BASE_URL;
          if (!apiBaseUrl) {
            throw new Error(
              'INTERNAL_API_BASE_URL environment variable not set',
            );
          }

          // Step 1: Create matchup_players records if they don't exist
          const createEndpoint = `${apiBaseUrl}/games/create-matchup`;

          const createResponse = await fetch(createEndpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              league: leagueId,
              week: args.weekNumber,
            }),
          });

          if (!createResponse.ok) {
            const errorText = await createResponse.text();
            throw new Error(
              `Create matchup failed: ${createResponse.status} ${errorText}`,
            );
          }

          const createResult = (await createResponse.json()) as unknown;
          LOGGER.info(`Created matchup players for matchup ${args.matchupId}`, {
            createResult,
          });

          // Step 2: Select games for each game number (1 through gamesPerMatchup)
          const selectEndpoint = `${apiBaseUrl}/games/select-game`;

          for (
            let gameNumber = 1;
            gameNumber <= gamesPerMatchup;
            gameNumber++
          ) {
            const selectResponse = await fetch(selectEndpoint, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                matchupId: args.matchupId,
                gameNumber,
              }),
            });

            if (!selectResponse.ok) {
              const errorText = await selectResponse.text();
              throw new Error(
                `Select game ${gameNumber} failed: ${selectResponse.status} ${errorText}`,
              );
            }

            const selectResult = (await selectResponse.json()) as unknown;
            LOGGER.info(
              `Selected game ${gameNumber} for matchup ${args.matchupId}`,
              { selectResult },
            );
          }

          LOGGER.info(
            `Completed game selection for matchup ${args.matchupId}: ${gamesPerMatchup} games selected`,
            {
              matchupId: args.matchupId,
              leagueId,
              weekNumber: args.weekNumber,
              gamesPerMatchup,
            },
          );

          return true;
        } catch (error: unknown) {
          LOGGER.error('Failed to trigger game selection', { error });
          const errorMessage: string =
            error instanceof Error ? error.message : JSON.stringify(error);
          throw new Error(`Failed to trigger game selection: ${errorMessage}`);
        }
      });
    },
  }),
);

// Mutation: advanceWeekGames - Select next game for all matchups in a league week
builder.mutationField('advanceWeekGames', (t) =>
  t.field({
    type: 'Boolean',
    args: {
      leagueId: t.arg.int({ required: true }),
      weekNumber: t.arg.int({ required: true }),
    },
    resolve: async (parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      return await runWithPublicClient(getDbOptions(), async (db) => {
        // Get all matchups for this league/week
        const matchups = await db
          .select()
          .from(PublicSchema.matchups)
          .where(
            and(
              eq(PublicSchema.matchups.leagueId, args.leagueId),
              eq(PublicSchema.matchups.weekNumber, args.weekNumber),
            ),
          );

        if (matchups.length === 0) {
          throw new Error(
            `No matchups found for league ${args.leagueId} week ${args.weekNumber}`,
          );
        }

        LOGGER.info(
          `Found ${matchups.length} matchups for league ${args.leagueId} week ${args.weekNumber}`,
        );

        // Determine which game number to select next
        // Check the first matchup to see how many games are already selected
        const firstMatchup = matchups[0];
        const matchupPlayers = await db
          .select()
          .from(PublicSchema.matchupPlayers)
          .where(eq(PublicSchema.matchupPlayers.matchupId, firstMatchup.id))
          .limit(1);

        if (matchupPlayers.length === 0) {
          throw new Error(
            'No matchup players found - create matchup players first',
          );
        }

        // Check existing games for this matchup player
        const existingGames = await db
          .select()
          .from(PublicSchema.matchupPlayerGames)
          .where(
            eq(
              PublicSchema.matchupPlayerGames.matchupPlayerId,
              matchupPlayers[0].id,
            ),
          );

        // Find the highest game number already selected
        const maxGameNum = existingGames.reduce((max, game) => {
          return game.gameNum !== null && game.gameNum > max
            ? game.gameNum
            : max;
        }, 0);

        const nextGameNumber = maxGameNum + 1;
        const gamesPerMatchup = firstMatchup.gamesPerMatchup || 5;

        if (nextGameNumber > gamesPerMatchup) {
          throw new Error(
            `All ${gamesPerMatchup} games already selected for this week`,
          );
        }

        LOGGER.info(
          `Selecting game ${nextGameNumber} for all matchups in league ${args.leagueId} week ${args.weekNumber}`,
        );

        // Call the game-selection API Gateway endpoint for each matchup
        try {
          const apiBaseUrl = process.env.INTERNAL_API_BASE_URL;
          if (!apiBaseUrl) {
            throw new Error(
              'INTERNAL_API_BASE_URL environment variable not set',
            );
          }

          const selectEndpoint = `${apiBaseUrl}/games/select-game`;

          // Select the next game for each matchup
          for (const matchup of matchups) {
            const selectResponse = await fetch(selectEndpoint, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                matchupId: matchup.id,
                gameNumber: nextGameNumber,
              }),
            });

            if (!selectResponse.ok) {
              const errorText = await selectResponse.text();
              throw new Error(
                `Select game ${nextGameNumber} failed for matchup ${matchup.id}: ${selectResponse.status} ${errorText}`,
              );
            }

            const selectResult = (await selectResponse.json()) as unknown;
            LOGGER.info(
              `Selected game ${nextGameNumber} for matchup ${matchup.id}`,
              { selectResult },
            );
          }

          LOGGER.info(
            `Completed game ${nextGameNumber} selection for ${matchups.length} matchups`,
            {
              leagueId: args.leagueId,
              weekNumber: args.weekNumber,
              gameNumber: nextGameNumber,
            },
          );

          return true;
        } catch (error: unknown) {
          LOGGER.error('Failed to advance week games', { error });
          const errorMessage: string =
            error instanceof Error ? error.message : JSON.stringify(error);
          throw new Error(`Failed to advance week games: ${errorMessage}`);
        }
      });
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

      const { StandingsService } = await import(
        '../services/standings-service'
      );

      const standings = await StandingsService.getStandings({
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

      const { StandingsService } = await import(
        '../services/standings-service'
      );

      return await StandingsService.getHeadToHead({
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

      const { StandingsService } = await import(
        '../services/standings-service'
      );

      const results = await StandingsService.getSeasonSummary(
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

      const { StandingsService } = await import(
        '../services/standings-service'
      );

      const qualifications = await StandingsService.getPlayoffRace({
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

      const { StandingsService } = await import(
        '../services/standings-service'
      );

      return await StandingsService.getMatchupHistory({
        leagueId: args.leagueId,
        season: args.season,
        teamId: args.teamId,
        status: args.status,
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

      const { StandingsService } = await import(
        '../services/standings-service'
      );

      return await StandingsService.getTeamRecentMatchups(
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

      const { StandingsService } = await import(
        '../services/standings-service'
      );

      return await StandingsService.getMatchupStats(
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

      const { StandingsService } = await import(
        '../services/standings-service'
      );

      const powerRankings = await StandingsService.getPowerRankings(
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

// Mutation: advanceLeagueWeek
// Advances the entire league to the next week by:
// 1. Completing all current matchups
// 2. Creating new matchups for all team pairs
// 3. Auto-populating players for each matchup
builder.mutationField('advanceLeagueWeek', (t) =>
  t.field({
    type: [Matchup],
    args: {
      leagueId: t.arg.int({ required: true }),
    },
    resolve: async (parent, args, context) => {
      console.log(
        '[advanceLeagueWeek] Starting mutation for leagueId:',
        args.leagueId,
      );

      if (!context.user) {
        console.error(
          '[advanceLeagueWeek] Authentication failed - no user in context',
        );
        throw new Error('Authentication required');
      }

      console.log('[advanceLeagueWeek] User authenticated:', context.user.id);

      return await runWithPublicClient(getDbOptions(), async (db) => {
        // Wrap everything in a transaction to ensure atomicity
        return await db.transaction(async (tx) => {
          // 1. Get the league and its configuration
          const league = await tx
            .select()
            .from(PublicSchema.leagues)
            .where(eq(PublicSchema.leagues.id, args.leagueId))
            .limit(1);

          if (!league[0]) {
            console.error(
              '[advanceLeagueWeek] League not found:',
              args.leagueId,
            );
            throw new Error('League not found');
          }

          console.log('[advanceLeagueWeek] League found:', league[0].name);

          // 2. Check if draft has been completed
          const draftStatus = league[0].draftStatus;
          if (draftStatus !== 'completed') {
            console.error(
              '[advanceLeagueWeek] Draft not completed. Status:',
              draftStatus,
            );
            throw new Error(
              `Cannot advance league week until draft is completed. Current draft status: ${draftStatus}`,
            );
          }

          console.log('[advanceLeagueWeek] Draft status: completed');

          // 3. Get all teams in the league
          const teams = await tx
            .select()
            .from(PublicSchema.teams)
            .where(eq(PublicSchema.teams.leagueId, args.leagueId));

          if (teams.length < 2) {
            console.error(
              '[advanceLeagueWeek] Not enough teams. Found:',
              teams.length,
            );
            throw new Error(
              'League must have at least 2 teams to create matchups',
            );
          }

          console.log('[advanceLeagueWeek] Found', teams.length, 'teams');

          // 4. Get all existing matchups to find the highest week and complete ongoing ones
          const existingMatchups = await tx
            .select()
            .from(PublicSchema.matchups)
            .where(eq(PublicSchema.matchups.leagueId, args.leagueId));

          const highestWeek = existingMatchups.reduce(
            (max, m) => Math.max(max, m.weekNumber ?? 0),
            0,
          );
          const nextWeek = highestWeek + 1;

          console.log(
            '[advanceLeagueWeek] Current week:',
            highestWeek,
            'Next week:',
            nextWeek,
          );

          // 5. Complete all non-completed matchups for the current week
          const currentWeekMatchups = existingMatchups.filter(
            (m) => m.weekNumber === highestWeek && m.status !== 'completed',
          );

          if (currentWeekMatchups.length > 0) {
            console.log(
              '[advanceLeagueWeek] Completing',
              currentWeekMatchups.length,
              'matchups from week',
              highestWeek,
            );
            await tx
              .update(PublicSchema.matchups)
              .set({ status: 'completed' })
              .where(
                and(
                  eq(PublicSchema.matchups.leagueId, args.leagueId),
                  eq(PublicSchema.matchups.weekNumber, highestWeek),
                  ne(PublicSchema.matchups.status, 'completed'),
                ),
              );
          }

          // 6. Create matchups for all team pairs using the league's configured scheduling strategy
          const gamesPerMatchup = league[0].gamesPerMatchup ?? 5;
          const createdMatchups: (typeof PublicSchema.matchups.$inferInsert)[] =
            [];

          // Check if matchups already exist for the next week
          const nextWeekMatchups = existingMatchups.filter(
            (m) => m.weekNumber === nextWeek,
          );
          if (nextWeekMatchups.length > 0) {
            console.log(
              '[advanceLeagueWeek] Found',
              nextWeekMatchups.length,
              'existing matchups for week',
              nextWeek,
            );

            // Update league's currentMatchup if not already set
            const leagueCurrentMatchup = league[0].currentMatchup;
            if (
              !leagueCurrentMatchup ||
              !nextWeekMatchups.find((m) => m.id === leagueCurrentMatchup)
            ) {
              // Current matchup is not set or doesn't belong to this week, update it
              if (nextWeekMatchups[0].id) {
                await tx
                  .update(PublicSchema.leagues)
                  .set({ currentMatchup: nextWeekMatchups[0].id })
                  .where(eq(PublicSchema.leagues.id, args.leagueId));
                console.log(
                  '[advanceLeagueWeek] Updated league currentMatchup to',
                  nextWeekMatchups[0].id,
                );
              }
            }

            console.log(
              '[advanceLeagueWeek] Returning existing matchups for week',
              nextWeek,
            );
            return nextWeekMatchups.map((m) => ({
              id: m.id ?? 0,
              weekNumber: m.weekNumber ?? nextWeek,
              leagueId: m.leagueId ?? args.leagueId,
              team1Id: m.team1Id ?? null,
              team2Id: m.team2Id ?? null,
              team1Score: m.team1Score ?? null,
              team2Score: m.team2Score ?? null,
              status: m.status ?? 'scheduled',
              statsLoadingStatus: m.statsLoadingStatus ?? 'not_started',
              selectedSeason: m.selectedSeason ?? null,
              gamesPerMatchup: m.gamesPerMatchup ?? null,
              startTime: m.startTime ?? null,
              endTime: m.endTime ?? null,
            }));
          }

          // Instantiate the appropriate scheduling strategy based on league configuration
          const schedulingStrategyType =
            league[0].schedulingStrategy || 'round-robin';
          let scheduler: ISchedulingStrategy;

          switch (schedulingStrategyType) {
            case 'divisional':
              scheduler = new DivisionalStrategy();
              break;
            case 'random':
              scheduler = new RandomStrategy();
              break;
            case 'round-robin':
            default:
              scheduler = new RoundRobinStrategy();
              break;
          }

          console.log(
            `[advanceLeagueWeek] Using ${schedulingStrategyType} scheduling strategy`,
          );

          const teamInfos = teams.map((t) => ({
            id: t.id,
            name: t.name,
            leagueId: args.leagueId,
          }));
          const pairings = scheduler.generatePairings(teamInfos, nextWeek);

          // Filter to only this week's pairings
          const weekPairings = pairings.filter(
            (p) => p.weekNumber === nextWeek,
          );

          console.log(
            `[advanceLeagueWeek] Creating ${weekPairings.length} matchups for week ${nextWeek}`,
          );

          for (const pairing of weekPairings) {
            console.log(
              '[advanceLeagueWeek] Creating matchup:',
              pairing.team1Id,
              'vs',
              pairing.team2Id,
            );

            // Validate that both teams exist and belong to this league
            const validTeamIds = teams.map((t) => t.id);
            if (!validTeamIds.includes(pairing.team1Id)) {
              console.error(
                '[advanceLeagueWeek] Team1 ID',
                pairing.team1Id,
                'not found in league',
                args.leagueId,
              );
              console.error(
                '[advanceLeagueWeek] Valid team IDs:',
                validTeamIds,
              );
              throw new Error(
                `Team ${pairing.team1Id} does not exist in league ${args.leagueId}`,
              );
            }
            if (!validTeamIds.includes(pairing.team2Id)) {
              console.error(
                '[advanceLeagueWeek] Team2 ID',
                pairing.team2Id,
                'not found in league',
                args.leagueId,
              );
              console.error(
                '[advanceLeagueWeek] Valid team IDs:',
                validTeamIds,
              );
              throw new Error(
                `Team ${pairing.team2Id} does not exist in league ${args.leagueId}`,
              );
            }

            const matchupData = {
              leagueId: args.leagueId,
              weekNumber: nextWeek,
              team1Id: pairing.team1Id,
              team2Id: pairing.team2Id,
              status: 'scheduled' as const,
              gamesPerMatchup,
            };

            let newMatchup: typeof PublicSchema.matchups.$inferSelect;
            try {
              const [insertedMatchup] = await tx
                .insert(PublicSchema.matchups)
                .values(matchupData)
                .returning();

              newMatchup = insertedMatchup;
              createdMatchups.push(newMatchup);
              console.log('[advanceLeagueWeek] Created matchup', newMatchup.id);
            } catch (insertError) {
              console.error(
                '[advanceLeagueWeek] Failed to insert matchup:',
                matchupData,
              );
              console.error('[advanceLeagueWeek] Insert error:', insertError);
              throw insertError;
            }

            // 6. Auto-populate players for this matchup
            try {
              console.log(
                '[advanceLeagueWeek] Auto-populating players for matchup',
                newMatchup.id,
              );

              // Get team members for both teams
              const teamMembers = await tx
                .select()
                .from(PublicSchema.teamMembers)
                .where(
                  or(
                    eq(PublicSchema.teamMembers.teamId, pairing.team1Id),
                    eq(PublicSchema.teamMembers.teamId, pairing.team2Id),
                  ),
                );

              console.log(
                '[advanceLeagueWeek] Found',
                teamMembers.length,
                'team members',
              );

              // For each unique player, ensure they have a season selected for this league/week
              const uniquePlayers = new Set(
                teamMembers.map((m) => m.playerId).filter(Boolean),
              );

              for (const playerId of uniquePlayers) {
                // Check if season already selected for this league/week/player
                const existingSeason = await tx
                  .select()
                  .from(PublicSchema.leagueWeekPlayerSeasons)
                  .where(
                    and(
                      eq(
                        PublicSchema.leagueWeekPlayerSeasons.leagueId,
                        args.leagueId,
                      ),
                      eq(
                        PublicSchema.leagueWeekPlayerSeasons.weekNumber,
                        nextWeek,
                      ),
                      eq(
                        PublicSchema.leagueWeekPlayerSeasons.playerId,
                        playerId,
                      ),
                    ),
                  )
                  .limit(1);

                if (existingSeason.length === 0) {
                  // Query available seasons for this player
                  const playerSeasons = await tx
                    .selectDistinct({
                      season: PublicSchema.seasonBatting.season,
                    })
                    .from(PublicSchema.seasonBatting)
                    .where(eq(PublicSchema.seasonBatting.playerId, playerId));

                  let selectedSeason: number;

                  if (playerSeasons.length === 0) {
                    // Use default season (2023) for players without season_batting records yet
                    console.log(
                      '[advanceLeagueWeek] No seasons found for player',
                      playerId,
                      '- using default season 2023',
                    );
                    selectedSeason = 2023;
                  } else {
                    // Pick a random season from available seasons
                    const randomSeason =
                      playerSeasons[
                        Math.floor(Math.random() * playerSeasons.length)
                      ];
                    selectedSeason = randomSeason.season;
                  }

                  // Insert season selection for this league/week/player
                  await tx.insert(PublicSchema.leagueWeekPlayerSeasons).values({
                    leagueId: args.leagueId,
                    weekNumber: nextWeek,
                    playerId,
                    season: selectedSeason,
                  });
                }
              }

              // Now insert matchup players (without season - that's in league_week_player_seasons)
              const matchupPlayersToInsert: (typeof PublicSchema.matchupPlayers.$inferInsert)[] =
                [];

              for (const member of teamMembers) {
                if (!member.playerId) continue;

                matchupPlayersToInsert.push({
                  matchupId: newMatchup.id,
                  playerId: member.playerId,
                  teamId: member.teamId,
                });
              }

              if (matchupPlayersToInsert.length > 0) {
                await tx
                  .insert(PublicSchema.matchupPlayers)
                  .values(matchupPlayersToInsert);

                console.log(
                  '[advanceLeagueWeek] Inserted',
                  matchupPlayersToInsert.length,
                  'matchup players',
                );
              }
            } catch (err) {
              console.error(
                '[advanceLeagueWeek] Error populating players for matchup',
                newMatchup.id,
                ':',
                err,
              );
              // Continue with other matchups even if this one fails
            }
          }

          console.log(
            '[advanceLeagueWeek] Successfully created',
            createdMatchups.length,
            'matchups for week',
            nextWeek,
          );

          // Update league's currentMatchup to point to the first matchup of the new week
          if (createdMatchups.length > 0 && createdMatchups[0].id) {
            await tx
              .update(PublicSchema.leagues)
              .set({ currentMatchup: createdMatchups[0].id })
              .where(eq(PublicSchema.leagues.id, args.leagueId));

            console.log(
              '[advanceLeagueWeek] Updated league currentMatchup to',
              createdMatchups[0].id,
            );
          }

          // Return the newly created matchups, mapped to the expected type
          return createdMatchups.map((m) => ({
            id: m.id ?? 0,
            weekNumber: m.weekNumber ?? nextWeek,
            leagueId: m.leagueId ?? args.leagueId,
            team1Id: m.team1Id ?? null,
            team2Id: m.team2Id ?? null,
            team1Score: m.team1Score ?? null,
            team2Score: m.team2Score ?? null,
            status: m.status ?? 'scheduled',
            statsLoadingStatus: m.statsLoadingStatus ?? 'not_started',
            selectedSeason: m.selectedSeason ?? null,
            gamesPerMatchup: m.gamesPerMatchup ?? null,
            startTime: m.startTime ?? null,
            endTime: m.endTime ?? null,
          }));
        }); // End transaction
      }); // End runWithPublicClient
    },
  }),
);
