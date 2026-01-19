/**
 * @legacy-sports/scheduling
 * 
 * Matchup scheduling for fantasy leagues
 */

// Main scheduler
export { MatchupScheduler } from './matchup-scheduler';

// Playoff scheduler
export {
  generatePlayoffBracket,
  advancePlayoffRound,
  isRoundComplete,
  type PlayoffTeam,
  type PlayoffBracketConfig,
  type PlayoffMatchup,
  type PlayoffBracket,
} from './playoff-scheduler';

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
