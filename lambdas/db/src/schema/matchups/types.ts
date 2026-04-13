/**
 * Matchups domain — GraphQL type definitions
 */

import { PublicSchema } from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import {
  generateMatchupRecap,
  type MatchupContext,
  type PlayerPerformance,
} from '@legacy-sports/narrative';
import { eq } from 'drizzle-orm';
import { builder } from '../builder';
import { Team } from '../leagues/types';
import {
  GameBattingRef,
  GameFieldingRef,
  GamePitchingRef,
  SeasonBattingRef,
  SeasonFieldingRef,
  SeasonPitchingRef,
} from '../statistics';

// ── Enum Types ───────────────────────────────────────────────────────────────

// Matchup status enum
export const MatchupStatus = builder.enumType('MatchupStatus', {
  values: ['scheduled', 'in_progress', 'completed', 'cancelled'] as const,
});

// Stats loading status enum
export const StatsLoadingStatus = builder.enumType('StatsLoadingStatus', {
  values: [
    'not_started',
    'queued',
    'loading',
    'completed',
    'failed',
    'retry',
  ] as const,
});

// ── Core Matchup Type ────────────────────────────────────────────────────────

// Extended Matchup type with all new fields
export const Matchup = builder.objectRef<{
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
  spStartsPerMatchup: number | null;
  startTime: string | null;
  endTime: string | null;
}>('Matchup');

// MatchupRecap ref — declared here so the Matchup.recap field can reference it.
// builder.objectType(MatchupRecapType) is called below after the Matchup fields.
export const MatchupRecapType = builder.objectRef<{
  headline: string;
  narrative: string;
  highlights: string[];
  matchupType: string;
  winnerId: number | null;
}>('MatchupRecap');

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
    spStartsPerMatchup: t.exposeInt('spStartsPerMatchup', { nullable: true }),
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
    recap: t.field({
      type: MatchupRecapType,
      nullable: true,
      description:
        'Auto-generated narrative recap, only available for completed matchups.',
      resolve: async (matchup, _args, context) => {
        // Only generate recaps for completed matchups with two teams
        if (
          matchup.status !== 'completed' ||
          !matchup.team1Id ||
          !matchup.team2Id
        ) {
          return null;
        }

        // Load team names
        const [team1, team2] = await Promise.all([
          context.loaders.teams.load(matchup.team1Id),
          context.loaders.teams.load(matchup.team2Id),
        ]);

        if (!team1 || !team2) return null;

        // Load all matchup players for this matchup
        const matchupPlayers = await context.db
          .select()
          .from(PublicSchema.matchupPlayers)
          .where(eq(PublicSchema.matchupPlayers.matchupId, matchup.id));

        if (matchupPlayers.length === 0) return null;

        // Resolve player names, seasons, and position types in parallel
        const playerDetails = await Promise.all(
          matchupPlayers.map(async (mp) => {
            const [player, position] = await Promise.all([
              context.loaders.players.load(mp.playerId),
              mp.positionId
                ? context.loaders.leaguePositionById.load(mp.positionId)
                : Promise.resolve(null),
            ]);

            const seasonKey = `${matchup.leagueId}-${matchup.weekNumber}-${mp.playerId}`;
            const season =
              await context.loaders.leagueWeekPlayerSeasons.load(seasonKey);

            return { mp, player, position, season };
          }),
        );

        // Resolve batting/pitching season stats for each player
        const performanceMap = await Promise.all(
          playerDetails.map(async ({ mp, player, position, season }) => {
            if (!player || !season) return null;

            const isSp = position?.positionType === 'SP';
            const statsKey = `${mp.playerId}-${season}`;

            let fantasyPoints = 0;
            let perfStats: Partial<PlayerPerformance> = {};

            if (isSp) {
              const pitching =
                await context.loaders.seasonPitching.load(statsKey);
              if (pitching) {
                const ip = pitching.ip ?? 0;
                const k = pitching.so ?? 0;
                const er = pitching.er ?? 0;
                // Simple heuristic: IP*2 + K*1 - ER*2
                fantasyPoints = ip * 2 + k * 1 - er * 2;
                perfStats = {
                  isPitcher: true,
                  ip,
                  k,
                  er,
                };
              }
            } else {
              const batting =
                await context.loaders.seasonBatting.load(statsKey);
              if (batting) {
                const hr = batting.hr ?? 0;
                const rbi = batting.rbi ?? 0;
                const h = batting.h ?? 0;
                const sb = batting.sb ?? 0;
                const bb = batting.bb ?? 0;
                const ab = batting.ab ?? 0;
                // Simple heuristic: HR*4 + RBI*2 + H*1 + SB*2 + BB*1
                fantasyPoints = hr * 4 + rbi * 2 + h * 1 + sb * 2 + bb * 1;
                perfStats = {
                  hr,
                  rbi,
                  h,
                  sb,
                  bb,
                  ba: ab > 0 ? h / ab : undefined,
                };
              }
            }

            const perf: PlayerPerformance = {
              playerId: mp.playerId,
              playerName: `${player.firstName} ${player.lastName}`,
              season,
              fantasyPoints,
              ...perfStats,
            };
            return { teamId: mp.teamId, perf };
          }),
        );

        // Group performers by team
        const team1Performers: PlayerPerformance[] = [];
        const team2Performers: PlayerPerformance[] = [];
        for (const item of performanceMap) {
          if (!item) continue;
          if (item.teamId === matchup.team1Id) {
            team1Performers.push(item.perf);
          } else if (item.teamId === matchup.team2Id) {
            team2Performers.push(item.perf);
          }
        }

        const team1Score = matchup.team1Score
          ? parseFloat(matchup.team1Score)
          : 0;
        const team2Score = matchup.team2Score
          ? parseFloat(matchup.team2Score)
          : 0;

        const ctx: MatchupContext = {
          matchupId: matchup.id,
          weekNumber: matchup.weekNumber,
          leagueId: matchup.leagueId,
          team1: {
            teamId: matchup.team1Id,
            teamName: team1.name,
            score: team1Score,
            performers: team1Performers,
          },
          team2: {
            teamId: matchup.team2Id,
            teamName: team2.name,
            score: team2Score,
            performers: team2Performers,
          },
        };

        return generateMatchupRecap(ctx);
      },
    }),
  }),
});

