export { createMlbDataProvider } from './lib/factory';
export type { MlbClientConfig, MlbProviderName } from './lib/factory';
export type { MlbDataProvider } from './lib/provider';
export type {
  GameFeed,
  MlbGame,
  MlbGameStatus,
  MlbTeamScore,
  PlayerGameStats,
  PlayerSeasonStats,
  Schedule,
  ScheduleGame,
  ScheduleOptions,
  Scoreboard,
  StandingsRecord,
  Standings,
  Team,
} from './lib/types';
// MlbStatsApiProvider is intentionally NOT exported: it is dev/staging only and
// must be accessed through createMlbDataProvider() so the production guard is enforced.
export {
  BallDontLieProvider,
  NotImplementedError,
} from './lib/providers/balldontlie';
