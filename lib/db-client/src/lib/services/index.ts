/**
 * Combined service layer providing access to all database services
 * This is the main entry point for database operations
 */

import { DbOptions } from '@legacy-sports/utils';
import { UserService, createUserService } from './UserService';
import { PlayerService, createPlayerService } from './PlayerService';

export class DatabaseService {
  public readonly users: UserService;
  public readonly players: PlayerService;

  constructor(private options: DbOptions) {
    this.users = createUserService(options);
    this.players = createPlayerService(options);
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

// Re-export types
export type { UserFilters, UserQueryOptions } from './UserService';
export type { PlayerFilters, PlayerQueryOptions } from './PlayerService';
