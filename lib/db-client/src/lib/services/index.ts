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
import {
  createNotificationService,
  NotificationService,
} from './NotificationService';
import { createLeagueService, LeagueService } from './LeagueService';
import { createGdprService, GdprService } from './GdprService';
import { BadgeService, createBadgeService } from './BadgeService';
import { type GenericDatabase, getPublicDbConnection } from '../client/Helpers';
import * as PublicSchema from '../../drizzle/public/schema';

export class DatabaseService {
  public readonly users: UserService;
  public readonly players: PlayerService;
  public readonly statistics: StatisticsService;
  public readonly scoring: ScoringService;
  public readonly notifications: NotificationService;
  public readonly leagues: LeagueService;
  public readonly gdpr: GdprService;
  public readonly badges: BadgeService;
  private _dbConnection: GenericDatabase<typeof PublicSchema> | null = null;

  constructor(private options: DbOptions) {
    this.users = createUserService(options);
    this.players = createPlayerService(options);
    this.statistics = createStatisticsService(options);
    this.scoring = createScoringService(options);
    this.notifications = createNotificationService(options);
    this.leagues = createLeagueService(options);
    this.gdpr = createGdprService(options);
    this.badges = createBadgeService(options);
  }

  /**
   * Get the database options used by this service
   */
  getOptions(): DbOptions {
    return this.options;
  }

  /**
   * Get a shared database connection for direct queries
   * This connection is initialized on first use and reused for subsequent calls
   * Useful for GraphQL context to share connections across resolvers
   */
  async getDb(): Promise<GenericDatabase<typeof PublicSchema>> {
    if (!this._dbConnection) {
      const connection = getPublicDbConnection(this.options);
      await connection.initialize();
      this._dbConnection = connection.db;
    }
    return this._dbConnection;
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
export {
  NotificationService,
  createNotificationService,
} from './NotificationService';
export { LeagueService, createLeagueService } from './LeagueService';
export { GdprService, createGdprService } from './GdprService';
export {
  BadgeService,
  createBadgeService,
  BADGE_DEFINITIONS,
  BADGE_DEFINITION_MAP,
} from './BadgeService';

// Re-export types
export type { UserFilters, UserQueryOptions } from './UserService';
export type {
  PlayerFilters,
  PlayerQueryOptions,
  PlayerOrderBy,
  PlayerWithScoring,
  CareerStatOrderBy,
  ScoringOrderBy,
} from './PlayerService';
export type {
  StatisticsFilters,
  StatisticsQueryOptions,
  OnThisDayEntry,
} from './StatisticsService';
export type { LeagueScoringMultiplierUpdate } from './ScoringService';
export type {
  NotificationPreference,
  DeviceToken,
  NotificationHistoryItem,
  NotificationPreferenceUpdate,
} from './NotificationService';
export type { CreateLeagueOptions, CreateLeagueResult } from './LeagueService';
export type {
  UserConsent,
  DataRequest,
  ConsentType,
  ConsentStatus,
  DataRequestType,
  DataRequestStatus,
  RecordConsentInput,
  UserDataExport,
} from './GdprService';
export type {
  BadgeDefinition,
  BadgeRarity,
  BadgeCategory,
  BadgeScope,
  UserBadge,
  BadgeProgressRecord,
  AwardedBadgeResult,
} from './BadgeService';
