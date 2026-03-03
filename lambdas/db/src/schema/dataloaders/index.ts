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
  createCareerPitchingLoader,
  createCareerYearRangeLoader,
  createGameBattingLoader,
  createGameFieldingLoader,
  createGamePitchingLoader,
  createSeasonBattingLoader,
  createSeasonFieldingLoader,
  createSeasonPitchingLoader,
} from './statistics-loaders';

import {
  createEligiblePositionsLoader,
  createLeaguePositionByIdLoader,
  createPlayersLoader,
  createTeamsLoader,
  createUsersLoader,
} from './entity-loaders';

import {
  createLeagueWeekPlayerSeasonsLoader,
  createMatchupMessagesLoader,
  createMatchupPlayerGamesLoader,
  createMatchupPlayersLoader,
  createMatchupsLoader,
  createPlayoffMatchupsByBracketLoader,
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
export { clearEligiblePositionsCache } from './entity-loaders';

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
  matchupPlayersById: createMatchupPlayersLoader(db),
  matchupsById: createMatchupsLoader(db),
  leagueWeekPlayerSeasons: createLeagueWeekPlayerSeasonsLoader(db),
  selectedGamesCount: createSelectedGamesCountLoader(db),
  careerFielding: createCareerFieldingLoader(db),
  careerBatting: createCareerBattingLoader(db),
  careerPitching: createCareerPitchingLoader(db),
  battingSeasonsPlayed: createBattingSeasonsPlayedLoader(db),
  careerYearRange: createCareerYearRangeLoader(db),
  matchupMessages: createMatchupMessagesLoader(db),
  playoffMatchupsByBracket: createPlayoffMatchupsByBracketLoader(db),
  leaguePositionById: createLeaguePositionByIdLoader(db),
});

/**
 * Type definition for loaders object
 */
export type Loaders = ReturnType<typeof createLoaders>;
