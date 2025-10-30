/**
 * Combined service layer providing access to all database services
 * This is the main entry point for database operations
 */

import { DbOptions } from '@legacy-sports/utils';
import { createPlayerService, PlayerService } from './PlayerService';
import { createUserService, UserService } from './UserService';
import {
  createStatisticsService,
  StatisticsService,
} from './StatisticsService';
import { createScoringService, ScoringService } from './ScoringService';

export class DatabaseService {
  public readonly users: UserService;
  public readonly players: PlayerService;
  public readonly statistics: StatisticsService;
  public readonly scoring: ScoringService;

  constructor(private options: DbOptions) {
    this.users = createUserService(options);
    this.players = createPlayerService(options);
    this.statistics = createStatisticsService(options);
    this.scoring = createScoringService(options);
  }

  /**
   * Get the database options used by this service
   */
  getOptions(): DbOptions {
    return this.options;
  }
}

/**
 * Factory function to create a complete database service
 */
export function createDatabaseService(options: DbOptions): DatabaseService {
  return new DatabaseService(options);
}

// Re-export individual services for direct usage
export { UserService, createUserService } from './UserService';
export { PlayerService, createPlayerService } from './PlayerService';
export {
  StatisticsService,
  createStatisticsService,
} from './StatisticsService';
export { ScoringService, createScoringService } from './ScoringService';

// Re-export types
export type { UserFilters, UserQueryOptions } from './UserService';
export type { PlayerFilters, PlayerQueryOptions } from './PlayerService';
export type {
  StatisticsFilters,
  StatisticsQueryOptions,
} from './StatisticsService';
export type { LeagueScoringMultiplierUpdate } from './ScoringService';
