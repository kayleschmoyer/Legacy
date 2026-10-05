/**
 * DataLoaders — barrel export
 *
 * Assembles all per-domain loader factories into a single
 * createLoaders() function and exports the Loaders type.
 */

import { type GenericDatabase, PublicSchema } from '@legacy-sports/db-client';

import {
  createBattingSeasonsPlayedLoader,
  createCareerBattingLoader,
  createCareerFieldingLoader,
  createCareerFootballDefenseIdpLoader,
  createCareerFootballDefenseLoader,
  createCareerFootballKickingLoader,
  createCareerFootballPassingLoader,
  createCareerFootballReceivingLoader,
  createCareerFootballRushingLoader,
  createCareerPitchingLoader,
  createCareerYearRangeLoader,
  createGameBattingLoader,
  createGameFieldingLoader,
  createGamePitchingLoader,
  createSeasonBattingLoader,
  createSeasonFieldingLoader,
  createSeasonPitchingLoader,
} from './statistics-loaders';

import { createDraftedPlayerAdpLoader } from './draft-loaders';

import {
  createEligiblePositionsLoader,
  createLeaguePayrollConfigLoader,
  createLeaguePositionByIdLoader,
  createPlayerClubLoader,
  createPlayersLoader,
  createTeamPayrollLoader,
  createTeamRosterLimitStatusLoader,
  createTeamsLoader,
  createUsersLoader,
} from './entity-loaders';

import {
  createFootballScoringSettingsLoader,
  createLatestScoringChangeAtLoader,
  createLeagueRosterLockInputsLoader,
  createLeagueWeekPlayerSeasonsLoader,
  createLockedTeamMembersLoader,
  createMatchupMessagesLoader,
  createMatchupPlayerGamesLoader,
  createMatchupPlayersByMatchupIdLoader,
  createMatchupPlayersLoader,
  createMatchupsLoader,
  createPlayoffMatchupsByBracketLoader,
  createScoringChangeLogLoader,
  createSelectedGamesCountLoader,
} from './matchup-loaders';

// Re-export individually-exported loaders for backward compatibility
export {
  createCareerBattingLoader,
  createBattingSeasonsPlayedLoader,
  createGameBattingLoader,
  createGamePitchingLoader,
  createGameFieldingLoader,
} from './statistics-loaders';

// Re-export cache utilities
export {
  clearEligiblePositionsCache,
  clearPlayerClubCache,
} from './entity-loaders';

/**
 * Create all loaders for GraphQL context
 * Accepts a shared database connection instead of creating its own
 */
export const createLoaders = (db: GenericDatabase<typeof PublicSchema>) => ({
  gameBatting: createGameBattingLoader(db),
  gamePitching: createGamePitchingLoader(db),
  gameFielding: createGameFieldingLoader(db),
  seasonBatting: createSeasonBattingLoader(db),
  seasonPitching: createSeasonPitchingLoader(db),
  seasonFielding: createSeasonFieldingLoader(db),
  teams: createTeamsLoader(db),
  players: createPlayersLoader(db),
  users: createUsersLoader(db),
  matchupPlayerGames: createMatchupPlayerGamesLoader(db),
  eligiblePositions: createEligiblePositionsLoader(db),
  playerClub: createPlayerClubLoader(db),
  matchupPlayersById: createMatchupPlayersLoader(db),
  matchupPlayersByMatchupId: createMatchupPlayersByMatchupIdLoader(db),
  matchupsById: createMatchupsLoader(db),
  leagueWeekPlayerSeasons: createLeagueWeekPlayerSeasonsLoader(db),
  footballScoringSettingsByLeagueId: createFootballScoringSettingsLoader(db),
  selectedGamesCount: createSelectedGamesCountLoader(db),
  careerFielding: createCareerFieldingLoader(db),
  careerBatting: createCareerBattingLoader(db),
  careerPitching: createCareerPitchingLoader(db),
  careerFootballPassing: createCareerFootballPassingLoader(db),
  careerFootballRushing: createCareerFootballRushingLoader(db),
  careerFootballReceiving: createCareerFootballReceivingLoader(db),
  careerFootballKicking: createCareerFootballKickingLoader(db),
  careerFootballDefense: createCareerFootballDefenseLoader(db),
  careerFootballDefenseIdp: createCareerFootballDefenseIdpLoader(db),
  battingSeasonsPlayed: createBattingSeasonsPlayedLoader(db),
  careerYearRange: createCareerYearRangeLoader(db),
  matchupMessages: createMatchupMessagesLoader(db),
  playoffMatchupsByBracket: createPlayoffMatchupsByBracketLoader(db),
  leaguePositionById: createLeaguePositionByIdLoader(db),
  leagueRosterLockInputs: createLeagueRosterLockInputsLoader(db),
  leaguePayrollConfig: createLeaguePayrollConfigLoader(db),
  teamPayroll: createTeamPayrollLoader(db),
  teamRosterLimitStatus: createTeamRosterLimitStatusLoader(db),
  lockedTeamMembers: createLockedTeamMembersLoader(db),
  latestScoringChangeAt: createLatestScoringChangeAtLoader(db),
  scoringChangeLog: createScoringChangeLogLoader(db),
  draftedPlayerAdp: createDraftedPlayerAdpLoader(db),
});

/**
 * Type definition for loaders object
 */
export type Loaders = ReturnType<typeof createLoaders>;