// ── MatchupRecap Type Implementation ──────────────────────────────────────────

builder.objectType(MatchupRecapType, {
  description: 'Auto-generated narrative recap for a completed matchup',
  fields: (t) => ({
    headline: t.exposeString('headline', {
      description: 'Short headline summarising the matchup result',
    }),
    narrative: t.exposeString('narrative', {
      description: 'Two-to-three sentence narrative paragraph',
    }),
    highlights: t.stringList({
      description: 'Bullet-point highlights for standout player performances',
      resolve: (recap) => recap.highlights,
    }),
    matchupType: t.exposeString('matchupType', {
      description: 'Classification: blowout | close | normal',
    }),
    winnerId: t.exposeInt('winnerId', {
      nullable: true,
      description: 'ID of the winning team, or null on a tie',
    }),
  }),
});

// ── Input Types ──────────────────────────────────────────────────────────────

// Input types for mutations
export const CreateMatchupInput = builder.inputType('CreateMatchupInput', {
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

// ── Advance League Week Response ─────────────────────────────────────────────

// Response type for advanceLeagueWeek
export const AdvanceLeagueWeekResponse = builder.objectRef<{
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
    spStartsPerMatchup: number | null;
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

// ── Standings Types ──────────────────────────────────────────────────────────

// TeamStanding type for standings queries
export const TeamStanding = builder.objectRef<{
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
  avatarUrl?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  /** Division this team belongs to; null means the league has no divisions */
  divisionId?: number | null;
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
    avatarUrl: t.exposeString('avatarUrl', { nullable: true }),
    primaryColor: t.exposeString('primaryColor', { nullable: true }),
    secondaryColor: t.exposeString('secondaryColor', { nullable: true }),
    divisionId: t.exposeInt('divisionId', { nullable: true }),
  }),
});

