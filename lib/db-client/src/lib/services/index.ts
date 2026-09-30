/**
 * Combined service layer providing access to all database services
 * This is the main entry point for database operations
 */

import { DbOptions } from '@legacy-sports/utils/node';
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
import {
  createUserPreferencesService,
  UserPreferencesService,
} from './UserPreferencesService';
import { createLeagueService, LeagueService } from './LeagueService';
import { createGdprService, GdprService } from './GdprService';
import { BadgeService, createBadgeService } from './BadgeService';
import {
  createSubscriptionService,
  SubscriptionService,
} from './SubscriptionService';
import {
  type GenericDatabase,
  getPublicDbConnection,
  shouldReuseConnection,
} from '../client/Helpers';
import * as PublicSchema from '../../drizzle/public/schema';
export {
  handleSubscriptionDowngrade,
  reapplyLeagueRestrictions,
  clearLeagueTierFreezes,
  FREE_TIER_LEAGUE_LIMIT,
} from './SubscriptionDowngradeService';
export {
  SeasonDraftGameService,
  SeasonDraftJoinError,
} from './SeasonDraftGameService';
export type { SeasonDraftJoinErrorCode } from './SeasonDraftGameService';
export { TwentyQuestionsService } from './TwentyQuestionsService';
export type {
  QuestionCategory,
  GameStateWithQuestions,
  PlayerRecord as TwentyQuestionsPlayerRecord,
} from './TwentyQuestionsService';
export { HITTER_STAT_KEYS, PITCHER_STAT_KEYS } from './SeasonDraftGameService';
export {
  DisclosureGameService,
  MIN_FACT_COUNT,
  TIER_SORT_ORDER,
} from './DisclosureGameService';
export type { PlayerFact, EligiblePlayer } from './DisclosureGameService';
export {
  MinigamePersonalStatsService,
  computeDayStreak,
} from './MinigamePersonalStatsService';
export type { MinigamePersonalStats } from './MinigamePersonalStatsService';
export {
  assignTierFromValue,
  bucketValue,
  orderFactsByDifficulty,
  shuffle,
  OBFUSCATION_CONFIG,
  TIER_NUMERIC_ORDER,
  TIER_SEQUENCE,
} from './DifficultyOrdering';
export type {
  DifficultyTier,
  FactCategory,
  ObfuscationRule,
  OrderableFact,
} from './DifficultyOrdering';
export type {
  HitterStatKey,
  PitcherStatKey,
  StatKey,
  PlayerType,
  GameMode,
  CreateSeasonDraftGameParams,
  MakePickParams,
  GameState as SeasonDraftGameState,
} from './SeasonDraftGameService';

export class DatabaseService {
  public readonly users: UserService;
  public readonly players: PlayerService;
  public readonly statistics: StatisticsService;
  public readonly scoring: ScoringService;
  public readonly notifications: NotificationService;
  public readonly userPreferences: UserPreferencesService;
  public readonly leagues: LeagueService;
  public readonly gdpr: GdprService;
  public readonly badges: BadgeService;
  public readonly subscriptions: SubscriptionService;
  // Promise cache prevents double-initialization when concurrent requests arrive
  // before the first pool is ready (e.g. Lambda cold start with parallel invocations).
  private _dbConnectionPromise: Promise<
    GenericDatabase<typeof PublicSchema>
  > | null = null;
  // The connection `_dbConnectionPromise` was built from. runWithClient evicts
  // and ends the shared cached connection on a severed socket; holding on to
  // its `db` afterwards leaves every later request on this warm Lambda failing
  // with "Cannot use a pool after calling end on the pool" (LS-10304).
  private _dbConnection: unknown = null;

  constructor(private options: DbOptions) {
    this.users = createUserService(options);
    this.players = createPlayerService(options);
    this.statistics = createStatisticsService(options);
    this.scoring = createScoringService(options);
    this.notifications = createNotificationService(options);
    this.userPreferences = createUserPreferencesService(options);
    this.leagues = createLeagueService(options);
    this.gdpr = createGdprService(options);
    this.badges = createBadgeService(options);
    this.subscriptions = createSubscriptionService(options);
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
    // Where connections are cached, a different object than the one we
    // initialized means the old one was evicted (and its pool ended).
    if (
      this._dbConnectionPromise &&
      shouldReuseConnection() &&
      getPublicDbConnection(this.options) !== this._dbConnection
    ) {
      this._dbConnectionPromise = null;
    }
    if (!this._dbConnectionPromise) {
      const connection = getPublicDbConnection(this.options);
      this._dbConnection = connection;
      this._dbConnectionPromise = (async () => {
        await connection.initialize();
        return connection.db;
      })();
      // Clear the cache on failure so the next request can retry rather than
      // receiving the same permanently-rejected promise (e.g. transient
      // Secrets Manager timeout during Lambda cold start).
      void this._dbConnectionPromise.catch(() => {
        this._dbConnectionPromise = null;
      });
    }
    return this._dbConnectionPromise;
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
export type {
  PlayerNotablePlayRow,
  PlayerNotablePlayUpsert,
  PlayerHighlightVideoRow,
  HighlightVideoCandidate,
  HighlightVideoResolution,
  HighlightVideoVerification,
} from './PlayerService';
export {
  StatisticsService,
  createStatisticsService,
} from './StatisticsService';
export { ScoringService, createScoringService } from './ScoringService';
export {
  NotificationService,
  createNotificationService,
} from './NotificationService';
export {
  UserPreferencesService,
  createUserPreferencesService,
} from './UserPreferencesService';
export { LeagueService, createLeagueService } from './LeagueService';
export { GdprService, createGdprService } from './GdprService';
export {
  BadgeService,
  createBadgeService,
  BADGE_DEFINITIONS,
  BADGE_DEFINITION_MAP,
} from './BadgeService';
export {
  SubscriptionService,
  createSubscriptionService,
} from './SubscriptionService';
export type { UserSubscription } from './SubscriptionService';

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
export type {
  UserPreferences,
  UserPreferencesUpdate,
  StatsFormat,
} from './UserPreferencesService';
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

// App download allowlist + audit (LS-9455, admin surface LS-9456). Plain
// functions rather than a factory: every call site already holds a database
// handle, and the two tables live outside the generated public schema.
export {
  isEmailAllowlisted,
  recordDownloadAttempt,
  listAllowlist,
  addAllowlistEntry,
  setAllowlistRevoked,
} from './AppDownloadService';
export type {
  AppDownloadDb,
  AppDownloadOutcome,
  AppDownloadAttempt,
  AppDownloadAllowlistRow,
} from './AppDownloadService';
