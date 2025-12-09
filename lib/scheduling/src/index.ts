/**
 * @legacy-sports/scheduling
 *
 * Matchup scheduling for fantasy leagues
 */

// Main scheduler
export { MatchupScheduler } from './matchup-scheduler';

// Season selection
export {
  determineEligibleSeasons,
  selectRandomSeason,
  validateSeasonForMatchup,
  type SeasonEligibilityParams,
  type SeasonSelectionParams,
} from './season-selector';

// Strategies
export { type SchedulingStrategy } from './strategies/strategy-interface';
export { RoundRobinStrategy } from './strategies/round-robin-strategy';
export { RandomStrategy } from './strategies/random-strategy';
export {
  DivisionalStrategy,
  type DivisionalConfig,
} from './strategies/divisional-strategy';

// Types
export type {
  TeamInfo,
  LeagueConfig,
  MatchupPairing,
  ScheduledMatchup,
  SeasonInfo,
  ScheduleParams,
  ScheduleResult,
  SchedulingStrategy as SchedulingStrategyType,
  PlayerGameCount,
  TeamRoster,
} from './types';