// HeadToHeadRecord type
export const HeadToHeadRecord = builder.objectRef<{
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
export const SeasonResults = builder.objectRef<{
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
    avatarUrl?: string | null;
    primaryColor?: string | null;
    secondaryColor?: string | null;
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
export const PlayoffQualification = builder.objectRef<{
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
    avatarUrl?: string | null;
    primaryColor?: string | null;
    secondaryColor?: string | null;
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
export const MatchupStatusCounts = builder.objectRef<{
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

// ── Matchup Player Types ─────────────────────────────────────────────────────

// MatchupPlayer type
export const MatchupPlayer = builder.objectRef<{
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
    // Computed field: number of games this player will play in the matchup
    // SP players get spStartsPerMatchup; all others get gamesPerMatchup
    numberOfGames: t.int({
      description:
        'Number of games this player is expected to play in this matchup (SP uses spStartsPerMatchup, others use gamesPerMatchup)',
      resolve: async (matchupPlayer, _args, context) => {
        try {
          const matchup = await context.loaders.matchupsById.load(
            matchupPlayer.matchupId,
          );
          if (!matchup) return 0;

          const gamesPerMatchup = matchup.gamesPerMatchup ?? 0;

          // If no position assigned or no spStarts setting, use full games
          if (!matchupPlayer.positionId || matchup.spStartsPerMatchup == null) {
            return gamesPerMatchup;
          }

          // Look up the position type to check if SP
          const position = await context.loaders.leaguePositionById.load(
            matchupPlayer.positionId,
          );
          if (position?.positionType === 'SP') {
            return matchup.spStartsPerMatchup;
          }

          return gamesPerMatchup;
        } catch (err) {
          LOGGER.error(
            'Failed to resolve numberOfGames',
            err instanceof Error ? err : new Error(String(err)),
            {
              matchupPlayerId: matchupPlayer.id,
              matchupId: matchupPlayer.matchupId,
            },
          );
          return 0;
        }
      },
    }),
    // Player details
    player: t.field({
      type: 'Player',
      nullable: true,
      resolve: async (matchupPlayer, _args, context) => {
        try {
          return await context.loaders.players.load(matchupPlayer.playerId);
        } catch (err) {
          LOGGER.error(
            'Failed to resolve player',
            err instanceof Error ? err : new Error(String(err)),
            {
              matchupPlayerId: matchupPlayer.id,
              playerId: matchupPlayer.playerId,
            },
          );
          return null;
        }
      },
    }),
    // Season stats
    seasonBatting: t.field({
      type: SeasonBattingRef,
      nullable: true,
      resolve: async (matchupPlayer, _args, context) => {
        if (!matchupPlayer.season) return null;
        try {
          const key = `${matchupPlayer.playerId}-${matchupPlayer.season}`;
          return await context.loaders.seasonBatting.load(key);
        } catch (err) {
          LOGGER.error(
            'Failed to resolve seasonBatting',
            err instanceof Error ? err : new Error(String(err)),
            {
              matchupPlayerId: matchupPlayer.id,
              playerId: matchupPlayer.playerId,
              season: matchupPlayer.season,
            },
          );
          return null;
        }
      },
    }),
    seasonPitching: t.field({
      type: SeasonPitchingRef,
      nullable: true,
      resolve: async (matchupPlayer, _args, context) => {
        if (!matchupPlayer.season) return null;
        try {
          const key = `${matchupPlayer.playerId}-${matchupPlayer.season}`;
          return await context.loaders.seasonPitching.load(key);
        } catch (err) {
          LOGGER.error(
            'Failed to resolve seasonPitching',
            err instanceof Error ? err : new Error(String(err)),
            {
              matchupPlayerId: matchupPlayer.id,
              playerId: matchupPlayer.playerId,
              season: matchupPlayer.season,
            },
          );
          return null;
        }
      },
    }),
    seasonFielding: t.field({
      type: SeasonFieldingRef,
      nullable: true,
      resolve: async (matchupPlayer, _args, context) => {
        if (!matchupPlayer.season) return null;
        try {
          const key = `${matchupPlayer.playerId}-${matchupPlayer.season}`;
          return await context.loaders.seasonFielding.load(key);
        } catch (err) {
          LOGGER.error(
            'Failed to resolve seasonFielding',
            err instanceof Error ? err : new Error(String(err)),
            {
              matchupPlayerId: matchupPlayer.id,
              playerId: matchupPlayer.playerId,
              season: matchupPlayer.season,
            },
          );
          return null;
        }
      },
    }),

    // Games selected for this matchup player
    games: t.field({
      type: [MatchupPlayerGameRef],
      resolve: async (matchupPlayer, _args, context) => {
        try {
          return await context.loaders.matchupPlayerGames.load(
            matchupPlayer.id,
          );
        } catch (err) {
          LOGGER.error(
            'Failed to resolve matchup player games',
            err instanceof Error ? err : new Error(String(err)),
            {
              matchupPlayerId: matchupPlayer.id,
            },
          );
          return [];
        }
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
  /** True when an SP was probabilistically skipped for this game day */
  spSkipped: boolean;
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
    /** True when an SP was probabilistically skipped for this game day (not starting). */
    spSkipped: t.exposeBoolean('spSkipped'),

    // Resolve the actual game stats for this selected game
    battingGame: t.field({
      type: GameBattingRef,
      nullable: true,
      resolve: async (game, _args, context) => {
        if (!game.gameIdentifier) return null;

        try {
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
          return await context.loaders.gameBatting.load(statKey);
        } catch (err) {
          LOGGER.error(
            'Failed to resolve battingGame',
            err instanceof Error ? err : new Error(String(err)),
            {
              matchupPlayerGameId: game.id,
              matchupPlayerId: game.matchupPlayerId,
              gameIdentifier: game.gameIdentifier,
            },
          );
          return null;
        }
      },
    }),

    pitchingGame: t.field({
      type: GamePitchingRef,
      nullable: true,
      resolve: async (game, _args, context) => {
        // Only show pitching stats for games where the player was selected
        // (gameIdentifier will be null for skipped SP slots or unselected games)
        if (!game.gameIdentifier) return null;

        try {
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
          return await context.loaders.gamePitching.load(statKey);
        } catch (err) {
          LOGGER.error(
            'Failed to resolve pitchingGame',
            err instanceof Error ? err : new Error(String(err)),
            {
              matchupPlayerGameId: game.id,
              matchupPlayerId: game.matchupPlayerId,
              gameIdentifier: game.gameIdentifier,
            },
          );
          return null;
        }
      },
    }),

    fieldingGame: t.field({
      type: GameFieldingRef,
      nullable: true,
      resolve: async (game, _args, context) => {
        if (!game.gameIdentifier) return null;

        try {
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
        } catch (err) {
          LOGGER.error(
            'Failed to resolve fieldingGame',
            err instanceof Error ? err : new Error(String(err)),
            {
              matchupPlayerGameId: game.id,
              matchupPlayerId: game.matchupPlayerId,
              gameIdentifier: game.gameIdentifier,
            },
          );
          return null;
        }
      },
    }),
  }),
});
