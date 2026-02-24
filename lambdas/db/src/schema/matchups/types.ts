/**
 * Matchups domain — GraphQL type definitions
 */

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
      },
    }),
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
        // Only show pitching stats for games where the player was selected
        // (gameIdentifier will be null for skipped SP slots or unselected games)
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
