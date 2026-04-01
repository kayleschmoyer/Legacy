/* eslint-disable */
import { gql } from '@apollo/client';
import * as Apollo from '@apollo/client/react';

// Apollo Client 4.x compatibility: these types are no longer exported
type MutationFunction<TData, TVariables> = (
  variables?: TVariables,
) => Promise<any>;
type BaseMutationOptions<TData, TVariables> = any;
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = {
  [K in keyof T]: T[K];
};
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & {
  [SubKey in K]?: Maybe<T[SubKey]>;
};
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & {
  [SubKey in K]: Maybe<T[SubKey]>;
};
export type MakeEmpty<
  T extends { [key: string]: unknown },
  K extends keyof T,
> = { [_ in K]?: never };
export type Incremental<T> =
  | T
  | {
      [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never;
    };
const defaultOptions = {} as const;
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string };
  String: { input: string; output: string };
  Boolean: { input: boolean; output: boolean };
  Int: { input: number; output: number };
  Float: { input: number; output: number };
};

/** A per-league rule that restricts rosters based on a career achievement type */
export type AchievementRestriction = {
  __typename?: 'AchievementRestriction';
  /** One of: all_star_selections | gold_gloves | silver_sluggers | mvp_awards | cy_young_awards | world_series_rings | hall_of_fame | rookie_of_the_year */
  achievementType?: Maybe<Scalars['String']['output']>;
  createdAt?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  /** Whether the achievement can be earned multiple times */
  isRepeatable?: Maybe<Scalars['Boolean']['output']>;
  leagueId?: Maybe<Scalars['Int']['output']>;
  /** Minimum count of the award a player must have to qualify (repeatable types only) */
  playerMinCount?: Maybe<Scalars['Int']['output']>;
  /** Cap on the total count of a repeatable award summed across the whole roster (e.g. no more than 25 All-Star selections total on one team) */
  repeatableRosterMax?: Maybe<Scalars['Int']['output']>;
  /** Maximum number of qualifying players allowed on a roster */
  rosterMax?: Maybe<Scalars['Int']['output']>;
  /** Minimum number of qualifying players required on a roster */
  rosterMin?: Maybe<Scalars['Int']['output']>;
  updatedAt?: Maybe<Scalars['String']['output']>;
};

export type AdminRevenueStats = {
  __typename?: 'AdminRevenueStats';
  conversionRate?: Maybe<Scalars['Float']['output']>;
  newSubscribersThisMonth?: Maybe<Scalars['Int']['output']>;
  statusBreakdown?: Maybe<Array<SubscriptionStatusCount>>;
  subscriberGrowth?: Maybe<Array<SubscriberGrowthPoint>>;
  totalFreeUsers?: Maybe<Scalars['Int']['output']>;
  totalPremiumUsers?: Maybe<Scalars['Int']['output']>;
  totalSubscribers?: Maybe<Scalars['Int']['output']>;
  totalUsers?: Maybe<Scalars['Int']['output']>;
};

export type AdvanceLeagueWeekResponse = {
  __typename?: 'AdvanceLeagueWeekResponse';
  currentMatchupId?: Maybe<Scalars['Int']['output']>;
  matchups?: Maybe<Array<Matchup>>;
};

/** An all-time record across all seasons in a league's history */
export type AllTimeRecord = {
  __typename?: 'AllTimeRecord';
  details?: Maybe<Scalars['String']['output']>;
  leagueId?: Maybe<Scalars['Int']['output']>;
  recordType?: Maybe<Scalars['String']['output']>;
  seasonNumber?: Maybe<Scalars['Int']['output']>;
  teamId?: Maybe<Scalars['Int']['output']>;
  teamName?: Maybe<Scalars['String']['output']>;
  value?: Maybe<Scalars['Float']['output']>;
};

export type AppleVerifyResult = {
  __typename?: 'AppleVerifyResult';
  status?: Maybe<Scalars['String']['output']>;
  success?: Maybe<Scalars['Boolean']['output']>;
  tier?: Maybe<Scalars['String']['output']>;
};

/** Per-team budget tracking during an auction draft */
export type AuctionBudget = {
  __typename?: 'AuctionBudget';
  maxBid?: Maybe<Scalars['Int']['output']>;
  playersWon?: Maybe<Scalars['Int']['output']>;
  remainingBudget?: Maybe<Scalars['Int']['output']>;
  team?: Maybe<Team>;
};

/** Live state of an auction draft in progress */
export type AuctionState = {
  __typename?: 'AuctionState';
  bidDeadline?: Maybe<Scalars['String']['output']>;
  currentBid?: Maybe<Scalars['Int']['output']>;
  currentBidder?: Maybe<Team>;
  draftId?: Maybe<Scalars['Int']['output']>;
  nominatedPlayer?: Maybe<Player>;
  nominationDeadline?: Maybe<Scalars['String']['output']>;
  nominationOrder?: Maybe<Scalars['Int']['output']>;
  nominatorTeam?: Maybe<Team>;
};

/** Result of the automated weekly matchup advancement across all active leagues */
export type AutoAdvanceMatchupsResult = {
  __typename?: 'AutoAdvanceMatchupsResult';
  errors?: Maybe<Array<Scalars['String']['output']>>;
  leaguesAdvanced?: Maybe<Scalars['Int']['output']>;
  leaguesProcessed?: Maybe<Scalars['Int']['output']>;
  leaguesSkipped?: Maybe<Scalars['Int']['output']>;
};

/** Result of the automated draft pick processing for expired deadlines */
export type AutoProcessDraftPicksResult = {
  __typename?: 'AutoProcessDraftPicksResult';
  draftsCompleted?: Maybe<Scalars['Int']['output']>;
  draftsProcessed?: Maybe<Scalars['Int']['output']>;
  errors?: Maybe<Array<Scalars['String']['output']>>;
  picksAutoMade?: Maybe<Scalars['Int']['output']>;
};

/** Result of the automated nightly game selection across all active leagues */
export type AutoSelectGamesResult = {
  __typename?: 'AutoSelectGamesResult';
  errors?: Maybe<Array<Scalars['String']['output']>>;
  gamesTriggered?: Maybe<Scalars['Int']['output']>;
  leaguesProcessed?: Maybe<Scalars['Int']['output']>;
};

/** Result of the scheduled draft auto-start job */
export type AutoStartScheduledDraftsResult = {
  __typename?: 'AutoStartScheduledDraftsResult';
  draftsStarted?: Maybe<Scalars['Int']['output']>;
  errors?: Maybe<Array<Scalars['String']['output']>>;
};

export type AverageSeasonBatting = {
  __typename?: 'AverageSeasonBatting';
  atBats?: Maybe<Scalars['Float']['output']>;
  battingAverage?: Maybe<Scalars['Float']['output']>;
  games?: Maybe<Scalars['Float']['output']>;
  hits?: Maybe<Scalars['Float']['output']>;
  homeRuns?: Maybe<Scalars['Float']['output']>;
  onBasePercentage?: Maybe<Scalars['Float']['output']>;
  rbi?: Maybe<Scalars['Float']['output']>;
  runs?: Maybe<Scalars['Float']['output']>;
  seasons?: Maybe<Scalars['Int']['output']>;
  sluggingPercentage?: Maybe<Scalars['Float']['output']>;
  stolenBases?: Maybe<Scalars['Float']['output']>;
};

/** Metadata for a badge that can be earned in the system */
export type BadgeDefinition = {
  __typename?: 'BadgeDefinition';
  /** Category of the badge: draft | matchup | roster | league */
  category?: Maybe<Scalars['String']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  /** Unique identifier for the badge type */
  key?: Maybe<Scalars['String']['output']>;
  /** Required progress count; null for instant badges */
  progressTarget?: Maybe<Scalars['Int']['output']>;
  /** Rarity of the badge: common | rare | legendary */
  rarity?: Maybe<Scalars['String']['output']>;
  /** Whether this badge can be earned multiple times */
  repeatable?: Maybe<Scalars['Boolean']['output']>;
  /** Whether the badge is global (cross-league) or per_league */
  scope?: Maybe<Scalars['String']['output']>;
  title?: Maybe<Scalars['String']['output']>;
};

/** Progress toward a not-yet-earned multi-step badge */
export type BadgeProgress = {
  __typename?: 'BadgeProgress';
  badgeKey?: Maybe<Scalars['String']['output']>;
  /** Badge definition for this progress record */
  definition?: Maybe<BadgeDefinition>;
  id?: Maybe<Scalars['Int']['output']>;
  leagueId?: Maybe<Scalars['Int']['output']>;
  /** Target required to earn the badge */
  progressTarget?: Maybe<Scalars['Int']['output']>;
  /** Current progress count */
  progressValue?: Maybe<Scalars['Int']['output']>;
  userId?: Maybe<Scalars['Int']['output']>;
};

export type BillingPortalSessionResult = {
  __typename?: 'BillingPortalSessionResult';
  url?: Maybe<Scalars['String']['output']>;
};

export type BulkDropPlayersInput = {
  leagueId: Scalars['Int']['input'];
  reason?: InputMaybe<Scalars['String']['input']>;
  teamId: Scalars['Int']['input'];
};

/** Career honours and awards sourced from Baseball Reference */
export type CareerAchievements = {
  __typename?: 'CareerAchievements';
  /** Number of All-Star game selections */
  allStarSelections?: Maybe<Scalars['Int']['output']>;
  /** Number of Cy Young Awards */
  cyYoungAwards?: Maybe<Scalars['Int']['output']>;
  /** Number of Gold Glove Awards */
  goldGloves?: Maybe<Scalars['Int']['output']>;
  /** Whether the player is in the Baseball Hall of Fame */
  hallOfFame?: Maybe<Scalars['Boolean']['output']>;
  /** Number of Most Valuable Player Awards (AL or NL) */
  mvpAwards?: Maybe<Scalars['Int']['output']>;
  /** Whether the player won the Rookie of the Year Award */
  rookieOfTheYear?: Maybe<Scalars['Boolean']['output']>;
  /** Number of Silver Slugger Awards */
  silverSluggers?: Maybe<Scalars['Int']['output']>;
  /** Number of World Series Championship rings */
  worldSeriesRings?: Maybe<Scalars['Int']['output']>;
};

export type CareerBatting = {
  __typename?: 'CareerBatting';
  atBats?: Maybe<Scalars['Int']['output']>;
  baseOnBalls?: Maybe<Scalars['Int']['output']>;
  battingAverage?: Maybe<Scalars['Float']['output']>;
  caughtStealing?: Maybe<Scalars['Int']['output']>;
  doubles?: Maybe<Scalars['Int']['output']>;
  games?: Maybe<Scalars['Int']['output']>;
  groundedIntoDoublePlays?: Maybe<Scalars['Int']['output']>;
  hitByPitch?: Maybe<Scalars['Int']['output']>;
  hits?: Maybe<Scalars['Int']['output']>;
  homeRuns?: Maybe<Scalars['Int']['output']>;
  intentionalBaseOnBalls?: Maybe<Scalars['Int']['output']>;
  /** Approximate offensive WAR computed from career counting stats. Includes wOBA-based batting runs, SB/CS baserunning, positional adjustment, and replacement level. Excludes fielding value. */
  offensiveWAR?: Maybe<Scalars['Float']['output']>;
  onBasePercentage?: Maybe<Scalars['Float']['output']>;
  plateAppearances?: Maybe<Scalars['Int']['output']>;
  player?: Maybe<Player>;
  playerId?: Maybe<Scalars['Int']['output']>;
  positionsPlayed?: Maybe<Scalars['String']['output']>;
  primaryPosition?: Maybe<Scalars['String']['output']>;
  rbi?: Maybe<Scalars['Int']['output']>;
  runs?: Maybe<Scalars['Int']['output']>;
  sacrificeHits?: Maybe<Scalars['Int']['output']>;
  sluggingPercentage?: Maybe<Scalars['Float']['output']>;
  stolenBases?: Maybe<Scalars['Int']['output']>;
  strikeouts?: Maybe<Scalars['Int']['output']>;
  totalBases?: Maybe<Scalars['Int']['output']>;
  triples?: Maybe<Scalars['Int']['output']>;
};

export type CareerBattingConnection = {
  __typename?: 'CareerBattingConnection';
  edges?: Maybe<Array<Maybe<CareerBattingEdge>>>;
  pageInfo: PageInfo;
  /** Total number of career batting records matching the filters */
  totalCount?: Maybe<Scalars['Int']['output']>;
};

export type CareerBattingEdge = {
  __typename?: 'CareerBattingEdge';
  cursor: Scalars['String']['output'];
  node?: Maybe<CareerBatting>;
};

export type CareerFielding = {
  __typename?: 'CareerFielding';
  assists?: Maybe<Scalars['Int']['output']>;
  caughtStealing?: Maybe<Scalars['Int']['output']>;
  chances?: Maybe<Scalars['Float']['output']>;
  completeGames?: Maybe<Scalars['Int']['output']>;
  doublePlays?: Maybe<Scalars['Int']['output']>;
  errors?: Maybe<Scalars['Int']['output']>;
  fieldingPercentage?: Maybe<Scalars['Float']['output']>;
  games?: Maybe<Scalars['Int']['output']>;
  gamesStarted?: Maybe<Scalars['Int']['output']>;
  inningsDefended?: Maybe<Scalars['Float']['output']>;
  pickoffs?: Maybe<Scalars['Int']['output']>;
  playerId?: Maybe<Scalars['Int']['output']>;
  positions?: Maybe<Scalars['String']['output']>;
  positionsPlayed?: Maybe<Scalars['String']['output']>;
  putouts?: Maybe<Scalars['Int']['output']>;
  stolenBases?: Maybe<Scalars['Int']['output']>;
  wildPitches?: Maybe<Scalars['Int']['output']>;
};

export type CareerPitching = {
  __typename?: 'CareerPitching';
  balks?: Maybe<Scalars['Int']['output']>;
  baseOnBalls?: Maybe<Scalars['Int']['output']>;
  battersFaced?: Maybe<Scalars['Int']['output']>;
  completeGames?: Maybe<Scalars['Int']['output']>;
  earnedRuns?: Maybe<Scalars['Int']['output']>;
  era?: Maybe<Scalars['String']['output']>;
  games?: Maybe<Scalars['Int']['output']>;
  gamesFinished?: Maybe<Scalars['Int']['output']>;
  gamesStarted?: Maybe<Scalars['Int']['output']>;
  hitByPitch?: Maybe<Scalars['Int']['output']>;
  hits?: Maybe<Scalars['Int']['output']>;
  homeRuns?: Maybe<Scalars['Int']['output']>;
  intentionalBaseOnBalls?: Maybe<Scalars['Int']['output']>;
  losses?: Maybe<Scalars['Int']['output']>;
  outRate?: Maybe<Scalars['Int']['output']>;
  outsRecorded?: Maybe<Scalars['Int']['output']>;
  /** Approximate pitching WAR computed from career counting stats. Uses FIP-based run estimation with season-specific cFIP constants, league ERA baseline, and replacement level (20 runs per 200 IP). */
  pitchingWAR?: Maybe<Scalars['Float']['output']>;
  player?: Maybe<Player>;
  playerId?: Maybe<Scalars['Int']['output']>;
  positionsPlayed?: Maybe<Scalars['String']['output']>;
  primaryPosition?: Maybe<Scalars['String']['output']>;
  runs?: Maybe<Scalars['Int']['output']>;
  saves?: Maybe<Scalars['Int']['output']>;
  shutouts?: Maybe<Scalars['Int']['output']>;
  strikeouts?: Maybe<Scalars['Int']['output']>;
  wildPitches?: Maybe<Scalars['Int']['output']>;
  winPercentage?: Maybe<Scalars['Float']['output']>;
  wins?: Maybe<Scalars['Int']['output']>;
};

/** Championship trophy and historical record */
export type ChampionTrophy = {
  __typename?: 'ChampionTrophy';
  awardedAt?: Maybe<Scalars['String']['output']>;
  championTeam?: Maybe<Team>;
  championshipWeek?: Maybe<Scalars['Int']['output']>;
  createdAt?: Maybe<Scalars['String']['output']>;
  finalScore?: Maybe<Scalars['Float']['output']>;
  id?: Maybe<Scalars['ID']['output']>;
  leagueId?: Maybe<Scalars['Int']['output']>;
  runnerUpScore?: Maybe<Scalars['Float']['output']>;
  runnerUpTeam?: Maybe<Team>;
  runnerUpTeamId?: Maybe<Scalars['Int']['output']>;
  season?: Maybe<Scalars['Int']['output']>;
  teamId?: Maybe<Scalars['Int']['output']>;
  updatedAt?: Maybe<Scalars['String']['output']>;
};

export type CheckoutSessionResult = {
  __typename?: 'CheckoutSessionResult';
  url?: Maybe<Scalars['String']['output']>;
};

/** Result of a commissioner action */
export type CommissionerActionResult = {
  __typename?: 'CommissionerActionResult';
  message?: Maybe<Scalars['String']['output']>;
  success?: Maybe<Scalars['Boolean']['output']>;
};

/** An audit-trail entry for a commissioner action */
export type CommissionerAuditLog = {
  __typename?: 'CommissionerAuditLog';
  action?: Maybe<Scalars['String']['output']>;
  createdAt?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  leagueId?: Maybe<Scalars['Int']['output']>;
  reason?: Maybe<Scalars['String']['output']>;
  targetId?: Maybe<Scalars['Int']['output']>;
  targetType?: Maybe<Scalars['String']['output']>;
  userId?: Maybe<Scalars['Int']['output']>;
};

export enum ConsentType {
  Analytics = 'analytics',
  DataProcessing = 'data_processing',
  MarketingEmails = 'marketing_emails',
  ThirdPartySharing = 'third_party_sharing',
}

export type CreateLeagueAndTeamsInput = {
  auctionBudget?: InputMaybe<Scalars['Int']['input']>;
  auctionMinBid?: InputMaybe<Scalars['Int']['input']>;
  customEraEndYear?: InputMaybe<Scalars['Int']['input']>;
  customEraStartYear?: InputMaybe<Scalars['Int']['input']>;
  draftMode?: InputMaybe<Scalars['String']['input']>;
  draftOrder?: InputMaybe<Scalars['String']['input']>;
  eraFilter?: InputMaybe<Scalars['String']['input']>;
  faabBudgetDefault?: InputMaybe<Scalars['Int']['input']>;
  hofOnly?: InputMaybe<Scalars['Boolean']['input']>;
  isPublic?: InputMaybe<Scalars['Boolean']['input']>;
  leagueName: Scalars['String']['input'];
  luxuryTaxThreshold?: InputMaybe<Scalars['Int']['input']>;
  maxBatters?: InputMaybe<Scalars['Int']['input']>;
  maxPitchers?: InputMaybe<Scalars['Int']['input']>;
  maxRosterSize?: InputMaybe<Scalars['Int']['input']>;
  minSalary?: InputMaybe<Scalars['Int']['input']>;
  numberOfDivisions?: InputMaybe<Scalars['Int']['input']>;
  numberOfTeams: Scalars['Int']['input'];
  playerPool: Scalars['String']['input'];
  salaryCap?: InputMaybe<Scalars['Int']['input']>;
  salaryCapEnabled?: InputMaybe<Scalars['Boolean']['input']>;
  salaryDecayPct?: InputMaybe<Scalars['Int']['input']>;
  salaryEscalationPct?: InputMaybe<Scalars['Int']['input']>;
  salaryFloor?: InputMaybe<Scalars['Int']['input']>;
  schedulingStrategy?: InputMaybe<Scalars['String']['input']>;
  selectionMethod?: InputMaybe<Scalars['String']['input']>;
  startDate?: InputMaybe<Scalars['String']['input']>;
  tradingEnabled?: InputMaybe<Scalars['Boolean']['input']>;
  waiverEnabled?: InputMaybe<Scalars['Boolean']['input']>;
  waiverType?: InputMaybe<Scalars['String']['input']>;
};

export type CreateLeagueAndTeamsPayload = {
  __typename?: 'CreateLeagueAndTeamsPayload';
  league?: Maybe<League>;
  leagueMembers?: Maybe<Array<LeagueMember>>;
  teams?: Maybe<Array<Team>>;
};

export type CreateMatchupInput = {
  endTime?: InputMaybe<Scalars['String']['input']>;
  gamesPerMatchup?: InputMaybe<Scalars['Int']['input']>;
  leagueId: Scalars['Int']['input'];
  startTime?: InputMaybe<Scalars['String']['input']>;
  team1Id?: InputMaybe<Scalars['Int']['input']>;
  team2Id?: InputMaybe<Scalars['Int']['input']>;
  weekNumber: Scalars['Int']['input'];
};

/** Information about the current draft pick */
export type CurrentDraftPick = {
  __typename?: 'CurrentDraftPick';
  draftId?: Maybe<Scalars['Int']['output']>;
  isComplete?: Maybe<Scalars['Boolean']['output']>;
  overallPick?: Maybe<Scalars['Int']['output']>;
  pickNumber?: Maybe<Scalars['Int']['output']>;
  round?: Maybe<Scalars['Int']['output']>;
  team?: Maybe<Team>;
  teamId?: Maybe<Scalars['Int']['output']>;
};

export type DataRequest = {
  __typename?: 'DataRequest';
  completedAt?: Maybe<Scalars['String']['output']>;
  createdAt?: Maybe<Scalars['String']['output']>;
  exportUrl?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  notes?: Maybe<Scalars['String']['output']>;
  processedAt?: Maybe<Scalars['String']['output']>;
  requestType?: Maybe<Scalars['String']['output']>;
  requestedAt?: Maybe<Scalars['String']['output']>;
  status?: Maybe<Scalars['String']['output']>;
  updatedAt?: Maybe<Scalars['String']['output']>;
  userId?: Maybe<Scalars['Int']['output']>;
};

export type DeviceToken = {
  __typename?: 'DeviceToken';
  createdAt?: Maybe<Scalars['String']['output']>;
  deviceToken?: Maybe<Scalars['String']['output']>;
  enabled?: Maybe<Scalars['Boolean']['output']>;
  endpointArn?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  isActive?: Maybe<Scalars['Boolean']['output']>;
  platform?: Maybe<Scalars['String']['output']>;
  updatedAt?: Maybe<Scalars['String']['output']>;
  userId?: Maybe<Scalars['Int']['output']>;
};

export type DeviceTokenInput = {
  deviceToken: Scalars['String']['input'];
  platform: Scalars['String']['input'];
};

/** A private direct message between two players */
export type DirectMessage = {
  __typename?: 'DirectMessage';
  createdAt?: Maybe<Scalars['String']['output']>;
  deletedAt?: Maybe<Scalars['String']['output']>;
  fromUserId?: Maybe<Scalars['Int']['output']>;
  id?: Maybe<Scalars['ID']['output']>;
  leagueId?: Maybe<Scalars['Int']['output']>;
  messageText?: Maybe<Scalars['String']['output']>;
  readAt?: Maybe<Scalars['String']['output']>;
  recipient?: Maybe<User>;
  sender?: Maybe<User>;
  toUserId?: Maybe<Scalars['Int']['output']>;
  updatedAt?: Maybe<Scalars['String']['output']>;
};

/** A draft event for a league */
export type Draft = {
  __typename?: 'Draft';
  /** When true, the commissioner has disabled auto-pick for the entire draft. autoProcessDraftPicks will not fire and individual teams cannot enable auto-pick (LS-481). */
  autoPickDisabled?: Maybe<Scalars['Boolean']['output']>;
  createdAt?: Maybe<Scalars['String']['output']>;
  currentPick?: Maybe<Scalars['Int']['output']>;
  currentPickDeadline?: Maybe<Scalars['String']['output']>;
  date?: Maybe<Scalars['String']['output']>;
  draftCompletedAt?: Maybe<Scalars['String']['output']>;
  draftMode?: Maybe<Scalars['String']['output']>;
  draftOrder?: Maybe<Scalars['String']['output']>;
  draftStartedAt?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  leagueId?: Maybe<Scalars['Int']['output']>;
  pickTimeLimitSeconds?: Maybe<Scalars['Int']['output']>;
  /** ISO-8601 timestamp when the draft is scheduled to auto-start (LS-423). Null means no scheduled start. */
  scheduledAt?: Maybe<Scalars['String']['output']>;
  selectionMethod?: Maybe<Scalars['String']['output']>;
  updatedAt?: Maybe<Scalars['String']['output']>;
};

/** A single pick made during a draft */
export type DraftPick = {
  __typename?: 'DraftPick';
  draftId?: Maybe<Scalars['Int']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  overallPick?: Maybe<Scalars['Int']['output']>;
  pickNumber?: Maybe<Scalars['Int']['output']>;
  pickedAt?: Maybe<Scalars['String']['output']>;
  /** The drafted player. Included so the draft board can display names for all picks (including pitchers who have no career batting entry) without a secondary lookup. */
  player?: Maybe<Player>;
  playerId?: Maybe<Scalars['Int']['output']>;
  round?: Maybe<Scalars['Int']['output']>;
  team?: Maybe<Team>;
  teamId?: Maybe<Scalars['Int']['output']>;
};

/** A player in the context of a draft */
export type DraftPlayer = {
  __typename?: 'DraftPlayer';
  brefId?: Maybe<Scalars['String']['output']>;
  /** Career batting statistics for the player */
  careerBatting?: Maybe<CareerBatting>;
  /** List of positions this player is eligible to play (e.g. SP, RP, 1B, SS) */
  eligiblePositions?: Maybe<Array<Scalars['String']['output']>>;
  firstName?: Maybe<Scalars['String']['output']>;
  /** Career hitter average points per game (batting + fielding score / career games) */
  hitterAvgPointsPerGame?: Maybe<Scalars['Float']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  lastName?: Maybe<Scalars['String']['output']>;
  /** Career pitching average points per game (pitching score / career games) */
  pitchingAvgPointsPerGame?: Maybe<Scalars['Float']['output']>;
};

/** A prioritised entry in a team's draft queue. Auto-pick picks the first available entry before falling back to the FPG algorithm. */
export type DraftQueueEntry = {
  __typename?: 'DraftQueueEntry';
  draftId?: Maybe<Scalars['Int']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  player?: Maybe<Player>;
  playerId?: Maybe<Scalars['Int']['output']>;
  priority?: Maybe<Scalars['Int']['output']>;
  teamId?: Maybe<Scalars['Int']['output']>;
};

/** A draft pick recommendation produced by the Draft Intelligence algorithm */
export type DraftRecommendation = {
  __typename?: 'DraftRecommendation';
  playerId?: Maybe<Scalars['Int']['output']>;
  playerName?: Maybe<Scalars['String']['output']>;
  position?: Maybe<Scalars['String']['output']>;
  reason?: Maybe<Scalars['String']['output']>;
  score?: Maybe<Scalars['Float']['output']>;
  topStats?: Maybe<Array<DraftRecommendationStat>>;
};

/** A stat label/value pair displayed on a draft recommendation */
export type DraftRecommendationStat = {
  __typename?: 'DraftRecommendationStat';
  label?: Maybe<Scalars['String']['output']>;
  value?: Maybe<Scalars['String']['output']>;
};

/** Auto-pick status for a team in a draft */
export type DraftTeamAutoPickStatus = {
  __typename?: 'DraftTeamAutoPickStatus';
  autoPick?: Maybe<Scalars['Boolean']['output']>;
  teamId?: Maybe<Scalars['Int']['output']>;
};

/** A team and its assigned slot in the draft order */
export type DraftTeamOrderEntry = {
  __typename?: 'DraftTeamOrderEntry';
  draftOrder?: Maybe<Scalars['Int']['output']>;
  teamId?: Maybe<Scalars['Int']['output']>;
  teamName?: Maybe<Scalars['String']['output']>;
};

export type EditMatchupScoreInput = {
  matchupId: Scalars['Int']['input'];
  reason?: InputMaybe<Scalars['String']['input']>;
  team1Score: Scalars['Float']['input'];
  team2Score: Scalars['Float']['input'];
};

/** Result of a badge evaluation run */
export type EvaluateBadgesResult = {
  __typename?: 'EvaluateBadgesResult';
  /** De-duplicated list of badge keys that were newly awarded */
  awardedBadgeKeys?: Maybe<Array<Scalars['String']['output']>>;
  /** Number of new badges awarded */
  awardedCount?: Maybe<Scalars['Int']['output']>;
};

export type ForceAddPlayerInput = {
  leagueId: Scalars['Int']['input'];
  playerId: Scalars['Int']['input'];
  reason?: InputMaybe<Scalars['String']['input']>;
  teamId: Scalars['Int']['input'];
};

export type ForceDropPlayerInput = {
  leagueId: Scalars['Int']['input'];
  playerId: Scalars['Int']['input'];
  reason?: InputMaybe<Scalars['String']['input']>;
  teamId: Scalars['Int']['input'];
};

export type GameBatting = {
  __typename?: 'GameBatting';
  atBats?: Maybe<Scalars['Int']['output']>;
  baseOnBalls?: Maybe<Scalars['Int']['output']>;
  battingAverage?: Maybe<Scalars['Float']['output']>;
  caughtStealing?: Maybe<Scalars['Int']['output']>;
  doubles?: Maybe<Scalars['Int']['output']>;
  gameIdentifier?: Maybe<Scalars['String']['output']>;
  gameNum?: Maybe<Scalars['Int']['output']>;
  groundedIntoDoublePlays?: Maybe<Scalars['Int']['output']>;
  hitByPitch?: Maybe<Scalars['Int']['output']>;
  hits?: Maybe<Scalars['Int']['output']>;
  homeRuns?: Maybe<Scalars['Int']['output']>;
  intentionalBaseOnBalls?: Maybe<Scalars['Int']['output']>;
  plateAppearances?: Maybe<Scalars['Int']['output']>;
  playerId?: Maybe<Scalars['Int']['output']>;
  rbi?: Maybe<Scalars['Int']['output']>;
  runs?: Maybe<Scalars['Int']['output']>;
  sacrificeFlies?: Maybe<Scalars['String']['output']>;
  sacrificeHits?: Maybe<Scalars['Int']['output']>;
  season?: Maybe<Scalars['Int']['output']>;
  stolenBases?: Maybe<Scalars['Int']['output']>;
  strikeouts?: Maybe<Scalars['Int']['output']>;
  triples?: Maybe<Scalars['Int']['output']>;
};

export type GameFielding = {
  __typename?: 'GameFielding';
  assists?: Maybe<Scalars['Int']['output']>;
  caughtStealing?: Maybe<Scalars['Int']['output']>;
  doublePlays?: Maybe<Scalars['Int']['output']>;
  errors?: Maybe<Scalars['Int']['output']>;
  fieldingPercentage?: Maybe<Scalars['Float']['output']>;
  gameIdentifier?: Maybe<Scalars['String']['output']>;
  gameNum?: Maybe<Scalars['Int']['output']>;
  games?: Maybe<Scalars['Int']['output']>;
  gamesStarted?: Maybe<Scalars['Int']['output']>;
  inningsPlayed?: Maybe<Scalars['Float']['output']>;
  passedBalls?: Maybe<Scalars['Int']['output']>;
  playerId?: Maybe<Scalars['Int']['output']>;
  position?: Maybe<Scalars['String']['output']>;
  putouts?: Maybe<Scalars['Int']['output']>;
  season?: Maybe<Scalars['Int']['output']>;
  stolenBasesAllowed?: Maybe<Scalars['Int']['output']>;
};

export type GamePitching = {
  __typename?: 'GamePitching';
  baseOnBalls?: Maybe<Scalars['Int']['output']>;
  battersFaced?: Maybe<Scalars['Int']['output']>;
  completeGames?: Maybe<Scalars['Int']['output']>;
  earnedRuns?: Maybe<Scalars['Int']['output']>;
  era?: Maybe<Scalars['Float']['output']>;
  gameIdentifier?: Maybe<Scalars['String']['output']>;
  gameNum?: Maybe<Scalars['Int']['output']>;
  gamesFinished?: Maybe<Scalars['Int']['output']>;
  gamesStarted?: Maybe<Scalars['Int']['output']>;
  hitByPitch?: Maybe<Scalars['Int']['output']>;
  hits?: Maybe<Scalars['Int']['output']>;
  homeRuns?: Maybe<Scalars['Int']['output']>;
  inningsPitched?: Maybe<Scalars['Float']['output']>;
  intentionalBaseOnBalls?: Maybe<Scalars['Int']['output']>;
  losses?: Maybe<Scalars['Int']['output']>;
  outsRecorded?: Maybe<Scalars['Int']['output']>;
  playerId?: Maybe<Scalars['Int']['output']>;
  runs?: Maybe<Scalars['Int']['output']>;
  saves?: Maybe<Scalars['Int']['output']>;
  season?: Maybe<Scalars['Int']['output']>;
  shutouts?: Maybe<Scalars['Int']['output']>;
  strikeouts?: Maybe<Scalars['Int']['output']>;
  wins?: Maybe<Scalars['Int']['output']>;
};

export type GoogleVerifyResult = {
  __typename?: 'GoogleVerifyResult';
  status?: Maybe<Scalars['String']['output']>;
  success?: Maybe<Scalars['Boolean']['output']>;
  tier?: Maybe<Scalars['String']['output']>;
};

/** Head-to-head record between two teams */
export type HeadToHeadRecord = {
  __typename?: 'HeadToHeadRecord';
  averageTeam1Score?: Maybe<Scalars['Float']['output']>;
  averageTeam2Score?: Maybe<Scalars['Float']['output']>;
  team1Id?: Maybe<Scalars['ID']['output']>;
  team1TotalPoints?: Maybe<Scalars['Float']['output']>;
  team1Wins?: Maybe<Scalars['Int']['output']>;
  team2Id?: Maybe<Scalars['ID']['output']>;
  team2TotalPoints?: Maybe<Scalars['Float']['output']>;
  team2Wins?: Maybe<Scalars['Int']['output']>;
  ties?: Maybe<Scalars['Int']['output']>;
  totalMatchups?: Maybe<Scalars['Int']['output']>;
};

export type ImpersonateUserResult = {
  __typename?: 'ImpersonateUserResult';
  token?: Maybe<Scalars['String']['output']>;
};

export type InviteCodeInfo = {
  __typename?: 'InviteCodeInfo';
  availableSpots?: Maybe<Scalars['Int']['output']>;
  isAlreadyMember?: Maybe<Scalars['Boolean']['output']>;
  isFull?: Maybe<Scalars['Boolean']['output']>;
  leagueId?: Maybe<Scalars['Int']['output']>;
  leagueName?: Maybe<Scalars['String']['output']>;
  totalSpots?: Maybe<Scalars['Int']['output']>;
};

export type JoinLeaguePayload = {
  __typename?: 'JoinLeaguePayload';
  leagueId?: Maybe<Scalars['Int']['output']>;
  message?: Maybe<Scalars['String']['output']>;
  success?: Maybe<Scalars['Boolean']['output']>;
  teamId?: Maybe<Scalars['Int']['output']>;
};

/** A fantasy sports league */
export type League = {
  __typename?: 'League';
  auctionBudget?: Maybe<Scalars['Int']['output']>;
  auctionMinBid?: Maybe<Scalars['Int']['output']>;
  bannerUrl?: Maybe<Scalars['String']['output']>;
  currentMatchup?: Maybe<Scalars['Int']['output']>;
  currentWeek?: Maybe<Scalars['Int']['output']>;
  /** The current active week number for the league */
  currentWeekNumber?: Maybe<Scalars['Int']['output']>;
  customEraEndYear?: Maybe<Scalars['Int']['output']>;
  customEraStartYear?: Maybe<Scalars['Int']['output']>;
  draftStatus?: Maybe<Scalars['String']['output']>;
  eraFilter?: Maybe<Scalars['String']['output']>;
  faabBudgetDefault?: Maybe<Scalars['Int']['output']>;
  frozenAt?: Maybe<Scalars['String']['output']>;
  gamesPerMatchup?: Maybe<Scalars['Int']['output']>;
  hofOnly?: Maybe<Scalars['Boolean']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  inviteCode?: Maybe<Scalars['String']['output']>;
  isMockDraft?: Maybe<Scalars['Boolean']['output']>;
  isPublic?: Maybe<Scalars['Boolean']['output']>;
  /** Lifecycle phase of the league: pre-draft (awaiting draft), active (season in play), offseason (post-renewal, before commissioner starts new season) */
  leaguePhase?: Maybe<Scalars['String']['output']>;
  lmNotes?: Maybe<Scalars['String']['output']>;
  logoUrl?: Maybe<Scalars['String']['output']>;
  luxuryTaxThreshold?: Maybe<Scalars['Int']['output']>;
  maxRosterSize?: Maybe<Scalars['Int']['output']>;
  minCareerGames?: Maybe<Scalars['Int']['output']>;
  minCareerSeasons?: Maybe<Scalars['Int']['output']>;
  minSalary?: Maybe<Scalars['Int']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  owner?: Maybe<Scalars['Int']['output']>;
  playerPool?: Maybe<Scalars['String']['output']>;
  playoffEnabled?: Maybe<Scalars['Boolean']['output']>;
  playoffFormat?: Maybe<Scalars['String']['output']>;
  playoffMultiWeek?: Maybe<Scalars['Boolean']['output']>;
  previousLeagueId?: Maybe<Scalars['Int']['output']>;
  primaryColor?: Maybe<Scalars['String']['output']>;
  salaryCap?: Maybe<Scalars['Int']['output']>;
  salaryCapEnabled?: Maybe<Scalars['Boolean']['output']>;
  salaryDecayPct?: Maybe<Scalars['Int']['output']>;
  salaryEscalationPct?: Maybe<Scalars['Int']['output']>;
  salaryFloor?: Maybe<Scalars['Int']['output']>;
  scoringProfile?: Maybe<ScoringConfig>;
  seasonNumber?: Maybe<Scalars['Int']['output']>;
  secondaryColor?: Maybe<Scalars['String']['output']>;
  spStartsPerMatchup?: Maybe<Scalars['Int']['output']>;
  /** ISO timestamp set when this league was frozen due to a subscription tier downgrade. Null when the league is active or frozen for a different reason (season retirement). Cleared on re-upgrade or when the owner re-selects this league as one of their active free-tier leagues. */
  tierFrozenAt?: Maybe<Scalars['String']['output']>;
  totalMatchups?: Maybe<Scalars['Int']['output']>;
  userMembership?: Maybe<LeagueMember>;
  waiverEnabled?: Maybe<Scalars['Boolean']['output']>;
  waiverType?: Maybe<Scalars['String']['output']>;
  weekAdvanceStatus?: Maybe<Scalars['String']['output']>;
};

/** A single activity event in a league's timeline */
export type LeagueActivityEvent = {
  __typename?: 'LeagueActivityEvent';
  actorUserId?: Maybe<Scalars['Int']['output']>;
  actorUsername?: Maybe<Scalars['String']['output']>;
  eventType?: Maybe<LeagueActivityEventType>;
  id?: Maybe<Scalars['ID']['output']>;
  leagueId?: Maybe<Scalars['Int']['output']>;
  occurredAt?: Maybe<Scalars['String']['output']>;
  payload?: Maybe<Scalars['String']['output']>;
  teamId?: Maybe<Scalars['Int']['output']>;
};

/** Type of activity event in a league */
export enum LeagueActivityEventType {
  DraftPickMade = 'draft_pick_made',
  LeagueAnnouncement = 'league_announcement',
  TradeAccepted = 'trade_accepted',
  TradeCancelled = 'trade_cancelled',
  TradeProposed = 'trade_proposed',
  TradeRejected = 'trade_rejected',
  TradeVetoed = 'trade_vetoed',
  WaiverCancelled = 'waiver_cancelled',
  WaiverClaimApproved = 'waiver_claim_approved',
  WaiverClaimRejected = 'waiver_claim_rejected',
  WaiverClaimed = 'waiver_claimed',
}

/** Comprehensive analytics for a league */
export type LeagueAnalytics = {
  __typename?: 'LeagueAnalytics';
  averagePointsPerMatchup?: Maybe<Scalars['Float']['output']>;
  currentWeek?: Maybe<Scalars['Int']['output']>;
  leagueId?: Maybe<Scalars['Int']['output']>;
  leagueName?: Maybe<Scalars['String']['output']>;
  playoffProjections?: Maybe<Array<PlayoffProjection>>;
  powerRankings?: Maybe<Array<PowerRanking>>;
  teamStats?: Maybe<Array<TeamStatistics>>;
  totalTeams?: Maybe<Scalars['Int']['output']>;
};

/** A message posted to the league-wide chat room */
export type LeagueChatMessage = {
  __typename?: 'LeagueChatMessage';
  gifUrl?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['ID']['output']>;
  leagueId?: Maybe<Scalars['Int']['output']>;
  messageText?: Maybe<Scalars['String']['output']>;
  messageType?: Maybe<Scalars['String']['output']>;
  metadata?: Maybe<Scalars['String']['output']>;
  sender?: Maybe<User>;
  timestamp?: Maybe<Scalars['String']['output']>;
  userId?: Maybe<Scalars['Int']['output']>;
};

/** Per-league dues configuration set by the commissioner */
export type LeagueDuesSettings = {
  __typename?: 'LeagueDuesSettings';
  /** Dues amount in cents (e.g. 5000 = $50.00) */
  amountCents?: Maybe<Scalars['Int']['output']>;
  createdAt?: Maybe<Scalars['String']['output']>;
  enabled?: Maybe<Scalars['Boolean']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  leagueId?: Maybe<Scalars['Int']['output']>;
  /** Day of week for reminders (0=Sunday, 6=Saturday) */
  reminderDayOfWeek?: Maybe<Scalars['Int']['output']>;
  reminderEnabled?: Maybe<Scalars['Boolean']['output']>;
  updatedAt?: Maybe<Scalars['String']['output']>;
};

/** A member of a league */
export type LeagueMember = {
  __typename?: 'LeagueMember';
  leagueId?: Maybe<Scalars['Int']['output']>;
  permissionLevel?: Maybe<Scalars['String']['output']>;
  team?: Maybe<Team>;
  teamId?: Maybe<Scalars['Int']['output']>;
  userId?: Maybe<Scalars['Int']['output']>;
  username?: Maybe<Scalars['String']['output']>;
};

/** Payment status for a single league member */
export type LeagueMemberPaymentStatus = {
  __typename?: 'LeagueMemberPaymentStatus';
  createdAt?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  leagueId?: Maybe<Scalars['Int']['output']>;
  markedBy?: Maybe<Scalars['Int']['output']>;
  paid?: Maybe<Scalars['Boolean']['output']>;
  paidAt?: Maybe<Scalars['String']['output']>;
  updatedAt?: Maybe<Scalars['String']['output']>;
  userId?: Maybe<Scalars['Int']['output']>;
  username?: Maybe<Scalars['String']['output']>;
};

/** A position configuration in a league */
export type LeaguePosition = {
  __typename?: 'LeaguePosition';
  id?: Maybe<Scalars['Int']['output']>;
  leagueId?: Maybe<Scalars['Int']['output']>;
  positionType?: Maybe<Scalars['String']['output']>;
};

/** A fantasy-league-specific seasonal award assigned by the commissioner to a player */
export type LeagueSeasonAward = {
  __typename?: 'LeagueSeasonAward';
  /** One of: mvp | cy_young | rookie_of_the_year | gold_glove | silver_slugger */
  awardType?: Maybe<Scalars['String']['output']>;
  createdAt?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  leagueId?: Maybe<Scalars['Int']['output']>;
  notes?: Maybe<Scalars['String']['output']>;
  playerFirstName?: Maybe<Scalars['String']['output']>;
  playerId?: Maybe<Scalars['Int']['output']>;
  playerLastName?: Maybe<Scalars['String']['output']>;
  season?: Maybe<Scalars['Int']['output']>;
  updatedAt?: Maybe<Scalars['String']['output']>;
};

/** Summary of a single season in a league's history */
export type LeagueSeasonSummary = {
  __typename?: 'LeagueSeasonSummary';
  championScore?: Maybe<Scalars['Float']['output']>;
  championTeamId?: Maybe<Scalars['Int']['output']>;
  championTeamName?: Maybe<Scalars['String']['output']>;
  frozenAt?: Maybe<Scalars['String']['output']>;
  leagueId?: Maybe<Scalars['Int']['output']>;
  leaguePhase?: Maybe<Scalars['String']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  runnerUpScore?: Maybe<Scalars['Float']['output']>;
  runnerUpTeamId?: Maybe<Scalars['Int']['output']>;
  runnerUpTeamName?: Maybe<Scalars['String']['output']>;
  seasonNumber?: Maybe<Scalars['Int']['output']>;
  totalMatchups?: Maybe<Scalars['Int']['output']>;
};

/** A head-to-head matchup between two teams in a league */
export type Matchup = {
  __typename?: 'Matchup';
  endTime?: Maybe<Scalars['String']['output']>;
  gamesPerMatchup?: Maybe<Scalars['Int']['output']>;
  id?: Maybe<Scalars['ID']['output']>;
  leagueId?: Maybe<Scalars['Int']['output']>;
  /** Auto-generated narrative recap, only available for completed matchups. */
  recap?: Maybe<MatchupRecap>;
  /** Number of unique games selected for this matchup */
  selectedGamesCount?: Maybe<Scalars['Int']['output']>;
  spStartsPerMatchup?: Maybe<Scalars['Int']['output']>;
  startTime?: Maybe<Scalars['String']['output']>;
  statsLoadingStatus?: Maybe<StatsLoadingStatus>;
  status?: Maybe<MatchupStatus>;
  team1?: Maybe<Team>;
  team1Id?: Maybe<Scalars['Int']['output']>;
  team1Score?: Maybe<Scalars['Float']['output']>;
  team2?: Maybe<Team>;
  team2Id?: Maybe<Scalars['Int']['output']>;
  team2Score?: Maybe<Scalars['Float']['output']>;
  weekNumber?: Maybe<Scalars['Int']['output']>;
};

/** User blocking relationship for chat */
export type MatchupChatBlock = {
  __typename?: 'MatchupChatBlock';
  blockedUserId?: Maybe<Scalars['Int']['output']>;
  blockingUserId?: Maybe<Scalars['Int']['output']>;
  createdAt?: Maybe<Scalars['String']['output']>;
  expiresAt?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['ID']['output']>;
  leagueId?: Maybe<Scalars['Int']['output']>;
  matchupId?: Maybe<Scalars['Int']['output']>;
  scope?: Maybe<MatchupChatBlockScope>;
  updatedAt?: Maybe<Scalars['String']['output']>;
};

/** Scope of chat block (matchup-specific, league-wide, or global) */
export enum MatchupChatBlockScope {
  Global = 'global',
  League = 'league',
  Matchup = 'matchup',
}

/** Chat message in matchup with moderation features */
export type MatchupMessage = {
  __typename?: 'MatchupMessage';
  containsProfanity?: Maybe<Scalars['Boolean']['output']>;
  createdAt?: Maybe<Scalars['String']['output']>;
  deletedAt?: Maybe<Scalars['String']['output']>;
  flaggedBy?: Maybe<Scalars['Int']['output']>;
  flaggedReason?: Maybe<Scalars['String']['output']>;
  gifUrl?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['ID']['output']>;
  isFlagged?: Maybe<Scalars['Boolean']['output']>;
  leagueId?: Maybe<Scalars['Int']['output']>;
  matchupId?: Maybe<Scalars['Int']['output']>;
  message?: Maybe<Scalars['String']['output']>;
  messageType?: Maybe<MatchupMessageType>;
  moderatedAt?: Maybe<Scalars['String']['output']>;
  pinnedAt?: Maybe<Scalars['String']['output']>;
  replyToMessage?: Maybe<MatchupMessage>;
  replyToMessageId?: Maybe<Scalars['Int']['output']>;
  sender?: Maybe<User>;
  senderId?: Maybe<Scalars['Int']['output']>;
  updatedAt?: Maybe<Scalars['String']['output']>;
};

/** WebSocket connection tracking for real-time chat */
export type MatchupMessageConnection = {
  __typename?: 'MatchupMessageConnection';
  connectedAt?: Maybe<Scalars['String']['output']>;
  connectionId?: Maybe<Scalars['String']['output']>;
  lastSeenAt?: Maybe<Scalars['String']['output']>;
  leagueId?: Maybe<Scalars['Int']['output']>;
  matchupId?: Maybe<Scalars['Int']['output']>;
  platform?: Maybe<Scalars['String']['output']>;
  userId?: Maybe<Scalars['Int']['output']>;
};

/** Reaction to a matchup message */
export type MatchupMessageReaction = {
  __typename?: 'MatchupMessageReaction';
  createdAt?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['ID']['output']>;
  messageId?: Maybe<Scalars['Int']['output']>;
  reactionType?: Maybe<MatchupMessageReactionType>;
  updatedAt?: Maybe<Scalars['String']['output']>;
  userId?: Maybe<Scalars['Int']['output']>;
};

/** Available reaction types for messages */
export enum MatchupMessageReactionType {
  Fire = 'fire',
  Laugh = 'laugh',
  Like = 'like',
  ThumbsDown = 'thumbs_down',
  Trophy = 'trophy',
  Wow = 'wow',
}

/** Message moderation report */
export type MatchupMessageReport = {
  __typename?: 'MatchupMessageReport';
  createdAt?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['ID']['output']>;
  messageId?: Maybe<Scalars['Int']['output']>;
  moderatorNotes?: Maybe<Scalars['String']['output']>;
  reason?: Maybe<Scalars['String']['output']>;
  reportedBy?: Maybe<Scalars['Int']['output']>;
  resolution?: Maybe<Scalars['String']['output']>;
  resolvedAt?: Maybe<Scalars['String']['output']>;
  reviewedBy?: Maybe<Scalars['Int']['output']>;
  status?: Maybe<MatchupMessageReportStatus>;
  updatedAt?: Maybe<Scalars['String']['output']>;
};

/** Status of message moderation report */
export enum MatchupMessageReportStatus {
  Dismissed = 'dismissed',
  Pending = 'pending',
  Resolved = 'resolved',
  Reviewing = 'reviewing',
}

/** Type of matchup message */
export enum MatchupMessageType {
  Gif = 'gif',
  System = 'system',
  Text = 'text',
}

/** A player selected for a specific matchup */
export type MatchupPlayer = {
  __typename?: 'MatchupPlayer';
  games?: Maybe<Array<MatchupPlayerGame>>;
  id?: Maybe<Scalars['ID']['output']>;
  matchupId?: Maybe<Scalars['Int']['output']>;
  /** Number of games this player is expected to play in this matchup (SP uses spStartsPerMatchup, others use gamesPerMatchup) */
  numberOfGames?: Maybe<Scalars['Int']['output']>;
  player?: Maybe<Player>;
  playerId?: Maybe<Scalars['Int']['output']>;
  positionId?: Maybe<Scalars['Int']['output']>;
  season?: Maybe<Scalars['Int']['output']>;
  seasonBatting?: Maybe<SeasonBatting>;
  seasonFielding?: Maybe<SeasonFielding>;
  seasonPitching?: Maybe<SeasonPitching>;
  teamId?: Maybe<Scalars['Int']['output']>;
};

export type MatchupPlayerGame = {
  __typename?: 'MatchupPlayerGame';
  battingGame?: Maybe<GameBatting>;
  fieldingGame?: Maybe<GameFielding>;
  fieldingGamePos?: Maybe<Scalars['String']['output']>;
  gameIdentifier?: Maybe<Scalars['String']['output']>;
  gameNum?: Maybe<Scalars['Int']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  matchupPlayerId?: Maybe<Scalars['Int']['output']>;
  pitchingGame?: Maybe<GamePitching>;
  spSkipped?: Maybe<Scalars['Boolean']['output']>;
  statsLoadingStatus?: Maybe<Scalars['String']['output']>;
};

/** Auto-generated narrative recap for a completed matchup */
export type MatchupRecap = {
  __typename?: 'MatchupRecap';
  /** Short headline summarising the matchup result */
  headline?: Maybe<Scalars['String']['output']>;
  /** Bullet-point highlights for standout player performances */
  highlights?: Maybe<Array<Scalars['String']['output']>>;
  /** Classification: blowout | close | normal */
  matchupType?: Maybe<Scalars['String']['output']>;
  /** Two-to-three sentence narrative paragraph */
  narrative?: Maybe<Scalars['String']['output']>;
  /** ID of the winning team, or null on a tie */
  winnerId?: Maybe<Scalars['Int']['output']>;
};

export enum MatchupStatus {
  Cancelled = 'cancelled',
  Completed = 'completed',
  InProgress = 'in_progress',
  Scheduled = 'scheduled',
}

/** Count of matchups by status */
export type MatchupStatusCounts = {
  __typename?: 'MatchupStatusCounts';
  cancelled?: Maybe<Scalars['Int']['output']>;
  completed?: Maybe<Scalars['Int']['output']>;
  inProgress?: Maybe<Scalars['Int']['output']>;
  scheduled?: Maybe<Scalars['Int']['output']>;
  total?: Maybe<Scalars['Int']['output']>;
};

/** Result of merging two user accounts */
export type MergeAccountsResult = {
  __typename?: 'MergeAccountsResult';
  errors?: Maybe<Array<Scalars['String']['output']>>;
  sourceUserId?: Maybe<Scalars['Int']['output']>;
  success?: Maybe<Scalars['Boolean']['output']>;
  tablesUpdated?: Maybe<Array<Scalars['String']['output']>>;
  targetUserId?: Maybe<Scalars['Int']['output']>;
};

/** Identifiers for a newly created mock draft session */
export type MockDraftInit = {
  __typename?: 'MockDraftInit';
  draftId?: Maybe<Scalars['Int']['output']>;
  leagueId?: Maybe<Scalars['Int']['output']>;
};

export type Mutation = {
  __typename?: 'Mutation';
  _placeholder?: Maybe<Scalars['Boolean']['output']>;
  /** Record that the user has accepted the privacy policy */
  acceptPrivacyPolicy?: Maybe<PrivacyPolicyStatus>;
  /** Accept a pending trade offer. Players are swapped between teams immediately. */
  acceptTrade?: Maybe<TradeOffer>;
  addDefaultPositionsToLeague?: Maybe<Array<LeaguePosition>>;
  /** Add a player to the end of the current user's draft queue. No-ops if already queued. */
  addToDraftQueue?: Maybe<Array<DraftQueueEntry>>;
  advancePlayoffBracket?: Maybe<PlayoffBracket>;
  /** Automatically advance matchups for leagues where all games are complete. When leagueId is provided, processes only that league (commissioner access). Without leagueId, processes all leagues (admin / system only). Triggered Sundays at 3am EST by EventBridge. */
  autoAdvanceMatchups?: Maybe<AutoAdvanceMatchupsResult>;
  /** Process expired draft pick deadlines. Idempotent — safe to call from any client as a nudge. EventBridge also calls this every minute as a fallback. */
  autoProcessDraftPicks?: Maybe<AutoProcessDraftPicksResult>;
  /** Automatically select the next game for active leagues. When leagueId is provided, processes only that league (commissioner access). Without leagueId, processes all leagues (admin / system only). Triggered nightly at midnight EST by EventBridge. */
  autoSelectGames?: Maybe<AutoSelectGamesResult>;
  /** System-only: start all live drafts whose scheduled_at has arrived. Triggered by EventBridge every minute. */
  autoStartScheduledDrafts?: Maybe<AutoStartScheduledDraftsResult>;
  awardChampionship?: Maybe<ChampionTrophy>;
  /** Award the League Champion badge to the winning team owner. Requires commissioner / system access. */
  awardLeagueChampionBadge?: Maybe<Scalars['Boolean']['output']>;
  /** Award Playoff Appearance badges to all teams that qualified for the playoffs. */
  awardPlayoffAppearanceBadges?: Maybe<Scalars['Boolean']['output']>;
  /** Commissioner: drop all players from a team (useful for inactive teams). */
  bulkDropTeamPlayers?: Maybe<CommissionerActionResult>;
  /** Cancel a Season Draft Game (only the creator can cancel, only in setup or drafting) */
  cancelSeasonDraftGame?: Maybe<Scalars['Boolean']['output']>;
  /** Cancel a pending trade offer as the team that proposed it. */
  cancelTrade?: Maybe<TradeOffer>;
  cancelWaiverClaim?: Maybe<WaiverClaim>;
  claimFreeAgent?: Maybe<WaiverClaim>;
  commissionerPick?: Maybe<DraftPick>;
  /** Commissioner: enable or disable auto-pick for the entire draft (LS-481). When disabled, autoProcessDraftPicks will not fire and teams cannot opt in to auto-pick. */
  commissionerSetDraftAutoPickDisabled?: Maybe<Draft>;
  createAllMatchups?: Maybe<AdvanceLeagueWeekResponse>;
  /** Create a Stripe Billing Portal session for managing an existing subscription (upgrade, downgrade, cancel, update payment method). */
  createBillingPortalSession?: Maybe<BillingPortalSessionResult>;
  /** Create a Stripe Checkout Session for a subscription plan. If the user already has an active subscription a Billing Portal URL is returned instead so they can manage their plan. */
  createCheckoutSession?: Maybe<CheckoutSessionResult>;
  createLeague?: Maybe<League>;
  createLeagueAndTeams?: Maybe<CreateLeagueAndTeamsPayload>;
  createMatchup?: Maybe<Matchup>;
  createPlayoffBracket?: Maybe<PlayoffBracket>;
  /** Create a new Season Draft Game */
  createSeasonDraftGame?: Maybe<Scalars['Int']['output']>;
  createTiebreakerRules?: Maybe<TiebreakerRule>;
  /** Remove an achievement restriction from a league. Commissioner / General Manager access required. */
  deleteAchievementRestriction?: Maybe<Scalars['Boolean']['output']>;
  deleteAllLeagues?: Maybe<Scalars['String']['output']>;
  deleteLeague?: Maybe<Scalars['String']['output']>;
  deleteLeagueAnnouncement?: Maybe<Scalars['Boolean']['output']>;
  /** Remove a season award from a league. Commissioner / General Manager access required. */
  deleteLeagueSeasonAward?: Maybe<Scalars['Boolean']['output']>;
  disableDeviceToken?: Maybe<Scalars['Boolean']['output']>;
  /** Commissioner: edit the scores of a past or current matchup. All edits are audit-logged. */
  editMatchupScore?: Maybe<CommissionerActionResult>;
  /** Evaluate and award all eligible draft-based badges for a league. Call when a draft completes. Requires authentication. */
  evaluateDraftBadges?: Maybe<EvaluateBadgesResult>;
  /** Evaluate and award all eligible matchup-based badges for a completed matchup. Call when a matchup status transitions to completed. Requires authentication. */
  evaluateMatchupBadges?: Maybe<EvaluateBadgesResult>;
  /** Commissioner: force-add a player to a team, bypassing normal acquisition rules. */
  forceAddPlayer?: Maybe<CommissionerActionResult>;
  /** Commissioner: force-drop a player from a team. */
  forceDropPlayer?: Maybe<CommissionerActionResult>;
  /** Admin only: generate a JWT that authenticates as the specified user for debugging purposes. */
  impersonateUser?: Maybe<ImpersonateUserResult>;
  initializeDraft?: Maybe<Draft>;
  /** Create an ephemeral mock draft league to practice drafting against AI teams. Picks are recorded but rosters are not persisted to any real league. */
  initializeMockDraft?: Maybe<MockDraftInit>;
  inviteAssistantManager?: Maybe<LeagueMember>;
  joinLeague?: Maybe<JoinLeaguePayload>;
  joinLeagueByCode?: Maybe<Team>;
  joinPublicLeague?: Maybe<JoinLeaguePayload>;
  makeDraftPick?: Maybe<DraftPick>;
  /** Make a draft pick in a Season Draft Game */
  makeSeasonDraftPick?: Maybe<Scalars['Boolean']['output']>;
  markAllNotificationsAsRead?: Maybe<Scalars['Boolean']['output']>;
  /** Mark a league member as paid. Commissioner/GM access required. */
  markMemberPaid?: Maybe<LeagueMemberPaymentStatus>;
  /** Mark a league member as unpaid. Commissioner/GM access required. */
  markMemberUnpaid?: Maybe<LeagueMemberPaymentStatus>;
  markNotificationAsRead?: Maybe<Scalars['Boolean']['output']>;
  /** Merge a source user account into the authenticated (target) user account. Transfers all leagues, rosters, messages, and settings. The source account is deactivated. Requires admin access. */
  mergeAccounts?: Maybe<MergeAccountsResult>;
  nominatePlayer?: Maybe<AuctionState>;
  pauseDraft?: Maybe<Draft>;
  placeBid?: Maybe<AuctionState>;
  postLeagueAnnouncement?: Maybe<LeagueChatMessage>;
  processWaiverClaims?: Maybe<ProcessWaiverClaimsResult>;
  /** Propose a trade to another team. Provide the players you are offering and the players you want in return. */
  proposeTrade?: Maybe<TradeOffer>;
  randomizeDraftOrder?: Maybe<Draft>;
  /** Record user consent for a specific data processing type */
  recordConsent?: Maybe<UserConsent>;
  registerDeviceToken?: Maybe<DeviceToken>;
  /** Reject a pending trade offer as the receiving team manager. */
  rejectTrade?: Maybe<TradeOffer>;
  removeAssistantManager?: Maybe<Scalars['Boolean']['output']>;
  /** Remove a player from the current user's draft queue. */
  removeFromDraftQueue?: Maybe<Array<DraftQueueEntry>>;
  renameTeam?: Maybe<Team>;
  renewLeague?: Maybe<League>;
  /** Reorder the current user's draft queue. playerIds must contain the same players that are already queued — only the order changes. */
  reorderDraftQueue?: Maybe<Array<DraftQueueEntry>>;
  /** Request deletion of all personal data (GDPR Art. 17 - Right to Erasure) */
  requestDataDeletion?: Maybe<DataRequest>;
  /** Request an export of all personal data (GDPR Art. 15 - Right of Access) */
  requestDataExport?: Maybe<DataRequest>;
  /** Restore Apple IAP purchases and sync the subscription tier. Pass the JWS-signed transaction string for the most recent active purchase returned by StoreKit 2 restoreCompletedTransactions. */
  restoreApplePurchases?: Maybe<Scalars['Boolean']['output']>;
  /** Restore Google Play subscriptions and sync the subscription tier. Pass the purchaseToken for the most recent active purchase returned by react-native-iap getAvailablePurchases on Android. */
  restoreGooglePurchases?: Maybe<Scalars['Boolean']['output']>;
  resumeDraft?: Maybe<Draft>;
  /** Revoke a previously granted consent */
  revokeConsent?: Maybe<UserConsent>;
  sendDirectMessage?: Maybe<DirectMessage>;
  /** Check all active leagues for upcoming matchup locks and send Discord reminders. Triggered hourly by EventBridge. */
  sendDiscordLineupReminders?: Maybe<SendDiscordLineupRemindersResult>;
  /** Check all active leagues for in-progress matchups and post score updates to Discord. Highlights close matchups within a point threshold. Triggered periodically by EventBridge. */
  sendDiscordScoreAlerts?: Maybe<SendDiscordScoreAlertsResult>;
  /** Post weekly recaps (results, standings, top scorer) to Discord for all active leagues. Triggered weekly by EventBridge after matchup advancement. */
  sendDiscordWeeklyRecaps?: Maybe<SendDiscordWeeklyRecapsResult>;
  /** Check all leagues with dues reminders enabled and post reminders to league chat (and Discord if configured) for unpaid members. Only fires for leagues whose reminder day matches the current day of week. Triggered daily by EventBridge. */
  sendDuesReminders?: Maybe<SendDuesRemindersResult>;
  sendLeagueMessage?: Maybe<LeagueChatMessage>;
  sendMatchupMessage?: Maybe<MatchupMessage>;
  /** Select up to 3 leagues to keep active after a subscription downgrade. Leagues not included in the list will be tier-frozen (read-only). Only callable on the free tier — all leagues are automatically active on premium. */
  setActiveLeagues?: Maybe<Scalars['Boolean']['output']>;
  setDraftOrder?: Maybe<Draft>;
  /** Replace the current user's draft queue for a draft. The order of playerIds defines pick priority (index 0 = first pick). Pass an empty array to clear. */
  setDraftQueue?: Maybe<Array<DraftQueueEntry>>;
  /** Set or clear a custom nickname for a player on your roster. Pass null or empty string to remove the nickname. */
  setNickname?: Maybe<TeamMember>;
  /** Commissioner: lock or unlock a team to prevent/allow roster moves. */
  setTeamLock?: Maybe<CommissionerActionResult>;
  /** Mark or unmark a roster player as available for trade. Only the team owner (GM or assistant manager) may call this. */
  setTradeBlock?: Maybe<TeamMember>;
  startDraft?: Maybe<League>;
  startSeason?: Maybe<League>;
  /** Start a Season Draft Game (move from setup to drafting) */
  startSeasonDraftGame?: Maybe<Scalars['Boolean']['output']>;
  swapMatchupPlayerPositions?: Maybe<Array<MatchupPlayer>>;
  /** Commissioner: swap the team assignments between two matchups in the same league. */
  swapMatchupTeams?: Maybe<CommissionerActionResult>;
  swapTeamMemberPositions?: Maybe<Array<TeamMember>>;
  /** Enable or disable auto-pick for the current user's team in a live draft. When enabled the system immediately picks for them as soon as their turn begins. Enabling also activates automatically when a team misses a pick. */
  toggleDraftAutoPick?: Maybe<Scalars['Boolean']['output']>;
  /** Trigger stat loading for a baseball player if stats have not been fetched yet. Returns true if loading was triggered, false if stats already exist. */
  triggerSeasonDraftStatLoading?: Maybe<Scalars['Boolean']['output']>;
  undoLastDraftPick?: Maybe<DraftPick>;
  /** Commissioner: update the persistent LM note for a league. */
  updateCommissionerNote?: Maybe<CommissionerActionResult>;
  updateDraftSettings?: Maybe<UpdateDraftSettingsPayload>;
  /** Create or update dues settings for a league. Commissioner/GM access required. */
  updateDuesSettings?: Maybe<LeagueDuesSettings>;
  updateLeagueAnnouncement?: Maybe<LeagueChatMessage>;
  updateLeagueScoringProfile?: Maybe<ScoringConfig>;
  updateLeagueSettings?: Maybe<League>;
  updateMatchupPlayerPosition?: Maybe<MatchupPlayer>;
  updateMatchupScore?: Maybe<Matchup>;
  updateMatchupStatus?: Maybe<Matchup>;
  updateNotificationPreferences?: Maybe<NotificationPreference>;
  updatePlayoffMatchup?: Maybe<PlayoffMatchup>;
  updateTeamBranding?: Maybe<Team>;
  updateTeamMemberPosition?: Maybe<TeamMember>;
  /** Update the avatar URL for the currently authenticated user. */
  updateUserAvatar?: Maybe<User>;
  /** Update a user's access level. Requires admin access. Use "admin" to grant admin privileges or "none" to revoke them. */
  updateUserRole?: Maybe<User>;
  /** Update the username for the currently authenticated user. */
  updateUsername?: Maybe<User>;
  /** Create or update a single achievement restriction for a league. Commissioner / General Manager access required. */
  upsertAchievementRestriction?: Maybe<AchievementRestriction>;
  /** Create or update a season award for a player in a league. Commissioner / General Manager access required. */
  upsertLeagueSeasonAward?: Maybe<LeagueSeasonAward>;
  /** Verify and record an iOS in-app purchase transaction. The client passes the JWS-signed transaction string from StoreKit 2. Returns the resulting subscription tier and status. */
  verifyApplePurchase?: Maybe<AppleVerifyResult>;
  /** Verify and record an Android Google Play Billing purchase. The client passes the purchaseToken and productId from the Billing Library. Returns the resulting subscription tier and status. */
  verifyGooglePurchase?: Maybe<GoogleVerifyResult>;
  /** Commissioner-only: veto an accepted trade, reversing the player swap. */
  vetoTrade?: Maybe<TradeOffer>;
};

export type MutationAcceptTradeArgs = {
  tradeId: Scalars['Int']['input'];
};

export type MutationAddDefaultPositionsToLeagueArgs = {
  leagueId: Scalars['Int']['input'];
};

export type MutationAddToDraftQueueArgs = {
  draftId: Scalars['Int']['input'];
  playerId: Scalars['Int']['input'];
};

export type MutationAdvancePlayoffBracketArgs = {
  bracketId: Scalars['Int']['input'];
};

export type MutationAutoAdvanceMatchupsArgs = {
  leagueId?: InputMaybe<Scalars['Int']['input']>;
};

export type MutationAutoProcessDraftPicksArgs = {
  leagueId?: InputMaybe<Scalars['Int']['input']>;
};

export type MutationAutoSelectGamesArgs = {
  leagueId?: InputMaybe<Scalars['Int']['input']>;
};

export type MutationAwardChampionshipArgs = {
  bracketId: Scalars['Int']['input'];
};

export type MutationAwardLeagueChampionBadgeArgs = {
  leagueId: Scalars['Int']['input'];
  teamId: Scalars['Int']['input'];
  userId: Scalars['Int']['input'];
};

export type MutationAwardPlayoffAppearanceBadgesArgs = {
  leagueId: Scalars['Int']['input'];
  teamIds: Array<Scalars['Int']['input']>;
};

export type MutationBulkDropTeamPlayersArgs = {
  input: BulkDropPlayersInput;
};

export type MutationCancelSeasonDraftGameArgs = {
  gameId: Scalars['Int']['input'];
};

export type MutationCancelTradeArgs = {
  tradeId: Scalars['Int']['input'];
};

export type MutationCancelWaiverClaimArgs = {
  claimId: Scalars['Int']['input'];
};

export type MutationClaimFreeAgentArgs = {
  dropPlayerId?: InputMaybe<Scalars['Int']['input']>;
  faabBid?: InputMaybe<Scalars['Int']['input']>;
  leagueId: Scalars['Int']['input'];
  playerId: Scalars['Int']['input'];
};

export type MutationCommissionerPickArgs = {
  draftId: Scalars['Int']['input'];
  playerId: Scalars['Int']['input'];
};

export type MutationCommissionerSetDraftAutoPickDisabledArgs = {
  disabled: Scalars['Boolean']['input'];
  draftId: Scalars['Int']['input'];
};

export type MutationCreateAllMatchupsArgs = {
  leagueId: Scalars['Int']['input'];
};

export type MutationCreateBillingPortalSessionArgs = {
  returnUrl: Scalars['String']['input'];
};

export type MutationCreateCheckoutSessionArgs = {
  cancelUrl: Scalars['String']['input'];
  priceId: Scalars['String']['input'];
  successUrl: Scalars['String']['input'];
};

export type MutationCreateLeagueArgs = {
  maxRosterSize?: InputMaybe<Scalars['Int']['input']>;
  name: Scalars['String']['input'];
};

export type MutationCreateLeagueAndTeamsArgs = {
  input: CreateLeagueAndTeamsInput;
};

export type MutationCreateMatchupArgs = {
  input: CreateMatchupInput;
};

export type MutationCreatePlayoffBracketArgs = {
  format: Scalars['String']['input'];
  leagueId: Scalars['Int']['input'];
  multiWeekMatchups?: InputMaybe<Scalars['Boolean']['input']>;
  season: Scalars['Int']['input'];
  startWeek: Scalars['Int']['input'];
};

export type MutationCreateSeasonDraftGameArgs = {
  gameMode?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['String']['input'];
  playerNames: Array<Scalars['String']['input']>;
  playerType?: InputMaybe<Scalars['String']['input']>;
  statKey?: InputMaybe<Scalars['String']['input']>;
  userIds: Array<Scalars['Int']['input']>;
};

export type MutationCreateTiebreakerRulesArgs = {
  allowCommissionerOverride?: InputMaybe<Scalars['Boolean']['input']>;
  leagueId: Scalars['Int']['input'];
  primaryMethod: TiebreakerMethod;
  secondaryMethod?: InputMaybe<TiebreakerMethod>;
  tertiaryMethod?: InputMaybe<TiebreakerMethod>;
};

export type MutationDeleteAchievementRestrictionArgs = {
  achievementType: Scalars['String']['input'];
  leagueId: Scalars['Int']['input'];
};

export type MutationDeleteLeagueArgs = {
  leagueId: Scalars['Int']['input'];
};

export type MutationDeleteLeagueAnnouncementArgs = {
  id: Scalars['Int']['input'];
  leagueId: Scalars['Int']['input'];
};

export type MutationDeleteLeagueSeasonAwardArgs = {
  awardType: Scalars['String']['input'];
  leagueId: Scalars['Int']['input'];
  season: Scalars['Int']['input'];
};

export type MutationDisableDeviceTokenArgs = {
  deviceToken: Scalars['String']['input'];
};

export type MutationEditMatchupScoreArgs = {
  input: EditMatchupScoreInput;
};

export type MutationEvaluateDraftBadgesArgs = {
  leagueId: Scalars['Int']['input'];
};

export type MutationEvaluateMatchupBadgesArgs = {
  matchupId: Scalars['Int']['input'];
};

export type MutationForceAddPlayerArgs = {
  input: ForceAddPlayerInput;
};

export type MutationForceDropPlayerArgs = {
  input: ForceDropPlayerInput;
};

export type MutationImpersonateUserArgs = {
  userId: Scalars['Int']['input'];
};

export type MutationInitializeDraftArgs = {
  draftMode?: InputMaybe<Scalars['String']['input']>;
  draftOrder?: InputMaybe<Scalars['String']['input']>;
  leagueId: Scalars['Int']['input'];
  selectionMethod?: InputMaybe<Scalars['String']['input']>;
};

export type MutationInitializeMockDraftArgs = {
  numTeams: Scalars['Int']['input'];
  pickTimeLimitSeconds?: InputMaybe<Scalars['Int']['input']>;
  rosterSize: Scalars['Int']['input'];
  userPickPosition: Scalars['Int']['input'];
};

export type MutationInviteAssistantManagerArgs = {
  teamId: Scalars['Int']['input'];
  username: Scalars['String']['input'];
};

export type MutationJoinLeagueArgs = {
  inviteCode: Scalars['String']['input'];
  teamName: Scalars['String']['input'];
};

export type MutationJoinLeagueByCodeArgs = {
  inviteCode: Scalars['String']['input'];
  teamName: Scalars['String']['input'];
};

export type MutationJoinPublicLeagueArgs = {
  leagueId: Scalars['Int']['input'];
  teamName: Scalars['String']['input'];
};

export type MutationMakeDraftPickArgs = {
  draftId: Scalars['Int']['input'];
  playerId: Scalars['Int']['input'];
};

export type MutationMakeSeasonDraftPickArgs = {
  gameId: Scalars['Int']['input'];
  playerId: Scalars['Int']['input'];
  position: Scalars['String']['input'];
  rosterSlotId: Scalars['Int']['input'];
  season: Scalars['Int']['input'];
  team?: InputMaybe<Scalars['String']['input']>;
};

export type MutationMarkMemberPaidArgs = {
  leagueId: Scalars['Int']['input'];
  userId: Scalars['Int']['input'];
};

export type MutationMarkMemberUnpaidArgs = {
  leagueId: Scalars['Int']['input'];
  userId: Scalars['Int']['input'];
};

export type MutationMarkNotificationAsReadArgs = {
  notificationId: Scalars['Int']['input'];
};

export type MutationMergeAccountsArgs = {
  sourceUserId: Scalars['Int']['input'];
};

export type MutationNominatePlayerArgs = {
  draftId: Scalars['Int']['input'];
  playerId: Scalars['Int']['input'];
};

export type MutationPauseDraftArgs = {
  leagueId: Scalars['Int']['input'];
};

export type MutationPlaceBidArgs = {
  amount: Scalars['Int']['input'];
  draftId: Scalars['Int']['input'];
};

export type MutationPostLeagueAnnouncementArgs = {
  leagueId: Scalars['Int']['input'];
  messageText: Scalars['String']['input'];
};

export type MutationProcessWaiverClaimsArgs = {
  leagueId?: InputMaybe<Scalars['Int']['input']>;
};

export type MutationProposeTradeArgs = {
  expiresInDays?: InputMaybe<Scalars['Int']['input']>;
  leagueId: Scalars['Int']['input'];
  message?: InputMaybe<Scalars['String']['input']>;
  offeringPlayerIds: Array<Scalars['Int']['input']>;
  receivingTeamId: Scalars['Int']['input'];
  requestingPlayerIds: Array<Scalars['Int']['input']>;
};

export type MutationRandomizeDraftOrderArgs = {
  draftId: Scalars['Int']['input'];
};

export type MutationRecordConsentArgs = {
  input: RecordConsentInput;
};

export type MutationRegisterDeviceTokenArgs = {
  input: DeviceTokenInput;
};

export type MutationRejectTradeArgs = {
  tradeId: Scalars['Int']['input'];
};

export type MutationRemoveAssistantManagerArgs = {
  teamId: Scalars['Int']['input'];
  userId: Scalars['Int']['input'];
};

export type MutationRemoveFromDraftQueueArgs = {
  draftId: Scalars['Int']['input'];
  playerId: Scalars['Int']['input'];
};

export type MutationRenameTeamArgs = {
  leagueId: Scalars['Int']['input'];
  newName: Scalars['String']['input'];
  teamId: Scalars['Int']['input'];
};

export type MutationRenewLeagueArgs = {
  keepRosters: Scalars['Boolean']['input'];
  leagueId: Scalars['Int']['input'];
};

export type MutationReorderDraftQueueArgs = {
  draftId: Scalars['Int']['input'];
  playerIds: Array<Scalars['Int']['input']>;
};

export type MutationRestoreApplePurchasesArgs = {
  jwsTransaction: Scalars['String']['input'];
};

export type MutationRestoreGooglePurchasesArgs = {
  productId: Scalars['String']['input'];
  purchaseToken: Scalars['String']['input'];
};

export type MutationResumeDraftArgs = {
  leagueId: Scalars['Int']['input'];
};

export type MutationRevokeConsentArgs = {
  consentType: ConsentType;
};

export type MutationSendDirectMessageArgs = {
  leagueId?: InputMaybe<Scalars['Int']['input']>;
  messageText: Scalars['String']['input'];
  toUserId: Scalars['Int']['input'];
};

export type MutationSendDiscordLineupRemindersArgs = {
  leagueId?: InputMaybe<Scalars['Int']['input']>;
};

export type MutationSendDiscordScoreAlertsArgs = {
  leagueId?: InputMaybe<Scalars['Int']['input']>;
};

export type MutationSendDiscordWeeklyRecapsArgs = {
  leagueId?: InputMaybe<Scalars['Int']['input']>;
};

export type MutationSendDuesRemindersArgs = {
  leagueId?: InputMaybe<Scalars['Int']['input']>;
};

export type MutationSendLeagueMessageArgs = {
  gifUrl?: InputMaybe<Scalars['String']['input']>;
  leagueId: Scalars['Int']['input'];
  messageText: Scalars['String']['input'];
};

export type MutationSendMatchupMessageArgs = {
  gifUrl?: InputMaybe<Scalars['String']['input']>;
  matchupId: Scalars['Int']['input'];
  message: Scalars['String']['input'];
  replyToMessageId?: InputMaybe<Scalars['Int']['input']>;
};

export type MutationSetActiveLeaguesArgs = {
  leagueIds: Array<Scalars['Int']['input']>;
};

export type MutationSetDraftOrderArgs = {
  draftId: Scalars['Int']['input'];
  teamIds: Array<Scalars['Int']['input']>;
};

export type MutationSetDraftQueueArgs = {
  draftId: Scalars['Int']['input'];
  playerIds: Array<Scalars['Int']['input']>;
};

export type MutationSetNicknameArgs = {
  nickname?: InputMaybe<Scalars['String']['input']>;
  teamMemberId: Scalars['Int']['input'];
};

export type MutationSetTeamLockArgs = {
  input: SetTeamLockInput;
};

export type MutationSetTradeBlockArgs = {
  askingPrice?: InputMaybe<Scalars['String']['input']>;
  onTradeBlock: Scalars['Boolean']['input'];
  teamMemberId: Scalars['Int']['input'];
};

export type MutationStartDraftArgs = {
  draftMode?: InputMaybe<Scalars['String']['input']>;
  draftOrder?: InputMaybe<Scalars['String']['input']>;
  leagueId: Scalars['Int']['input'];
  selectionMethod?: InputMaybe<Scalars['String']['input']>;
};

export type MutationStartSeasonArgs = {
  leagueId: Scalars['Int']['input'];
};

export type MutationStartSeasonDraftGameArgs = {
  gameId: Scalars['Int']['input'];
};

export type MutationSwapMatchupPlayerPositionsArgs = {
  matchupPlayerIdA: Scalars['Int']['input'];
  matchupPlayerIdB: Scalars['Int']['input'];
  positionIdA?: InputMaybe<Scalars['Int']['input']>;
  positionIdB?: InputMaybe<Scalars['Int']['input']>;
};

export type MutationSwapMatchupTeamsArgs = {
  input: SwapMatchupTeamsInput;
};

export type MutationSwapTeamMemberPositionsArgs = {
  positionIdA?: InputMaybe<Scalars['Int']['input']>;
  positionIdB?: InputMaybe<Scalars['Int']['input']>;
  teamMemberIdA: Scalars['Int']['input'];
  teamMemberIdB: Scalars['Int']['input'];
};

export type MutationToggleDraftAutoPickArgs = {
  draftId: Scalars['Int']['input'];
  enable: Scalars['Boolean']['input'];
};

export type MutationTriggerSeasonDraftStatLoadingArgs = {
  playerId: Scalars['Int']['input'];
};

export type MutationUndoLastDraftPickArgs = {
  draftId: Scalars['Int']['input'];
};

export type MutationUpdateCommissionerNoteArgs = {
  input: UpdateCommissionerNoteInput;
};

export type MutationUpdateDraftSettingsArgs = {
  input: UpdateDraftSettingsInput;
};

export type MutationUpdateDuesSettingsArgs = {
  input: UpdateDuesSettingsInput;
};

export type MutationUpdateLeagueAnnouncementArgs = {
  id: Scalars['Int']['input'];
  leagueId: Scalars['Int']['input'];
  messageText: Scalars['String']['input'];
};

export type MutationUpdateLeagueScoringProfileArgs = {
  leagueId: Scalars['Int']['input'];
  updates: Array<UpdateLeagueScoringMultiplierInput>;
};

export type MutationUpdateLeagueSettingsArgs = {
  input: UpdateLeagueSettingsInput;
};

export type MutationUpdateMatchupPlayerPositionArgs = {
  matchupPlayerId: Scalars['Int']['input'];
  positionId?: InputMaybe<Scalars['Int']['input']>;
};

export type MutationUpdateMatchupScoreArgs = {
  matchupId: Scalars['Int']['input'];
  team1Score?: InputMaybe<Scalars['Float']['input']>;
  team2Score?: InputMaybe<Scalars['Float']['input']>;
};

export type MutationUpdateMatchupStatusArgs = {
  matchupId: Scalars['Int']['input'];
  status: MatchupStatus;
};

export type MutationUpdateNotificationPreferencesArgs = {
  input: NotificationPreferenceInput;
};

export type MutationUpdatePlayoffMatchupArgs = {
  highSeedScore?: InputMaybe<Scalars['Float']['input']>;
  lowSeedScore?: InputMaybe<Scalars['Float']['input']>;
  matchupId: Scalars['Int']['input'];
  status?: InputMaybe<PlayoffMatchupStatus>;
};

export type MutationUpdateTeamBrandingArgs = {
  avatarUrl?: InputMaybe<Scalars['String']['input']>;
  bannerUrl?: InputMaybe<Scalars['String']['input']>;
  leagueId: Scalars['Int']['input'];
  logoUrl?: InputMaybe<Scalars['String']['input']>;
  primaryColor?: InputMaybe<Scalars['String']['input']>;
  secondaryColor?: InputMaybe<Scalars['String']['input']>;
  teamId: Scalars['Int']['input'];
};

export type MutationUpdateTeamMemberPositionArgs = {
  positionId?: InputMaybe<Scalars['Int']['input']>;
  teamMemberId: Scalars['Int']['input'];
};

export type MutationUpdateUserAvatarArgs = {
  avatarUrl?: InputMaybe<Scalars['String']['input']>;
};

export type MutationUpdateUserRoleArgs = {
  accessLevel: Scalars['String']['input'];
  userId: Scalars['Int']['input'];
};

export type MutationUpdateUsernameArgs = {
  username: Scalars['String']['input'];
};

export type MutationUpsertAchievementRestrictionArgs = {
  input: UpsertAchievementRestrictionInput;
};

export type MutationUpsertLeagueSeasonAwardArgs = {
  input: UpsertLeagueSeasonAwardInput;
};

export type MutationVerifyApplePurchaseArgs = {
  jwsTransaction: Scalars['String']['input'];
};

export type MutationVerifyGooglePurchaseArgs = {
  productId: Scalars['String']['input'];
  purchaseToken: Scalars['String']['input'];
};

export type MutationVetoTradeArgs = {
  tradeId: Scalars['Int']['input'];
};

export type NotificationHistoryItem = {
  __typename?: 'NotificationHistoryItem';
  body?: Maybe<Scalars['String']['output']>;
  channel?: Maybe<Scalars['String']['output']>;
  createdAt?: Maybe<Scalars['String']['output']>;
  data?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  isRead?: Maybe<Scalars['Boolean']['output']>;
  leagueId?: Maybe<Scalars['Int']['output']>;
  matchupId?: Maybe<Scalars['Int']['output']>;
  message?: Maybe<Scalars['String']['output']>;
  metadata?: Maybe<Scalars['String']['output']>;
  notificationType?: Maybe<Scalars['String']['output']>;
  read?: Maybe<Scalars['Boolean']['output']>;
  readAt?: Maybe<Scalars['String']['output']>;
  sentAt?: Maybe<Scalars['String']['output']>;
  title?: Maybe<Scalars['String']['output']>;
  updatedAt?: Maybe<Scalars['String']['output']>;
  userId?: Maybe<Scalars['Int']['output']>;
};

export type NotificationPreference = {
  __typename?: 'NotificationPreference';
  closeGameThreshold?: Maybe<Scalars['Int']['output']>;
  createdAt?: Maybe<Scalars['String']['output']>;
  emailEnabled?: Maybe<Scalars['Boolean']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  matchupCloseGameEnabled?: Maybe<Scalars['Boolean']['output']>;
  matchupEndedEnabled?: Maybe<Scalars['Boolean']['output']>;
  matchupReminderEnabled?: Maybe<Scalars['Boolean']['output']>;
  matchupStartedEnabled?: Maybe<Scalars['Boolean']['output']>;
  pushEnabled?: Maybe<Scalars['Boolean']['output']>;
  updatedAt?: Maybe<Scalars['String']['output']>;
  userId?: Maybe<Scalars['Int']['output']>;
};

export type NotificationPreferenceInput = {
  closeGameThreshold?: InputMaybe<Scalars['Int']['input']>;
  emailEnabled?: InputMaybe<Scalars['Boolean']['input']>;
  matchupCloseGameEnabled?: InputMaybe<Scalars['Boolean']['input']>;
  matchupEndedEnabled?: InputMaybe<Scalars['Boolean']['input']>;
  matchupReminderEnabled?: InputMaybe<Scalars['Boolean']['input']>;
  matchupStartedEnabled?: InputMaybe<Scalars['Boolean']['input']>;
  pushEnabled?: InputMaybe<Scalars['Boolean']['input']>;
};

/** A historically notable game-log performance on a specific calendar date */
export type OnThisDayEntry = {
  __typename?: 'OnThisDayEntry';
  atBats?: Maybe<Scalars['Int']['output']>;
  baseOnBalls?: Maybe<Scalars['Int']['output']>;
  /** Baseball-Reference player ID (used to build player URLs) */
  brefId?: Maybe<Scalars['String']['output']>;
  doubles?: Maybe<Scalars['Int']['output']>;
  earnedRuns?: Maybe<Scalars['Int']['output']>;
  /** "batting" or "pitching" */
  entryType?: Maybe<Scalars['String']['output']>;
  firstName?: Maybe<Scalars['String']['output']>;
  /** Baseball-Reference game identifier (encodes date & team) */
  gameIdentifier?: Maybe<Scalars['String']['output']>;
  hits?: Maybe<Scalars['Int']['output']>;
  hitsAllowed?: Maybe<Scalars['Int']['output']>;
  homeRuns?: Maybe<Scalars['Int']['output']>;
  inningsPitched?: Maybe<Scalars['Float']['output']>;
  lastName?: Maybe<Scalars['String']['output']>;
  playerId?: Maybe<Scalars['Int']['output']>;
  rbi?: Maybe<Scalars['Int']['output']>;
  runs?: Maybe<Scalars['Int']['output']>;
  saves?: Maybe<Scalars['Int']['output']>;
  /** Year of the game */
  season?: Maybe<Scalars['Int']['output']>;
  strikeouts?: Maybe<Scalars['Int']['output']>;
  triples?: Maybe<Scalars['Int']['output']>;
  walksAllowed?: Maybe<Scalars['Int']['output']>;
  wins?: Maybe<Scalars['Int']['output']>;
};

/** A historical baseball event (signing, trade) on a calendar date */
export type OnThisDayEvent = {
  __typename?: 'OnThisDayEvent';
  day?: Maybe<Scalars['Int']['output']>;
  /** Human-readable description of the event */
  description?: Maybe<Scalars['String']['output']>;
  /** MLB transaction type code (e.g. TR, SFA, CE) */
  eventType?: Maybe<Scalars['String']['output']>;
  fromTeam?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  month?: Maybe<Scalars['Int']['output']>;
  playerId?: Maybe<Scalars['Int']['output']>;
  playerName?: Maybe<Scalars['String']['output']>;
  toTeam?: Maybe<Scalars['String']['output']>;
  /** Year the event occurred */
  year?: Maybe<Scalars['Int']['output']>;
};

export type PageInfo = {
  __typename?: 'PageInfo';
  endCursor?: Maybe<Scalars['String']['output']>;
  hasNextPage: Scalars['Boolean']['output'];
  hasPreviousPage: Scalars['Boolean']['output'];
  startCursor?: Maybe<Scalars['String']['output']>;
};

export type Player = {
  __typename?: 'Player';
  averageSeasonBatting?: Maybe<AverageSeasonBatting>;
  brefId?: Maybe<Scalars['String']['output']>;
  /** Career honours and awards sourced from Baseball Reference (All-Star, Gold Glove, etc.) */
  careerAchievements?: Maybe<CareerAchievements>;
  /** Career batting statistics for the player */
  careerBatting?: Maybe<CareerBatting>;
  /** Career pitching statistics for the player */
  careerPitching?: Maybe<CareerPitching>;
  /** List of positions this player is eligible to play (e.g. SP, RP, 1B, SS) */
  eligiblePositions?: Maybe<Array<Scalars['String']['output']>>;
  firstName?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  lastName?: Maybe<Scalars['String']['output']>;
  /** The player's primary historical baseball era, derived from the midpoint of their MLB career. Values: Dead Ball Era | Golden Age | Expansion Era | Free Agency Era | Steroid Era | Modern Era */
  primaryEra?: Maybe<Scalars['String']['output']>;
  /** Fantasy scoring data (only populated when using scoring-based sort) */
  scoring?: Maybe<PlayerScoring>;
  /** Number of distinct MLB seasons the player has batting stats for (AL/NL only) */
  seasonsPlayed?: Maybe<Scalars['Int']['output']>;
  statsLastFetchedAt?: Maybe<Scalars['String']['output']>;
};

export type PlayerScoring = {
  __typename?: 'PlayerScoring';
  avgPointsPerGame?: Maybe<Scalars['Float']['output']>;
  battingScore?: Maybe<Scalars['Float']['output']>;
  careerGames?: Maybe<Scalars['Int']['output']>;
  fieldingScore?: Maybe<Scalars['Float']['output']>;
  hitterAvgPointsPerGame?: Maybe<Scalars['Float']['output']>;
  hitterScore?: Maybe<Scalars['Float']['output']>;
  pitchingAvgPointsPerGame?: Maybe<Scalars['Float']['output']>;
  pitchingScore?: Maybe<Scalars['Float']['output']>;
  totalScore?: Maybe<Scalars['Float']['output']>;
};

/** Playoff bracket configuration and status for a league season */
export type PlayoffBracket = {
  __typename?: 'PlayoffBracket';
  championTeam?: Maybe<Team>;
  championTeamId?: Maybe<Scalars['Int']['output']>;
  createdAt?: Maybe<Scalars['String']['output']>;
  endWeek?: Maybe<Scalars['Int']['output']>;
  format?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['ID']['output']>;
  leagueId?: Maybe<Scalars['Int']['output']>;
  matchups?: Maybe<Array<PlayoffMatchup>>;
  season?: Maybe<Scalars['Int']['output']>;
  startWeek?: Maybe<Scalars['Int']['output']>;
  status?: Maybe<PlayoffMatchupStatus>;
  updatedAt?: Maybe<Scalars['String']['output']>;
};

/** Individual playoff matchup within a bracket */
export type PlayoffMatchup = {
  __typename?: 'PlayoffMatchup';
  bracketId?: Maybe<Scalars['Int']['output']>;
  highSeedScore?: Maybe<Scalars['Float']['output']>;
  highSeedTeam?: Maybe<Team>;
  highSeedTeamId?: Maybe<Scalars['Int']['output']>;
  id?: Maybe<Scalars['ID']['output']>;
  isMultiWeek?: Maybe<Scalars['Boolean']['output']>;
  lowSeedScore?: Maybe<Scalars['Float']['output']>;
  lowSeedTeam?: Maybe<Team>;
  lowSeedTeamId?: Maybe<Scalars['Int']['output']>;
  matchupNumber?: Maybe<Scalars['Int']['output']>;
  round?: Maybe<PlayoffRound>;
  status?: Maybe<PlayoffMatchupStatus>;
  weekNumber?: Maybe<Scalars['Int']['output']>;
  winnerTeam?: Maybe<Team>;
  winnerTeamId?: Maybe<Scalars['Int']['output']>;
};

/** Status of a playoff matchup */
export enum PlayoffMatchupStatus {
  Completed = 'completed',
  InProgress = 'in_progress',
  Scheduled = 'scheduled',
}

/** Playoff projection for a team */
export type PlayoffProjection = {
  __typename?: 'PlayoffProjection';
  currentRecord?: Maybe<Scalars['String']['output']>;
  eliminationNumber?: Maybe<Scalars['Int']['output']>;
  magicNumber?: Maybe<Scalars['Int']['output']>;
  playoffProbability?: Maybe<Scalars['Float']['output']>;
  projectedLosses?: Maybe<Scalars['Float']['output']>;
  projectedWins?: Maybe<Scalars['Float']['output']>;
  remainingMatchups?: Maybe<Scalars['Int']['output']>;
  strengthOfSchedule?: Maybe<Scalars['Float']['output']>;
  teamId?: Maybe<Scalars['Int']['output']>;
  teamName?: Maybe<Scalars['String']['output']>;
};

/** Playoff qualification status for a team */
export type PlayoffQualification = {
  __typename?: 'PlayoffQualification';
  isQualified?: Maybe<Scalars['Boolean']['output']>;
  seedNumber?: Maybe<Scalars['Int']['output']>;
  standing?: Maybe<TeamStanding>;
  teamId?: Maybe<Scalars['ID']['output']>;
  teamName?: Maybe<Scalars['String']['output']>;
};

/** Playoff round designation */
export enum PlayoffRound {
  Finals = 'finals',
  Semifinals = 'semifinals',
  Wildcard = 'wildcard',
}

/** Team seeding and qualification info for playoffs */
export type PlayoffSeed = {
  __typename?: 'PlayoffSeed';
  bracketId?: Maybe<Scalars['Int']['output']>;
  id?: Maybe<Scalars['ID']['output']>;
  pointsFor?: Maybe<Scalars['Float']['output']>;
  regularSeasonLosses?: Maybe<Scalars['Int']['output']>;
  regularSeasonWins?: Maybe<Scalars['Int']['output']>;
  seedNumber?: Maybe<Scalars['Int']['output']>;
  team?: Maybe<Team>;
  teamId?: Maybe<Scalars['Int']['output']>;
};

/** Power ranking for a team */
export type PowerRanking = {
  __typename?: 'PowerRanking';
  pointDifferential?: Maybe<Scalars['Float']['output']>;
  powerScore?: Maybe<Scalars['Float']['output']>;
  rank?: Maybe<Scalars['Int']['output']>;
  recentFormScore?: Maybe<Scalars['Float']['output']>;
  teamId?: Maybe<Scalars['Int']['output']>;
  teamName?: Maybe<Scalars['String']['output']>;
};

export type PrivacyPolicyStatus = {
  __typename?: 'PrivacyPolicyStatus';
  accepted?: Maybe<Scalars['Boolean']['output']>;
  acceptedAt?: Maybe<Scalars['String']['output']>;
};

export type ProcessWaiverClaimsResult = {
  __typename?: 'ProcessWaiverClaimsResult';
  failed?: Maybe<Scalars['Int']['output']>;
  processed?: Maybe<Scalars['Int']['output']>;
  succeeded?: Maybe<Scalars['Int']['output']>;
};

/** A public league available for discovery and joining */
export type PublicLeagueInfo = {
  __typename?: 'PublicLeagueInfo';
  availableSpots?: Maybe<Scalars['Int']['output']>;
  draftStatus?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  isAlreadyMember?: Maybe<Scalars['Boolean']['output']>;
  isFull?: Maybe<Scalars['Boolean']['output']>;
  isPublic?: Maybe<Scalars['Boolean']['output']>;
  maxRosterSize?: Maybe<Scalars['Int']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  owner?: Maybe<Scalars['Int']['output']>;
  playerPool?: Maybe<Scalars['String']['output']>;
  totalSpots?: Maybe<Scalars['Int']['output']>;
};

export type Query = {
  __typename?: 'Query';
  /** Return all achievement restrictions configured for a league, sorted by achievement type */
  achievementRestrictions?: Maybe<Array<AchievementRestriction>>;
  /** Admin-only aggregate revenue and subscription metrics. */
  adminRevenueStats?: Maybe<AdminRevenueStats>;
  /** List all badge definitions available in the system */
  allBadgeDefinitions?: Maybe<Array<BadgeDefinition>>;
  auctionBudgets?: Maybe<Array<AuctionBudget>>;
  auctionState?: Maybe<AuctionState>;
  careerBattingStats?: Maybe<CareerBattingConnection>;
  careerFieldingStats?: Maybe<Array<CareerFielding>>;
  careerPitchingStats?: Maybe<Array<CareerPitching>>;
  careerPitchingStatsCount?: Maybe<Scalars['Int']['output']>;
  /** Commissioner: fetch the audit log for all commissioner actions in a league. */
  commissionerAuditLogs?: Maybe<Array<CommissionerAuditLog>>;
  defaultScoringProfile?: Maybe<ScoringConfig>;
  /** Get a complete export of all personal data for the authenticated user */
  exportMyData?: Maybe<UserDataExport>;
  freeAgents?: Maybe<Array<Player>>;
  /** Get all-time records across all seasons in a league's history (most wins, highest score, longest win streak, most points in a season). */
  getAllTimeRecords?: Maybe<Array<AllTimeRecord>>;
  getAvailableDraftPlayers?: Maybe<Array<DraftPlayer>>;
  getChampionshipTrophies?: Maybe<Array<ChampionTrophy>>;
  getCurrentDraftPick?: Maybe<CurrentDraftPick>;
  getCurrentWeekForLeague?: Maybe<Scalars['Int']['output']>;
  getDirectMessages?: Maybe<Array<DirectMessage>>;
  getDraft?: Maybe<Draft>;
  getDraftPicks?: Maybe<Array<DraftPick>>;
  /** Returns top-5 draft pick recommendations for a team using the Draft Intelligence algorithm (stat value 50% + positional need 30% + scarcity 20%). */
  getDraftRecommendations?: Maybe<Array<DraftRecommendation>>;
  /** Returns the auto-pick status for every team registered in the given draft. */
  getDraftTeamAutoPickStatuses?: Maybe<Array<DraftTeamAutoPickStatus>>;
  getDraftTeamOrder?: Maybe<Array<DraftTeamOrderEntry>>;
  getHeadToHeadRecord?: Maybe<HeadToHeadRecord>;
  getLeagueAnalytics?: Maybe<LeagueAnalytics>;
  getLeagueAnnouncements?: Maybe<Array<LeagueChatMessage>>;
  getLeagueDraft?: Maybe<Draft>;
  /** Get the full season history for a league by traversing the previousLeagueId lineage chain. Returns seasons in reverse chronological order (current first). */
  getLeagueHistory?: Maybe<Array<LeagueSeasonSummary>>;
  getLeagueMessages?: Maybe<Array<LeagueChatMessage>>;
  getLeagueStandings?: Maybe<Array<TeamStanding>>;
  getMatchupById?: Maybe<Matchup>;
  getMatchupHistory?: Maybe<Array<Matchup>>;
  getMatchupMessages?: Maybe<Array<MatchupMessage>>;
  getMatchupPlayers?: Maybe<Array<MatchupPlayer>>;
  getMatchupRoster?: Maybe<Array<MatchupPlayer>>;
  getMatchupStatusCounts?: Maybe<MatchupStatusCounts>;
  getMatchupsByWeek?: Maybe<Array<Matchup>>;
  getMatchupsForLeague?: Maybe<Array<Matchup>>;
  getMyDraftQueue?: Maybe<Array<DraftQueueEntry>>;
  /** Returns the auto-pick status for the current user's team in the given draft, or null if the user has no team in this draft. */
  getMyDraftTeamAutoPick?: Maybe<Scalars['Boolean']['output']>;
  getNotificationHistory?: Maybe<Array<NotificationHistoryItem>>;
  getPlayoffBracket?: Maybe<PlayoffBracket>;
  getPlayoffProjections?: Maybe<Array<PlayoffProjection>>;
  getPlayoffRace?: Maybe<Array<PlayoffQualification>>;
  getPlayoffSeeds?: Maybe<Array<PlayoffSeed>>;
  getPowerRankings?: Maybe<Array<TeamStanding>>;
  getSeasonResults?: Maybe<SeasonResults>;
  getTeamMatchupHistory?: Maybe<Array<Matchup>>;
  getTeamRecentMatchups?: Maybe<Array<Matchup>>;
  getTeamStatistics?: Maybe<Array<TeamStatistics>>;
  getTiebreakerHistory?: Maybe<Array<TiebreakerHistory>>;
  getTiebreakerRules?: Maybe<TiebreakerRule>;
  getUnreadNotificationCount?: Maybe<Scalars['Int']['output']>;
  getUserDeviceTokens?: Maybe<Array<DeviceToken>>;
  getUserNotificationPreferences?: Maybe<NotificationPreference>;
  hello?: Maybe<Scalars['String']['output']>;
  league?: Maybe<League>;
  /** Paginated activity timeline for a league, newest first. Optionally filter by one or more event types. */
  leagueActivity?: Maybe<Array<LeagueActivityEvent>>;
  /** Get dues settings for a league. Requires league membership. */
  leagueDuesSettings?: Maybe<LeagueDuesSettings>;
  /** Get payment status for all league members. Requires league membership. */
  leagueDuesStatus?: Maybe<Array<LeagueMemberPaymentStatus>>;
  leaguePositions?: Maybe<Array<LeaguePosition>>;
  leagueScoringProfile?: Maybe<ScoringConfig>;
  /** Return all season awards for a league, optionally filtered by season */
  leagueSeasonAwards?: Maybe<Array<LeagueSeasonAward>>;
  leagueTeams?: Maybe<Array<Team>>;
  /** Returns all roster entries explicitly listed on the trade block for the given league. */
  leagueTradeBlock?: Maybe<Array<TeamMember>>;
  leagueTradeOffers?: Maybe<Array<TradeOffer>>;
  /** Get all consent records for the authenticated user */
  myConsents?: Maybe<Array<UserConsent>>;
  /** Get all data export/deletion requests for the authenticated user */
  myDataRequests?: Maybe<Array<DataRequest>>;
  /** Get the current subscription for the authenticated user. */
  mySubscription?: Maybe<SubscriptionInfo>;
  /** Notable historical game-log performances from today's calendar date across all seasons */
  onThisDay?: Maybe<Array<OnThisDayEntry>>;
  /** Baseball events (signings, trades) that occurred on the given calendar date */
  onThisDayEvents?: Maybe<Array<OnThisDayEvent>>;
  player?: Maybe<Player>;
  playerByBrefId?: Maybe<Player>;
  playerCareerBatting?: Maybe<CareerBatting>;
  playerCareerFielding?: Maybe<CareerFielding>;
  playerCareerPitching?: Maybe<CareerPitching>;
  playerSeasonBatting?: Maybe<Array<SeasonBatting>>;
  playerSeasonFielding?: Maybe<Array<SeasonFielding>>;
  playerSeasonPitching?: Maybe<Array<SeasonPitching>>;
  players?: Maybe<Array<Player>>;
  /** Check if the authenticated user has accepted the privacy policy */
  privacyPolicyStatus?: Maybe<PrivacyPolicyStatus>;
  publicLeagues: Array<PublicLeagueInfo>;
  /** Live MLB scoreboard for the given date (defaults to today). Resolver stub — full implementation added in LS-1865 via MlbDataProvider. */
  scoreboard?: Maybe<Scoreboard>;
  scoringDefinitions?: Maybe<Array<ScoringStatDefinition>>;
  searchPlayers?: Maybe<Array<Player>>;
  searchUsers?: Maybe<Array<User>>;
  seasonBattingStats?: Maybe<Array<SeasonBatting>>;
  seasonDraftGame?: Maybe<SeasonDraftGame>;
  /** Get list of available positions to draft for */
  seasonDraftGameAvailablePositions?: Maybe<Array<Scalars['String']['output']>>;
  /** Get available draft options for a player: distinct teams (career_team mode) or seasons (season mode) */
  seasonDraftGamePlayerOptions?: Maybe<Array<Scalars['String']['output']>>;
  /** Get stat value for a player/season/position combination */
  seasonDraftGamePlayerSeasonStatValue?: Maybe<Scalars['Int']['output']>;
  /** Get valid stat keys for a given player type */
  seasonDraftGameValidStatKeys?: Maybe<Array<Scalars['String']['output']>>;
  /** Get all Season Draft Games for the current user */
  seasonDraftGames?: Maybe<Array<SeasonDraftGameSummary>>;
  seasonFieldingStats?: Maybe<Array<SeasonFielding>>;
  seasonPitchingStats?: Maybe<Array<SeasonPitching>>;
  /** Return earned badges for a team in a league */
  teamBadges?: Maybe<Array<UserBadge>>;
  teamById?: Maybe<Team>;
  teamLeagueMembers?: Maybe<Array<LeagueMember>>;
  teamMembers?: Maybe<Array<TeamMember>>;
  teamTradeOffers?: Maybe<Array<TradeOffer>>;
  teamWaiverClaims?: Maybe<Array<WaiverClaim>>;
  user?: Maybe<User>;
  /** Return progress records for in-progress multi-step badges for a user */
  userBadgeProgress?: Maybe<Array<BadgeProgress>>;
  /** Return earned badges for a user, optionally filtered to a specific league */
  userBadges?: Maybe<Array<UserBadge>>;
  userByEmail?: Maybe<User>;
  userLeagues: Array<League>;
  userTeamId?: Maybe<Scalars['Int']['output']>;
  users?: Maybe<Array<User>>;
  usersCount?: Maybe<Scalars['Int']['output']>;
  validateInviteCode?: Maybe<InviteCodeInfo>;
  /** Get version and deployment information for the GraphQL API */
  version?: Maybe<VersionInfo>;
};

export type QueryAchievementRestrictionsArgs = {
  leagueId: Scalars['Int']['input'];
};

export type QueryAuctionBudgetsArgs = {
  draftId: Scalars['Int']['input'];
};

export type QueryAuctionStateArgs = {
  draftId: Scalars['Int']['input'];
};

export type QueryCareerBattingStatsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  minBattingAvg?: InputMaybe<Scalars['Float']['input']>;
  minGames?: InputMaybe<Scalars['Int']['input']>;
  minHomeRuns?: InputMaybe<Scalars['Int']['input']>;
  minRBI?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Scalars['String']['input']>;
  orderDirection?: InputMaybe<Scalars['String']['input']>;
  position?: InputMaybe<Scalars['String']['input']>;
  searchTerm?: InputMaybe<Scalars['String']['input']>;
};

export type QueryCareerFieldingStatsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  minGames?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Scalars['String']['input']>;
  orderDirection?: InputMaybe<Scalars['String']['input']>;
};

export type QueryCareerPitchingStatsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  minGames?: InputMaybe<Scalars['Int']['input']>;
  minStrikeouts?: InputMaybe<Scalars['Int']['input']>;
  minWins?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Scalars['String']['input']>;
  orderDirection?: InputMaybe<Scalars['String']['input']>;
  searchTerm?: InputMaybe<Scalars['String']['input']>;
};

export type QueryCareerPitchingStatsCountArgs = {
  minGames?: InputMaybe<Scalars['Int']['input']>;
  minStrikeouts?: InputMaybe<Scalars['Int']['input']>;
  minWins?: InputMaybe<Scalars['Int']['input']>;
  searchTerm?: InputMaybe<Scalars['String']['input']>;
};

export type QueryCommissionerAuditLogsArgs = {
  leagueId: Scalars['Int']['input'];
  limit?: InputMaybe<Scalars['Int']['input']>;
};

export type QueryFreeAgentsArgs = {
  leagueId: Scalars['Int']['input'];
};

export type QueryGetAllTimeRecordsArgs = {
  leagueId: Scalars['Int']['input'];
};

export type QueryGetAvailableDraftPlayersArgs = {
  draftId: Scalars['Int']['input'];
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Scalars['String']['input']>;
  position?: InputMaybe<Scalars['String']['input']>;
  search?: InputMaybe<Scalars['String']['input']>;
};

export type QueryGetChampionshipTrophiesArgs = {
  leagueId: Scalars['Int']['input'];
};

export type QueryGetCurrentDraftPickArgs = {
  draftId: Scalars['Int']['input'];
};

export type QueryGetCurrentWeekForLeagueArgs = {
  leagueId: Scalars['Int']['input'];
};

export type QueryGetDirectMessagesArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  otherUserId: Scalars['Int']['input'];
};

export type QueryGetDraftArgs = {
  draftId: Scalars['Int']['input'];
};

export type QueryGetDraftPicksArgs = {
  draftId: Scalars['Int']['input'];
};

export type QueryGetDraftRecommendationsArgs = {
  draftId: Scalars['Int']['input'];
  teamId: Scalars['Int']['input'];
};

export type QueryGetDraftTeamAutoPickStatusesArgs = {
  draftId: Scalars['Int']['input'];
};

export type QueryGetDraftTeamOrderArgs = {
  draftId: Scalars['Int']['input'];
};

export type QueryGetHeadToHeadRecordArgs = {
  leagueId: Scalars['Int']['input'];
  team1Id: Scalars['Int']['input'];
  team2Id: Scalars['Int']['input'];
};

export type QueryGetLeagueAnalyticsArgs = {
  leagueId: Scalars['Int']['input'];
};

export type QueryGetLeagueAnnouncementsArgs = {
  leagueId: Scalars['Int']['input'];
};

export type QueryGetLeagueDraftArgs = {
  leagueId: Scalars['Int']['input'];
};

export type QueryGetLeagueHistoryArgs = {
  leagueId: Scalars['Int']['input'];
};

export type QueryGetLeagueMessagesArgs = {
  leagueId: Scalars['Int']['input'];
  limit?: InputMaybe<Scalars['Int']['input']>;
};

export type QueryGetLeagueStandingsArgs = {
  leagueId: Scalars['Int']['input'];
  season?: InputMaybe<Scalars['Int']['input']>;
};

export type QueryGetMatchupByIdArgs = {
  id: Scalars['Int']['input'];
};

export type QueryGetMatchupHistoryArgs = {
  leagueId: Scalars['Int']['input'];
  limit?: InputMaybe<Scalars['Int']['input']>;
  season?: InputMaybe<Scalars['Int']['input']>;
  status?: InputMaybe<MatchupStatus>;
  teamId?: InputMaybe<Scalars['Int']['input']>;
};

export type QueryGetMatchupMessagesArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  matchupId: Scalars['Int']['input'];
};

export type QueryGetMatchupPlayersArgs = {
  matchupId: Scalars['Int']['input'];
};

export type QueryGetMatchupRosterArgs = {
  matchupId: Scalars['Int']['input'];
  teamId: Scalars['Int']['input'];
};

export type QueryGetMatchupStatusCountsArgs = {
  leagueId: Scalars['Int']['input'];
  season?: InputMaybe<Scalars['Int']['input']>;
};

export type QueryGetMatchupsByWeekArgs = {
  leagueId: Scalars['Int']['input'];
  weekNumber: Scalars['Int']['input'];
};

export type QueryGetMatchupsForLeagueArgs = {
  leagueId: Scalars['Int']['input'];
  weekNumber?: InputMaybe<Scalars['Int']['input']>;
};

export type QueryGetMyDraftQueueArgs = {
  draftId: Scalars['Int']['input'];
};

export type QueryGetMyDraftTeamAutoPickArgs = {
  draftId: Scalars['Int']['input'];
};

export type QueryGetNotificationHistoryArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
};

export type QueryGetPlayoffBracketArgs = {
  leagueId: Scalars['Int']['input'];
  season?: InputMaybe<Scalars['Int']['input']>;
};

export type QueryGetPlayoffProjectionsArgs = {
  leagueId: Scalars['Int']['input'];
  playoffTeams?: InputMaybe<Scalars['Int']['input']>;
  remainingWeeks?: InputMaybe<Scalars['Int']['input']>;
};

export type QueryGetPlayoffRaceArgs = {
  leagueId: Scalars['Int']['input'];
  playoffSpots: Scalars['Int']['input'];
  season?: InputMaybe<Scalars['Int']['input']>;
};

export type QueryGetPlayoffSeedsArgs = {
  bracketId: Scalars['Int']['input'];
};

export type QueryGetPowerRankingsArgs = {
  leagueId: Scalars['Int']['input'];
  season?: InputMaybe<Scalars['Int']['input']>;
};

export type QueryGetSeasonResultsArgs = {
  leagueId: Scalars['Int']['input'];
  season?: InputMaybe<Scalars['Int']['input']>;
};

export type QueryGetTeamMatchupHistoryArgs = {
  leagueId: Scalars['Int']['input'];
  limit?: InputMaybe<Scalars['Int']['input']>;
  teamId: Scalars['Int']['input'];
};

export type QueryGetTeamRecentMatchupsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  teamId: Scalars['Int']['input'];
};

export type QueryGetTeamStatisticsArgs = {
  endWeek?: InputMaybe<Scalars['Int']['input']>;
  leagueId: Scalars['Int']['input'];
  startWeek?: InputMaybe<Scalars['Int']['input']>;
};

export type QueryGetTiebreakerHistoryArgs = {
  leagueId?: InputMaybe<Scalars['Int']['input']>;
  matchupId?: InputMaybe<Scalars['Int']['input']>;
};

export type QueryGetTiebreakerRulesArgs = {
  leagueId: Scalars['Int']['input'];
};

export type QueryLeagueArgs = {
  id: Scalars['Int']['input'];
};

export type QueryLeagueActivityArgs = {
  eventTypes?: InputMaybe<Array<LeagueActivityEventType>>;
  leagueId: Scalars['Int']['input'];
  limit?: InputMaybe<Scalars['Int']['input']>;
};

export type QueryLeagueDuesSettingsArgs = {
  leagueId: Scalars['Int']['input'];
};

export type QueryLeagueDuesStatusArgs = {
  leagueId: Scalars['Int']['input'];
};

export type QueryLeaguePositionsArgs = {
  leagueId: Scalars['Int']['input'];
};

export type QueryLeagueScoringProfileArgs = {
  leagueId: Scalars['Int']['input'];
};

export type QueryLeagueSeasonAwardsArgs = {
  leagueId: Scalars['Int']['input'];
  season?: InputMaybe<Scalars['Int']['input']>;
};

export type QueryLeagueTeamsArgs = {
  leagueId: Scalars['Int']['input'];
};

export type QueryLeagueTradeBlockArgs = {
  leagueId: Scalars['Int']['input'];
};

export type QueryLeagueTradeOffersArgs = {
  leagueId: Scalars['Int']['input'];
  status?: InputMaybe<Scalars['String']['input']>;
};

export type QueryOnThisDayArgs = {
  day: Scalars['Int']['input'];
  limit?: InputMaybe<Scalars['Int']['input']>;
  month: Scalars['Int']['input'];
};

export type QueryOnThisDayEventsArgs = {
  day: Scalars['Int']['input'];
  limit?: InputMaybe<Scalars['Int']['input']>;
  month: Scalars['Int']['input'];
};

export type QueryPlayerArgs = {
  id: Scalars['Int']['input'];
};

export type QueryPlayerByBrefIdArgs = {
  brefId: Scalars['String']['input'];
};

export type QueryPlayerCareerBattingArgs = {
  playerId: Scalars['Int']['input'];
};

export type QueryPlayerCareerFieldingArgs = {
  playerId: Scalars['Int']['input'];
};

export type QueryPlayerCareerPitchingArgs = {
  playerId: Scalars['Int']['input'];
};

export type QueryPlayerSeasonBattingArgs = {
  playerId: Scalars['Int']['input'];
  season?: InputMaybe<Scalars['Int']['input']>;
};

export type QueryPlayerSeasonFieldingArgs = {
  playerId: Scalars['Int']['input'];
  season?: InputMaybe<Scalars['Int']['input']>;
};

export type QueryPlayerSeasonPitchingArgs = {
  playerId: Scalars['Int']['input'];
  season?: InputMaybe<Scalars['Int']['input']>;
};

export type QueryPlayersArgs = {
  excludeEmptyNames?: InputMaybe<Scalars['Boolean']['input']>;
  leagueId?: InputMaybe<Scalars['Int']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Scalars['String']['input']>;
  orderDirection?: InputMaybe<Scalars['String']['input']>;
  position?: InputMaybe<Scalars['String']['input']>;
  search?: InputMaybe<Scalars['String']['input']>;
};

export type QueryPublicLeaguesArgs = {
  draftStatus?: InputMaybe<Scalars['String']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  playerPool?: InputMaybe<Scalars['String']['input']>;
  search?: InputMaybe<Scalars['String']['input']>;
};

export type QueryScoreboardArgs = {
  date?: InputMaybe<Scalars['String']['input']>;
};

export type QuerySearchPlayersArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  searchTerm: Scalars['String']['input'];
};

export type QuerySearchUsersArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  searchTerm: Scalars['String']['input'];
};

export type QuerySeasonBattingStatsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  minGames?: InputMaybe<Scalars['Int']['input']>;
  minHomeRuns?: InputMaybe<Scalars['Int']['input']>;
  minRBI?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Scalars['String']['input']>;
  orderDirection?: InputMaybe<Scalars['String']['input']>;
  playerId?: InputMaybe<Scalars['Int']['input']>;
  season?: InputMaybe<Scalars['Int']['input']>;
  team?: InputMaybe<Scalars['String']['input']>;
};

export type QuerySeasonDraftGameArgs = {
  gameId: Scalars['Int']['input'];
};

export type QuerySeasonDraftGameAvailablePositionsArgs = {
  gameId: Scalars['Int']['input'];
};

export type QuerySeasonDraftGamePlayerOptionsArgs = {
  gameMode: SeasonDraftGameMode;
  playerId: Scalars['Int']['input'];
  playerType: SeasonDraftPlayerType;
};

export type QuerySeasonDraftGamePlayerSeasonStatValueArgs = {
  gameMode?: InputMaybe<Scalars['String']['input']>;
  playerId: Scalars['Int']['input'];
  playerType?: InputMaybe<Scalars['String']['input']>;
  position: Scalars['String']['input'];
  season: Scalars['Int']['input'];
  statKey?: InputMaybe<Scalars['String']['input']>;
  team?: InputMaybe<Scalars['String']['input']>;
};

export type QuerySeasonDraftGameValidStatKeysArgs = {
  playerType: Scalars['String']['input'];
};

export type QuerySeasonFieldingStatsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  minGames?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Scalars['String']['input']>;
  orderDirection?: InputMaybe<Scalars['String']['input']>;
  playerId?: InputMaybe<Scalars['Int']['input']>;
  season?: InputMaybe<Scalars['Int']['input']>;
  team?: InputMaybe<Scalars['String']['input']>;
};

export type QuerySeasonPitchingStatsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  minGames?: InputMaybe<Scalars['Int']['input']>;
  minStrikeouts?: InputMaybe<Scalars['Int']['input']>;
  minWins?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Scalars['String']['input']>;
  orderDirection?: InputMaybe<Scalars['String']['input']>;
  playerId?: InputMaybe<Scalars['Int']['input']>;
  season?: InputMaybe<Scalars['Int']['input']>;
  team?: InputMaybe<Scalars['String']['input']>;
};

export type QueryTeamBadgesArgs = {
  leagueId: Scalars['Int']['input'];
  teamId: Scalars['Int']['input'];
};

export type QueryTeamByIdArgs = {
  teamId: Scalars['Int']['input'];
};

export type QueryTeamLeagueMembersArgs = {
  teamId: Scalars['Int']['input'];
};

export type QueryTeamMembersArgs = {
  teamId: Scalars['Int']['input'];
};

export type QueryTeamTradeOffersArgs = {
  status?: InputMaybe<Scalars['String']['input']>;
  teamId: Scalars['Int']['input'];
};

export type QueryTeamWaiverClaimsArgs = {
  status?: InputMaybe<Scalars['String']['input']>;
  teamId: Scalars['Int']['input'];
};

export type QueryUserArgs = {
  id: Scalars['Int']['input'];
};

export type QueryUserBadgeProgressArgs = {
  leagueId?: InputMaybe<Scalars['Int']['input']>;
  userId: Scalars['Int']['input'];
};

export type QueryUserBadgesArgs = {
  leagueId?: InputMaybe<Scalars['Int']['input']>;
  userId: Scalars['Int']['input'];
};

export type QueryUserByEmailArgs = {
  email: Scalars['String']['input'];
};

export type QueryUserTeamIdArgs = {
  leagueId: Scalars['Int']['input'];
};

export type QueryUsersArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Scalars['String']['input']>;
  orderDirection?: InputMaybe<Scalars['String']['input']>;
  search?: InputMaybe<Scalars['String']['input']>;
};

export type QueryUsersCountArgs = {
  search?: InputMaybe<Scalars['String']['input']>;
};

export type QueryValidateInviteCodeArgs = {
  code: Scalars['String']['input'];
};

export type RecordConsentInput = {
  consentType: ConsentType;
  ipAddress?: InputMaybe<Scalars['String']['input']>;
  userAgent?: InputMaybe<Scalars['String']['input']>;
};

/** Live MLB scoreboard data for a single date */
export type Scoreboard = {
  __typename?: 'Scoreboard';
  /** Date of the games (YYYY-MM-DD) */
  date?: Maybe<Scalars['String']['output']>;
  /** All games scheduled for this date */
  games?: Maybe<Array<ScoreboardGame>>;
  /** ISO 8601 timestamp of the last data refresh */
  lastUpdated?: Maybe<Scalars['String']['output']>;
};

/** A single MLB game on the scoreboard */
export type ScoreboardGame = {
  __typename?: 'ScoreboardGame';
  /** Away team score and linescore */
  awayTeam: ScoreboardTeam;
  /** MLB primary key for the game */
  gamePk: Scalars['Int']['output'];
  /** Home team score and linescore */
  homeTeam: ScoreboardTeam;
  /** Current inning number (null for Preview/Final) */
  inning?: Maybe<Scalars['Int']['output']>;
  /** "Top" or "Bot" — null for Preview/Final */
  inningHalf?: Maybe<Scalars['String']['output']>;
  /** Current number of outs (null for Preview/Final) */
  outs?: Maybe<Scalars['Int']['output']>;
  /** Scheduled start time (ISO 8601) */
  startTime?: Maybe<Scalars['String']['output']>;
  /** Game status: "Preview", "Live", or "Final" */
  status: Scalars['String']['output'];
};

/** Team score and linescore data for a single game */
export type ScoreboardTeam = {
  __typename?: 'ScoreboardTeam';
  /** Three-letter team abbreviation (e.g. NYY, BOS) */
  abbreviation: Scalars['String']['output'];
  /** Total errors */
  errors: Scalars['Int']['output'];
  /** Total hits */
  hits: Scalars['Int']['output'];
  /** Runs scored per inning (index 0 = inning 1) */
  linescoreInnings?: Maybe<Array<Scalars['Int']['output']>>;
  /** Total runs scored */
  runs: Scalars['Int']['output'];
  /** Full team name */
  teamName: Scalars['String']['output'];
};

export type ScoringConfig = {
  __typename?: 'ScoringConfig';
  definitions?: Maybe<Array<ScoringStatDefinition>>;
  entries?: Maybe<Array<ScoringConfigEntry>>;
  leagueId?: Maybe<Scalars['Int']['output']>;
  multiplierGroups?: Maybe<Array<ScoringRuleGroup>>;
  profileId?: Maybe<Scalars['Int']['output']>;
  profileName?: Maybe<Scalars['String']['output']>;
  stats?: Maybe<Array<ScoringRule>>;
};

export type ScoringConfigEntry = {
  __typename?: 'ScoringConfigEntry';
  createdAt?: Maybe<Scalars['String']['output']>;
  definition?: Maybe<ScoringStatDefinition>;
  id?: Maybe<Scalars['Int']['output']>;
  isEnabled?: Maybe<Scalars['Boolean']['output']>;
  multiplier?: Maybe<Scalars['Float']['output']>;
  profileId?: Maybe<Scalars['Int']['output']>;
  statDefinitionId?: Maybe<Scalars['Int']['output']>;
  updatedAt?: Maybe<Scalars['String']['output']>;
};

export type ScoringMultiplierEntry = {
  __typename?: 'ScoringMultiplierEntry';
  multiplier?: Maybe<Scalars['Float']['output']>;
  sourceColumn?: Maybe<Scalars['String']['output']>;
  statKey?: Maybe<Scalars['String']['output']>;
};

export type ScoringRule = {
  __typename?: 'ScoringRule';
  defaultMultiplier?: Maybe<Scalars['Float']['output']>;
  definition?: Maybe<ScoringStatDefinition>;
  isEnabled?: Maybe<Scalars['Boolean']['output']>;
  isOverride?: Maybe<Scalars['Boolean']['output']>;
  multiplier?: Maybe<Scalars['Float']['output']>;
};

export type ScoringRuleGroup = {
  __typename?: 'ScoringRuleGroup';
  group?: Maybe<ScoringStatGroup>;
  values?: Maybe<Array<ScoringMultiplierEntry>>;
};

export type ScoringStatDefinition = {
  __typename?: 'ScoringStatDefinition';
  createdAt?: Maybe<Scalars['String']['output']>;
  defaultMultiplier?: Maybe<Scalars['Float']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  displayName?: Maybe<Scalars['String']['output']>;
  enforceNegative?: Maybe<Scalars['Boolean']['output']>;
  enforcePositive?: Maybe<Scalars['Boolean']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  isRequired?: Maybe<Scalars['Boolean']['output']>;
  maxMultiplier?: Maybe<Scalars['Float']['output']>;
  minMultiplier?: Maybe<Scalars['Float']['output']>;
  sourceColumn?: Maybe<Scalars['String']['output']>;
  sourceTable?: Maybe<Scalars['String']['output']>;
  statGroup?: Maybe<ScoringStatGroup>;
  statKey?: Maybe<Scalars['String']['output']>;
  stepSize?: Maybe<Scalars['Float']['output']>;
  updatedAt?: Maybe<Scalars['String']['output']>;
};

/** Grouping for fantasy scoring statistics */
export enum ScoringStatGroup {
  Batting = 'batting',
  Fielding = 'fielding',
  Pitching = 'pitching',
}

export type SeasonBatting = {
  __typename?: 'SeasonBatting';
  atBats?: Maybe<Scalars['Int']['output']>;
  awardSummary?: Maybe<Scalars['String']['output']>;
  baseOnBalls?: Maybe<Scalars['Int']['output']>;
  battingAverage?: Maybe<Scalars['Float']['output']>;
  /** Baseball Reference WAR (bWAR) for this season */
  bwar?: Maybe<Scalars['Float']['output']>;
  caughtStealing?: Maybe<Scalars['Int']['output']>;
  doubles?: Maybe<Scalars['Int']['output']>;
  games?: Maybe<Scalars['Int']['output']>;
  groundedIntoDoublePlays?: Maybe<Scalars['Int']['output']>;
  hitByPitch?: Maybe<Scalars['Int']['output']>;
  hits?: Maybe<Scalars['Int']['output']>;
  homeRuns?: Maybe<Scalars['Int']['output']>;
  intentionalBaseOnBalls?: Maybe<Scalars['Int']['output']>;
  league?: Maybe<Scalars['String']['output']>;
  onBasePercentage?: Maybe<Scalars['Float']['output']>;
  onBasePlusSlugging?: Maybe<Scalars['Float']['output']>;
  onBasePlusSluggingPlus?: Maybe<Scalars['Float']['output']>;
  plateAppearances?: Maybe<Scalars['Int']['output']>;
  playerId?: Maybe<Scalars['Int']['output']>;
  rbi?: Maybe<Scalars['Int']['output']>;
  runs?: Maybe<Scalars['Int']['output']>;
  sacrificeHits?: Maybe<Scalars['Int']['output']>;
  season?: Maybe<Scalars['Int']['output']>;
  sluggingPercentage?: Maybe<Scalars['Float']['output']>;
  stolenBases?: Maybe<Scalars['Int']['output']>;
  strikeouts?: Maybe<Scalars['Int']['output']>;
  team?: Maybe<Scalars['String']['output']>;
  totalBases?: Maybe<Scalars['Int']['output']>;
  triples?: Maybe<Scalars['Int']['output']>;
};

/** A Season Draft Game with full state */
export type SeasonDraftGame = {
  __typename?: 'SeasonDraftGame';
  createdBy?: Maybe<Scalars['Int']['output']>;
  currentTurn?: Maybe<Scalars['Int']['output']>;
  gameMode?: Maybe<SeasonDraftGameMode>;
  id?: Maybe<Scalars['Int']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  picks?: Maybe<Array<SeasonDraftGamePickHistory>>;
  playerType?: Maybe<SeasonDraftPlayerType>;
  players?: Maybe<Array<SeasonDraftPlayer>>;
  statKey?: Maybe<Scalars['String']['output']>;
  status?: Maybe<SeasonDraftGameStatus>;
};

/** Game mode: season (player+year), career_team (player+team career total), or most_teams (count of distinct teams) */
export enum SeasonDraftGameMode {
  CareerTeam = 'career_team',
  MostTeams = 'most_teams',
  Season = 'season',
}

/** A historical pick in the draft */
export type SeasonDraftGamePickHistory = {
  __typename?: 'SeasonDraftGamePickHistory';
  baseballPlayerName?: Maybe<Scalars['String']['output']>;
  draftingUser?: Maybe<Scalars['String']['output']>;
  pickNumber?: Maybe<Scalars['Int']['output']>;
  pickedAt?: Maybe<Scalars['String']['output']>;
  playerName?: Maybe<Scalars['String']['output']>;
  position?: Maybe<Scalars['String']['output']>;
  season?: Maybe<Scalars['Int']['output']>;
  statValue?: Maybe<Scalars['Int']['output']>;
  team?: Maybe<Scalars['String']['output']>;
};

export enum SeasonDraftGameStatus {
  Cancelled = 'cancelled',
  Completed = 'completed',
  Drafting = 'drafting',
  Setup = 'setup',
}

/** Summary of a Season Draft Game */
export type SeasonDraftGameSummary = {
  __typename?: 'SeasonDraftGameSummary';
  gameMode?: Maybe<SeasonDraftGameMode>;
  id?: Maybe<Scalars['Int']['output']>;
  isMyTurn?: Maybe<Scalars['Boolean']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  playerType?: Maybe<SeasonDraftPlayerType>;
  statKey?: Maybe<Scalars['String']['output']>;
  status?: Maybe<SeasonDraftGameStatus>;
};

/** A completed draft pick with player and scoring info */
export type SeasonDraftPick = {
  __typename?: 'SeasonDraftPick';
  playerName?: Maybe<Scalars['String']['output']>;
  season?: Maybe<Scalars['Int']['output']>;
  statValue?: Maybe<Scalars['Int']['output']>;
  team?: Maybe<Scalars['String']['output']>;
};

/** A player (human) in a Season Draft Game */
export type SeasonDraftPlayer = {
  __typename?: 'SeasonDraftPlayer';
  draftOrder?: Maybe<Scalars['Int']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  playerName?: Maybe<Scalars['String']['output']>;
  roster?: Maybe<Array<SeasonDraftRosterSlot>>;
  totalScore?: Maybe<Scalars['Int']['output']>;
  userId?: Maybe<Scalars['Int']['output']>;
};

/** Whether this is a hitter draft or pitcher draft */
export enum SeasonDraftPlayerType {
  Hitter = 'hitter',
  Pitcher = 'pitcher',
}

/** A roster slot for a player in a Season Draft Game */
export type SeasonDraftRosterSlot = {
  __typename?: 'SeasonDraftRosterSlot';
  id?: Maybe<Scalars['Int']['output']>;
  isFilled?: Maybe<Scalars['Boolean']['output']>;
  pick?: Maybe<SeasonDraftPick>;
  position?: Maybe<Scalars['String']['output']>;
  slotNumber?: Maybe<Scalars['Int']['output']>;
};

export type SeasonFielding = {
  __typename?: 'SeasonFielding';
  assists?: Maybe<Scalars['Int']['output']>;
  awardSummary?: Maybe<Scalars['String']['output']>;
  caughtStealing?: Maybe<Scalars['Int']['output']>;
  caughtStealingPercentage?: Maybe<Scalars['Float']['output']>;
  caughtStealingPercentageLeague?: Maybe<Scalars['Float']['output']>;
  chances?: Maybe<Scalars['Float']['output']>;
  completeGames?: Maybe<Scalars['Int']['output']>;
  doublePlays?: Maybe<Scalars['Int']['output']>;
  errors?: Maybe<Scalars['Int']['output']>;
  fieldingPercentage?: Maybe<Scalars['Float']['output']>;
  fieldingPercentageLeague?: Maybe<Scalars['Float']['output']>;
  games?: Maybe<Scalars['Int']['output']>;
  gamesOfParts?: Maybe<Scalars['Int']['output']>;
  gamesStarted?: Maybe<Scalars['Int']['output']>;
  inningsDefended?: Maybe<Scalars['Float']['output']>;
  league?: Maybe<Scalars['String']['output']>;
  pickoffs?: Maybe<Scalars['Int']['output']>;
  playerId?: Maybe<Scalars['Int']['output']>;
  position?: Maybe<Scalars['String']['output']>;
  putouts?: Maybe<Scalars['Int']['output']>;
  rangeFactorPerGame?: Maybe<Scalars['Float']['output']>;
  rangeFactorPerGameLeague?: Maybe<Scalars['Float']['output']>;
  rangeFactorPerNine?: Maybe<Scalars['Float']['output']>;
  rangeFactorPerNineLeague?: Maybe<Scalars['Float']['output']>;
  rowId?: Maybe<Scalars['String']['output']>;
  season?: Maybe<Scalars['Int']['output']>;
  stolenBases?: Maybe<Scalars['Int']['output']>;
  team?: Maybe<Scalars['String']['output']>;
  wildPitches?: Maybe<Scalars['Int']['output']>;
};

export type SeasonPitching = {
  __typename?: 'SeasonPitching';
  awardSummary?: Maybe<Scalars['String']['output']>;
  balks?: Maybe<Scalars['Int']['output']>;
  baseOnBalls?: Maybe<Scalars['Int']['output']>;
  basesOnBallsPerNine?: Maybe<Scalars['Float']['output']>;
  battersFaced?: Maybe<Scalars['Int']['output']>;
  completeGames?: Maybe<Scalars['Int']['output']>;
  earnedRunAverage?: Maybe<Scalars['String']['output']>;
  earnedRunAveragePlus?: Maybe<Scalars['Float']['output']>;
  earnedRuns?: Maybe<Scalars['Int']['output']>;
  fip?: Maybe<Scalars['Float']['output']>;
  games?: Maybe<Scalars['Int']['output']>;
  gamesFinished?: Maybe<Scalars['Int']['output']>;
  gamesStarted?: Maybe<Scalars['Int']['output']>;
  hitByPitch?: Maybe<Scalars['Int']['output']>;
  hits?: Maybe<Scalars['Int']['output']>;
  hitsPerNine?: Maybe<Scalars['Float']['output']>;
  homeRuns?: Maybe<Scalars['Int']['output']>;
  homeRunsPerNine?: Maybe<Scalars['Float']['output']>;
  inningsPitched?: Maybe<Scalars['Float']['output']>;
  intentionalBaseOnBalls?: Maybe<Scalars['Int']['output']>;
  league?: Maybe<Scalars['String']['output']>;
  losses?: Maybe<Scalars['Int']['output']>;
  outsRecorded?: Maybe<Scalars['Int']['output']>;
  playerId?: Maybe<Scalars['Int']['output']>;
  /** Baseball Reference pitching WAR for this season (distinct from position-player bWAR) */
  pwar?: Maybe<Scalars['Float']['output']>;
  rowId?: Maybe<Scalars['String']['output']>;
  runs?: Maybe<Scalars['Int']['output']>;
  saves?: Maybe<Scalars['Int']['output']>;
  season?: Maybe<Scalars['Int']['output']>;
  shutouts?: Maybe<Scalars['Int']['output']>;
  strikeouts?: Maybe<Scalars['Int']['output']>;
  strikeoutsPerBaseOnBalls?: Maybe<Scalars['Float']['output']>;
  strikeoutsPerNine?: Maybe<Scalars['Float']['output']>;
  team?: Maybe<Scalars['String']['output']>;
  whip?: Maybe<Scalars['Float']['output']>;
  wildPitches?: Maybe<Scalars['Int']['output']>;
  winLossPercentage?: Maybe<Scalars['String']['output']>;
  winPercentage?: Maybe<Scalars['Float']['output']>;
  wins?: Maybe<Scalars['Int']['output']>;
};

/** Complete season results with standings */
export type SeasonResults = {
  __typename?: 'SeasonResults';
  completedMatchups?: Maybe<Scalars['Int']['output']>;
  leagueId?: Maybe<Scalars['ID']['output']>;
  season?: Maybe<Scalars['Int']['output']>;
  standings?: Maybe<Array<TeamStanding>>;
  totalMatchups?: Maybe<Scalars['Int']['output']>;
};

/** Result of the Discord lineup lock reminder check across all active leagues */
export type SendDiscordLineupRemindersResult = {
  __typename?: 'SendDiscordLineupRemindersResult';
  errors?: Maybe<Array<Scalars['String']['output']>>;
  leaguesChecked?: Maybe<Scalars['Int']['output']>;
  remindersSent?: Maybe<Scalars['Int']['output']>;
};

/** Result of the Discord matchup score alert check across all active leagues */
export type SendDiscordScoreAlertsResult = {
  __typename?: 'SendDiscordScoreAlertsResult';
  alertsSent?: Maybe<Scalars['Int']['output']>;
  closeMatchupsFound?: Maybe<Scalars['Int']['output']>;
  errors?: Maybe<Array<Scalars['String']['output']>>;
  leaguesChecked?: Maybe<Scalars['Int']['output']>;
};

/** Result of the weekly Discord recap post across all active leagues */
export type SendDiscordWeeklyRecapsResult = {
  __typename?: 'SendDiscordWeeklyRecapsResult';
  errors?: Maybe<Array<Scalars['String']['output']>>;
  leaguesChecked?: Maybe<Scalars['Int']['output']>;
  recapsSent?: Maybe<Scalars['Int']['output']>;
};

/** Result of the scheduled dues reminder check across all active leagues */
export type SendDuesRemindersResult = {
  __typename?: 'SendDuesRemindersResult';
  errors?: Maybe<Array<Scalars['String']['output']>>;
  leaguesChecked?: Maybe<Scalars['Int']['output']>;
  remindersSent?: Maybe<Scalars['Int']['output']>;
};

export type SetTeamLockInput = {
  leagueId: Scalars['Int']['input'];
  locked: Scalars['Boolean']['input'];
  reason?: InputMaybe<Scalars['String']['input']>;
  teamId: Scalars['Int']['input'];
};

export enum StatsLoadingStatus {
  Completed = 'completed',
  Failed = 'failed',
  Loading = 'loading',
  NotStarted = 'not_started',
  Queued = 'queued',
  Retry = 'retry',
}

export type SubscriberGrowthPoint = {
  __typename?: 'SubscriberGrowthPoint';
  month?: Maybe<Scalars['String']['output']>;
  newSubscribers?: Maybe<Scalars['Int']['output']>;
};

export type SubscriptionInfo = {
  __typename?: 'SubscriptionInfo';
  cancelAtPeriodEnd?: Maybe<Scalars['Boolean']['output']>;
  currentPeriodEnd?: Maybe<Scalars['String']['output']>;
  gracePeriodEndsAt?: Maybe<Scalars['String']['output']>;
  status?: Maybe<Scalars['String']['output']>;
  tier?: Maybe<Scalars['String']['output']>;
  trialEndsAt?: Maybe<Scalars['String']['output']>;
};

export type SubscriptionStatusCount = {
  __typename?: 'SubscriptionStatusCount';
  count?: Maybe<Scalars['Int']['output']>;
  status?: Maybe<Scalars['String']['output']>;
};

export type SwapMatchupTeamsInput = {
  matchupId1: Scalars['Int']['input'];
  matchupId2: Scalars['Int']['input'];
  reason?: InputMaybe<Scalars['String']['input']>;
};

/** A team in a league */
export type Team = {
  __typename?: 'Team';
  avatarUrl?: Maybe<Scalars['String']['output']>;
  bannerUrl?: Maybe<Scalars['String']['output']>;
  /** Remaining salary cap space for this team (league.salaryCap - totalPayroll). Null if cap is not enabled or no cap limit is set. */
  capSpace?: Maybe<Scalars['Int']['output']>;
  createdAt?: Maybe<Scalars['String']['output']>;
  divisionId?: Maybe<Scalars['Int']['output']>;
  faabBudget?: Maybe<Scalars['Int']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  isLocked?: Maybe<Scalars['Boolean']['output']>;
  leagueId?: Maybe<Scalars['Int']['output']>;
  logoUrl?: Maybe<Scalars['String']['output']>;
  /** The userId of the primary manager for this team (from leagueMembers). */
  managerId?: Maybe<Scalars['Int']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  primaryColor?: Maybe<Scalars['String']['output']>;
  secondaryColor?: Maybe<Scalars['String']['output']>;
  /** Total salary cap payroll for this team (sum of team_members.salary). Null if the league does not have salary cap enabled. */
  totalPayroll?: Maybe<Scalars['Int']['output']>;
  updatedAt?: Maybe<Scalars['String']['output']>;
  waiverOrder?: Maybe<Scalars['Int']['output']>;
};

/** A member of a team */
export type TeamMember = {
  __typename?: 'TeamMember';
  /** Free-text asking price displayed on the trade block listing. Null when not set. */
  askingPrice?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  leagueId?: Maybe<Scalars['Int']['output']>;
  /** Optional custom nickname for this player on this roster. (LS-1813) */
  nickname?: Maybe<Scalars['String']['output']>;
  onTradeBlock?: Maybe<Scalars['Boolean']['output']>;
  player?: Maybe<Player>;
  playerId?: Maybe<Scalars['Int']['output']>;
  positionId?: Maybe<Scalars['Int']['output']>;
  /** Current salary cap hit for this roster slot. Null in non-salary-cap leagues. */
  salary?: Maybe<Scalars['Int']['output']>;
  teamId?: Maybe<Scalars['Int']['output']>;
};

/** Team standing information with wins, losses, and scoring stats */
export type TeamStanding = {
  __typename?: 'TeamStanding';
  avatarUrl?: Maybe<Scalars['String']['output']>;
  averagePointsAgainst?: Maybe<Scalars['Float']['output']>;
  averagePointsFor?: Maybe<Scalars['Float']['output']>;
  divisionId?: Maybe<Scalars['Int']['output']>;
  losses?: Maybe<Scalars['Int']['output']>;
  pointsAgainst?: Maybe<Scalars['Float']['output']>;
  pointsFor?: Maybe<Scalars['Float']['output']>;
  primaryColor?: Maybe<Scalars['String']['output']>;
  rank?: Maybe<Scalars['Int']['output']>;
  secondaryColor?: Maybe<Scalars['String']['output']>;
  teamId?: Maybe<Scalars['ID']['output']>;
  teamName?: Maybe<Scalars['String']['output']>;
  ties?: Maybe<Scalars['Int']['output']>;
  totalMatchups?: Maybe<Scalars['Int']['output']>;
  winPercentage?: Maybe<Scalars['Float']['output']>;
  wins?: Maybe<Scalars['Int']['output']>;
};

/** Statistical analytics for a team */
export type TeamStatistics = {
  __typename?: 'TeamStatistics';
  averagePoints?: Maybe<Scalars['Float']['output']>;
  currentStreak?: Maybe<Scalars['String']['output']>;
  currentStreakCount?: Maybe<Scalars['Int']['output']>;
  longestLoseStreak?: Maybe<Scalars['Int']['output']>;
  longestWinStreak?: Maybe<Scalars['Int']['output']>;
  losses?: Maybe<Scalars['Int']['output']>;
  matchupsPlayed?: Maybe<Scalars['Int']['output']>;
  teamId?: Maybe<Scalars['Int']['output']>;
  teamName?: Maybe<Scalars['String']['output']>;
  ties?: Maybe<Scalars['Int']['output']>;
  totalPoints?: Maybe<Scalars['Float']['output']>;
  winPercentage?: Maybe<Scalars['Float']['output']>;
  wins?: Maybe<Scalars['Int']['output']>;
};

/** Historical record of tiebreaker resolution */
export type TiebreakerHistory = {
  __typename?: 'TiebreakerHistory';
  appliedMethod?: Maybe<TiebreakerMethod>;
  commissionerUserId?: Maybe<Scalars['Int']['output']>;
  createdAt?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['ID']['output']>;
  matchupId?: Maybe<Scalars['Int']['output']>;
  reason?: Maybe<Scalars['String']['output']>;
  resolvedAt?: Maybe<Scalars['String']['output']>;
  updatedAt?: Maybe<Scalars['String']['output']>;
  wasCommissionerOverride?: Maybe<Scalars['Boolean']['output']>;
  winner?: Maybe<Team>;
  winnerId?: Maybe<Scalars['Int']['output']>;
};

/** Method for resolving tiebreaker scenarios */
export enum TiebreakerMethod {
  CoChampion = 'co_champion',
  HeadToHeadRecord = 'head_to_head_record',
  HighestCategory = 'highest_category',
  Random = 'random',
  TotalSeasonPoints = 'total_season_points',
}

/** Tiebreaker configuration for a league */
export type TiebreakerRule = {
  __typename?: 'TiebreakerRule';
  allowCommissionerOverride?: Maybe<Scalars['Boolean']['output']>;
  config?: Maybe<Scalars['String']['output']>;
  createdAt?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['ID']['output']>;
  leagueId?: Maybe<Scalars['Int']['output']>;
  primaryMethod?: Maybe<TiebreakerMethod>;
  secondaryMethod?: Maybe<TiebreakerMethod>;
  tertiaryMethod?: Maybe<TiebreakerMethod>;
  updatedAt?: Maybe<Scalars['String']['output']>;
};

/** A trade proposal between two teams in a fantasy league */
export type TradeOffer = {
  __typename?: 'TradeOffer';
  createdAt?: Maybe<Scalars['String']['output']>;
  expiresAt?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  leagueId?: Maybe<Scalars['Int']['output']>;
  message?: Maybe<Scalars['String']['output']>;
  players?: Maybe<Array<TradeOfferPlayer>>;
  proposingTeamId?: Maybe<Scalars['Int']['output']>;
  proposingTeamName?: Maybe<Scalars['String']['output']>;
  receivingTeamId?: Maybe<Scalars['Int']['output']>;
  receivingTeamName?: Maybe<Scalars['String']['output']>;
  respondedAt?: Maybe<Scalars['String']['output']>;
  status?: Maybe<Scalars['String']['output']>;
  updatedAt?: Maybe<Scalars['String']['output']>;
  vetoedAt?: Maybe<Scalars['String']['output']>;
};

/** A single player leg of a trade offer */
export type TradeOfferPlayer = {
  __typename?: 'TradeOfferPlayer';
  fromTeamId?: Maybe<Scalars['Int']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  playerId?: Maybe<Scalars['Int']['output']>;
  playerName?: Maybe<Scalars['String']['output']>;
  playerPosition?: Maybe<Scalars['String']['output']>;
  tradeOfferId?: Maybe<Scalars['Int']['output']>;
};

export type UpdateCommissionerNoteInput = {
  leagueId: Scalars['Int']['input'];
  note?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateDraftSettingsInput = {
  customEraEndYear?: InputMaybe<Scalars['Int']['input']>;
  customEraStartYear?: InputMaybe<Scalars['Int']['input']>;
  draftMode?: InputMaybe<Scalars['String']['input']>;
  draftOrder?: InputMaybe<Scalars['String']['input']>;
  eraFilter?: InputMaybe<Scalars['String']['input']>;
  hofOnly?: InputMaybe<Scalars['Boolean']['input']>;
  leagueId: Scalars['Int']['input'];
  pickTimeLimitSeconds?: InputMaybe<Scalars['Int']['input']>;
  playerPool?: InputMaybe<Scalars['String']['input']>;
  scheduledAt?: InputMaybe<Scalars['String']['input']>;
  selectionMethod?: InputMaybe<Scalars['String']['input']>;
};

/** Result of updating draft settings */
export type UpdateDraftSettingsPayload = {
  __typename?: 'UpdateDraftSettingsPayload';
  currentPick?: Maybe<Scalars['Int']['output']>;
  draftCompletedAt?: Maybe<Scalars['String']['output']>;
  draftMode?: Maybe<Scalars['String']['output']>;
  draftOrder?: Maybe<Scalars['String']['output']>;
  draftStartedAt?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  leagueId?: Maybe<Scalars['Int']['output']>;
  pickTimeLimitSeconds?: Maybe<Scalars['Int']['output']>;
  playerPool?: Maybe<Scalars['String']['output']>;
  scheduledAt?: Maybe<Scalars['String']['output']>;
  selectionMethod?: Maybe<Scalars['String']['output']>;
};

export type UpdateDuesSettingsInput = {
  amountCents: Scalars['Int']['input'];
  enabled: Scalars['Boolean']['input'];
  leagueId: Scalars['Int']['input'];
  reminderDayOfWeek?: InputMaybe<Scalars['Int']['input']>;
  reminderEnabled: Scalars['Boolean']['input'];
};

export type UpdateLeagueScoringMultiplierInput = {
  isEnabled?: InputMaybe<Scalars['Boolean']['input']>;
  multiplier?: InputMaybe<Scalars['Float']['input']>;
  statDefinitionId: Scalars['Int']['input'];
};

export type UpdateLeagueSettingsInput = {
  auctionBudget?: InputMaybe<Scalars['Int']['input']>;
  auctionMinBid?: InputMaybe<Scalars['Int']['input']>;
  bannerUrl?: InputMaybe<Scalars['String']['input']>;
  gamesPerMatchup?: InputMaybe<Scalars['Int']['input']>;
  leagueId: Scalars['Int']['input'];
  logoUrl?: InputMaybe<Scalars['String']['input']>;
  luxuryTaxThreshold?: InputMaybe<Scalars['Int']['input']>;
  minCareerGames?: InputMaybe<Scalars['Int']['input']>;
  minCareerSeasons?: InputMaybe<Scalars['Int']['input']>;
  minSalary?: InputMaybe<Scalars['Int']['input']>;
  playoffEnabled?: InputMaybe<Scalars['Boolean']['input']>;
  playoffFormat?: InputMaybe<Scalars['String']['input']>;
  playoffMultiWeek?: InputMaybe<Scalars['Boolean']['input']>;
  primaryColor?: InputMaybe<Scalars['String']['input']>;
  salaryCap?: InputMaybe<Scalars['Int']['input']>;
  salaryCapEnabled?: InputMaybe<Scalars['Boolean']['input']>;
  salaryDecayPct?: InputMaybe<Scalars['Int']['input']>;
  salaryEscalationPct?: InputMaybe<Scalars['Int']['input']>;
  salaryFloor?: InputMaybe<Scalars['Int']['input']>;
  secondaryColor?: InputMaybe<Scalars['String']['input']>;
  spStartsPerMatchup?: InputMaybe<Scalars['Int']['input']>;
  totalMatchups?: InputMaybe<Scalars['Int']['input']>;
};

export type UpsertAchievementRestrictionInput = {
  achievementType: Scalars['String']['input'];
  leagueId: Scalars['Int']['input'];
  playerMinCount?: InputMaybe<Scalars['Int']['input']>;
  repeatableRosterMax?: InputMaybe<Scalars['Int']['input']>;
  rosterMax?: InputMaybe<Scalars['Int']['input']>;
  rosterMin?: InputMaybe<Scalars['Int']['input']>;
};

export type UpsertLeagueSeasonAwardInput = {
  awardType: Scalars['String']['input'];
  leagueId: Scalars['Int']['input'];
  notes?: InputMaybe<Scalars['String']['input']>;
  playerId: Scalars['Int']['input'];
  season: Scalars['Int']['input'];
};

export type User = {
  __typename?: 'User';
  accessLevel?: Maybe<Scalars['String']['output']>;
  avatarUrl?: Maybe<Scalars['String']['output']>;
  discordAvatar?: Maybe<Scalars['String']['output']>;
  discordId?: Maybe<Scalars['String']['output']>;
  discordUsername?: Maybe<Scalars['String']['output']>;
  email?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  subscriptionTier?: Maybe<Scalars['String']['output']>;
  username?: Maybe<Scalars['String']['output']>;
};

/** A badge earned by a user */
export type UserBadge = {
  __typename?: 'UserBadge';
  /** Badge definition key */
  badgeKey?: Maybe<Scalars['String']['output']>;
  /** Full badge definition metadata */
  definition?: Maybe<BadgeDefinition>;
  /** ISO 8601 timestamp when the badge was earned */
  earnedAt?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  /** League scope; null for global badges */
  leagueId?: Maybe<Scalars['Int']['output']>;
  rarity?: Maybe<Scalars['String']['output']>;
  /** Team associated with the earn event */
  teamId?: Maybe<Scalars['Int']['output']>;
  userId?: Maybe<Scalars['Int']['output']>;
};

export type UserConsent = {
  __typename?: 'UserConsent';
  consentType?: Maybe<Scalars['String']['output']>;
  createdAt?: Maybe<Scalars['String']['output']>;
  grantedAt?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  ipAddress?: Maybe<Scalars['String']['output']>;
  revokedAt?: Maybe<Scalars['String']['output']>;
  status?: Maybe<Scalars['String']['output']>;
  updatedAt?: Maybe<Scalars['String']['output']>;
  userId?: Maybe<Scalars['Int']['output']>;
};

export type UserDataExport = {
  __typename?: 'UserDataExport';
  consentsJson?: Maybe<Scalars['String']['output']>;
  dataRequestsJson?: Maybe<Scalars['String']['output']>;
  leaguesJson?: Maybe<Scalars['String']['output']>;
  privacyPolicyAcceptedAt?: Maybe<Scalars['String']['output']>;
  teamsJson?: Maybe<Scalars['String']['output']>;
  userCreatedAt?: Maybe<Scalars['String']['output']>;
  userEmail?: Maybe<Scalars['String']['output']>;
  userUsername?: Maybe<Scalars['String']['output']>;
};

/** Version and deployment information for the GraphQL API */
export type VersionInfo = {
  __typename?: 'VersionInfo';
  /** Deployment timestamp (ISO 8601) */
  deployedAt?: Maybe<Scalars['String']['output']>;
  /** Runtime environment (development, production, etc.) */
  environment?: Maybe<Scalars['String']['output']>;
  /** Git commit hash (short) */
  gitCommit?: Maybe<Scalars['String']['output']>;
  /** Package version from package.json */
  version?: Maybe<Scalars['String']['output']>;
};

export type WaiverClaim = {
  __typename?: 'WaiverClaim';
  createdAt?: Maybe<Scalars['String']['output']>;
  dropPlayerId?: Maybe<Scalars['Int']['output']>;
  dropPlayerName?: Maybe<Scalars['String']['output']>;
  errorMessage?: Maybe<Scalars['String']['output']>;
  faabBid?: Maybe<Scalars['Int']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  leagueId?: Maybe<Scalars['Int']['output']>;
  playerId?: Maybe<Scalars['Int']['output']>;
  playerName?: Maybe<Scalars['String']['output']>;
  processedAt?: Maybe<Scalars['String']['output']>;
  status?: Maybe<Scalars['String']['output']>;
  teamId?: Maybe<Scalars['Int']['output']>;
  userId?: Maybe<Scalars['Int']['output']>;
};

export type DuesSettingsFragment = {
  __typename?: 'LeagueDuesSettings';
  id?: number | null;
  leagueId?: number | null;
  enabled?: boolean | null;
  amountCents?: number | null;
  reminderEnabled?: boolean | null;
  reminderDayOfWeek?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type MemberPaymentStatusFragment = {
  __typename?: 'LeagueMemberPaymentStatus';
  id?: number | null;
  leagueId?: number | null;
  userId?: number | null;
  username?: string | null;
  paid?: boolean | null;
  paidAt?: string | null;
  markedBy?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type GetLeagueDuesSettingsQueryVariables = Exact<{
  leagueId: Scalars['Int']['input'];
}>;

export type GetLeagueDuesSettingsQuery = {
  __typename?: 'Query';
  leagueDuesSettings?: {
    __typename?: 'LeagueDuesSettings';
    id?: number | null;
    leagueId?: number | null;
    enabled?: boolean | null;
    amountCents?: number | null;
    reminderEnabled?: boolean | null;
    reminderDayOfWeek?: number | null;
    createdAt?: string | null;
    updatedAt?: string | null;
  } | null;
};

export type GetLeagueDuesStatusQueryVariables = Exact<{
  leagueId: Scalars['Int']['input'];
}>;

export type GetLeagueDuesStatusQuery = {
  __typename?: 'Query';
  leagueDuesSettings?: {
    __typename?: 'LeagueDuesSettings';
    id?: number | null;
    leagueId?: number | null;
    enabled?: boolean | null;
    amountCents?: number | null;
    reminderEnabled?: boolean | null;
    reminderDayOfWeek?: number | null;
    createdAt?: string | null;
    updatedAt?: string | null;
  } | null;
  leagueDuesStatus?: Array<{
    __typename?: 'LeagueMemberPaymentStatus';
    id?: number | null;
    leagueId?: number | null;
    userId?: number | null;
    username?: string | null;
    paid?: boolean | null;
    paidAt?: string | null;
    markedBy?: number | null;
    createdAt?: string | null;
    updatedAt?: string | null;
  }> | null;
};

export type UpdateDuesSettingsMutationVariables = Exact<{
  input: UpdateDuesSettingsInput;
}>;

export type UpdateDuesSettingsMutation = {
  __typename?: 'Mutation';
  updateDuesSettings?: {
    __typename?: 'LeagueDuesSettings';
    id?: number | null;
    leagueId?: number | null;
    enabled?: boolean | null;
    amountCents?: number | null;
    reminderEnabled?: boolean | null;
    reminderDayOfWeek?: number | null;
    createdAt?: string | null;
    updatedAt?: string | null;
  } | null;
};

export type MarkMemberPaidMutationVariables = Exact<{
  leagueId: Scalars['Int']['input'];
  userId: Scalars['Int']['input'];
}>;

export type MarkMemberPaidMutation = {
  __typename?: 'Mutation';
  markMemberPaid?: {
    __typename?: 'LeagueMemberPaymentStatus';
    id?: number | null;
    leagueId?: number | null;
    userId?: number | null;
    username?: string | null;
    paid?: boolean | null;
    paidAt?: string | null;
    markedBy?: number | null;
    createdAt?: string | null;
    updatedAt?: string | null;
  } | null;
};

export type MarkMemberUnpaidMutationVariables = Exact<{
  leagueId: Scalars['Int']['input'];
  userId: Scalars['Int']['input'];
}>;

export type MarkMemberUnpaidMutation = {
  __typename?: 'Mutation';
  markMemberUnpaid?: {
    __typename?: 'LeagueMemberPaymentStatus';
    id?: number | null;
    leagueId?: number | null;
    userId?: number | null;
    username?: string | null;
    paid?: boolean | null;
    paidAt?: string | null;
    markedBy?: number | null;
    createdAt?: string | null;
    updatedAt?: string | null;
  } | null;
};

export type LeagueFragment = {
  __typename?: 'League';
  id?: number | null;
  name?: string | null;
  owner?: number | null;
  maxRosterSize?: number | null;
  currentMatchup?: number | null;
  currentWeekNumber?: number | null;
  draftStatus?: string | null;
  leaguePhase?: string | null;
  inviteCode?: string | null;
  lmNotes?: string | null;
  playerPool?: string | null;
  waiverEnabled?: boolean | null;
  waiverType?: string | null;
  userMembership?: {
    __typename?: 'LeagueMember';
    leagueId?: number | null;
    permissionLevel?: string | null;
    teamId?: number | null;
    userId?: number | null;
  } | null;
};

export type LeagueMemberFragment = {
  __typename?: 'LeagueMember';
  leagueId?: number | null;
  permissionLevel?: string | null;
  teamId?: number | null;
  userId?: number | null;
};

export type LeaguePositionFragment = {
  __typename?: 'LeaguePosition';
  id?: number | null;
  leagueId?: number | null;
  positionType?: string | null;
};

export type GetLeagueByIdQueryVariables = Exact<{
  id: Scalars['Int']['input'];
  withMembers?: InputMaybe<Scalars['Boolean']['input']>;
  withTeams?: InputMaybe<Scalars['Boolean']['input']>;
  withMatchup?: InputMaybe<Scalars['Boolean']['input']>;
}>;

export type GetLeagueByIdQuery = {
  __typename?: 'Query';
  league?: {
    __typename?: 'League';
    id?: number | null;
    name?: string | null;
    owner?: number | null;
    maxRosterSize?: number | null;
    currentMatchup?: number | null;
    currentWeekNumber?: number | null;
    draftStatus?: string | null;
    leaguePhase?: string | null;
    inviteCode?: string | null;
    lmNotes?: string | null;
    playerPool?: string | null;
    waiverEnabled?: boolean | null;
    waiverType?: string | null;
    userMembership?: {
      __typename?: 'LeagueMember';
      leagueId?: number | null;
      permissionLevel?: string | null;
      teamId?: number | null;
      userId?: number | null;
    } | null;
  } | null;
};

export type CreateLeagueMutationVariables = Exact<{
  input: CreateLeagueAndTeamsInput;
  withMembers?: InputMaybe<Scalars['Boolean']['input']>;
  withTeams?: InputMaybe<Scalars['Boolean']['input']>;
  withMatchup?: InputMaybe<Scalars['Boolean']['input']>;
}>;

export type CreateLeagueMutation = {
  __typename?: 'Mutation';
  createLeagueAndTeams?: {
    __typename?: 'CreateLeagueAndTeamsPayload';
    league?: {
      __typename?: 'League';
      id?: number | null;
      name?: string | null;
      owner?: number | null;
      maxRosterSize?: number | null;
      currentMatchup?: number | null;
      currentWeekNumber?: number | null;
      draftStatus?: string | null;
      leaguePhase?: string | null;
      inviteCode?: string | null;
      lmNotes?: string | null;
      playerPool?: string | null;
      waiverEnabled?: boolean | null;
      waiverType?: string | null;
      userMembership?: {
        __typename?: 'LeagueMember';
        leagueId?: number | null;
        permissionLevel?: string | null;
        teamId?: number | null;
        userId?: number | null;
      } | null;
    } | null;
  } | null;
};

export type GetPositionsForLeagueQueryVariables = Exact<{
  leagueId: Scalars['Int']['input'];
}>;

export type GetPositionsForLeagueQuery = {
  __typename?: 'Query';
  leaguePositions?: Array<{
    __typename?: 'LeaguePosition';
    id?: number | null;
    leagueId?: number | null;
    positionType?: string | null;
  }> | null;
};

export type GetUserLeaguesQueryVariables = Exact<{ [key: string]: never }>;

export type GetUserLeaguesQuery = {
  __typename?: 'Query';
  userLeagues: Array<{
    __typename?: 'League';
    id?: number | null;
    name?: string | null;
    owner?: number | null;
    maxRosterSize?: number | null;
    currentMatchup?: number | null;
    currentWeekNumber?: number | null;
    draftStatus?: string | null;
    leaguePhase?: string | null;
    inviteCode?: string | null;
    lmNotes?: string | null;
    playerPool?: string | null;
    waiverEnabled?: boolean | null;
    waiverType?: string | null;
    userMembership?: {
      __typename?: 'LeagueMember';
      leagueId?: number | null;
      permissionLevel?: string | null;
      teamId?: number | null;
      userId?: number | null;
    } | null;
  }>;
};

export type DeleteAllLeaguesMutationVariables = Exact<{ [key: string]: never }>;

export type DeleteAllLeaguesMutation = {
  __typename?: 'Mutation';
  deleteAllLeagues?: string | null;
};

export type StartDraftMutationVariables = Exact<{
  leagueId: Scalars['Int']['input'];
  selectionMethod?: InputMaybe<Scalars['String']['input']>;
}>;

export type StartDraftMutation = {
  __typename?: 'Mutation';
  startDraft?: {
    __typename?: 'League';
    id?: number | null;
    name?: string | null;
    owner?: number | null;
    maxRosterSize?: number | null;
    currentMatchup?: number | null;
    currentWeekNumber?: number | null;
    draftStatus?: string | null;
    leaguePhase?: string | null;
    inviteCode?: string | null;
    lmNotes?: string | null;
    playerPool?: string | null;
    waiverEnabled?: boolean | null;
    waiverType?: string | null;
    userMembership?: {
      __typename?: 'LeagueMember';
      leagueId?: number | null;
      permissionLevel?: string | null;
      teamId?: number | null;
      userId?: number | null;
    } | null;
  } | null;
};

export type GetLeagueTeamsQueryVariables = Exact<{
  leagueId: Scalars['Int']['input'];
}>;

export type GetLeagueTeamsQuery = {
  __typename?: 'Query';
  leagueTeams?: Array<{
    __typename?: 'Team';
    id?: number | null;
    name?: string | null;
    leagueId?: number | null;
  }> | null;
};

export type GetPublicLeaguesQueryVariables = Exact<{
  search?: InputMaybe<Scalars['String']['input']>;
  draftStatus?: InputMaybe<Scalars['String']['input']>;
  playerPool?: InputMaybe<Scalars['String']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
}>;

export type GetPublicLeaguesQuery = {
  __typename?: 'Query';
  publicLeagues: Array<{
    __typename?: 'PublicLeagueInfo';
    id?: number | null;
    name?: string | null;
    owner?: number | null;
    maxRosterSize?: number | null;
    draftStatus?: string | null;
    playerPool?: string | null;
    isPublic?: boolean | null;
    totalSpots?: number | null;
    availableSpots?: number | null;
    isFull?: boolean | null;
    isAlreadyMember?: boolean | null;
  }>;
};

export type JoinPublicLeagueMutationVariables = Exact<{
  leagueId: Scalars['Int']['input'];
  teamName: Scalars['String']['input'];
}>;

export type JoinPublicLeagueMutation = {
  __typename?: 'Mutation';
  joinPublicLeague?: {
    __typename?: 'JoinLeaguePayload';
    success?: boolean | null;
    message?: string | null;
    leagueId?: number | null;
    teamId?: number | null;
  } | null;
};

export type GetUserTeamIdQueryVariables = Exact<{
  leagueId: Scalars['Int']['input'];
}>;

export type GetUserTeamIdQuery = {
  __typename?: 'Query';
  userTeamId?: number | null;
};

export type MatchupFragment = {
  __typename?: 'Matchup';
  id?: string | null;
  weekNumber?: number | null;
  leagueId?: number | null;
  team1Id?: number | null;
  team2Id?: number | null;
  team1Score?: number | null;
  team2Score?: number | null;
  status?: MatchupStatus | null;
  statsLoadingStatus?: StatsLoadingStatus | null;
  gamesPerMatchup?: number | null;
  spStartsPerMatchup?: number | null;
  selectedGamesCount?: number | null;
  startTime?: string | null;
  endTime?: string | null;
};

export type GetMatchupByIdQueryVariables = Exact<{
  id: Scalars['Int']['input'];
}>;

export type GetMatchupByIdQuery = {
  __typename?: 'Query';
  getMatchupById?: {
    __typename?: 'Matchup';
    id?: string | null;
    weekNumber?: number | null;
    leagueId?: number | null;
    team1Id?: number | null;
    team2Id?: number | null;
    team1Score?: number | null;
    team2Score?: number | null;
    status?: MatchupStatus | null;
    statsLoadingStatus?: StatsLoadingStatus | null;
    gamesPerMatchup?: number | null;
    spStartsPerMatchup?: number | null;
    selectedGamesCount?: number | null;
    startTime?: string | null;
    endTime?: string | null;
  } | null;
};

export type GetMatchupsForLeagueQueryVariables = Exact<{
  leagueId: Scalars['Int']['input'];
  weekNumber?: InputMaybe<Scalars['Int']['input']>;
}>;

export type GetMatchupsForLeagueQuery = {
  __typename?: 'Query';
  getMatchupsForLeague?: Array<{
    __typename?: 'Matchup';
    id?: string | null;
    weekNumber?: number | null;
    leagueId?: number | null;
    team1Id?: number | null;
    team2Id?: number | null;
    team1Score?: number | null;
    team2Score?: number | null;
    status?: MatchupStatus | null;
    statsLoadingStatus?: StatsLoadingStatus | null;
    gamesPerMatchup?: number | null;
    spStartsPerMatchup?: number | null;
    selectedGamesCount?: number | null;
    startTime?: string | null;
    endTime?: string | null;
  }> | null;
};

export type GetCurrentWeekForLeagueQueryVariables = Exact<{
  leagueId: Scalars['Int']['input'];
}>;

export type GetCurrentWeekForLeagueQuery = {
  __typename?: 'Query';
  getCurrentWeekForLeague?: number | null;
};

export type GetMatchupsByWeekQueryVariables = Exact<{
  leagueId: Scalars['Int']['input'];
  weekNumber: Scalars['Int']['input'];
}>;

export type GetMatchupsByWeekQuery = {
  __typename?: 'Query';
  getMatchupsByWeek?: Array<{
    __typename?: 'Matchup';
    id?: string | null;
    weekNumber?: number | null;
    leagueId?: number | null;
    team1Id?: number | null;
    team2Id?: number | null;
    team1Score?: number | null;
    team2Score?: number | null;
    status?: MatchupStatus | null;
    statsLoadingStatus?: StatsLoadingStatus | null;
    gamesPerMatchup?: number | null;
    spStartsPerMatchup?: number | null;
    selectedGamesCount?: number | null;
    startTime?: string | null;
    endTime?: string | null;
  }> | null;
};

export type GetLeagueStandingsQueryVariables = Exact<{
  leagueId: Scalars['Int']['input'];
}>;

export type GetLeagueStandingsQuery = {
  __typename?: 'Query';
  getLeagueStandings?: Array<{
    __typename?: 'TeamStanding';
    teamId?: string | null;
    teamName?: string | null;
    wins?: number | null;
    losses?: number | null;
    ties?: number | null;
    winPercentage?: number | null;
    pointsFor?: number | null;
    pointsAgainst?: number | null;
    avatarUrl?: string | null;
    primaryColor?: string | null;
    secondaryColor?: string | null;
    divisionId?: number | null;
  }> | null;
};

export type MatchupPlayerFragment = {
  __typename?: 'MatchupPlayer';
  id?: string | null;
  matchupId?: number | null;
  playerId?: number | null;
  teamId?: number | null;
  positionId?: number | null;
  season?: number | null;
  player?: {
    __typename?: 'Player';
    id?: number | null;
    firstName?: string | null;
    lastName?: string | null;
    eligiblePositions?: Array<string> | null;
  } | null;
};

export type GetMatchupPlayersQueryVariables = Exact<{
  matchupId: Scalars['Int']['input'];
}>;

export type GetMatchupPlayersQuery = {
  __typename?: 'Query';
  getMatchupPlayers?: Array<{
    __typename?: 'MatchupPlayer';
    id?: string | null;
    matchupId?: number | null;
    playerId?: number | null;
    teamId?: number | null;
    positionId?: number | null;
    season?: number | null;
    player?: {
      __typename?: 'Player';
      id?: number | null;
      firstName?: string | null;
      lastName?: string | null;
      eligiblePositions?: Array<string> | null;
    } | null;
  }> | null;
};

export type UpdateMatchupPlayerPositionMutationVariables = Exact<{
  matchupPlayerId: Scalars['Int']['input'];
  positionId?: InputMaybe<Scalars['Int']['input']>;
}>;

export type UpdateMatchupPlayerPositionMutation = {
  __typename?: 'Mutation';
  updateMatchupPlayerPosition?: {
    __typename?: 'MatchupPlayer';
    id?: string | null;
    matchupId?: number | null;
    playerId?: number | null;
    teamId?: number | null;
    positionId?: number | null;
    season?: number | null;
    player?: {
      __typename?: 'Player';
      id?: number | null;
      firstName?: string | null;
      lastName?: string | null;
      eligiblePositions?: Array<string> | null;
    } | null;
  } | null;
};

export type SwapMatchupPlayerPositionsMutationVariables = Exact<{
  matchupPlayerIdA: Scalars['Int']['input'];
  positionIdA?: InputMaybe<Scalars['Int']['input']>;
  matchupPlayerIdB: Scalars['Int']['input'];
  positionIdB?: InputMaybe<Scalars['Int']['input']>;
}>;

export type SwapMatchupPlayerPositionsMutation = {
  __typename?: 'Mutation';
  swapMatchupPlayerPositions?: Array<{
    __typename?: 'MatchupPlayer';
    id?: string | null;
    matchupId?: number | null;
    playerId?: number | null;
    teamId?: number | null;
    positionId?: number | null;
    season?: number | null;
    player?: {
      __typename?: 'Player';
      id?: number | null;
      firstName?: string | null;
      lastName?: string | null;
      eligiblePositions?: Array<string> | null;
    } | null;
  }> | null;
};

export type GetMatchupHistoryQueryVariables = Exact<{
  leagueId: Scalars['Int']['input'];
  season?: InputMaybe<Scalars['Int']['input']>;
  teamId?: InputMaybe<Scalars['Int']['input']>;
  status?: InputMaybe<MatchupStatus>;
  limit?: InputMaybe<Scalars['Int']['input']>;
}>;

export type GetMatchupHistoryQuery = {
  __typename?: 'Query';
  getMatchupHistory?: Array<{
    __typename?: 'Matchup';
    id?: string | null;
    weekNumber?: number | null;
    leagueId?: number | null;
    team1Id?: number | null;
    team2Id?: number | null;
    team1Score?: number | null;
    team2Score?: number | null;
    status?: MatchupStatus | null;
    statsLoadingStatus?: StatsLoadingStatus | null;
    gamesPerMatchup?: number | null;
    spStartsPerMatchup?: number | null;
    selectedGamesCount?: number | null;
    startTime?: string | null;
    endTime?: string | null;
  }> | null;
};

export type GetLeagueTeamsForDmQueryVariables = Exact<{
  leagueId: Scalars['Int']['input'];
}>;

export type GetLeagueTeamsForDmQuery = {
  __typename?: 'Query';
  leagueTeams?: Array<{
    __typename?: 'Team';
    id?: number | null;
    name?: string | null;
    managerId?: number | null;
  }> | null;
};

export type LeagueChatMessageFieldsFragment = {
  __typename?: 'LeagueChatMessage';
  id?: string | null;
  leagueId?: number | null;
  userId?: number | null;
  messageText?: string | null;
  timestamp?: string | null;
  messageType?: string | null;
  gifUrl?: string | null;
  sender?: {
    __typename?: 'User';
    id?: number | null;
    username?: string | null;
  } | null;
};

export type DirectMessageFieldsFragment = {
  __typename?: 'DirectMessage';
  id?: string | null;
  fromUserId?: number | null;
  toUserId?: number | null;
  leagueId?: number | null;
  messageText?: string | null;
  readAt?: string | null;
  deletedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  sender?: {
    __typename?: 'User';
    id?: number | null;
    username?: string | null;
  } | null;
  recipient?: {
    __typename?: 'User';
    id?: number | null;
    username?: string | null;
  } | null;
};

export type GetLeagueMessagesQueryVariables = Exact<{
  leagueId: Scalars['Int']['input'];
  limit?: InputMaybe<Scalars['Int']['input']>;
}>;

export type GetLeagueMessagesQuery = {
  __typename?: 'Query';
  getLeagueMessages?: Array<{
    __typename?: 'LeagueChatMessage';
    id?: string | null;
    leagueId?: number | null;
    userId?: number | null;
    messageText?: string | null;
    timestamp?: string | null;
    messageType?: string | null;
    gifUrl?: string | null;
    sender?: {
      __typename?: 'User';
      id?: number | null;
      username?: string | null;
    } | null;
  }> | null;
};

export type GetDirectMessagesQueryVariables = Exact<{
  otherUserId: Scalars['Int']['input'];
  limit?: InputMaybe<Scalars['Int']['input']>;
}>;

export type GetDirectMessagesQuery = {
  __typename?: 'Query';
  getDirectMessages?: Array<{
    __typename?: 'DirectMessage';
    id?: string | null;
    fromUserId?: number | null;
    toUserId?: number | null;
    leagueId?: number | null;
    messageText?: string | null;
    readAt?: string | null;
    deletedAt?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
    sender?: {
      __typename?: 'User';
      id?: number | null;
      username?: string | null;
    } | null;
    recipient?: {
      __typename?: 'User';
      id?: number | null;
      username?: string | null;
    } | null;
  }> | null;
};

export type SendLeagueMessageMutationVariables = Exact<{
  leagueId: Scalars['Int']['input'];
  messageText: Scalars['String']['input'];
  gifUrl?: InputMaybe<Scalars['String']['input']>;
}>;

export type SendLeagueMessageMutation = {
  __typename?: 'Mutation';
  sendLeagueMessage?: {
    __typename?: 'LeagueChatMessage';
    id?: string | null;
    leagueId?: number | null;
    userId?: number | null;
    messageText?: string | null;
    timestamp?: string | null;
    messageType?: string | null;
    gifUrl?: string | null;
    sender?: {
      __typename?: 'User';
      id?: number | null;
      username?: string | null;
    } | null;
  } | null;
};

export type SendDirectMessageMutationVariables = Exact<{
  toUserId: Scalars['Int']['input'];
  messageText: Scalars['String']['input'];
  leagueId?: InputMaybe<Scalars['Int']['input']>;
}>;

export type SendDirectMessageMutation = {
  __typename?: 'Mutation';
  sendDirectMessage?: {
    __typename?: 'DirectMessage';
    id?: string | null;
    fromUserId?: number | null;
    toUserId?: number | null;
    leagueId?: number | null;
    messageText?: string | null;
    readAt?: string | null;
    deletedAt?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
    sender?: {
      __typename?: 'User';
      id?: number | null;
      username?: string | null;
    } | null;
    recipient?: {
      __typename?: 'User';
      id?: number | null;
      username?: string | null;
    } | null;
  } | null;
};

export type NotificationPreferenceFragment = {
  __typename?: 'NotificationPreference';
  id?: number | null;
  userId?: number | null;
  matchupStartedEnabled?: boolean | null;
  matchupEndedEnabled?: boolean | null;
  matchupCloseGameEnabled?: boolean | null;
  matchupReminderEnabled?: boolean | null;
  pushEnabled?: boolean | null;
  emailEnabled?: boolean | null;
  closeGameThreshold?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type DeviceTokenFragment = {
  __typename?: 'DeviceToken';
  id?: number | null;
  userId?: number | null;
  deviceToken?: string | null;
  platform?: string | null;
  endpointArn?: string | null;
  enabled?: boolean | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type NotificationHistoryItemFragment = {
  __typename?: 'NotificationHistoryItem';
  id?: number | null;
  userId?: number | null;
  notificationType?: string | null;
  channel?: string | null;
  matchupId?: number | null;
  leagueId?: number | null;
  title?: string | null;
  message?: string | null;
  metadata?: string | null;
  read?: boolean | null;
  sentAt?: string | null;
  readAt?: string | null;
  createdAt?: string | null;
};

export type GetUserNotificationPreferencesQueryVariables = Exact<{
  [key: string]: never;
}>;

export type GetUserNotificationPreferencesQuery = {
  __typename?: 'Query';
  getUserNotificationPreferences?: {
    __typename?: 'NotificationPreference';
    id?: number | null;
    userId?: number | null;
    matchupStartedEnabled?: boolean | null;
    matchupEndedEnabled?: boolean | null;
    matchupCloseGameEnabled?: boolean | null;
    matchupReminderEnabled?: boolean | null;
    pushEnabled?: boolean | null;
    emailEnabled?: boolean | null;
    closeGameThreshold?: number | null;
    createdAt?: string | null;
    updatedAt?: string | null;
  } | null;
};

export type GetNotificationHistoryQueryVariables = Exact<{
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
}>;

export type GetNotificationHistoryQuery = {
  __typename?: 'Query';
  getNotificationHistory?: Array<{
    __typename?: 'NotificationHistoryItem';
    id?: number | null;
    userId?: number | null;
    notificationType?: string | null;
    channel?: string | null;
    matchupId?: number | null;
    leagueId?: number | null;
    title?: string | null;
    message?: string | null;
    metadata?: string | null;
    read?: boolean | null;
    sentAt?: string | null;
    readAt?: string | null;
    createdAt?: string | null;
  }> | null;
};

export type GetUnreadNotificationCountQueryVariables = Exact<{
  [key: string]: never;
}>;

export type GetUnreadNotificationCountQuery = {
  __typename?: 'Query';
  getUnreadNotificationCount?: number | null;
};

export type GetUserDeviceTokensQueryVariables = Exact<{ [key: string]: never }>;

export type GetUserDeviceTokensQuery = {
  __typename?: 'Query';
  getUserDeviceTokens?: Array<{
    __typename?: 'DeviceToken';
    id?: number | null;
    userId?: number | null;
    deviceToken?: string | null;
    platform?: string | null;
    endpointArn?: string | null;
    enabled?: boolean | null;
    createdAt?: string | null;
    updatedAt?: string | null;
  }> | null;
};

export type UpdateNotificationPreferencesMutationVariables = Exact<{
  input: NotificationPreferenceInput;
}>;

export type UpdateNotificationPreferencesMutation = {
  __typename?: 'Mutation';
  updateNotificationPreferences?: {
    __typename?: 'NotificationPreference';
    id?: number | null;
    userId?: number | null;
    matchupStartedEnabled?: boolean | null;
    matchupEndedEnabled?: boolean | null;
    matchupCloseGameEnabled?: boolean | null;
    matchupReminderEnabled?: boolean | null;
    pushEnabled?: boolean | null;
    emailEnabled?: boolean | null;
    closeGameThreshold?: number | null;
    createdAt?: string | null;
    updatedAt?: string | null;
  } | null;
};

export type RegisterDeviceTokenMutationVariables = Exact<{
  input: DeviceTokenInput;
}>;

export type RegisterDeviceTokenMutation = {
  __typename?: 'Mutation';
  registerDeviceToken?: {
    __typename?: 'DeviceToken';
    id?: number | null;
    userId?: number | null;
    deviceToken?: string | null;
    platform?: string | null;
    endpointArn?: string | null;
    enabled?: boolean | null;
    createdAt?: string | null;
    updatedAt?: string | null;
  } | null;
};

export type DisableDeviceTokenMutationVariables = Exact<{
  deviceToken: Scalars['String']['input'];
}>;

export type DisableDeviceTokenMutation = {
  __typename?: 'Mutation';
  disableDeviceToken?: boolean | null;
};

export type MarkNotificationAsReadMutationVariables = Exact<{
  notificationId: Scalars['Int']['input'];
}>;

export type MarkNotificationAsReadMutation = {
  __typename?: 'Mutation';
  markNotificationAsRead?: boolean | null;
};

export type MarkAllNotificationsAsReadMutationVariables = Exact<{
  [key: string]: never;
}>;

export type MarkAllNotificationsAsReadMutation = {
  __typename?: 'Mutation';
  markAllNotificationsAsRead?: boolean | null;
};

export type GetFreeAgentPlayersQueryVariables = Exact<{
  leagueId: Scalars['Int']['input'];
}>;

export type GetFreeAgentPlayersQuery = {
  __typename?: 'Query';
  freeAgents?: Array<{
    __typename?: 'Player';
    id?: number | null;
    firstName?: string | null;
    lastName?: string | null;
    eligiblePositions?: Array<string> | null;
    scoring?: {
      __typename?: 'PlayerScoring';
      hitterAvgPointsPerGame?: number | null;
      pitchingAvgPointsPerGame?: number | null;
      avgPointsPerGame?: number | null;
      careerGames?: number | null;
    } | null;
  }> | null;
};

export type ClaimFreeAgentMutationVariables = Exact<{
  leagueId: Scalars['Int']['input'];
  playerId: Scalars['Int']['input'];
  dropPlayerId?: InputMaybe<Scalars['Int']['input']>;
  faabBid?: InputMaybe<Scalars['Int']['input']>;
}>;

export type ClaimFreeAgentMutation = {
  __typename?: 'Mutation';
  claimFreeAgent?: {
    __typename?: 'WaiverClaim';
    id?: number | null;
    leagueId?: number | null;
    teamId?: number | null;
    playerId?: number | null;
    dropPlayerId?: number | null;
    faabBid?: number | null;
    status?: string | null;
    errorMessage?: string | null;
    createdAt?: string | null;
  } | null;
};

export type PlayerFragment = {
  __typename?: 'Player';
  id?: number | null;
  firstName?: string | null;
  lastName?: string | null;
  brefId?: string | null;
};

export type GetLeagueScoringProfileQueryVariables = Exact<{
  leagueId: Scalars['Int']['input'];
}>;

export type GetLeagueScoringProfileQuery = {
  __typename?: 'Query';
  leagueScoringProfile?: {
    __typename?: 'ScoringConfig';
    profileId?: number | null;
    profileName?: string | null;
    stats?: Array<{
      __typename?: 'ScoringRule';
      multiplier?: number | null;
      defaultMultiplier?: number | null;
      isOverride?: boolean | null;
      isEnabled?: boolean | null;
      definition?: {
        __typename?: 'ScoringStatDefinition';
        id?: number | null;
        statKey?: string | null;
        statGroup?: ScoringStatGroup | null;
        displayName?: string | null;
        description?: string | null;
        sourceColumn?: string | null;
        defaultMultiplier?: number | null;
        minMultiplier?: number | null;
        maxMultiplier?: number | null;
        stepSize?: number | null;
        isRequired?: boolean | null;
        enforcePositive?: boolean | null;
        enforceNegative?: boolean | null;
      } | null;
    }> | null;
    multiplierGroups?: Array<{
      __typename?: 'ScoringRuleGroup';
      group?: ScoringStatGroup | null;
      values?: Array<{
        __typename?: 'ScoringMultiplierEntry';
        statKey?: string | null;
        sourceColumn?: string | null;
        multiplier?: number | null;
      }> | null;
    }> | null;
  } | null;
};

export type GetDefaultScoringProfileQueryVariables = Exact<{
  [key: string]: never;
}>;

export type GetDefaultScoringProfileQuery = {
  __typename?: 'Query';
  defaultScoringProfile?: {
    __typename?: 'ScoringConfig';
    profileName?: string | null;
    stats?: Array<{
      __typename?: 'ScoringRule';
      multiplier?: number | null;
      defaultMultiplier?: number | null;
      isOverride?: boolean | null;
      isEnabled?: boolean | null;
      definition?: {
        __typename?: 'ScoringStatDefinition';
        id?: number | null;
        statKey?: string | null;
        statGroup?: ScoringStatGroup | null;
        displayName?: string | null;
        description?: string | null;
        sourceColumn?: string | null;
        defaultMultiplier?: number | null;
        minMultiplier?: number | null;
        maxMultiplier?: number | null;
        stepSize?: number | null;
        isRequired?: boolean | null;
        enforcePositive?: boolean | null;
        enforceNegative?: boolean | null;
      } | null;
    }> | null;
    multiplierGroups?: Array<{
      __typename?: 'ScoringRuleGroup';
      group?: ScoringStatGroup | null;
      values?: Array<{
        __typename?: 'ScoringMultiplierEntry';
        statKey?: string | null;
        sourceColumn?: string | null;
        multiplier?: number | null;
      }> | null;
    }> | null;
  } | null;
};

export type UpdateLeagueScoringProfileMutationVariables = Exact<{
  leagueId: Scalars['Int']['input'];
  updates:
    | Array<UpdateLeagueScoringMultiplierInput>
    | UpdateLeagueScoringMultiplierInput;
}>;

export type UpdateLeagueScoringProfileMutation = {
  __typename?: 'Mutation';
  updateLeagueScoringProfile?: {
    __typename?: 'ScoringConfig';
    profileId?: number | null;
    profileName?: string | null;
    stats?: Array<{
      __typename?: 'ScoringRule';
      multiplier?: number | null;
      defaultMultiplier?: number | null;
      isOverride?: boolean | null;
      isEnabled?: boolean | null;
      definition?: {
        __typename?: 'ScoringStatDefinition';
        id?: number | null;
        statKey?: string | null;
        statGroup?: ScoringStatGroup | null;
        displayName?: string | null;
        description?: string | null;
        sourceColumn?: string | null;
        defaultMultiplier?: number | null;
        minMultiplier?: number | null;
        maxMultiplier?: number | null;
        stepSize?: number | null;
        isRequired?: boolean | null;
        enforcePositive?: boolean | null;
        enforceNegative?: boolean | null;
      } | null;
    }> | null;
    multiplierGroups?: Array<{
      __typename?: 'ScoringRuleGroup';
      group?: ScoringStatGroup | null;
      values?: Array<{
        __typename?: 'ScoringMultiplierEntry';
        statKey?: string | null;
        sourceColumn?: string | null;
        multiplier?: number | null;
      }> | null;
    }> | null;
  } | null;
};

export type CareerBattingStatsFragment = {
  __typename?: 'CareerBatting';
  atBats?: number | null;
  baseOnBalls?: number | null;
  caughtStealing?: number | null;
  doubles?: number | null;
  games?: number | null;
  groundedIntoDoublePlays?: number | null;
  hits?: number | null;
  hitByPitch?: number | null;
  homeRuns?: number | null;
  intentionalBaseOnBalls?: number | null;
  plateAppearances?: number | null;
  runs?: number | null;
  rbi?: number | null;
  stolenBases?: number | null;
  sacrificeHits?: number | null;
  strikeouts?: number | null;
  totalBases?: number | null;
  triples?: number | null;
  battingAverage?: number | null;
  onBasePercentage?: number | null;
  sluggingPercentage?: number | null;
  playerId?: number | null;
};

export type CareerFieldingStatsFragment = {
  __typename?: 'CareerFielding';
  assists?: number | null;
  completeGames?: number | null;
  chances?: number | null;
  caughtStealing?: number | null;
  doublePlays?: number | null;
  errors?: number | null;
  fieldingPercentage?: number | null;
  games?: number | null;
  gamesStarted?: number | null;
  inningsDefended?: number | null;
  pickoffs?: number | null;
  putouts?: number | null;
  positions?: string | null;
  stolenBases?: number | null;
  wildPitches?: number | null;
  playerId?: number | null;
};

export type CareerPitchingStatsFragment = {
  __typename?: 'CareerPitching';
  battersFaced?: number | null;
  baseOnBalls?: number | null;
  balks?: number | null;
  completeGames?: number | null;
  earnedRuns?: number | null;
  era?: string | null;
  games?: number | null;
  gamesFinished?: number | null;
  gamesStarted?: number | null;
  hits?: number | null;
  hitByPitch?: number | null;
  homeRuns?: number | null;
  intentionalBaseOnBalls?: number | null;
  losses?: number | null;
  outRate?: number | null;
  outsRecorded?: number | null;
  runs?: number | null;
  shutouts?: number | null;
  strikeouts?: number | null;
  saves?: number | null;
  wins?: number | null;
  wildPitches?: number | null;
  winPercentage?: number | null;
  playerId?: number | null;
};

export type GetCareerBattingStatsQueryVariables = Exact<{
  [key: string]: never;
}>;

export type GetCareerBattingStatsQuery = {
  __typename?: 'Query';
  careerBattingStats?: {
    __typename?: 'CareerBattingConnection';
    edges?: Array<{
      __typename?: 'CareerBattingEdge';
      node?: {
        __typename?: 'CareerBatting';
        atBats?: number | null;
        baseOnBalls?: number | null;
        caughtStealing?: number | null;
        doubles?: number | null;
        games?: number | null;
        groundedIntoDoublePlays?: number | null;
        hits?: number | null;
        hitByPitch?: number | null;
        homeRuns?: number | null;
        intentionalBaseOnBalls?: number | null;
        plateAppearances?: number | null;
        runs?: number | null;
        rbi?: number | null;
        stolenBases?: number | null;
        sacrificeHits?: number | null;
        strikeouts?: number | null;
        totalBases?: number | null;
        triples?: number | null;
        battingAverage?: number | null;
        onBasePercentage?: number | null;
        sluggingPercentage?: number | null;
        playerId?: number | null;
      } | null;
    } | null> | null;
  } | null;
};

export type GetCareerFieldingStatsQueryVariables = Exact<{
  [key: string]: never;
}>;

export type GetCareerFieldingStatsQuery = {
  __typename?: 'Query';
  careerFieldingStats?: Array<{
    __typename?: 'CareerFielding';
    assists?: number | null;
    completeGames?: number | null;
    chances?: number | null;
    caughtStealing?: number | null;
    doublePlays?: number | null;
    errors?: number | null;
    fieldingPercentage?: number | null;
    games?: number | null;
    gamesStarted?: number | null;
    inningsDefended?: number | null;
    pickoffs?: number | null;
    putouts?: number | null;
    positions?: string | null;
    stolenBases?: number | null;
    wildPitches?: number | null;
    playerId?: number | null;
  }> | null;
};

export type GetCareerPitchingStatsQueryVariables = Exact<{
  [key: string]: never;
}>;

export type GetCareerPitchingStatsQuery = {
  __typename?: 'Query';
  careerPitchingStats?: Array<{
    __typename?: 'CareerPitching';
    battersFaced?: number | null;
    baseOnBalls?: number | null;
    balks?: number | null;
    completeGames?: number | null;
    earnedRuns?: number | null;
    era?: string | null;
    games?: number | null;
    gamesFinished?: number | null;
    gamesStarted?: number | null;
    hits?: number | null;
    hitByPitch?: number | null;
    homeRuns?: number | null;
    intentionalBaseOnBalls?: number | null;
    losses?: number | null;
    outRate?: number | null;
    outsRecorded?: number | null;
    runs?: number | null;
    shutouts?: number | null;
    strikeouts?: number | null;
    saves?: number | null;
    wins?: number | null;
    wildPitches?: number | null;
    winPercentage?: number | null;
    playerId?: number | null;
  }> | null;
};

export type GetPlayerCareerStatsQueryVariables = Exact<{
  playerId: Scalars['Int']['input'];
}>;

export type GetPlayerCareerStatsQuery = {
  __typename?: 'Query';
  batting?: {
    __typename?: 'CareerBatting';
    atBats?: number | null;
    baseOnBalls?: number | null;
    caughtStealing?: number | null;
    doubles?: number | null;
    games?: number | null;
    groundedIntoDoublePlays?: number | null;
    hits?: number | null;
    hitByPitch?: number | null;
    homeRuns?: number | null;
    intentionalBaseOnBalls?: number | null;
    plateAppearances?: number | null;
    runs?: number | null;
    rbi?: number | null;
    stolenBases?: number | null;
    sacrificeHits?: number | null;
    strikeouts?: number | null;
    totalBases?: number | null;
    triples?: number | null;
    battingAverage?: number | null;
    onBasePercentage?: number | null;
    sluggingPercentage?: number | null;
    playerId?: number | null;
  } | null;
  fielding?: {
    __typename?: 'CareerFielding';
    assists?: number | null;
    completeGames?: number | null;
    chances?: number | null;
    caughtStealing?: number | null;
    doublePlays?: number | null;
    errors?: number | null;
    fieldingPercentage?: number | null;
    games?: number | null;
    gamesStarted?: number | null;
    inningsDefended?: number | null;
    pickoffs?: number | null;
    putouts?: number | null;
    positions?: string | null;
    stolenBases?: number | null;
    wildPitches?: number | null;
    playerId?: number | null;
  } | null;
  pitching?: {
    __typename?: 'CareerPitching';
    battersFaced?: number | null;
    baseOnBalls?: number | null;
    balks?: number | null;
    completeGames?: number | null;
    earnedRuns?: number | null;
    era?: string | null;
    games?: number | null;
    gamesFinished?: number | null;
    gamesStarted?: number | null;
    hits?: number | null;
    hitByPitch?: number | null;
    homeRuns?: number | null;
    intentionalBaseOnBalls?: number | null;
    losses?: number | null;
    outRate?: number | null;
    outsRecorded?: number | null;
    runs?: number | null;
    shutouts?: number | null;
    strikeouts?: number | null;
    saves?: number | null;
    wins?: number | null;
    wildPitches?: number | null;
    winPercentage?: number | null;
    playerId?: number | null;
  } | null;
};

export type SubscriptionInfoFragment = {
  __typename?: 'SubscriptionInfo';
  status?: string | null;
  tier?: string | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean | null;
  gracePeriodEndsAt?: string | null;
};

export type GetMySubscriptionQueryVariables = Exact<{ [key: string]: never }>;

export type GetMySubscriptionQuery = {
  __typename?: 'Query';
  mySubscription?: {
    __typename?: 'SubscriptionInfo';
    status?: string | null;
    tier?: string | null;
    currentPeriodEnd?: string | null;
    cancelAtPeriodEnd?: boolean | null;
    gracePeriodEndsAt?: string | null;
  } | null;
};

export type CreateCheckoutSessionMutationVariables = Exact<{
  priceId: Scalars['String']['input'];
  successUrl: Scalars['String']['input'];
  cancelUrl: Scalars['String']['input'];
}>;

export type CreateCheckoutSessionMutation = {
  __typename?: 'Mutation';
  createCheckoutSession?: {
    __typename?: 'CheckoutSessionResult';
    url?: string | null;
  } | null;
};

export type CreateBillingPortalSessionMutationVariables = Exact<{
  returnUrl: Scalars['String']['input'];
}>;

export type CreateBillingPortalSessionMutation = {
  __typename?: 'Mutation';
  createBillingPortalSession?: {
    __typename?: 'BillingPortalSessionResult';
    url?: string | null;
  } | null;
};

export type VerifyApplePurchaseMutationVariables = Exact<{
  jwsTransaction: Scalars['String']['input'];
}>;

export type VerifyApplePurchaseMutation = {
  __typename?: 'Mutation';
  verifyApplePurchase?: {
    __typename?: 'AppleVerifyResult';
    success?: boolean | null;
    tier?: string | null;
    status?: string | null;
  } | null;
};

export type RestoreApplePurchasesMutationVariables = Exact<{
  jwsTransaction: Scalars['String']['input'];
}>;

export type RestoreApplePurchasesMutation = {
  __typename?: 'Mutation';
  restoreApplePurchases?: boolean | null;
};

export type VerifyGooglePurchaseMutationVariables = Exact<{
  purchaseToken: Scalars['String']['input'];
  productId: Scalars['String']['input'];
}>;

export type VerifyGooglePurchaseMutation = {
  __typename?: 'Mutation';
  verifyGooglePurchase?: {
    __typename?: 'GoogleVerifyResult';
    success?: boolean | null;
    tier?: string | null;
    status?: string | null;
  } | null;
};

export type RestoreGooglePurchasesMutationVariables = Exact<{
  purchaseToken: Scalars['String']['input'];
  productId: Scalars['String']['input'];
}>;

export type RestoreGooglePurchasesMutation = {
  __typename?: 'Mutation';
  restoreGooglePurchases?: boolean | null;
};

export type TeamFragment = {
  __typename?: 'Team';
  id?: number | null;
  leagueId?: number | null;
  name?: string | null;
  logoUrl?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
};

export type TeamMemberFragment = {
  __typename?: 'TeamMember';
  id?: number | null;
  playerId?: number | null;
  positionId?: number | null;
  teamId?: number | null;
  leagueId?: number | null;
  onTradeBlock?: boolean | null;
  player?: {
    __typename?: 'Player';
    id?: number | null;
    firstName?: string | null;
    lastName?: string | null;
    brefId?: string | null;
    eligiblePositions?: Array<string> | null;
  } | null;
};

export type GetTeamMembersQueryVariables = Exact<{
  teamId: Scalars['Int']['input'];
}>;

export type GetTeamMembersQuery = {
  __typename?: 'Query';
  teamMembers?: Array<{
    __typename?: 'TeamMember';
    id?: number | null;
    playerId?: number | null;
    positionId?: number | null;
    teamId?: number | null;
    leagueId?: number | null;
    onTradeBlock?: boolean | null;
    player?: {
      __typename?: 'Player';
      id?: number | null;
      firstName?: string | null;
      lastName?: string | null;
      brefId?: string | null;
      eligiblePositions?: Array<string> | null;
    } | null;
  }> | null;
};

export type UpdateTeamMemberPositionMutationVariables = Exact<{
  teamMemberId: Scalars['Int']['input'];
  positionId?: InputMaybe<Scalars['Int']['input']>;
}>;

export type UpdateTeamMemberPositionMutation = {
  __typename?: 'Mutation';
  updateTeamMemberPosition?: {
    __typename?: 'TeamMember';
    id?: number | null;
    playerId?: number | null;
    positionId?: number | null;
    teamId?: number | null;
    leagueId?: number | null;
    onTradeBlock?: boolean | null;
    player?: {
      __typename?: 'Player';
      id?: number | null;
      firstName?: string | null;
      lastName?: string | null;
      brefId?: string | null;
      eligiblePositions?: Array<string> | null;
    } | null;
  } | null;
};

export type SetTradeBlockMutationVariables = Exact<{
  teamMemberId: Scalars['Int']['input'];
  onTradeBlock: Scalars['Boolean']['input'];
}>;

export type SetTradeBlockMutation = {
  __typename?: 'Mutation';
  setTradeBlock?: {
    __typename?: 'TeamMember';
    id?: number | null;
    playerId?: number | null;
    positionId?: number | null;
    teamId?: number | null;
    leagueId?: number | null;
    onTradeBlock?: boolean | null;
    player?: {
      __typename?: 'Player';
      id?: number | null;
      firstName?: string | null;
      lastName?: string | null;
      brefId?: string | null;
      eligiblePositions?: Array<string> | null;
    } | null;
  } | null;
};

export type GetLeagueTradeBlockQueryVariables = Exact<{
  leagueId: Scalars['Int']['input'];
}>;

export type GetLeagueTradeBlockQuery = {
  __typename?: 'Query';
  leagueTradeBlock?: Array<{
    __typename?: 'TeamMember';
    id?: number | null;
    playerId?: number | null;
    positionId?: number | null;
    teamId?: number | null;
    leagueId?: number | null;
    onTradeBlock?: boolean | null;
    player?: {
      __typename?: 'Player';
      id?: number | null;
      firstName?: string | null;
      lastName?: string | null;
      brefId?: string | null;
      eligiblePositions?: Array<string> | null;
    } | null;
  }> | null;
};

export type GetTeamWaiverClaimsQueryVariables = Exact<{
  teamId: Scalars['Int']['input'];
  status?: InputMaybe<Scalars['String']['input']>;
}>;

export type GetTeamWaiverClaimsQuery = {
  __typename?: 'Query';
  teamWaiverClaims?: Array<{
    __typename?: 'WaiverClaim';
    id?: number | null;
    leagueId?: number | null;
    teamId?: number | null;
    playerId?: number | null;
    dropPlayerId?: number | null;
    faabBid?: number | null;
    status?: string | null;
    errorMessage?: string | null;
    playerName?: string | null;
    dropPlayerName?: string | null;
    processedAt?: string | null;
    createdAt?: string | null;
  }> | null;
};

export type CancelWaiverClaimMutationVariables = Exact<{
  claimId: Scalars['Int']['input'];
}>;

export type CancelWaiverClaimMutation = {
  __typename?: 'Mutation';
  cancelWaiverClaim?: {
    __typename?: 'WaiverClaim';
    id?: number | null;
    status?: string | null;
    errorMessage?: string | null;
    processedAt?: string | null;
  } | null;
};

export type UserFragment = {
  __typename?: 'User';
  id?: number | null;
  email?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
  accessLevel?: string | null;
  subscriptionTier?: string | null;
};

export type GetUserByEmailQueryVariables = Exact<{
  email: Scalars['String']['input'];
}>;

export type GetUserByEmailQuery = {
  __typename?: 'Query';
  userByEmail?: {
    __typename?: 'User';
    id?: number | null;
    email?: string | null;
    username?: string | null;
    avatarUrl?: string | null;
    accessLevel?: string | null;
    subscriptionTier?: string | null;
  } | null;
};

export type GetLeaguesForUserQueryVariables = Exact<{
  id: Scalars['Int']['input'];
  withMembers?: InputMaybe<Scalars['Boolean']['input']>;
  withMatchup?: InputMaybe<Scalars['Boolean']['input']>;
  withTeams?: InputMaybe<Scalars['Boolean']['input']>;
}>;

export type GetLeaguesForUserQuery = {
  __typename?: 'Query';
  user?: {
    __typename?: 'User';
    id?: number | null;
    email?: string | null;
    username?: string | null;
    avatarUrl?: string | null;
    accessLevel?: string | null;
    subscriptionTier?: string | null;
  } | null;
};

export type GetUserByIdQueryVariables = Exact<{
  id: Scalars['Int']['input'];
}>;

export type GetUserByIdQuery = {
  __typename?: 'Query';
  user?: {
    __typename?: 'User';
    id?: number | null;
    email?: string | null;
    username?: string | null;
    avatarUrl?: string | null;
    accessLevel?: string | null;
    subscriptionTier?: string | null;
  } | null;
};

export type UpdateUsernameMutationVariables = Exact<{
  username: Scalars['String']['input'];
}>;

export type UpdateUsernameMutation = {
  __typename?: 'Mutation';
  updateUsername?: {
    __typename?: 'User';
    id?: number | null;
    email?: string | null;
    username?: string | null;
    avatarUrl?: string | null;
    accessLevel?: string | null;
    subscriptionTier?: string | null;
  } | null;
};

export type UpdateUserAvatarMutationVariables = Exact<{
  avatarUrl?: InputMaybe<Scalars['String']['input']>;
}>;

export type UpdateUserAvatarMutation = {
  __typename?: 'Mutation';
  updateUserAvatar?: {
    __typename?: 'User';
    id?: number | null;
    username?: string | null;
    avatarUrl?: string | null;
  } | null;
};

export const DuesSettingsFragmentDoc = gql`
  fragment DuesSettings on LeagueDuesSettings {
    id
    leagueId
    enabled
    amountCents
    reminderEnabled
    reminderDayOfWeek
    createdAt
    updatedAt
  }
`;
export const MemberPaymentStatusFragmentDoc = gql`
  fragment MemberPaymentStatus on LeagueMemberPaymentStatus {
    id
    leagueId
    userId
    username
    paid
    paidAt
    markedBy
    createdAt
    updatedAt
  }
`;
export const LeagueMemberFragmentDoc = gql`
  fragment LeagueMember on LeagueMember {
    leagueId
    permissionLevel
    teamId
    userId
  }
`;
export const LeagueFragmentDoc = gql`
  fragment League on League {
    id
    name
    owner
    maxRosterSize
    currentMatchup
    currentWeekNumber
    draftStatus
    leaguePhase
    inviteCode
    lmNotes
    playerPool
    waiverEnabled
    waiverType
    userMembership {
      ...LeagueMember
    }
  }
  ${LeagueMemberFragmentDoc}
`;
export const LeaguePositionFragmentDoc = gql`
  fragment LeaguePosition on LeaguePosition {
    id
    leagueId
    positionType
  }
`;
export const MatchupFragmentDoc = gql`
  fragment Matchup on Matchup {
    id
    weekNumber
    leagueId
    team1Id
    team2Id
    team1Score
    team2Score
    status
    statsLoadingStatus
    gamesPerMatchup
    spStartsPerMatchup
    selectedGamesCount
    startTime
    endTime
  }
`;
export const MatchupPlayerFragmentDoc = gql`
  fragment MatchupPlayer on MatchupPlayer {
    id
    matchupId
    playerId
    teamId
    positionId
    season
    player {
      id
      firstName
      lastName
      eligiblePositions
    }
  }
`;
export const LeagueChatMessageFieldsFragmentDoc = gql`
  fragment LeagueChatMessageFields on LeagueChatMessage {
    id
    leagueId
    userId
    messageText
    timestamp
    messageType
    gifUrl
    sender {
      id
      username
    }
  }
`;
export const DirectMessageFieldsFragmentDoc = gql`
  fragment DirectMessageFields on DirectMessage {
    id
    fromUserId
    toUserId
    leagueId
    messageText
    readAt
    deletedAt
    createdAt
    updatedAt
    sender {
      id
      username
    }
    recipient {
      id
      username
    }
  }
`;
export const NotificationPreferenceFragmentDoc = gql`
  fragment NotificationPreference on NotificationPreference {
    id
    userId
    matchupStartedEnabled
    matchupEndedEnabled
    matchupCloseGameEnabled
    matchupReminderEnabled
    pushEnabled
    emailEnabled
    closeGameThreshold
    createdAt
    updatedAt
  }
`;
export const DeviceTokenFragmentDoc = gql`
  fragment DeviceToken on DeviceToken {
    id
    userId
    deviceToken
    platform
    endpointArn
    enabled
    createdAt
    updatedAt
  }
`;
export const NotificationHistoryItemFragmentDoc = gql`
  fragment NotificationHistoryItem on NotificationHistoryItem {
    id
    userId
    notificationType
    channel
    matchupId
    leagueId
    title
    message
    metadata
    read
    sentAt
    readAt
    createdAt
  }
`;
export const PlayerFragmentDoc = gql`
  fragment Player on Player {
    id
    firstName
    lastName
    brefId
  }
`;
export const CareerBattingStatsFragmentDoc = gql`
  fragment CareerBattingStats on CareerBatting {
    atBats
    baseOnBalls
    caughtStealing
    doubles
    games
    groundedIntoDoublePlays
    hits
    hitByPitch
    homeRuns
    intentionalBaseOnBalls
    plateAppearances
    runs
    rbi
    stolenBases
    sacrificeHits
    strikeouts
    totalBases
    triples
    battingAverage
    onBasePercentage
    sluggingPercentage
    playerId
  }
`;
export const CareerFieldingStatsFragmentDoc = gql`
  fragment CareerFieldingStats on CareerFielding {
    assists
    completeGames
    chances
    caughtStealing
    doublePlays
    errors
    fieldingPercentage
    games
    gamesStarted
    inningsDefended
    pickoffs
    putouts
    positions
    stolenBases
    wildPitches
    playerId
  }
`;
export const CareerPitchingStatsFragmentDoc = gql`
  fragment CareerPitchingStats on CareerPitching {
    battersFaced
    baseOnBalls
    balks
    completeGames
    earnedRuns
    era
    games
    gamesFinished
    gamesStarted
    hits
    hitByPitch
    homeRuns
    intentionalBaseOnBalls
    losses
    outRate
    outsRecorded
    runs
    shutouts
    strikeouts
    saves
    wins
    wildPitches
    winPercentage
    playerId
  }
`;
export const SubscriptionInfoFragmentDoc = gql`
  fragment SubscriptionInfo on SubscriptionInfo {
    status
    tier
    currentPeriodEnd
    cancelAtPeriodEnd
    gracePeriodEndsAt
  }
`;
export const TeamFragmentDoc = gql`
  fragment Team on Team {
    id
    leagueId
    name
    logoUrl
    primaryColor
    secondaryColor
    avatarUrl
    bannerUrl
  }
`;
export const TeamMemberFragmentDoc = gql`
  fragment TeamMember on TeamMember {
    id
    playerId
    positionId
    teamId
    leagueId
    onTradeBlock
    player {
      id
      firstName
      lastName
      brefId
      eligiblePositions
    }
  }
`;
export const UserFragmentDoc = gql`
  fragment User on User {
    id
    email
    username
    avatarUrl
    accessLevel
    subscriptionTier
  }
`;
export const GetLeagueDuesSettings = gql`
  query GetLeagueDuesSettings($leagueId: Int!) {
    leagueDuesSettings(leagueId: $leagueId) {
      ...DuesSettings
    }
  }
  ${DuesSettingsFragmentDoc}
`;

/**
 * __useGetLeagueDuesSettingsQuery__
 *
 * To run a query within a React component, call `useGetLeagueDuesSettingsQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetLeagueDuesSettingsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetLeagueDuesSettingsQuery({
 *   variables: {
 *      leagueId: // value for 'leagueId'
 *   },
 * });
 */
export function useGetLeagueDuesSettingsQuery(
  baseOptions: Apollo.QueryHookOptions<
    GetLeagueDuesSettingsQuery,
    GetLeagueDuesSettingsQueryVariables
  > &
    (
      | { variables: GetLeagueDuesSettingsQueryVariables; skip?: boolean }
      | { skip: boolean }
    ),
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useQuery<
    GetLeagueDuesSettingsQuery,
    GetLeagueDuesSettingsQueryVariables
  >(GetLeagueDuesSettings, options);
}
export function useGetLeagueDuesSettingsLazyQuery(
  baseOptions?: Apollo.LazyQueryHookOptions<
    GetLeagueDuesSettingsQuery,
    GetLeagueDuesSettingsQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useLazyQuery<
    GetLeagueDuesSettingsQuery,
    GetLeagueDuesSettingsQueryVariables
  >(GetLeagueDuesSettings, options);
}
export function useGetLeagueDuesSettingsSuspenseQuery(
  baseOptions?:
    | Apollo.SkipToken
    | Apollo.SuspenseQueryHookOptions<
        GetLeagueDuesSettingsQuery,
        GetLeagueDuesSettingsQueryVariables
      >,
) {
  const options =
    baseOptions === Apollo.skipToken
      ? baseOptions
      : { ...defaultOptions, ...baseOptions };
  return Apollo.useSuspenseQuery<
    GetLeagueDuesSettingsQuery,
    GetLeagueDuesSettingsQueryVariables
  >(
    GetLeagueDuesSettings,
    options as
      | Apollo.SkipToken
      | Apollo.SuspenseQueryHookOptions<
          GetLeagueDuesSettingsQuery,
          GetLeagueDuesSettingsQueryVariables
        >,
  );
}
export type GetLeagueDuesSettingsQueryHookResult = ReturnType<
  typeof useGetLeagueDuesSettingsQuery
>;
export type GetLeagueDuesSettingsLazyQueryHookResult = ReturnType<
  typeof useGetLeagueDuesSettingsLazyQuery
>;
export type GetLeagueDuesSettingsSuspenseQueryHookResult = ReturnType<
  typeof useGetLeagueDuesSettingsSuspenseQuery
>;
export type GetLeagueDuesSettingsQueryResult = Apollo.QueryResult<
  GetLeagueDuesSettingsQuery,
  GetLeagueDuesSettingsQueryVariables
>;
export const GetLeagueDuesStatus = gql`
  query GetLeagueDuesStatus($leagueId: Int!) {
    leagueDuesSettings(leagueId: $leagueId) {
      ...DuesSettings
    }
    leagueDuesStatus(leagueId: $leagueId) {
      ...MemberPaymentStatus
    }
  }
  ${DuesSettingsFragmentDoc}
  ${MemberPaymentStatusFragmentDoc}
`;

/**
 * __useGetLeagueDuesStatusQuery__
 *
 * To run a query within a React component, call `useGetLeagueDuesStatusQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetLeagueDuesStatusQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetLeagueDuesStatusQuery({
 *   variables: {
 *      leagueId: // value for 'leagueId'
 *   },
 * });
 */
export function useGetLeagueDuesStatusQuery(
  baseOptions: Apollo.QueryHookOptions<
    GetLeagueDuesStatusQuery,
    GetLeagueDuesStatusQueryVariables
  > &
    (
      | { variables: GetLeagueDuesStatusQueryVariables; skip?: boolean }
      | { skip: boolean }
    ),
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useQuery<
    GetLeagueDuesStatusQuery,
    GetLeagueDuesStatusQueryVariables
  >(GetLeagueDuesStatus, options);
}
export function useGetLeagueDuesStatusLazyQuery(
  baseOptions?: Apollo.LazyQueryHookOptions<
    GetLeagueDuesStatusQuery,
    GetLeagueDuesStatusQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useLazyQuery<
    GetLeagueDuesStatusQuery,
    GetLeagueDuesStatusQueryVariables
  >(GetLeagueDuesStatus, options);
}
export function useGetLeagueDuesStatusSuspenseQuery(
  baseOptions?:
    | Apollo.SkipToken
    | Apollo.SuspenseQueryHookOptions<
        GetLeagueDuesStatusQuery,
        GetLeagueDuesStatusQueryVariables
      >,
) {
  const options =
    baseOptions === Apollo.skipToken
      ? baseOptions
      : { ...defaultOptions, ...baseOptions };
  return Apollo.useSuspenseQuery<
    GetLeagueDuesStatusQuery,
    GetLeagueDuesStatusQueryVariables
  >(
    GetLeagueDuesStatus,
    options as
      | Apollo.SkipToken
      | Apollo.SuspenseQueryHookOptions<
          GetLeagueDuesStatusQuery,
          GetLeagueDuesStatusQueryVariables
        >,
  );
}
export type GetLeagueDuesStatusQueryHookResult = ReturnType<
  typeof useGetLeagueDuesStatusQuery
>;
export type GetLeagueDuesStatusLazyQueryHookResult = ReturnType<
  typeof useGetLeagueDuesStatusLazyQuery
>;
export type GetLeagueDuesStatusSuspenseQueryHookResult = ReturnType<
  typeof useGetLeagueDuesStatusSuspenseQuery
>;
export type GetLeagueDuesStatusQueryResult = Apollo.QueryResult<
  GetLeagueDuesStatusQuery,
  GetLeagueDuesStatusQueryVariables
>;
export const UpdateDuesSettings = gql`
  mutation UpdateDuesSettings($input: UpdateDuesSettingsInput!) {
    updateDuesSettings(input: $input) {
      ...DuesSettings
    }
  }
  ${DuesSettingsFragmentDoc}
`;
export type UpdateDuesSettingsMutationFn = MutationFunction<
  UpdateDuesSettingsMutation,
  UpdateDuesSettingsMutationVariables
>;

/**
 * __useUpdateDuesSettingsMutation__
 *
 * To run a mutation, you first call `useUpdateDuesSettingsMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUpdateDuesSettingsMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [updateDuesSettingsMutation, { data, loading, error }] = useUpdateDuesSettingsMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
export function useUpdateDuesSettingsMutation(
  baseOptions?: Apollo.MutationHookOptions<
    UpdateDuesSettingsMutation,
    UpdateDuesSettingsMutationVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useMutation<
    UpdateDuesSettingsMutation,
    UpdateDuesSettingsMutationVariables
  >(UpdateDuesSettings, options);
}
export type UpdateDuesSettingsMutationHookResult = ReturnType<
  typeof useUpdateDuesSettingsMutation
>;
export type UpdateDuesSettingsMutationResult =
  Apollo.MutationResult<UpdateDuesSettingsMutation>;
export type UpdateDuesSettingsMutationOptions = BaseMutationOptions<
  UpdateDuesSettingsMutation,
  UpdateDuesSettingsMutationVariables
>;
export const MarkMemberPaid = gql`
  mutation MarkMemberPaid($leagueId: Int!, $userId: Int!) {
    markMemberPaid(leagueId: $leagueId, userId: $userId) {
      ...MemberPaymentStatus
    }
  }
  ${MemberPaymentStatusFragmentDoc}
`;
export type MarkMemberPaidMutationFn = MutationFunction<
  MarkMemberPaidMutation,
  MarkMemberPaidMutationVariables
>;

/**
 * __useMarkMemberPaidMutation__
 *
 * To run a mutation, you first call `useMarkMemberPaidMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useMarkMemberPaidMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [markMemberPaidMutation, { data, loading, error }] = useMarkMemberPaidMutation({
 *   variables: {
 *      leagueId: // value for 'leagueId'
 *      userId: // value for 'userId'
 *   },
 * });
 */
export function useMarkMemberPaidMutation(
  baseOptions?: Apollo.MutationHookOptions<
    MarkMemberPaidMutation,
    MarkMemberPaidMutationVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useMutation<
    MarkMemberPaidMutation,
    MarkMemberPaidMutationVariables
  >(MarkMemberPaid, options);
}
export type MarkMemberPaidMutationHookResult = ReturnType<
  typeof useMarkMemberPaidMutation
>;
export type MarkMemberPaidMutationResult =
  Apollo.MutationResult<MarkMemberPaidMutation>;
export type MarkMemberPaidMutationOptions = BaseMutationOptions<
  MarkMemberPaidMutation,
  MarkMemberPaidMutationVariables
>;
export const MarkMemberUnpaid = gql`
  mutation MarkMemberUnpaid($leagueId: Int!, $userId: Int!) {
    markMemberUnpaid(leagueId: $leagueId, userId: $userId) {
      ...MemberPaymentStatus
    }
  }
  ${MemberPaymentStatusFragmentDoc}
`;
export type MarkMemberUnpaidMutationFn = MutationFunction<
  MarkMemberUnpaidMutation,
  MarkMemberUnpaidMutationVariables
>;

/**
 * __useMarkMemberUnpaidMutation__
 *
 * To run a mutation, you first call `useMarkMemberUnpaidMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useMarkMemberUnpaidMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [markMemberUnpaidMutation, { data, loading, error }] = useMarkMemberUnpaidMutation({
 *   variables: {
 *      leagueId: // value for 'leagueId'
 *      userId: // value for 'userId'
 *   },
 * });
 */
export function useMarkMemberUnpaidMutation(
  baseOptions?: Apollo.MutationHookOptions<
    MarkMemberUnpaidMutation,
    MarkMemberUnpaidMutationVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useMutation<
    MarkMemberUnpaidMutation,
    MarkMemberUnpaidMutationVariables
  >(MarkMemberUnpaid, options);
}
export type MarkMemberUnpaidMutationHookResult = ReturnType<
  typeof useMarkMemberUnpaidMutation
>;
export type MarkMemberUnpaidMutationResult =
  Apollo.MutationResult<MarkMemberUnpaidMutation>;
export type MarkMemberUnpaidMutationOptions = BaseMutationOptions<
  MarkMemberUnpaidMutation,
  MarkMemberUnpaidMutationVariables
>;
export const GetLeagueById = gql`
  query GetLeagueById(
    $id: Int!
    $withMembers: Boolean = false
    $withTeams: Boolean = false
    $withMatchup: Boolean = false
  ) {
    league(id: $id) {
      ...League
    }
  }
  ${LeagueFragmentDoc}
`;

/**
 * __useGetLeagueByIdQuery__
 *
 * To run a query within a React component, call `useGetLeagueByIdQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetLeagueByIdQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetLeagueByIdQuery({
 *   variables: {
 *      id: // value for 'id'
 *      withMembers: // value for 'withMembers'
 *      withTeams: // value for 'withTeams'
 *      withMatchup: // value for 'withMatchup'
 *   },
 * });
 */
export function useGetLeagueByIdQuery(
  baseOptions: Apollo.QueryHookOptions<
    GetLeagueByIdQuery,
    GetLeagueByIdQueryVariables
  > &
    (
      | { variables: GetLeagueByIdQueryVariables; skip?: boolean }
      | { skip: boolean }
    ),
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useQuery<GetLeagueByIdQuery, GetLeagueByIdQueryVariables>(
    GetLeagueById,
    options,
  );
}
export function useGetLeagueByIdLazyQuery(
  baseOptions?: Apollo.LazyQueryHookOptions<
    GetLeagueByIdQuery,
    GetLeagueByIdQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useLazyQuery<GetLeagueByIdQuery, GetLeagueByIdQueryVariables>(
    GetLeagueById,
    options,
  );
}
export function useGetLeagueByIdSuspenseQuery(
  baseOptions?:
    | Apollo.SkipToken
    | Apollo.SuspenseQueryHookOptions<
        GetLeagueByIdQuery,
        GetLeagueByIdQueryVariables
      >,
) {
  const options =
    baseOptions === Apollo.skipToken
      ? baseOptions
      : { ...defaultOptions, ...baseOptions };
  return Apollo.useSuspenseQuery<
    GetLeagueByIdQuery,
    GetLeagueByIdQueryVariables
  >(
    GetLeagueById,
    options as
      | Apollo.SkipToken
      | Apollo.SuspenseQueryHookOptions<
          GetLeagueByIdQuery,
          GetLeagueByIdQueryVariables
        >,
  );
}
export type GetLeagueByIdQueryHookResult = ReturnType<
  typeof useGetLeagueByIdQuery
>;
export type GetLeagueByIdLazyQueryHookResult = ReturnType<
  typeof useGetLeagueByIdLazyQuery
>;
export type GetLeagueByIdSuspenseQueryHookResult = ReturnType<
  typeof useGetLeagueByIdSuspenseQuery
>;
export type GetLeagueByIdQueryResult = Apollo.QueryResult<
  GetLeagueByIdQuery,
  GetLeagueByIdQueryVariables
>;
export const CreateLeague = gql`
  mutation CreateLeague(
    $input: CreateLeagueAndTeamsInput!
    $withMembers: Boolean = false
    $withTeams: Boolean = false
    $withMatchup: Boolean = false
  ) {
    createLeagueAndTeams(input: $input) {
      league {
        ...League
      }
    }
  }
  ${LeagueFragmentDoc}
`;
export type CreateLeagueMutationFn = MutationFunction<
  CreateLeagueMutation,
  CreateLeagueMutationVariables
>;

/**
 * __useCreateLeagueMutation__
 *
 * To run a mutation, you first call `useCreateLeagueMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useCreateLeagueMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [createLeagueMutation, { data, loading, error }] = useCreateLeagueMutation({
 *   variables: {
 *      input: // value for 'input'
 *      withMembers: // value for 'withMembers'
 *      withTeams: // value for 'withTeams'
 *      withMatchup: // value for 'withMatchup'
 *   },
 * });
 */
export function useCreateLeagueMutation(
  baseOptions?: Apollo.MutationHookOptions<
    CreateLeagueMutation,
    CreateLeagueMutationVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useMutation<
    CreateLeagueMutation,
    CreateLeagueMutationVariables
  >(CreateLeague, options);
}
export type CreateLeagueMutationHookResult = ReturnType<
  typeof useCreateLeagueMutation
>;
export type CreateLeagueMutationResult =
  Apollo.MutationResult<CreateLeagueMutation>;
export type CreateLeagueMutationOptions = BaseMutationOptions<
  CreateLeagueMutation,
  CreateLeagueMutationVariables
>;
export const GetPositionsForLeague = gql`
  query GetPositionsForLeague($leagueId: Int!) {
    leaguePositions(leagueId: $leagueId) {
      ...LeaguePosition
    }
  }
  ${LeaguePositionFragmentDoc}
`;

/**
 * __useGetPositionsForLeagueQuery__
 *
 * To run a query within a React component, call `useGetPositionsForLeagueQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetPositionsForLeagueQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetPositionsForLeagueQuery({
 *   variables: {
 *      leagueId: // value for 'leagueId'
 *   },
 * });
 */
export function useGetPositionsForLeagueQuery(
  baseOptions: Apollo.QueryHookOptions<
    GetPositionsForLeagueQuery,
    GetPositionsForLeagueQueryVariables
  > &
    (
      | { variables: GetPositionsForLeagueQueryVariables; skip?: boolean }
      | { skip: boolean }
    ),
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useQuery<
    GetPositionsForLeagueQuery,
    GetPositionsForLeagueQueryVariables
  >(GetPositionsForLeague, options);
}
export function useGetPositionsForLeagueLazyQuery(
  baseOptions?: Apollo.LazyQueryHookOptions<
    GetPositionsForLeagueQuery,
    GetPositionsForLeagueQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useLazyQuery<
    GetPositionsForLeagueQuery,
    GetPositionsForLeagueQueryVariables
  >(GetPositionsForLeague, options);
}
export function useGetPositionsForLeagueSuspenseQuery(
  baseOptions?:
    | Apollo.SkipToken
    | Apollo.SuspenseQueryHookOptions<
        GetPositionsForLeagueQuery,
        GetPositionsForLeagueQueryVariables
      >,
) {
  const options =
    baseOptions === Apollo.skipToken
      ? baseOptions
      : { ...defaultOptions, ...baseOptions };
  return Apollo.useSuspenseQuery<
    GetPositionsForLeagueQuery,
    GetPositionsForLeagueQueryVariables
  >(
    GetPositionsForLeague,
    options as
      | Apollo.SkipToken
      | Apollo.SuspenseQueryHookOptions<
          GetPositionsForLeagueQuery,
          GetPositionsForLeagueQueryVariables
        >,
  );
}
export type GetPositionsForLeagueQueryHookResult = ReturnType<
  typeof useGetPositionsForLeagueQuery
>;
export type GetPositionsForLeagueLazyQueryHookResult = ReturnType<
  typeof useGetPositionsForLeagueLazyQuery
>;
export type GetPositionsForLeagueSuspenseQueryHookResult = ReturnType<
  typeof useGetPositionsForLeagueSuspenseQuery
>;
export type GetPositionsForLeagueQueryResult = Apollo.QueryResult<
  GetPositionsForLeagueQuery,
  GetPositionsForLeagueQueryVariables
>;
export const GetUserLeagues = gql`
  query GetUserLeagues {
    userLeagues {
      ...League
    }
  }
  ${LeagueFragmentDoc}
`;

/**
 * __useGetUserLeaguesQuery__
 *
 * To run a query within a React component, call `useGetUserLeaguesQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetUserLeaguesQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetUserLeaguesQuery({
 *   variables: {
 *   },
 * });
 */
export function useGetUserLeaguesQuery(
  baseOptions?: Apollo.QueryHookOptions<
    GetUserLeaguesQuery,
    GetUserLeaguesQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useQuery<GetUserLeaguesQuery, GetUserLeaguesQueryVariables>(
    GetUserLeagues,
    options,
  );
}
export function useGetUserLeaguesLazyQuery(
  baseOptions?: Apollo.LazyQueryHookOptions<
    GetUserLeaguesQuery,
    GetUserLeaguesQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useLazyQuery<GetUserLeaguesQuery, GetUserLeaguesQueryVariables>(
    GetUserLeagues,
    options,
  );
}
export function useGetUserLeaguesSuspenseQuery(
  baseOptions?:
    | Apollo.SkipToken
    | Apollo.SuspenseQueryHookOptions<
        GetUserLeaguesQuery,
        GetUserLeaguesQueryVariables
      >,
) {
  const options =
    baseOptions === Apollo.skipToken
      ? baseOptions
      : { ...defaultOptions, ...baseOptions };
  return Apollo.useSuspenseQuery<
    GetUserLeaguesQuery,
    GetUserLeaguesQueryVariables
  >(
    GetUserLeagues,
    options as
      | Apollo.SkipToken
      | Apollo.SuspenseQueryHookOptions<
          GetUserLeaguesQuery,
          GetUserLeaguesQueryVariables
        >,
  );
}
export type GetUserLeaguesQueryHookResult = ReturnType<
  typeof useGetUserLeaguesQuery
>;
export type GetUserLeaguesLazyQueryHookResult = ReturnType<
  typeof useGetUserLeaguesLazyQuery
>;
export type GetUserLeaguesSuspenseQueryHookResult = ReturnType<
  typeof useGetUserLeaguesSuspenseQuery
>;
export type GetUserLeaguesQueryResult = Apollo.QueryResult<
  GetUserLeaguesQuery,
  GetUserLeaguesQueryVariables
>;
export const DeleteAllLeagues = gql`
  mutation DeleteAllLeagues {
    deleteAllLeagues
  }
`;
export type DeleteAllLeaguesMutationFn = MutationFunction<
  DeleteAllLeaguesMutation,
  DeleteAllLeaguesMutationVariables
>;

/**
 * __useDeleteAllLeaguesMutation__
 *
 * To run a mutation, you first call `useDeleteAllLeaguesMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useDeleteAllLeaguesMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [deleteAllLeaguesMutation, { data, loading, error }] = useDeleteAllLeaguesMutation({
 *   variables: {
 *   },
 * });
 */
export function useDeleteAllLeaguesMutation(
  baseOptions?: Apollo.MutationHookOptions<
    DeleteAllLeaguesMutation,
    DeleteAllLeaguesMutationVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useMutation<
    DeleteAllLeaguesMutation,
    DeleteAllLeaguesMutationVariables
  >(DeleteAllLeagues, options);
}
export type DeleteAllLeaguesMutationHookResult = ReturnType<
  typeof useDeleteAllLeaguesMutation
>;
export type DeleteAllLeaguesMutationResult =
  Apollo.MutationResult<DeleteAllLeaguesMutation>;
export type DeleteAllLeaguesMutationOptions = BaseMutationOptions<
  DeleteAllLeaguesMutation,
  DeleteAllLeaguesMutationVariables
>;
export const StartDraft = gql`
  mutation StartDraft($leagueId: Int!, $selectionMethod: String) {
    startDraft(leagueId: $leagueId, selectionMethod: $selectionMethod) {
      ...League
    }
  }
  ${LeagueFragmentDoc}
`;
export type StartDraftMutationFn = MutationFunction<
  StartDraftMutation,
  StartDraftMutationVariables
>;

/**
 * __useStartDraftMutation__
 *
 * To run a mutation, you first call `useStartDraftMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useStartDraftMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [startDraftMutation, { data, loading, error }] = useStartDraftMutation({
 *   variables: {
 *      leagueId: // value for 'leagueId'
 *      selectionMethod: // value for 'selectionMethod'
 *   },
 * });
 */
export function useStartDraftMutation(
  baseOptions?: Apollo.MutationHookOptions<
    StartDraftMutation,
    StartDraftMutationVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useMutation<StartDraftMutation, StartDraftMutationVariables>(
    StartDraft,
    options,
  );
}
export type StartDraftMutationHookResult = ReturnType<
  typeof useStartDraftMutation
>;
export type StartDraftMutationResult =
  Apollo.MutationResult<StartDraftMutation>;
export type StartDraftMutationOptions = BaseMutationOptions<
  StartDraftMutation,
  StartDraftMutationVariables
>;
export const GetLeagueTeams = gql`
  query GetLeagueTeams($leagueId: Int!) {
    leagueTeams(leagueId: $leagueId) {
      id
      name
      leagueId
    }
  }
`;

/**
 * __useGetLeagueTeamsQuery__
 *
 * To run a query within a React component, call `useGetLeagueTeamsQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetLeagueTeamsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetLeagueTeamsQuery({
 *   variables: {
 *      leagueId: // value for 'leagueId'
 *   },
 * });
 */
export function useGetLeagueTeamsQuery(
  baseOptions: Apollo.QueryHookOptions<
    GetLeagueTeamsQuery,
    GetLeagueTeamsQueryVariables
  > &
    (
      | { variables: GetLeagueTeamsQueryVariables; skip?: boolean }
      | { skip: boolean }
    ),
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useQuery<GetLeagueTeamsQuery, GetLeagueTeamsQueryVariables>(
    GetLeagueTeams,
    options,
  );
}
export function useGetLeagueTeamsLazyQuery(
  baseOptions?: Apollo.LazyQueryHookOptions<
    GetLeagueTeamsQuery,
    GetLeagueTeamsQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useLazyQuery<GetLeagueTeamsQuery, GetLeagueTeamsQueryVariables>(
    GetLeagueTeams,
    options,
  );
}
export function useGetLeagueTeamsSuspenseQuery(
  baseOptions?:
    | Apollo.SkipToken
    | Apollo.SuspenseQueryHookOptions<
        GetLeagueTeamsQuery,
        GetLeagueTeamsQueryVariables
      >,
) {
  const options =
    baseOptions === Apollo.skipToken
      ? baseOptions
      : { ...defaultOptions, ...baseOptions };
  return Apollo.useSuspenseQuery<
    GetLeagueTeamsQuery,
    GetLeagueTeamsQueryVariables
  >(
    GetLeagueTeams,
    options as
      | Apollo.SkipToken
      | Apollo.SuspenseQueryHookOptions<
          GetLeagueTeamsQuery,
          GetLeagueTeamsQueryVariables
        >,
  );
}
export type GetLeagueTeamsQueryHookResult = ReturnType<
  typeof useGetLeagueTeamsQuery
>;
export type GetLeagueTeamsLazyQueryHookResult = ReturnType<
  typeof useGetLeagueTeamsLazyQuery
>;
export type GetLeagueTeamsSuspenseQueryHookResult = ReturnType<
  typeof useGetLeagueTeamsSuspenseQuery
>;
export type GetLeagueTeamsQueryResult = Apollo.QueryResult<
  GetLeagueTeamsQuery,
  GetLeagueTeamsQueryVariables
>;
export const GetPublicLeagues = gql`
  query GetPublicLeagues(
    $search: String
    $draftStatus: String
    $playerPool: String
    $limit: Int
    $offset: Int
  ) {
    publicLeagues(
      search: $search
      draftStatus: $draftStatus
      playerPool: $playerPool
      limit: $limit
      offset: $offset
    ) {
      id
      name
      owner
      maxRosterSize
      draftStatus
      playerPool
      isPublic
      totalSpots
      availableSpots
      isFull
      isAlreadyMember
    }
  }
`;

/**
 * __useGetPublicLeaguesQuery__
 *
 * To run a query within a React component, call `useGetPublicLeaguesQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetPublicLeaguesQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetPublicLeaguesQuery({
 *   variables: {
 *      search: // value for 'search'
 *      draftStatus: // value for 'draftStatus'
 *      playerPool: // value for 'playerPool'
 *      limit: // value for 'limit'
 *      offset: // value for 'offset'
 *   },
 * });
 */
export function useGetPublicLeaguesQuery(
  baseOptions?: Apollo.QueryHookOptions<
    GetPublicLeaguesQuery,
    GetPublicLeaguesQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useQuery<GetPublicLeaguesQuery, GetPublicLeaguesQueryVariables>(
    GetPublicLeagues,
    options,
  );
}
export function useGetPublicLeaguesLazyQuery(
  baseOptions?: Apollo.LazyQueryHookOptions<
    GetPublicLeaguesQuery,
    GetPublicLeaguesQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useLazyQuery<
    GetPublicLeaguesQuery,
    GetPublicLeaguesQueryVariables
  >(GetPublicLeagues, options);
}
export function useGetPublicLeaguesSuspenseQuery(
  baseOptions?:
    | Apollo.SkipToken
    | Apollo.SuspenseQueryHookOptions<
        GetPublicLeaguesQuery,
        GetPublicLeaguesQueryVariables
      >,
) {
  const options =
    baseOptions === Apollo.skipToken
      ? baseOptions
      : { ...defaultOptions, ...baseOptions };
  return Apollo.useSuspenseQuery<
    GetPublicLeaguesQuery,
    GetPublicLeaguesQueryVariables
  >(
    GetPublicLeagues,
    options as
      | Apollo.SkipToken
      | Apollo.SuspenseQueryHookOptions<
          GetPublicLeaguesQuery,
          GetPublicLeaguesQueryVariables
        >,
  );
}
export type GetPublicLeaguesQueryHookResult = ReturnType<
  typeof useGetPublicLeaguesQuery
>;
export type GetPublicLeaguesLazyQueryHookResult = ReturnType<
  typeof useGetPublicLeaguesLazyQuery
>;
export type GetPublicLeaguesSuspenseQueryHookResult = ReturnType<
  typeof useGetPublicLeaguesSuspenseQuery
>;
export type GetPublicLeaguesQueryResult = Apollo.QueryResult<
  GetPublicLeaguesQuery,
  GetPublicLeaguesQueryVariables
>;
export const JoinPublicLeague = gql`
  mutation JoinPublicLeague($leagueId: Int!, $teamName: String!) {
    joinPublicLeague(leagueId: $leagueId, teamName: $teamName) {
      success
      message
      leagueId
      teamId
    }
  }
`;
export type JoinPublicLeagueMutationFn = MutationFunction<
  JoinPublicLeagueMutation,
  JoinPublicLeagueMutationVariables
>;

/**
 * __useJoinPublicLeagueMutation__
 *
 * To run a mutation, you first call `useJoinPublicLeagueMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useJoinPublicLeagueMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [joinPublicLeagueMutation, { data, loading, error }] = useJoinPublicLeagueMutation({
 *   variables: {
 *      leagueId: // value for 'leagueId'
 *      teamName: // value for 'teamName'
 *   },
 * });
 */
export function useJoinPublicLeagueMutation(
  baseOptions?: Apollo.MutationHookOptions<
    JoinPublicLeagueMutation,
    JoinPublicLeagueMutationVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useMutation<
    JoinPublicLeagueMutation,
    JoinPublicLeagueMutationVariables
  >(JoinPublicLeague, options);
}
export type JoinPublicLeagueMutationHookResult = ReturnType<
  typeof useJoinPublicLeagueMutation
>;
export type JoinPublicLeagueMutationResult =
  Apollo.MutationResult<JoinPublicLeagueMutation>;
export type JoinPublicLeagueMutationOptions = BaseMutationOptions<
  JoinPublicLeagueMutation,
  JoinPublicLeagueMutationVariables
>;
export const GetUserTeamId = gql`
  query GetUserTeamId($leagueId: Int!) {
    userTeamId(leagueId: $leagueId)
  }
`;

/**
 * __useGetUserTeamIdQuery__
 *
 * To run a query within a React component, call `useGetUserTeamIdQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetUserTeamIdQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetUserTeamIdQuery({
 *   variables: {
 *      leagueId: // value for 'leagueId'
 *   },
 * });
 */
export function useGetUserTeamIdQuery(
  baseOptions: Apollo.QueryHookOptions<
    GetUserTeamIdQuery,
    GetUserTeamIdQueryVariables
  > &
    (
      | { variables: GetUserTeamIdQueryVariables; skip?: boolean }
      | { skip: boolean }
    ),
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useQuery<GetUserTeamIdQuery, GetUserTeamIdQueryVariables>(
    GetUserTeamId,
    options,
  );
}
export function useGetUserTeamIdLazyQuery(
  baseOptions?: Apollo.LazyQueryHookOptions<
    GetUserTeamIdQuery,
    GetUserTeamIdQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useLazyQuery<GetUserTeamIdQuery, GetUserTeamIdQueryVariables>(
    GetUserTeamId,
    options,
  );
}
export function useGetUserTeamIdSuspenseQuery(
  baseOptions?:
    | Apollo.SkipToken
    | Apollo.SuspenseQueryHookOptions<
        GetUserTeamIdQuery,
        GetUserTeamIdQueryVariables
      >,
) {
  const options =
    baseOptions === Apollo.skipToken
      ? baseOptions
      : { ...defaultOptions, ...baseOptions };
  return Apollo.useSuspenseQuery<
    GetUserTeamIdQuery,
    GetUserTeamIdQueryVariables
  >(
    GetUserTeamId,
    options as
      | Apollo.SkipToken
      | Apollo.SuspenseQueryHookOptions<
          GetUserTeamIdQuery,
          GetUserTeamIdQueryVariables
        >,
  );
}
export type GetUserTeamIdQueryHookResult = ReturnType<
  typeof useGetUserTeamIdQuery
>;
export type GetUserTeamIdLazyQueryHookResult = ReturnType<
  typeof useGetUserTeamIdLazyQuery
>;
export type GetUserTeamIdSuspenseQueryHookResult = ReturnType<
  typeof useGetUserTeamIdSuspenseQuery
>;
export type GetUserTeamIdQueryResult = Apollo.QueryResult<
  GetUserTeamIdQuery,
  GetUserTeamIdQueryVariables
>;
export const GetMatchupById = gql`
  query GetMatchupById($id: Int!) {
    getMatchupById(id: $id) {
      ...Matchup
    }
  }
  ${MatchupFragmentDoc}
`;

/**
 * __useGetMatchupByIdQuery__
 *
 * To run a query within a React component, call `useGetMatchupByIdQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetMatchupByIdQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetMatchupByIdQuery({
 *   variables: {
 *      id: // value for 'id'
 *   },
 * });
 */
export function useGetMatchupByIdQuery(
  baseOptions: Apollo.QueryHookOptions<
    GetMatchupByIdQuery,
    GetMatchupByIdQueryVariables
  > &
    (
      | { variables: GetMatchupByIdQueryVariables; skip?: boolean }
      | { skip: boolean }
    ),
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useQuery<GetMatchupByIdQuery, GetMatchupByIdQueryVariables>(
    GetMatchupById,
    options,
  );
}
export function useGetMatchupByIdLazyQuery(
  baseOptions?: Apollo.LazyQueryHookOptions<
    GetMatchupByIdQuery,
    GetMatchupByIdQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useLazyQuery<GetMatchupByIdQuery, GetMatchupByIdQueryVariables>(
    GetMatchupById,
    options,
  );
}
export function useGetMatchupByIdSuspenseQuery(
  baseOptions?:
    | Apollo.SkipToken
    | Apollo.SuspenseQueryHookOptions<
        GetMatchupByIdQuery,
        GetMatchupByIdQueryVariables
      >,
) {
  const options =
    baseOptions === Apollo.skipToken
      ? baseOptions
      : { ...defaultOptions, ...baseOptions };
  return Apollo.useSuspenseQuery<
    GetMatchupByIdQuery,
    GetMatchupByIdQueryVariables
  >(
    GetMatchupById,
    options as
      | Apollo.SkipToken
      | Apollo.SuspenseQueryHookOptions<
          GetMatchupByIdQuery,
          GetMatchupByIdQueryVariables
        >,
  );
}
export type GetMatchupByIdQueryHookResult = ReturnType<
  typeof useGetMatchupByIdQuery
>;
export type GetMatchupByIdLazyQueryHookResult = ReturnType<
  typeof useGetMatchupByIdLazyQuery
>;
export type GetMatchupByIdSuspenseQueryHookResult = ReturnType<
  typeof useGetMatchupByIdSuspenseQuery
>;
export type GetMatchupByIdQueryResult = Apollo.QueryResult<
  GetMatchupByIdQuery,
  GetMatchupByIdQueryVariables
>;
export const GetMatchupsForLeague = gql`
  query GetMatchupsForLeague($leagueId: Int!, $weekNumber: Int) {
    getMatchupsForLeague(leagueId: $leagueId, weekNumber: $weekNumber) {
      ...Matchup
    }
  }
  ${MatchupFragmentDoc}
`;

/**
 * __useGetMatchupsForLeagueQuery__
 *
 * To run a query within a React component, call `useGetMatchupsForLeagueQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetMatchupsForLeagueQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetMatchupsForLeagueQuery({
 *   variables: {
 *      leagueId: // value for 'leagueId'
 *      weekNumber: // value for 'weekNumber'
 *   },
 * });
 */
export function useGetMatchupsForLeagueQuery(
  baseOptions: Apollo.QueryHookOptions<
    GetMatchupsForLeagueQuery,
    GetMatchupsForLeagueQueryVariables
  > &
    (
      | { variables: GetMatchupsForLeagueQueryVariables; skip?: boolean }
      | { skip: boolean }
    ),
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useQuery<
    GetMatchupsForLeagueQuery,
    GetMatchupsForLeagueQueryVariables
  >(GetMatchupsForLeague, options);
}
export function useGetMatchupsForLeagueLazyQuery(
  baseOptions?: Apollo.LazyQueryHookOptions<
    GetMatchupsForLeagueQuery,
    GetMatchupsForLeagueQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useLazyQuery<
    GetMatchupsForLeagueQuery,
    GetMatchupsForLeagueQueryVariables
  >(GetMatchupsForLeague, options);
}
export function useGetMatchupsForLeagueSuspenseQuery(
  baseOptions?:
    | Apollo.SkipToken
    | Apollo.SuspenseQueryHookOptions<
        GetMatchupsForLeagueQuery,
        GetMatchupsForLeagueQueryVariables
      >,
) {
  const options =
    baseOptions === Apollo.skipToken
      ? baseOptions
      : { ...defaultOptions, ...baseOptions };
  return Apollo.useSuspenseQuery<
    GetMatchupsForLeagueQuery,
    GetMatchupsForLeagueQueryVariables
  >(
    GetMatchupsForLeague,
    options as
      | Apollo.SkipToken
      | Apollo.SuspenseQueryHookOptions<
          GetMatchupsForLeagueQuery,
          GetMatchupsForLeagueQueryVariables
        >,
  );
}
export type GetMatchupsForLeagueQueryHookResult = ReturnType<
  typeof useGetMatchupsForLeagueQuery
>;
export type GetMatchupsForLeagueLazyQueryHookResult = ReturnType<
  typeof useGetMatchupsForLeagueLazyQuery
>;
export type GetMatchupsForLeagueSuspenseQueryHookResult = ReturnType<
  typeof useGetMatchupsForLeagueSuspenseQuery
>;
export type GetMatchupsForLeagueQueryResult = Apollo.QueryResult<
  GetMatchupsForLeagueQuery,
  GetMatchupsForLeagueQueryVariables
>;
export const GetCurrentWeekForLeague = gql`
  query GetCurrentWeekForLeague($leagueId: Int!) {
    getCurrentWeekForLeague(leagueId: $leagueId)
  }
`;

/**
 * __useGetCurrentWeekForLeagueQuery__
 *
 * To run a query within a React component, call `useGetCurrentWeekForLeagueQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetCurrentWeekForLeagueQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetCurrentWeekForLeagueQuery({
 *   variables: {
 *      leagueId: // value for 'leagueId'
 *   },
 * });
 */
export function useGetCurrentWeekForLeagueQuery(
  baseOptions: Apollo.QueryHookOptions<
    GetCurrentWeekForLeagueQuery,
    GetCurrentWeekForLeagueQueryVariables
  > &
    (
      | { variables: GetCurrentWeekForLeagueQueryVariables; skip?: boolean }
      | { skip: boolean }
    ),
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useQuery<
    GetCurrentWeekForLeagueQuery,
    GetCurrentWeekForLeagueQueryVariables
  >(GetCurrentWeekForLeague, options);
}
export function useGetCurrentWeekForLeagueLazyQuery(
  baseOptions?: Apollo.LazyQueryHookOptions<
    GetCurrentWeekForLeagueQuery,
    GetCurrentWeekForLeagueQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useLazyQuery<
    GetCurrentWeekForLeagueQuery,
    GetCurrentWeekForLeagueQueryVariables
  >(GetCurrentWeekForLeague, options);
}
export function useGetCurrentWeekForLeagueSuspenseQuery(
  baseOptions?:
    | Apollo.SkipToken
    | Apollo.SuspenseQueryHookOptions<
        GetCurrentWeekForLeagueQuery,
        GetCurrentWeekForLeagueQueryVariables
      >,
) {
  const options =
    baseOptions === Apollo.skipToken
      ? baseOptions
      : { ...defaultOptions, ...baseOptions };
  return Apollo.useSuspenseQuery<
    GetCurrentWeekForLeagueQuery,
    GetCurrentWeekForLeagueQueryVariables
  >(
    GetCurrentWeekForLeague,
    options as
      | Apollo.SkipToken
      | Apollo.SuspenseQueryHookOptions<
          GetCurrentWeekForLeagueQuery,
          GetCurrentWeekForLeagueQueryVariables
        >,
  );
}
export type GetCurrentWeekForLeagueQueryHookResult = ReturnType<
  typeof useGetCurrentWeekForLeagueQuery
>;
export type GetCurrentWeekForLeagueLazyQueryHookResult = ReturnType<
  typeof useGetCurrentWeekForLeagueLazyQuery
>;
export type GetCurrentWeekForLeagueSuspenseQueryHookResult = ReturnType<
  typeof useGetCurrentWeekForLeagueSuspenseQuery
>;
export type GetCurrentWeekForLeagueQueryResult = Apollo.QueryResult<
  GetCurrentWeekForLeagueQuery,
  GetCurrentWeekForLeagueQueryVariables
>;
export const GetMatchupsByWeek = gql`
  query GetMatchupsByWeek($leagueId: Int!, $weekNumber: Int!) {
    getMatchupsByWeek(leagueId: $leagueId, weekNumber: $weekNumber) {
      ...Matchup
    }
  }
  ${MatchupFragmentDoc}
`;

/**
 * __useGetMatchupsByWeekQuery__
 *
 * To run a query within a React component, call `useGetMatchupsByWeekQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetMatchupsByWeekQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetMatchupsByWeekQuery({
 *   variables: {
 *      leagueId: // value for 'leagueId'
 *      weekNumber: // value for 'weekNumber'
 *   },
 * });
 */
export function useGetMatchupsByWeekQuery(
  baseOptions: Apollo.QueryHookOptions<
    GetMatchupsByWeekQuery,
    GetMatchupsByWeekQueryVariables
  > &
    (
      | { variables: GetMatchupsByWeekQueryVariables; skip?: boolean }
      | { skip: boolean }
    ),
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useQuery<
    GetMatchupsByWeekQuery,
    GetMatchupsByWeekQueryVariables
  >(GetMatchupsByWeek, options);
}
export function useGetMatchupsByWeekLazyQuery(
  baseOptions?: Apollo.LazyQueryHookOptions<
    GetMatchupsByWeekQuery,
    GetMatchupsByWeekQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useLazyQuery<
    GetMatchupsByWeekQuery,
    GetMatchupsByWeekQueryVariables
  >(GetMatchupsByWeek, options);
}
export function useGetMatchupsByWeekSuspenseQuery(
  baseOptions?:
    | Apollo.SkipToken
    | Apollo.SuspenseQueryHookOptions<
        GetMatchupsByWeekQuery,
        GetMatchupsByWeekQueryVariables
      >,
) {
  const options =
    baseOptions === Apollo.skipToken
      ? baseOptions
      : { ...defaultOptions, ...baseOptions };
  return Apollo.useSuspenseQuery<
    GetMatchupsByWeekQuery,
    GetMatchupsByWeekQueryVariables
  >(
    GetMatchupsByWeek,
    options as
      | Apollo.SkipToken
      | Apollo.SuspenseQueryHookOptions<
          GetMatchupsByWeekQuery,
          GetMatchupsByWeekQueryVariables
        >,
  );
}
export type GetMatchupsByWeekQueryHookResult = ReturnType<
  typeof useGetMatchupsByWeekQuery
>;
export type GetMatchupsByWeekLazyQueryHookResult = ReturnType<
  typeof useGetMatchupsByWeekLazyQuery
>;
export type GetMatchupsByWeekSuspenseQueryHookResult = ReturnType<
  typeof useGetMatchupsByWeekSuspenseQuery
>;
export type GetMatchupsByWeekQueryResult = Apollo.QueryResult<
  GetMatchupsByWeekQuery,
  GetMatchupsByWeekQueryVariables
>;
export const GetLeagueStandings = gql`
  query GetLeagueStandings($leagueId: Int!) {
    getLeagueStandings(leagueId: $leagueId) {
      teamId
      teamName
      wins
      losses
      ties
      winPercentage
      pointsFor
      pointsAgainst
      avatarUrl
      primaryColor
      secondaryColor
      divisionId
    }
  }
`;

/**
 * __useGetLeagueStandingsQuery__
 *
 * To run a query within a React component, call `useGetLeagueStandingsQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetLeagueStandingsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetLeagueStandingsQuery({
 *   variables: {
 *      leagueId: // value for 'leagueId'
 *   },
 * });
 */
export function useGetLeagueStandingsQuery(
  baseOptions: Apollo.QueryHookOptions<
    GetLeagueStandingsQuery,
    GetLeagueStandingsQueryVariables
  > &
    (
      | { variables: GetLeagueStandingsQueryVariables; skip?: boolean }
      | { skip: boolean }
    ),
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useQuery<
    GetLeagueStandingsQuery,
    GetLeagueStandingsQueryVariables
  >(GetLeagueStandings, options);
}
export function useGetLeagueStandingsLazyQuery(
  baseOptions?: Apollo.LazyQueryHookOptions<
    GetLeagueStandingsQuery,
    GetLeagueStandingsQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useLazyQuery<
    GetLeagueStandingsQuery,
    GetLeagueStandingsQueryVariables
  >(GetLeagueStandings, options);
}
export function useGetLeagueStandingsSuspenseQuery(
  baseOptions?:
    | Apollo.SkipToken
    | Apollo.SuspenseQueryHookOptions<
        GetLeagueStandingsQuery,
        GetLeagueStandingsQueryVariables
      >,
) {
  const options =
    baseOptions === Apollo.skipToken
      ? baseOptions
      : { ...defaultOptions, ...baseOptions };
  return Apollo.useSuspenseQuery<
    GetLeagueStandingsQuery,
    GetLeagueStandingsQueryVariables
  >(
    GetLeagueStandings,
    options as
      | Apollo.SkipToken
      | Apollo.SuspenseQueryHookOptions<
          GetLeagueStandingsQuery,
          GetLeagueStandingsQueryVariables
        >,
  );
}
export type GetLeagueStandingsQueryHookResult = ReturnType<
  typeof useGetLeagueStandingsQuery
>;
export type GetLeagueStandingsLazyQueryHookResult = ReturnType<
  typeof useGetLeagueStandingsLazyQuery
>;
export type GetLeagueStandingsSuspenseQueryHookResult = ReturnType<
  typeof useGetLeagueStandingsSuspenseQuery
>;
export type GetLeagueStandingsQueryResult = Apollo.QueryResult<
  GetLeagueStandingsQuery,
  GetLeagueStandingsQueryVariables
>;
export const GetMatchupPlayers = gql`
  query GetMatchupPlayers($matchupId: Int!) {
    getMatchupPlayers(matchupId: $matchupId) {
      ...MatchupPlayer
    }
  }
  ${MatchupPlayerFragmentDoc}
`;

/**
 * __useGetMatchupPlayersQuery__
 *
 * To run a query within a React component, call `useGetMatchupPlayersQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetMatchupPlayersQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetMatchupPlayersQuery({
 *   variables: {
 *      matchupId: // value for 'matchupId'
 *   },
 * });
 */
export function useGetMatchupPlayersQuery(
  baseOptions: Apollo.QueryHookOptions<
    GetMatchupPlayersQuery,
    GetMatchupPlayersQueryVariables
  > &
    (
      | { variables: GetMatchupPlayersQueryVariables; skip?: boolean }
      | { skip: boolean }
    ),
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useQuery<
    GetMatchupPlayersQuery,
    GetMatchupPlayersQueryVariables
  >(GetMatchupPlayers, options);
}
export function useGetMatchupPlayersLazyQuery(
  baseOptions?: Apollo.LazyQueryHookOptions<
    GetMatchupPlayersQuery,
    GetMatchupPlayersQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useLazyQuery<
    GetMatchupPlayersQuery,
    GetMatchupPlayersQueryVariables
  >(GetMatchupPlayers, options);
}
export function useGetMatchupPlayersSuspenseQuery(
  baseOptions?:
    | Apollo.SkipToken
    | Apollo.SuspenseQueryHookOptions<
        GetMatchupPlayersQuery,
        GetMatchupPlayersQueryVariables
      >,
) {
  const options =
    baseOptions === Apollo.skipToken
      ? baseOptions
      : { ...defaultOptions, ...baseOptions };
  return Apollo.useSuspenseQuery<
    GetMatchupPlayersQuery,
    GetMatchupPlayersQueryVariables
  >(
    GetMatchupPlayers,
    options as
      | Apollo.SkipToken
      | Apollo.SuspenseQueryHookOptions<
          GetMatchupPlayersQuery,
          GetMatchupPlayersQueryVariables
        >,
  );
}
export type GetMatchupPlayersQueryHookResult = ReturnType<
  typeof useGetMatchupPlayersQuery
>;
export type GetMatchupPlayersLazyQueryHookResult = ReturnType<
  typeof useGetMatchupPlayersLazyQuery
>;
export type GetMatchupPlayersSuspenseQueryHookResult = ReturnType<
  typeof useGetMatchupPlayersSuspenseQuery
>;
export type GetMatchupPlayersQueryResult = Apollo.QueryResult<
  GetMatchupPlayersQuery,
  GetMatchupPlayersQueryVariables
>;
export const UpdateMatchupPlayerPosition = gql`
  mutation UpdateMatchupPlayerPosition(
    $matchupPlayerId: Int!
    $positionId: Int
  ) {
    updateMatchupPlayerPosition(
      matchupPlayerId: $matchupPlayerId
      positionId: $positionId
    ) {
      ...MatchupPlayer
    }
  }
  ${MatchupPlayerFragmentDoc}
`;
export type UpdateMatchupPlayerPositionMutationFn = MutationFunction<
  UpdateMatchupPlayerPositionMutation,
  UpdateMatchupPlayerPositionMutationVariables
>;

/**
 * __useUpdateMatchupPlayerPositionMutation__
 *
 * To run a mutation, you first call `useUpdateMatchupPlayerPositionMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUpdateMatchupPlayerPositionMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [updateMatchupPlayerPositionMutation, { data, loading, error }] = useUpdateMatchupPlayerPositionMutation({
 *   variables: {
 *      matchupPlayerId: // value for 'matchupPlayerId'
 *      positionId: // value for 'positionId'
 *   },
 * });
 */
export function useUpdateMatchupPlayerPositionMutation(
  baseOptions?: Apollo.MutationHookOptions<
    UpdateMatchupPlayerPositionMutation,
    UpdateMatchupPlayerPositionMutationVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useMutation<
    UpdateMatchupPlayerPositionMutation,
    UpdateMatchupPlayerPositionMutationVariables
  >(UpdateMatchupPlayerPosition, options);
}
export type UpdateMatchupPlayerPositionMutationHookResult = ReturnType<
  typeof useUpdateMatchupPlayerPositionMutation
>;
export type UpdateMatchupPlayerPositionMutationResult =
  Apollo.MutationResult<UpdateMatchupPlayerPositionMutation>;
export type UpdateMatchupPlayerPositionMutationOptions = BaseMutationOptions<
  UpdateMatchupPlayerPositionMutation,
  UpdateMatchupPlayerPositionMutationVariables
>;
export const SwapMatchupPlayerPositions = gql`
  mutation SwapMatchupPlayerPositions(
    $matchupPlayerIdA: Int!
    $positionIdA: Int
    $matchupPlayerIdB: Int!
    $positionIdB: Int
  ) {
    swapMatchupPlayerPositions(
      matchupPlayerIdA: $matchupPlayerIdA
      positionIdA: $positionIdA
      matchupPlayerIdB: $matchupPlayerIdB
      positionIdB: $positionIdB
    ) {
      ...MatchupPlayer
    }
  }
  ${MatchupPlayerFragmentDoc}
`;
export type SwapMatchupPlayerPositionsMutationFn = MutationFunction<
  SwapMatchupPlayerPositionsMutation,
  SwapMatchupPlayerPositionsMutationVariables
>;

/**
 * __useSwapMatchupPlayerPositionsMutation__
 *
 * To run a mutation, you first call `useSwapMatchupPlayerPositionsMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useSwapMatchupPlayerPositionsMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [swapMatchupPlayerPositionsMutation, { data, loading, error }] = useSwapMatchupPlayerPositionsMutation({
 *   variables: {
 *      matchupPlayerIdA: // value for 'matchupPlayerIdA'
 *      positionIdA: // value for 'positionIdA'
 *      matchupPlayerIdB: // value for 'matchupPlayerIdB'
 *      positionIdB: // value for 'positionIdB'
 *   },
 * });
 */
export function useSwapMatchupPlayerPositionsMutation(
  baseOptions?: Apollo.MutationHookOptions<
    SwapMatchupPlayerPositionsMutation,
    SwapMatchupPlayerPositionsMutationVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useMutation<
    SwapMatchupPlayerPositionsMutation,
    SwapMatchupPlayerPositionsMutationVariables
  >(SwapMatchupPlayerPositions, options);
}
export type SwapMatchupPlayerPositionsMutationHookResult = ReturnType<
  typeof useSwapMatchupPlayerPositionsMutation
>;
export type SwapMatchupPlayerPositionsMutationResult =
  Apollo.MutationResult<SwapMatchupPlayerPositionsMutation>;
export type SwapMatchupPlayerPositionsMutationOptions = BaseMutationOptions<
  SwapMatchupPlayerPositionsMutation,
  SwapMatchupPlayerPositionsMutationVariables
>;
export const GetMatchupHistory = gql`
  query GetMatchupHistory(
    $leagueId: Int!
    $season: Int
    $teamId: Int
    $status: MatchupStatus
    $limit: Int
  ) {
    getMatchupHistory(
      leagueId: $leagueId
      season: $season
      teamId: $teamId
      status: $status
      limit: $limit
    ) {
      ...Matchup
    }
  }
  ${MatchupFragmentDoc}
`;

/**
 * __useGetMatchupHistoryQuery__
 *
 * To run a query within a React component, call `useGetMatchupHistoryQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetMatchupHistoryQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetMatchupHistoryQuery({
 *   variables: {
 *      leagueId: // value for 'leagueId'
 *      season: // value for 'season'
 *      teamId: // value for 'teamId'
 *      status: // value for 'status'
 *      limit: // value for 'limit'
 *   },
 * });
 */
export function useGetMatchupHistoryQuery(
  baseOptions: Apollo.QueryHookOptions<
    GetMatchupHistoryQuery,
    GetMatchupHistoryQueryVariables
  > &
    (
      | { variables: GetMatchupHistoryQueryVariables; skip?: boolean }
      | { skip: boolean }
    ),
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useQuery<
    GetMatchupHistoryQuery,
    GetMatchupHistoryQueryVariables
  >(GetMatchupHistory, options);
}
export function useGetMatchupHistoryLazyQuery(
  baseOptions?: Apollo.LazyQueryHookOptions<
    GetMatchupHistoryQuery,
    GetMatchupHistoryQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useLazyQuery<
    GetMatchupHistoryQuery,
    GetMatchupHistoryQueryVariables
  >(GetMatchupHistory, options);
}
export function useGetMatchupHistorySuspenseQuery(
  baseOptions?:
    | Apollo.SkipToken
    | Apollo.SuspenseQueryHookOptions<
        GetMatchupHistoryQuery,
        GetMatchupHistoryQueryVariables
      >,
) {
  const options =
    baseOptions === Apollo.skipToken
      ? baseOptions
      : { ...defaultOptions, ...baseOptions };
  return Apollo.useSuspenseQuery<
    GetMatchupHistoryQuery,
    GetMatchupHistoryQueryVariables
  >(
    GetMatchupHistory,
    options as
      | Apollo.SkipToken
      | Apollo.SuspenseQueryHookOptions<
          GetMatchupHistoryQuery,
          GetMatchupHistoryQueryVariables
        >,
  );
}
export type GetMatchupHistoryQueryHookResult = ReturnType<
  typeof useGetMatchupHistoryQuery
>;
export type GetMatchupHistoryLazyQueryHookResult = ReturnType<
  typeof useGetMatchupHistoryLazyQuery
>;
export type GetMatchupHistorySuspenseQueryHookResult = ReturnType<
  typeof useGetMatchupHistorySuspenseQuery
>;
export type GetMatchupHistoryQueryResult = Apollo.QueryResult<
  GetMatchupHistoryQuery,
  GetMatchupHistoryQueryVariables
>;
export const GetLeagueTeamsForDm = gql`
  query GetLeagueTeamsForDM($leagueId: Int!) {
    leagueTeams(leagueId: $leagueId) {
      id
      name
      managerId
    }
  }
`;

/**
 * __useGetLeagueTeamsForDmQuery__
 *
 * To run a query within a React component, call `useGetLeagueTeamsForDmQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetLeagueTeamsForDmQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetLeagueTeamsForDmQuery({
 *   variables: {
 *      leagueId: // value for 'leagueId'
 *   },
 * });
 */
export function useGetLeagueTeamsForDmQuery(
  baseOptions: Apollo.QueryHookOptions<
    GetLeagueTeamsForDmQuery,
    GetLeagueTeamsForDmQueryVariables
  > &
    (
      | { variables: GetLeagueTeamsForDmQueryVariables; skip?: boolean }
      | { skip: boolean }
    ),
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useQuery<
    GetLeagueTeamsForDmQuery,
    GetLeagueTeamsForDmQueryVariables
  >(GetLeagueTeamsForDm, options);
}
export function useGetLeagueTeamsForDmLazyQuery(
  baseOptions?: Apollo.LazyQueryHookOptions<
    GetLeagueTeamsForDmQuery,
    GetLeagueTeamsForDmQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useLazyQuery<
    GetLeagueTeamsForDmQuery,
    GetLeagueTeamsForDmQueryVariables
  >(GetLeagueTeamsForDm, options);
}
export function useGetLeagueTeamsForDmSuspenseQuery(
  baseOptions?:
    | Apollo.SkipToken
    | Apollo.SuspenseQueryHookOptions<
        GetLeagueTeamsForDmQuery,
        GetLeagueTeamsForDmQueryVariables
      >,
) {
  const options =
    baseOptions === Apollo.skipToken
      ? baseOptions
      : { ...defaultOptions, ...baseOptions };
  return Apollo.useSuspenseQuery<
    GetLeagueTeamsForDmQuery,
    GetLeagueTeamsForDmQueryVariables
  >(
    GetLeagueTeamsForDm,
    options as
      | Apollo.SkipToken
      | Apollo.SuspenseQueryHookOptions<
          GetLeagueTeamsForDmQuery,
          GetLeagueTeamsForDmQueryVariables
        >,
  );
}
export type GetLeagueTeamsForDmQueryHookResult = ReturnType<
  typeof useGetLeagueTeamsForDmQuery
>;
export type GetLeagueTeamsForDmLazyQueryHookResult = ReturnType<
  typeof useGetLeagueTeamsForDmLazyQuery
>;
export type GetLeagueTeamsForDmSuspenseQueryHookResult = ReturnType<
  typeof useGetLeagueTeamsForDmSuspenseQuery
>;
export type GetLeagueTeamsForDmQueryResult = Apollo.QueryResult<
  GetLeagueTeamsForDmQuery,
  GetLeagueTeamsForDmQueryVariables
>;
export const GetLeagueMessages = gql`
  query GetLeagueMessages($leagueId: Int!, $limit: Int) {
    getLeagueMessages(leagueId: $leagueId, limit: $limit) {
      ...LeagueChatMessageFields
    }
  }
  ${LeagueChatMessageFieldsFragmentDoc}
`;

/**
 * __useGetLeagueMessagesQuery__
 *
 * To run a query within a React component, call `useGetLeagueMessagesQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetLeagueMessagesQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetLeagueMessagesQuery({
 *   variables: {
 *      leagueId: // value for 'leagueId'
 *      limit: // value for 'limit'
 *   },
 * });
 */
export function useGetLeagueMessagesQuery(
  baseOptions: Apollo.QueryHookOptions<
    GetLeagueMessagesQuery,
    GetLeagueMessagesQueryVariables
  > &
    (
      | { variables: GetLeagueMessagesQueryVariables; skip?: boolean }
      | { skip: boolean }
    ),
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useQuery<
    GetLeagueMessagesQuery,
    GetLeagueMessagesQueryVariables
  >(GetLeagueMessages, options);
}
export function useGetLeagueMessagesLazyQuery(
  baseOptions?: Apollo.LazyQueryHookOptions<
    GetLeagueMessagesQuery,
    GetLeagueMessagesQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useLazyQuery<
    GetLeagueMessagesQuery,
    GetLeagueMessagesQueryVariables
  >(GetLeagueMessages, options);
}
export function useGetLeagueMessagesSuspenseQuery(
  baseOptions?:
    | Apollo.SkipToken
    | Apollo.SuspenseQueryHookOptions<
        GetLeagueMessagesQuery,
        GetLeagueMessagesQueryVariables
      >,
) {
  const options =
    baseOptions === Apollo.skipToken
      ? baseOptions
      : { ...defaultOptions, ...baseOptions };
  return Apollo.useSuspenseQuery<
    GetLeagueMessagesQuery,
    GetLeagueMessagesQueryVariables
  >(
    GetLeagueMessages,
    options as
      | Apollo.SkipToken
      | Apollo.SuspenseQueryHookOptions<
          GetLeagueMessagesQuery,
          GetLeagueMessagesQueryVariables
        >,
  );
}
export type GetLeagueMessagesQueryHookResult = ReturnType<
  typeof useGetLeagueMessagesQuery
>;
export type GetLeagueMessagesLazyQueryHookResult = ReturnType<
  typeof useGetLeagueMessagesLazyQuery
>;
export type GetLeagueMessagesSuspenseQueryHookResult = ReturnType<
  typeof useGetLeagueMessagesSuspenseQuery
>;
export type GetLeagueMessagesQueryResult = Apollo.QueryResult<
  GetLeagueMessagesQuery,
  GetLeagueMessagesQueryVariables
>;
export const GetDirectMessages = gql`
  query GetDirectMessages($otherUserId: Int!, $limit: Int) {
    getDirectMessages(otherUserId: $otherUserId, limit: $limit) {
      ...DirectMessageFields
    }
  }
  ${DirectMessageFieldsFragmentDoc}
`;

/**
 * __useGetDirectMessagesQuery__
 *
 * To run a query within a React component, call `useGetDirectMessagesQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetDirectMessagesQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetDirectMessagesQuery({
 *   variables: {
 *      otherUserId: // value for 'otherUserId'
 *      limit: // value for 'limit'
 *   },
 * });
 */
export function useGetDirectMessagesQuery(
  baseOptions: Apollo.QueryHookOptions<
    GetDirectMessagesQuery,
    GetDirectMessagesQueryVariables
  > &
    (
      | { variables: GetDirectMessagesQueryVariables; skip?: boolean }
      | { skip: boolean }
    ),
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useQuery<
    GetDirectMessagesQuery,
    GetDirectMessagesQueryVariables
  >(GetDirectMessages, options);
}
export function useGetDirectMessagesLazyQuery(
  baseOptions?: Apollo.LazyQueryHookOptions<
    GetDirectMessagesQuery,
    GetDirectMessagesQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useLazyQuery<
    GetDirectMessagesQuery,
    GetDirectMessagesQueryVariables
  >(GetDirectMessages, options);
}
export function useGetDirectMessagesSuspenseQuery(
  baseOptions?:
    | Apollo.SkipToken
    | Apollo.SuspenseQueryHookOptions<
        GetDirectMessagesQuery,
        GetDirectMessagesQueryVariables
      >,
) {
  const options =
    baseOptions === Apollo.skipToken
      ? baseOptions
      : { ...defaultOptions, ...baseOptions };
  return Apollo.useSuspenseQuery<
    GetDirectMessagesQuery,
    GetDirectMessagesQueryVariables
  >(
    GetDirectMessages,
    options as
      | Apollo.SkipToken
      | Apollo.SuspenseQueryHookOptions<
          GetDirectMessagesQuery,
          GetDirectMessagesQueryVariables
        >,
  );
}
export type GetDirectMessagesQueryHookResult = ReturnType<
  typeof useGetDirectMessagesQuery
>;
export type GetDirectMessagesLazyQueryHookResult = ReturnType<
  typeof useGetDirectMessagesLazyQuery
>;
export type GetDirectMessagesSuspenseQueryHookResult = ReturnType<
  typeof useGetDirectMessagesSuspenseQuery
>;
export type GetDirectMessagesQueryResult = Apollo.QueryResult<
  GetDirectMessagesQuery,
  GetDirectMessagesQueryVariables
>;
export const SendLeagueMessage = gql`
  mutation SendLeagueMessage(
    $leagueId: Int!
    $messageText: String!
    $gifUrl: String
  ) {
    sendLeagueMessage(
      leagueId: $leagueId
      messageText: $messageText
      gifUrl: $gifUrl
    ) {
      ...LeagueChatMessageFields
    }
  }
  ${LeagueChatMessageFieldsFragmentDoc}
`;
export type SendLeagueMessageMutationFn = MutationFunction<
  SendLeagueMessageMutation,
  SendLeagueMessageMutationVariables
>;

/**
 * __useSendLeagueMessageMutation__
 *
 * To run a mutation, you first call `useSendLeagueMessageMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useSendLeagueMessageMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [sendLeagueMessageMutation, { data, loading, error }] = useSendLeagueMessageMutation({
 *   variables: {
 *      leagueId: // value for 'leagueId'
 *      messageText: // value for 'messageText'
 *      gifUrl: // value for 'gifUrl'
 *   },
 * });
 */
export function useSendLeagueMessageMutation(
  baseOptions?: Apollo.MutationHookOptions<
    SendLeagueMessageMutation,
    SendLeagueMessageMutationVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useMutation<
    SendLeagueMessageMutation,
    SendLeagueMessageMutationVariables
  >(SendLeagueMessage, options);
}
export type SendLeagueMessageMutationHookResult = ReturnType<
  typeof useSendLeagueMessageMutation
>;
export type SendLeagueMessageMutationResult =
  Apollo.MutationResult<SendLeagueMessageMutation>;
export type SendLeagueMessageMutationOptions = BaseMutationOptions<
  SendLeagueMessageMutation,
  SendLeagueMessageMutationVariables
>;
export const SendDirectMessage = gql`
  mutation SendDirectMessage(
    $toUserId: Int!
    $messageText: String!
    $leagueId: Int
  ) {
    sendDirectMessage(
      toUserId: $toUserId
      messageText: $messageText
      leagueId: $leagueId
    ) {
      ...DirectMessageFields
    }
  }
  ${DirectMessageFieldsFragmentDoc}
`;
export type SendDirectMessageMutationFn = MutationFunction<
  SendDirectMessageMutation,
  SendDirectMessageMutationVariables
>;

/**
 * __useSendDirectMessageMutation__
 *
 * To run a mutation, you first call `useSendDirectMessageMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useSendDirectMessageMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [sendDirectMessageMutation, { data, loading, error }] = useSendDirectMessageMutation({
 *   variables: {
 *      toUserId: // value for 'toUserId'
 *      messageText: // value for 'messageText'
 *      leagueId: // value for 'leagueId'
 *   },
 * });
 */
export function useSendDirectMessageMutation(
  baseOptions?: Apollo.MutationHookOptions<
    SendDirectMessageMutation,
    SendDirectMessageMutationVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useMutation<
    SendDirectMessageMutation,
    SendDirectMessageMutationVariables
  >(SendDirectMessage, options);
}
export type SendDirectMessageMutationHookResult = ReturnType<
  typeof useSendDirectMessageMutation
>;
export type SendDirectMessageMutationResult =
  Apollo.MutationResult<SendDirectMessageMutation>;
export type SendDirectMessageMutationOptions = BaseMutationOptions<
  SendDirectMessageMutation,
  SendDirectMessageMutationVariables
>;
export const GetUserNotificationPreferences = gql`
  query GetUserNotificationPreferences {
    getUserNotificationPreferences {
      ...NotificationPreference
    }
  }
  ${NotificationPreferenceFragmentDoc}
`;

/**
 * __useGetUserNotificationPreferencesQuery__
 *
 * To run a query within a React component, call `useGetUserNotificationPreferencesQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetUserNotificationPreferencesQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetUserNotificationPreferencesQuery({
 *   variables: {
 *   },
 * });
 */
export function useGetUserNotificationPreferencesQuery(
  baseOptions?: Apollo.QueryHookOptions<
    GetUserNotificationPreferencesQuery,
    GetUserNotificationPreferencesQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useQuery<
    GetUserNotificationPreferencesQuery,
    GetUserNotificationPreferencesQueryVariables
  >(GetUserNotificationPreferences, options);
}
export function useGetUserNotificationPreferencesLazyQuery(
  baseOptions?: Apollo.LazyQueryHookOptions<
    GetUserNotificationPreferencesQuery,
    GetUserNotificationPreferencesQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useLazyQuery<
    GetUserNotificationPreferencesQuery,
    GetUserNotificationPreferencesQueryVariables
  >(GetUserNotificationPreferences, options);
}
export function useGetUserNotificationPreferencesSuspenseQuery(
  baseOptions?:
    | Apollo.SkipToken
    | Apollo.SuspenseQueryHookOptions<
        GetUserNotificationPreferencesQuery,
        GetUserNotificationPreferencesQueryVariables
      >,
) {
  const options =
    baseOptions === Apollo.skipToken
      ? baseOptions
      : { ...defaultOptions, ...baseOptions };
  return Apollo.useSuspenseQuery<
    GetUserNotificationPreferencesQuery,
    GetUserNotificationPreferencesQueryVariables
  >(
    GetUserNotificationPreferences,
    options as
      | Apollo.SkipToken
      | Apollo.SuspenseQueryHookOptions<
          GetUserNotificationPreferencesQuery,
          GetUserNotificationPreferencesQueryVariables
        >,
  );
}
export type GetUserNotificationPreferencesQueryHookResult = ReturnType<
  typeof useGetUserNotificationPreferencesQuery
>;
export type GetUserNotificationPreferencesLazyQueryHookResult = ReturnType<
  typeof useGetUserNotificationPreferencesLazyQuery
>;
export type GetUserNotificationPreferencesSuspenseQueryHookResult = ReturnType<
  typeof useGetUserNotificationPreferencesSuspenseQuery
>;
export type GetUserNotificationPreferencesQueryResult = Apollo.QueryResult<
  GetUserNotificationPreferencesQuery,
  GetUserNotificationPreferencesQueryVariables
>;
export const GetNotificationHistory = gql`
  query GetNotificationHistory($limit: Int, $offset: Int) {
    getNotificationHistory(limit: $limit, offset: $offset) {
      ...NotificationHistoryItem
    }
  }
  ${NotificationHistoryItemFragmentDoc}
`;

/**
 * __useGetNotificationHistoryQuery__
 *
 * To run a query within a React component, call `useGetNotificationHistoryQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetNotificationHistoryQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetNotificationHistoryQuery({
 *   variables: {
 *      limit: // value for 'limit'
 *      offset: // value for 'offset'
 *   },
 * });
 */
export function useGetNotificationHistoryQuery(
  baseOptions?: Apollo.QueryHookOptions<
    GetNotificationHistoryQuery,
    GetNotificationHistoryQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useQuery<
    GetNotificationHistoryQuery,
    GetNotificationHistoryQueryVariables
  >(GetNotificationHistory, options);
}
export function useGetNotificationHistoryLazyQuery(
  baseOptions?: Apollo.LazyQueryHookOptions<
    GetNotificationHistoryQuery,
    GetNotificationHistoryQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useLazyQuery<
    GetNotificationHistoryQuery,
    GetNotificationHistoryQueryVariables
  >(GetNotificationHistory, options);
}
export function useGetNotificationHistorySuspenseQuery(
  baseOptions?:
    | Apollo.SkipToken
    | Apollo.SuspenseQueryHookOptions<
        GetNotificationHistoryQuery,
        GetNotificationHistoryQueryVariables
      >,
) {
  const options =
    baseOptions === Apollo.skipToken
      ? baseOptions
      : { ...defaultOptions, ...baseOptions };
  return Apollo.useSuspenseQuery<
    GetNotificationHistoryQuery,
    GetNotificationHistoryQueryVariables
  >(
    GetNotificationHistory,
    options as
      | Apollo.SkipToken
      | Apollo.SuspenseQueryHookOptions<
          GetNotificationHistoryQuery,
          GetNotificationHistoryQueryVariables
        >,
  );
}
export type GetNotificationHistoryQueryHookResult = ReturnType<
  typeof useGetNotificationHistoryQuery
>;
export type GetNotificationHistoryLazyQueryHookResult = ReturnType<
  typeof useGetNotificationHistoryLazyQuery
>;
export type GetNotificationHistorySuspenseQueryHookResult = ReturnType<
  typeof useGetNotificationHistorySuspenseQuery
>;
export type GetNotificationHistoryQueryResult = Apollo.QueryResult<
  GetNotificationHistoryQuery,
  GetNotificationHistoryQueryVariables
>;
export const GetUnreadNotificationCount = gql`
  query GetUnreadNotificationCount {
    getUnreadNotificationCount
  }
`;

/**
 * __useGetUnreadNotificationCountQuery__
 *
 * To run a query within a React component, call `useGetUnreadNotificationCountQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetUnreadNotificationCountQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetUnreadNotificationCountQuery({
 *   variables: {
 *   },
 * });
 */
export function useGetUnreadNotificationCountQuery(
  baseOptions?: Apollo.QueryHookOptions<
    GetUnreadNotificationCountQuery,
    GetUnreadNotificationCountQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useQuery<
    GetUnreadNotificationCountQuery,
    GetUnreadNotificationCountQueryVariables
  >(GetUnreadNotificationCount, options);
}
export function useGetUnreadNotificationCountLazyQuery(
  baseOptions?: Apollo.LazyQueryHookOptions<
    GetUnreadNotificationCountQuery,
    GetUnreadNotificationCountQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useLazyQuery<
    GetUnreadNotificationCountQuery,
    GetUnreadNotificationCountQueryVariables
  >(GetUnreadNotificationCount, options);
}
export function useGetUnreadNotificationCountSuspenseQuery(
  baseOptions?:
    | Apollo.SkipToken
    | Apollo.SuspenseQueryHookOptions<
        GetUnreadNotificationCountQuery,
        GetUnreadNotificationCountQueryVariables
      >,
) {
  const options =
    baseOptions === Apollo.skipToken
      ? baseOptions
      : { ...defaultOptions, ...baseOptions };
  return Apollo.useSuspenseQuery<
    GetUnreadNotificationCountQuery,
    GetUnreadNotificationCountQueryVariables
  >(
    GetUnreadNotificationCount,
    options as
      | Apollo.SkipToken
      | Apollo.SuspenseQueryHookOptions<
          GetUnreadNotificationCountQuery,
          GetUnreadNotificationCountQueryVariables
        >,
  );
}
export type GetUnreadNotificationCountQueryHookResult = ReturnType<
  typeof useGetUnreadNotificationCountQuery
>;
export type GetUnreadNotificationCountLazyQueryHookResult = ReturnType<
  typeof useGetUnreadNotificationCountLazyQuery
>;
export type GetUnreadNotificationCountSuspenseQueryHookResult = ReturnType<
  typeof useGetUnreadNotificationCountSuspenseQuery
>;
export type GetUnreadNotificationCountQueryResult = Apollo.QueryResult<
  GetUnreadNotificationCountQuery,
  GetUnreadNotificationCountQueryVariables
>;
export const GetUserDeviceTokens = gql`
  query GetUserDeviceTokens {
    getUserDeviceTokens {
      ...DeviceToken
    }
  }
  ${DeviceTokenFragmentDoc}
`;

/**
 * __useGetUserDeviceTokensQuery__
 *
 * To run a query within a React component, call `useGetUserDeviceTokensQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetUserDeviceTokensQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetUserDeviceTokensQuery({
 *   variables: {
 *   },
 * });
 */
export function useGetUserDeviceTokensQuery(
  baseOptions?: Apollo.QueryHookOptions<
    GetUserDeviceTokensQuery,
    GetUserDeviceTokensQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useQuery<
    GetUserDeviceTokensQuery,
    GetUserDeviceTokensQueryVariables
  >(GetUserDeviceTokens, options);
}
export function useGetUserDeviceTokensLazyQuery(
  baseOptions?: Apollo.LazyQueryHookOptions<
    GetUserDeviceTokensQuery,
    GetUserDeviceTokensQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useLazyQuery<
    GetUserDeviceTokensQuery,
    GetUserDeviceTokensQueryVariables
  >(GetUserDeviceTokens, options);
}
export function useGetUserDeviceTokensSuspenseQuery(
  baseOptions?:
    | Apollo.SkipToken
    | Apollo.SuspenseQueryHookOptions<
        GetUserDeviceTokensQuery,
        GetUserDeviceTokensQueryVariables
      >,
) {
  const options =
    baseOptions === Apollo.skipToken
      ? baseOptions
      : { ...defaultOptions, ...baseOptions };
  return Apollo.useSuspenseQuery<
    GetUserDeviceTokensQuery,
    GetUserDeviceTokensQueryVariables
  >(
    GetUserDeviceTokens,
    options as
      | Apollo.SkipToken
      | Apollo.SuspenseQueryHookOptions<
          GetUserDeviceTokensQuery,
          GetUserDeviceTokensQueryVariables
        >,
  );
}
export type GetUserDeviceTokensQueryHookResult = ReturnType<
  typeof useGetUserDeviceTokensQuery
>;
export type GetUserDeviceTokensLazyQueryHookResult = ReturnType<
  typeof useGetUserDeviceTokensLazyQuery
>;
export type GetUserDeviceTokensSuspenseQueryHookResult = ReturnType<
  typeof useGetUserDeviceTokensSuspenseQuery
>;
export type GetUserDeviceTokensQueryResult = Apollo.QueryResult<
  GetUserDeviceTokensQuery,
  GetUserDeviceTokensQueryVariables
>;
export const UpdateNotificationPreferences = gql`
  mutation UpdateNotificationPreferences($input: NotificationPreferenceInput!) {
    updateNotificationPreferences(input: $input) {
      ...NotificationPreference
    }
  }
  ${NotificationPreferenceFragmentDoc}
`;
export type UpdateNotificationPreferencesMutationFn = MutationFunction<
  UpdateNotificationPreferencesMutation,
  UpdateNotificationPreferencesMutationVariables
>;

/**
 * __useUpdateNotificationPreferencesMutation__
 *
 * To run a mutation, you first call `useUpdateNotificationPreferencesMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUpdateNotificationPreferencesMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [updateNotificationPreferencesMutation, { data, loading, error }] = useUpdateNotificationPreferencesMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
export function useUpdateNotificationPreferencesMutation(
  baseOptions?: Apollo.MutationHookOptions<
    UpdateNotificationPreferencesMutation,
    UpdateNotificationPreferencesMutationVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useMutation<
    UpdateNotificationPreferencesMutation,
    UpdateNotificationPreferencesMutationVariables
  >(UpdateNotificationPreferences, options);
}
export type UpdateNotificationPreferencesMutationHookResult = ReturnType<
  typeof useUpdateNotificationPreferencesMutation
>;
export type UpdateNotificationPreferencesMutationResult =
  Apollo.MutationResult<UpdateNotificationPreferencesMutation>;
export type UpdateNotificationPreferencesMutationOptions = BaseMutationOptions<
  UpdateNotificationPreferencesMutation,
  UpdateNotificationPreferencesMutationVariables
>;
export const RegisterDeviceToken = gql`
  mutation RegisterDeviceToken($input: DeviceTokenInput!) {
    registerDeviceToken(input: $input) {
      ...DeviceToken
    }
  }
  ${DeviceTokenFragmentDoc}
`;
export type RegisterDeviceTokenMutationFn = MutationFunction<
  RegisterDeviceTokenMutation,
  RegisterDeviceTokenMutationVariables
>;

/**
 * __useRegisterDeviceTokenMutation__
 *
 * To run a mutation, you first call `useRegisterDeviceTokenMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useRegisterDeviceTokenMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [registerDeviceTokenMutation, { data, loading, error }] = useRegisterDeviceTokenMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
export function useRegisterDeviceTokenMutation(
  baseOptions?: Apollo.MutationHookOptions<
    RegisterDeviceTokenMutation,
    RegisterDeviceTokenMutationVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useMutation<
    RegisterDeviceTokenMutation,
    RegisterDeviceTokenMutationVariables
  >(RegisterDeviceToken, options);
}
export type RegisterDeviceTokenMutationHookResult = ReturnType<
  typeof useRegisterDeviceTokenMutation
>;
export type RegisterDeviceTokenMutationResult =
  Apollo.MutationResult<RegisterDeviceTokenMutation>;
export type RegisterDeviceTokenMutationOptions = BaseMutationOptions<
  RegisterDeviceTokenMutation,
  RegisterDeviceTokenMutationVariables
>;
export const DisableDeviceToken = gql`
  mutation DisableDeviceToken($deviceToken: String!) {
    disableDeviceToken(deviceToken: $deviceToken)
  }
`;
export type DisableDeviceTokenMutationFn = MutationFunction<
  DisableDeviceTokenMutation,
  DisableDeviceTokenMutationVariables
>;

/**
 * __useDisableDeviceTokenMutation__
 *
 * To run a mutation, you first call `useDisableDeviceTokenMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useDisableDeviceTokenMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [disableDeviceTokenMutation, { data, loading, error }] = useDisableDeviceTokenMutation({
 *   variables: {
 *      deviceToken: // value for 'deviceToken'
 *   },
 * });
 */
export function useDisableDeviceTokenMutation(
  baseOptions?: Apollo.MutationHookOptions<
    DisableDeviceTokenMutation,
    DisableDeviceTokenMutationVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useMutation<
    DisableDeviceTokenMutation,
    DisableDeviceTokenMutationVariables
  >(DisableDeviceToken, options);
}
export type DisableDeviceTokenMutationHookResult = ReturnType<
  typeof useDisableDeviceTokenMutation
>;
export type DisableDeviceTokenMutationResult =
  Apollo.MutationResult<DisableDeviceTokenMutation>;
export type DisableDeviceTokenMutationOptions = BaseMutationOptions<
  DisableDeviceTokenMutation,
  DisableDeviceTokenMutationVariables
>;
export const MarkNotificationAsRead = gql`
  mutation MarkNotificationAsRead($notificationId: Int!) {
    markNotificationAsRead(notificationId: $notificationId)
  }
`;
export type MarkNotificationAsReadMutationFn = MutationFunction<
  MarkNotificationAsReadMutation,
  MarkNotificationAsReadMutationVariables
>;

/**
 * __useMarkNotificationAsReadMutation__
 *
 * To run a mutation, you first call `useMarkNotificationAsReadMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useMarkNotificationAsReadMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [markNotificationAsReadMutation, { data, loading, error }] = useMarkNotificationAsReadMutation({
 *   variables: {
 *      notificationId: // value for 'notificationId'
 *   },
 * });
 */
export function useMarkNotificationAsReadMutation(
  baseOptions?: Apollo.MutationHookOptions<
    MarkNotificationAsReadMutation,
    MarkNotificationAsReadMutationVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useMutation<
    MarkNotificationAsReadMutation,
    MarkNotificationAsReadMutationVariables
  >(MarkNotificationAsRead, options);
}
export type MarkNotificationAsReadMutationHookResult = ReturnType<
  typeof useMarkNotificationAsReadMutation
>;
export type MarkNotificationAsReadMutationResult =
  Apollo.MutationResult<MarkNotificationAsReadMutation>;
export type MarkNotificationAsReadMutationOptions = BaseMutationOptions<
  MarkNotificationAsReadMutation,
  MarkNotificationAsReadMutationVariables
>;
export const MarkAllNotificationsAsRead = gql`
  mutation MarkAllNotificationsAsRead {
    markAllNotificationsAsRead
  }
`;
export type MarkAllNotificationsAsReadMutationFn = MutationFunction<
  MarkAllNotificationsAsReadMutation,
  MarkAllNotificationsAsReadMutationVariables
>;

/**
 * __useMarkAllNotificationsAsReadMutation__
 *
 * To run a mutation, you first call `useMarkAllNotificationsAsReadMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useMarkAllNotificationsAsReadMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [markAllNotificationsAsReadMutation, { data, loading, error }] = useMarkAllNotificationsAsReadMutation({
 *   variables: {
 *   },
 * });
 */
export function useMarkAllNotificationsAsReadMutation(
  baseOptions?: Apollo.MutationHookOptions<
    MarkAllNotificationsAsReadMutation,
    MarkAllNotificationsAsReadMutationVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useMutation<
    MarkAllNotificationsAsReadMutation,
    MarkAllNotificationsAsReadMutationVariables
  >(MarkAllNotificationsAsRead, options);
}
export type MarkAllNotificationsAsReadMutationHookResult = ReturnType<
  typeof useMarkAllNotificationsAsReadMutation
>;
export type MarkAllNotificationsAsReadMutationResult =
  Apollo.MutationResult<MarkAllNotificationsAsReadMutation>;
export type MarkAllNotificationsAsReadMutationOptions = BaseMutationOptions<
  MarkAllNotificationsAsReadMutation,
  MarkAllNotificationsAsReadMutationVariables
>;
export const GetFreeAgentPlayers = gql`
  query GetFreeAgentPlayers($leagueId: Int!) {
    freeAgents(leagueId: $leagueId) {
      id
      firstName
      lastName
      eligiblePositions
      scoring {
        hitterAvgPointsPerGame
        pitchingAvgPointsPerGame
        avgPointsPerGame
        careerGames
      }
    }
  }
`;

/**
 * __useGetFreeAgentPlayersQuery__
 *
 * To run a query within a React component, call `useGetFreeAgentPlayersQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetFreeAgentPlayersQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetFreeAgentPlayersQuery({
 *   variables: {
 *      leagueId: // value for 'leagueId'
 *   },
 * });
 */
export function useGetFreeAgentPlayersQuery(
  baseOptions: Apollo.QueryHookOptions<
    GetFreeAgentPlayersQuery,
    GetFreeAgentPlayersQueryVariables
  > &
    (
      | { variables: GetFreeAgentPlayersQueryVariables; skip?: boolean }
      | { skip: boolean }
    ),
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useQuery<
    GetFreeAgentPlayersQuery,
    GetFreeAgentPlayersQueryVariables
  >(GetFreeAgentPlayers, options);
}
export function useGetFreeAgentPlayersLazyQuery(
  baseOptions?: Apollo.LazyQueryHookOptions<
    GetFreeAgentPlayersQuery,
    GetFreeAgentPlayersQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useLazyQuery<
    GetFreeAgentPlayersQuery,
    GetFreeAgentPlayersQueryVariables
  >(GetFreeAgentPlayers, options);
}
export function useGetFreeAgentPlayersSuspenseQuery(
  baseOptions?:
    | Apollo.SkipToken
    | Apollo.SuspenseQueryHookOptions<
        GetFreeAgentPlayersQuery,
        GetFreeAgentPlayersQueryVariables
      >,
) {
  const options =
    baseOptions === Apollo.skipToken
      ? baseOptions
      : { ...defaultOptions, ...baseOptions };
  return Apollo.useSuspenseQuery<
    GetFreeAgentPlayersQuery,
    GetFreeAgentPlayersQueryVariables
  >(
    GetFreeAgentPlayers,
    options as
      | Apollo.SkipToken
      | Apollo.SuspenseQueryHookOptions<
          GetFreeAgentPlayersQuery,
          GetFreeAgentPlayersQueryVariables
        >,
  );
}
export type GetFreeAgentPlayersQueryHookResult = ReturnType<
  typeof useGetFreeAgentPlayersQuery
>;
export type GetFreeAgentPlayersLazyQueryHookResult = ReturnType<
  typeof useGetFreeAgentPlayersLazyQuery
>;
export type GetFreeAgentPlayersSuspenseQueryHookResult = ReturnType<
  typeof useGetFreeAgentPlayersSuspenseQuery
>;
export type GetFreeAgentPlayersQueryResult = Apollo.QueryResult<
  GetFreeAgentPlayersQuery,
  GetFreeAgentPlayersQueryVariables
>;
export const ClaimFreeAgent = gql`
  mutation ClaimFreeAgent(
    $leagueId: Int!
    $playerId: Int!
    $dropPlayerId: Int
    $faabBid: Int
  ) {
    claimFreeAgent(
      leagueId: $leagueId
      playerId: $playerId
      dropPlayerId: $dropPlayerId
      faabBid: $faabBid
    ) {
      id
      leagueId
      teamId
      playerId
      dropPlayerId
      faabBid
      status
      errorMessage
      createdAt
    }
  }
`;
export type ClaimFreeAgentMutationFn = MutationFunction<
  ClaimFreeAgentMutation,
  ClaimFreeAgentMutationVariables
>;

/**
 * __useClaimFreeAgentMutation__
 *
 * To run a mutation, you first call `useClaimFreeAgentMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useClaimFreeAgentMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [claimFreeAgentMutation, { data, loading, error }] = useClaimFreeAgentMutation({
 *   variables: {
 *      leagueId: // value for 'leagueId'
 *      playerId: // value for 'playerId'
 *      dropPlayerId: // value for 'dropPlayerId'
 *      faabBid: // value for 'faabBid'
 *   },
 * });
 */
export function useClaimFreeAgentMutation(
  baseOptions?: Apollo.MutationHookOptions<
    ClaimFreeAgentMutation,
    ClaimFreeAgentMutationVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useMutation<
    ClaimFreeAgentMutation,
    ClaimFreeAgentMutationVariables
  >(ClaimFreeAgent, options);
}
export type ClaimFreeAgentMutationHookResult = ReturnType<
  typeof useClaimFreeAgentMutation
>;
export type ClaimFreeAgentMutationResult =
  Apollo.MutationResult<ClaimFreeAgentMutation>;
export type ClaimFreeAgentMutationOptions = BaseMutationOptions<
  ClaimFreeAgentMutation,
  ClaimFreeAgentMutationVariables
>;
export const GetLeagueScoringProfile = gql`
  query GetLeagueScoringProfile($leagueId: Int!) {
    leagueScoringProfile(leagueId: $leagueId) {
      profileId
      profileName
      stats {
        multiplier
        defaultMultiplier
        isOverride
        isEnabled
        definition {
          id
          statKey
          statGroup
          displayName
          description
          sourceColumn
          defaultMultiplier
          minMultiplier
          maxMultiplier
          stepSize
          isRequired
          enforcePositive
          enforceNegative
        }
      }
      multiplierGroups {
        group
        values {
          statKey
          sourceColumn
          multiplier
        }
      }
    }
  }
`;

/**
 * __useGetLeagueScoringProfileQuery__
 *
 * To run a query within a React component, call `useGetLeagueScoringProfileQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetLeagueScoringProfileQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetLeagueScoringProfileQuery({
 *   variables: {
 *      leagueId: // value for 'leagueId'
 *   },
 * });
 */
export function useGetLeagueScoringProfileQuery(
  baseOptions: Apollo.QueryHookOptions<
    GetLeagueScoringProfileQuery,
    GetLeagueScoringProfileQueryVariables
  > &
    (
      | { variables: GetLeagueScoringProfileQueryVariables; skip?: boolean }
      | { skip: boolean }
    ),
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useQuery<
    GetLeagueScoringProfileQuery,
    GetLeagueScoringProfileQueryVariables
  >(GetLeagueScoringProfile, options);
}
export function useGetLeagueScoringProfileLazyQuery(
  baseOptions?: Apollo.LazyQueryHookOptions<
    GetLeagueScoringProfileQuery,
    GetLeagueScoringProfileQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useLazyQuery<
    GetLeagueScoringProfileQuery,
    GetLeagueScoringProfileQueryVariables
  >(GetLeagueScoringProfile, options);
}
export function useGetLeagueScoringProfileSuspenseQuery(
  baseOptions?:
    | Apollo.SkipToken
    | Apollo.SuspenseQueryHookOptions<
        GetLeagueScoringProfileQuery,
        GetLeagueScoringProfileQueryVariables
      >,
) {
  const options =
    baseOptions === Apollo.skipToken
      ? baseOptions
      : { ...defaultOptions, ...baseOptions };
  return Apollo.useSuspenseQuery<
    GetLeagueScoringProfileQuery,
    GetLeagueScoringProfileQueryVariables
  >(
    GetLeagueScoringProfile,
    options as
      | Apollo.SkipToken
      | Apollo.SuspenseQueryHookOptions<
          GetLeagueScoringProfileQuery,
          GetLeagueScoringProfileQueryVariables
        >,
  );
}
export type GetLeagueScoringProfileQueryHookResult = ReturnType<
  typeof useGetLeagueScoringProfileQuery
>;
export type GetLeagueScoringProfileLazyQueryHookResult = ReturnType<
  typeof useGetLeagueScoringProfileLazyQuery
>;
export type GetLeagueScoringProfileSuspenseQueryHookResult = ReturnType<
  typeof useGetLeagueScoringProfileSuspenseQuery
>;
export type GetLeagueScoringProfileQueryResult = Apollo.QueryResult<
  GetLeagueScoringProfileQuery,
  GetLeagueScoringProfileQueryVariables
>;
export const GetDefaultScoringProfile = gql`
  query GetDefaultScoringProfile {
    defaultScoringProfile {
      profileName
      stats {
        multiplier
        defaultMultiplier
        isOverride
        isEnabled
        definition {
          id
          statKey
          statGroup
          displayName
          description
          sourceColumn
          defaultMultiplier
          minMultiplier
          maxMultiplier
          stepSize
          isRequired
          enforcePositive
          enforceNegative
        }
      }
      multiplierGroups {
        group
        values {
          statKey
          sourceColumn
          multiplier
        }
      }
    }
  }
`;

/**
 * __useGetDefaultScoringProfileQuery__
 *
 * To run a query within a React component, call `useGetDefaultScoringProfileQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetDefaultScoringProfileQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetDefaultScoringProfileQuery({
 *   variables: {
 *   },
 * });
 */
export function useGetDefaultScoringProfileQuery(
  baseOptions?: Apollo.QueryHookOptions<
    GetDefaultScoringProfileQuery,
    GetDefaultScoringProfileQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useQuery<
    GetDefaultScoringProfileQuery,
    GetDefaultScoringProfileQueryVariables
  >(GetDefaultScoringProfile, options);
}
export function useGetDefaultScoringProfileLazyQuery(
  baseOptions?: Apollo.LazyQueryHookOptions<
    GetDefaultScoringProfileQuery,
    GetDefaultScoringProfileQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useLazyQuery<
    GetDefaultScoringProfileQuery,
    GetDefaultScoringProfileQueryVariables
  >(GetDefaultScoringProfile, options);
}
export function useGetDefaultScoringProfileSuspenseQuery(
  baseOptions?:
    | Apollo.SkipToken
    | Apollo.SuspenseQueryHookOptions<
        GetDefaultScoringProfileQuery,
        GetDefaultScoringProfileQueryVariables
      >,
) {
  const options =
    baseOptions === Apollo.skipToken
      ? baseOptions
      : { ...defaultOptions, ...baseOptions };
  return Apollo.useSuspenseQuery<
    GetDefaultScoringProfileQuery,
    GetDefaultScoringProfileQueryVariables
  >(
    GetDefaultScoringProfile,
    options as
      | Apollo.SkipToken
      | Apollo.SuspenseQueryHookOptions<
          GetDefaultScoringProfileQuery,
          GetDefaultScoringProfileQueryVariables
        >,
  );
}
export type GetDefaultScoringProfileQueryHookResult = ReturnType<
  typeof useGetDefaultScoringProfileQuery
>;
export type GetDefaultScoringProfileLazyQueryHookResult = ReturnType<
  typeof useGetDefaultScoringProfileLazyQuery
>;
export type GetDefaultScoringProfileSuspenseQueryHookResult = ReturnType<
  typeof useGetDefaultScoringProfileSuspenseQuery
>;
export type GetDefaultScoringProfileQueryResult = Apollo.QueryResult<
  GetDefaultScoringProfileQuery,
  GetDefaultScoringProfileQueryVariables
>;
export const UpdateLeagueScoringProfile = gql`
  mutation UpdateLeagueScoringProfile(
    $leagueId: Int!
    $updates: [UpdateLeagueScoringMultiplierInput!]!
  ) {
    updateLeagueScoringProfile(leagueId: $leagueId, updates: $updates) {
      profileId
      profileName
      stats {
        multiplier
        defaultMultiplier
        isOverride
        isEnabled
        definition {
          id
          statKey
          statGroup
          displayName
          description
          sourceColumn
          defaultMultiplier
          minMultiplier
          maxMultiplier
          stepSize
          isRequired
          enforcePositive
          enforceNegative
        }
      }
      multiplierGroups {
        group
        values {
          statKey
          sourceColumn
          multiplier
        }
      }
    }
  }
`;
export type UpdateLeagueScoringProfileMutationFn = MutationFunction<
  UpdateLeagueScoringProfileMutation,
  UpdateLeagueScoringProfileMutationVariables
>;

/**
 * __useUpdateLeagueScoringProfileMutation__
 *
 * To run a mutation, you first call `useUpdateLeagueScoringProfileMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUpdateLeagueScoringProfileMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [updateLeagueScoringProfileMutation, { data, loading, error }] = useUpdateLeagueScoringProfileMutation({
 *   variables: {
 *      leagueId: // value for 'leagueId'
 *      updates: // value for 'updates'
 *   },
 * });
 */
export function useUpdateLeagueScoringProfileMutation(
  baseOptions?: Apollo.MutationHookOptions<
    UpdateLeagueScoringProfileMutation,
    UpdateLeagueScoringProfileMutationVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useMutation<
    UpdateLeagueScoringProfileMutation,
    UpdateLeagueScoringProfileMutationVariables
  >(UpdateLeagueScoringProfile, options);
}
export type UpdateLeagueScoringProfileMutationHookResult = ReturnType<
  typeof useUpdateLeagueScoringProfileMutation
>;
export type UpdateLeagueScoringProfileMutationResult =
  Apollo.MutationResult<UpdateLeagueScoringProfileMutation>;
export type UpdateLeagueScoringProfileMutationOptions = BaseMutationOptions<
  UpdateLeagueScoringProfileMutation,
  UpdateLeagueScoringProfileMutationVariables
>;
export const GetCareerBattingStats = gql`
  query GetCareerBattingStats {
    careerBattingStats {
      edges {
        node {
          ...CareerBattingStats
        }
      }
    }
  }
  ${CareerBattingStatsFragmentDoc}
`;

/**
 * __useGetCareerBattingStatsQuery__
 *
 * To run a query within a React component, call `useGetCareerBattingStatsQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetCareerBattingStatsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetCareerBattingStatsQuery({
 *   variables: {
 *   },
 * });
 */
export function useGetCareerBattingStatsQuery(
  baseOptions?: Apollo.QueryHookOptions<
    GetCareerBattingStatsQuery,
    GetCareerBattingStatsQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useQuery<
    GetCareerBattingStatsQuery,
    GetCareerBattingStatsQueryVariables
  >(GetCareerBattingStats, options);
}
export function useGetCareerBattingStatsLazyQuery(
  baseOptions?: Apollo.LazyQueryHookOptions<
    GetCareerBattingStatsQuery,
    GetCareerBattingStatsQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useLazyQuery<
    GetCareerBattingStatsQuery,
    GetCareerBattingStatsQueryVariables
  >(GetCareerBattingStats, options);
}
export function useGetCareerBattingStatsSuspenseQuery(
  baseOptions?:
    | Apollo.SkipToken
    | Apollo.SuspenseQueryHookOptions<
        GetCareerBattingStatsQuery,
        GetCareerBattingStatsQueryVariables
      >,
) {
  const options =
    baseOptions === Apollo.skipToken
      ? baseOptions
      : { ...defaultOptions, ...baseOptions };
  return Apollo.useSuspenseQuery<
    GetCareerBattingStatsQuery,
    GetCareerBattingStatsQueryVariables
  >(
    GetCareerBattingStats,
    options as
      | Apollo.SkipToken
      | Apollo.SuspenseQueryHookOptions<
          GetCareerBattingStatsQuery,
          GetCareerBattingStatsQueryVariables
        >,
  );
}
export type GetCareerBattingStatsQueryHookResult = ReturnType<
  typeof useGetCareerBattingStatsQuery
>;
export type GetCareerBattingStatsLazyQueryHookResult = ReturnType<
  typeof useGetCareerBattingStatsLazyQuery
>;
export type GetCareerBattingStatsSuspenseQueryHookResult = ReturnType<
  typeof useGetCareerBattingStatsSuspenseQuery
>;
export type GetCareerBattingStatsQueryResult = Apollo.QueryResult<
  GetCareerBattingStatsQuery,
  GetCareerBattingStatsQueryVariables
>;
export const GetCareerFieldingStats = gql`
  query GetCareerFieldingStats {
    careerFieldingStats {
      ...CareerFieldingStats
    }
  }
  ${CareerFieldingStatsFragmentDoc}
`;

/**
 * __useGetCareerFieldingStatsQuery__
 *
 * To run a query within a React component, call `useGetCareerFieldingStatsQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetCareerFieldingStatsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetCareerFieldingStatsQuery({
 *   variables: {
 *   },
 * });
 */
export function useGetCareerFieldingStatsQuery(
  baseOptions?: Apollo.QueryHookOptions<
    GetCareerFieldingStatsQuery,
    GetCareerFieldingStatsQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useQuery<
    GetCareerFieldingStatsQuery,
    GetCareerFieldingStatsQueryVariables
  >(GetCareerFieldingStats, options);
}
export function useGetCareerFieldingStatsLazyQuery(
  baseOptions?: Apollo.LazyQueryHookOptions<
    GetCareerFieldingStatsQuery,
    GetCareerFieldingStatsQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useLazyQuery<
    GetCareerFieldingStatsQuery,
    GetCareerFieldingStatsQueryVariables
  >(GetCareerFieldingStats, options);
}
export function useGetCareerFieldingStatsSuspenseQuery(
  baseOptions?:
    | Apollo.SkipToken
    | Apollo.SuspenseQueryHookOptions<
        GetCareerFieldingStatsQuery,
        GetCareerFieldingStatsQueryVariables
      >,
) {
  const options =
    baseOptions === Apollo.skipToken
      ? baseOptions
      : { ...defaultOptions, ...baseOptions };
  return Apollo.useSuspenseQuery<
    GetCareerFieldingStatsQuery,
    GetCareerFieldingStatsQueryVariables
  >(
    GetCareerFieldingStats,
    options as
      | Apollo.SkipToken
      | Apollo.SuspenseQueryHookOptions<
          GetCareerFieldingStatsQuery,
          GetCareerFieldingStatsQueryVariables
        >,
  );
}
export type GetCareerFieldingStatsQueryHookResult = ReturnType<
  typeof useGetCareerFieldingStatsQuery
>;
export type GetCareerFieldingStatsLazyQueryHookResult = ReturnType<
  typeof useGetCareerFieldingStatsLazyQuery
>;
export type GetCareerFieldingStatsSuspenseQueryHookResult = ReturnType<
  typeof useGetCareerFieldingStatsSuspenseQuery
>;
export type GetCareerFieldingStatsQueryResult = Apollo.QueryResult<
  GetCareerFieldingStatsQuery,
  GetCareerFieldingStatsQueryVariables
>;
export const GetCareerPitchingStats = gql`
  query GetCareerPitchingStats {
    careerPitchingStats {
      ...CareerPitchingStats
    }
  }
  ${CareerPitchingStatsFragmentDoc}
`;

/**
 * __useGetCareerPitchingStatsQuery__
 *
 * To run a query within a React component, call `useGetCareerPitchingStatsQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetCareerPitchingStatsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetCareerPitchingStatsQuery({
 *   variables: {
 *   },
 * });
 */
export function useGetCareerPitchingStatsQuery(
  baseOptions?: Apollo.QueryHookOptions<
    GetCareerPitchingStatsQuery,
    GetCareerPitchingStatsQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useQuery<
    GetCareerPitchingStatsQuery,
    GetCareerPitchingStatsQueryVariables
  >(GetCareerPitchingStats, options);
}
export function useGetCareerPitchingStatsLazyQuery(
  baseOptions?: Apollo.LazyQueryHookOptions<
    GetCareerPitchingStatsQuery,
    GetCareerPitchingStatsQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useLazyQuery<
    GetCareerPitchingStatsQuery,
    GetCareerPitchingStatsQueryVariables
  >(GetCareerPitchingStats, options);
}
export function useGetCareerPitchingStatsSuspenseQuery(
  baseOptions?:
    | Apollo.SkipToken
    | Apollo.SuspenseQueryHookOptions<
        GetCareerPitchingStatsQuery,
        GetCareerPitchingStatsQueryVariables
      >,
) {
  const options =
    baseOptions === Apollo.skipToken
      ? baseOptions
      : { ...defaultOptions, ...baseOptions };
  return Apollo.useSuspenseQuery<
    GetCareerPitchingStatsQuery,
    GetCareerPitchingStatsQueryVariables
  >(
    GetCareerPitchingStats,
    options as
      | Apollo.SkipToken
      | Apollo.SuspenseQueryHookOptions<
          GetCareerPitchingStatsQuery,
          GetCareerPitchingStatsQueryVariables
        >,
  );
}
export type GetCareerPitchingStatsQueryHookResult = ReturnType<
  typeof useGetCareerPitchingStatsQuery
>;
export type GetCareerPitchingStatsLazyQueryHookResult = ReturnType<
  typeof useGetCareerPitchingStatsLazyQuery
>;
export type GetCareerPitchingStatsSuspenseQueryHookResult = ReturnType<
  typeof useGetCareerPitchingStatsSuspenseQuery
>;
export type GetCareerPitchingStatsQueryResult = Apollo.QueryResult<
  GetCareerPitchingStatsQuery,
  GetCareerPitchingStatsQueryVariables
>;
export const GetPlayerCareerStats = gql`
  query GetPlayerCareerStats($playerId: Int!) {
    batting: playerCareerBatting(playerId: $playerId) {
      ...CareerBattingStats
    }
    fielding: playerCareerFielding(playerId: $playerId) {
      ...CareerFieldingStats
    }
    pitching: playerCareerPitching(playerId: $playerId) {
      ...CareerPitchingStats
    }
  }
  ${CareerBattingStatsFragmentDoc}
  ${CareerFieldingStatsFragmentDoc}
  ${CareerPitchingStatsFragmentDoc}
`;

/**
 * __useGetPlayerCareerStatsQuery__
 *
 * To run a query within a React component, call `useGetPlayerCareerStatsQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetPlayerCareerStatsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetPlayerCareerStatsQuery({
 *   variables: {
 *      playerId: // value for 'playerId'
 *   },
 * });
 */
export function useGetPlayerCareerStatsQuery(
  baseOptions: Apollo.QueryHookOptions<
    GetPlayerCareerStatsQuery,
    GetPlayerCareerStatsQueryVariables
  > &
    (
      | { variables: GetPlayerCareerStatsQueryVariables; skip?: boolean }
      | { skip: boolean }
    ),
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useQuery<
    GetPlayerCareerStatsQuery,
    GetPlayerCareerStatsQueryVariables
  >(GetPlayerCareerStats, options);
}
export function useGetPlayerCareerStatsLazyQuery(
  baseOptions?: Apollo.LazyQueryHookOptions<
    GetPlayerCareerStatsQuery,
    GetPlayerCareerStatsQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useLazyQuery<
    GetPlayerCareerStatsQuery,
    GetPlayerCareerStatsQueryVariables
  >(GetPlayerCareerStats, options);
}
export function useGetPlayerCareerStatsSuspenseQuery(
  baseOptions?:
    | Apollo.SkipToken
    | Apollo.SuspenseQueryHookOptions<
        GetPlayerCareerStatsQuery,
        GetPlayerCareerStatsQueryVariables
      >,
) {
  const options =
    baseOptions === Apollo.skipToken
      ? baseOptions
      : { ...defaultOptions, ...baseOptions };
  return Apollo.useSuspenseQuery<
    GetPlayerCareerStatsQuery,
    GetPlayerCareerStatsQueryVariables
  >(
    GetPlayerCareerStats,
    options as
      | Apollo.SkipToken
      | Apollo.SuspenseQueryHookOptions<
          GetPlayerCareerStatsQuery,
          GetPlayerCareerStatsQueryVariables
        >,
  );
}
export type GetPlayerCareerStatsQueryHookResult = ReturnType<
  typeof useGetPlayerCareerStatsQuery
>;
export type GetPlayerCareerStatsLazyQueryHookResult = ReturnType<
  typeof useGetPlayerCareerStatsLazyQuery
>;
export type GetPlayerCareerStatsSuspenseQueryHookResult = ReturnType<
  typeof useGetPlayerCareerStatsSuspenseQuery
>;
export type GetPlayerCareerStatsQueryResult = Apollo.QueryResult<
  GetPlayerCareerStatsQuery,
  GetPlayerCareerStatsQueryVariables
>;
export const GetMySubscription = gql`
  query GetMySubscription {
    mySubscription {
      ...SubscriptionInfo
    }
  }
  ${SubscriptionInfoFragmentDoc}
`;

/**
 * __useGetMySubscriptionQuery__
 *
 * To run a query within a React component, call `useGetMySubscriptionQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetMySubscriptionQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetMySubscriptionQuery({
 *   variables: {
 *   },
 * });
 */
export function useGetMySubscriptionQuery(
  baseOptions?: Apollo.QueryHookOptions<
    GetMySubscriptionQuery,
    GetMySubscriptionQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useQuery<
    GetMySubscriptionQuery,
    GetMySubscriptionQueryVariables
  >(GetMySubscription, options);
}
export function useGetMySubscriptionLazyQuery(
  baseOptions?: Apollo.LazyQueryHookOptions<
    GetMySubscriptionQuery,
    GetMySubscriptionQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useLazyQuery<
    GetMySubscriptionQuery,
    GetMySubscriptionQueryVariables
  >(GetMySubscription, options);
}
export function useGetMySubscriptionSuspenseQuery(
  baseOptions?:
    | Apollo.SkipToken
    | Apollo.SuspenseQueryHookOptions<
        GetMySubscriptionQuery,
        GetMySubscriptionQueryVariables
      >,
) {
  const options =
    baseOptions === Apollo.skipToken
      ? baseOptions
      : { ...defaultOptions, ...baseOptions };
  return Apollo.useSuspenseQuery<
    GetMySubscriptionQuery,
    GetMySubscriptionQueryVariables
  >(
    GetMySubscription,
    options as
      | Apollo.SkipToken
      | Apollo.SuspenseQueryHookOptions<
          GetMySubscriptionQuery,
          GetMySubscriptionQueryVariables
        >,
  );
}
export type GetMySubscriptionQueryHookResult = ReturnType<
  typeof useGetMySubscriptionQuery
>;
export type GetMySubscriptionLazyQueryHookResult = ReturnType<
  typeof useGetMySubscriptionLazyQuery
>;
export type GetMySubscriptionSuspenseQueryHookResult = ReturnType<
  typeof useGetMySubscriptionSuspenseQuery
>;
export type GetMySubscriptionQueryResult = Apollo.QueryResult<
  GetMySubscriptionQuery,
  GetMySubscriptionQueryVariables
>;
export const CreateCheckoutSession = gql`
  mutation CreateCheckoutSession(
    $priceId: String!
    $successUrl: String!
    $cancelUrl: String!
  ) {
    createCheckoutSession(
      priceId: $priceId
      successUrl: $successUrl
      cancelUrl: $cancelUrl
    ) {
      url
    }
  }
`;
export type CreateCheckoutSessionMutationFn = MutationFunction<
  CreateCheckoutSessionMutation,
  CreateCheckoutSessionMutationVariables
>;

/**
 * __useCreateCheckoutSessionMutation__
 *
 * To run a mutation, you first call `useCreateCheckoutSessionMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useCreateCheckoutSessionMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [createCheckoutSessionMutation, { data, loading, error }] = useCreateCheckoutSessionMutation({
 *   variables: {
 *      priceId: // value for 'priceId'
 *      successUrl: // value for 'successUrl'
 *      cancelUrl: // value for 'cancelUrl'
 *   },
 * });
 */
export function useCreateCheckoutSessionMutation(
  baseOptions?: Apollo.MutationHookOptions<
    CreateCheckoutSessionMutation,
    CreateCheckoutSessionMutationVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useMutation<
    CreateCheckoutSessionMutation,
    CreateCheckoutSessionMutationVariables
  >(CreateCheckoutSession, options);
}
export type CreateCheckoutSessionMutationHookResult = ReturnType<
  typeof useCreateCheckoutSessionMutation
>;
export type CreateCheckoutSessionMutationResult =
  Apollo.MutationResult<CreateCheckoutSessionMutation>;
export type CreateCheckoutSessionMutationOptions = BaseMutationOptions<
  CreateCheckoutSessionMutation,
  CreateCheckoutSessionMutationVariables
>;
export const CreateBillingPortalSession = gql`
  mutation CreateBillingPortalSession($returnUrl: String!) {
    createBillingPortalSession(returnUrl: $returnUrl) {
      url
    }
  }
`;
export type CreateBillingPortalSessionMutationFn = MutationFunction<
  CreateBillingPortalSessionMutation,
  CreateBillingPortalSessionMutationVariables
>;

/**
 * __useCreateBillingPortalSessionMutation__
 *
 * To run a mutation, you first call `useCreateBillingPortalSessionMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useCreateBillingPortalSessionMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [createBillingPortalSessionMutation, { data, loading, error }] = useCreateBillingPortalSessionMutation({
 *   variables: {
 *      returnUrl: // value for 'returnUrl'
 *   },
 * });
 */
export function useCreateBillingPortalSessionMutation(
  baseOptions?: Apollo.MutationHookOptions<
    CreateBillingPortalSessionMutation,
    CreateBillingPortalSessionMutationVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useMutation<
    CreateBillingPortalSessionMutation,
    CreateBillingPortalSessionMutationVariables
  >(CreateBillingPortalSession, options);
}
export type CreateBillingPortalSessionMutationHookResult = ReturnType<
  typeof useCreateBillingPortalSessionMutation
>;
export type CreateBillingPortalSessionMutationResult =
  Apollo.MutationResult<CreateBillingPortalSessionMutation>;
export type CreateBillingPortalSessionMutationOptions = BaseMutationOptions<
  CreateBillingPortalSessionMutation,
  CreateBillingPortalSessionMutationVariables
>;
export const VerifyApplePurchase = gql`
  mutation VerifyApplePurchase($jwsTransaction: String!) {
    verifyApplePurchase(jwsTransaction: $jwsTransaction) {
      success
      tier
      status
    }
  }
`;
export type VerifyApplePurchaseMutationFn = MutationFunction<
  VerifyApplePurchaseMutation,
  VerifyApplePurchaseMutationVariables
>;

/**
 * __useVerifyApplePurchaseMutation__
 *
 * To run a mutation, you first call `useVerifyApplePurchaseMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useVerifyApplePurchaseMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [verifyApplePurchaseMutation, { data, loading, error }] = useVerifyApplePurchaseMutation({
 *   variables: {
 *      jwsTransaction: // value for 'jwsTransaction'
 *   },
 * });
 */
export function useVerifyApplePurchaseMutation(
  baseOptions?: Apollo.MutationHookOptions<
    VerifyApplePurchaseMutation,
    VerifyApplePurchaseMutationVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useMutation<
    VerifyApplePurchaseMutation,
    VerifyApplePurchaseMutationVariables
  >(VerifyApplePurchase, options);
}
export type VerifyApplePurchaseMutationHookResult = ReturnType<
  typeof useVerifyApplePurchaseMutation
>;
export type VerifyApplePurchaseMutationResult =
  Apollo.MutationResult<VerifyApplePurchaseMutation>;
export type VerifyApplePurchaseMutationOptions = BaseMutationOptions<
  VerifyApplePurchaseMutation,
  VerifyApplePurchaseMutationVariables
>;
export const RestoreApplePurchases = gql`
  mutation RestoreApplePurchases($jwsTransaction: String!) {
    restoreApplePurchases(jwsTransaction: $jwsTransaction)
  }
`;
export type RestoreApplePurchasesMutationFn = MutationFunction<
  RestoreApplePurchasesMutation,
  RestoreApplePurchasesMutationVariables
>;

/**
 * __useRestoreApplePurchasesMutation__
 *
 * To run a mutation, you first call `useRestoreApplePurchasesMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useRestoreApplePurchasesMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [restoreApplePurchasesMutation, { data, loading, error }] = useRestoreApplePurchasesMutation({
 *   variables: {
 *      jwsTransaction: // value for 'jwsTransaction'
 *   },
 * });
 */
export function useRestoreApplePurchasesMutation(
  baseOptions?: Apollo.MutationHookOptions<
    RestoreApplePurchasesMutation,
    RestoreApplePurchasesMutationVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useMutation<
    RestoreApplePurchasesMutation,
    RestoreApplePurchasesMutationVariables
  >(RestoreApplePurchases, options);
}
export type RestoreApplePurchasesMutationHookResult = ReturnType<
  typeof useRestoreApplePurchasesMutation
>;
export type RestoreApplePurchasesMutationResult =
  Apollo.MutationResult<RestoreApplePurchasesMutation>;
export type RestoreApplePurchasesMutationOptions = BaseMutationOptions<
  RestoreApplePurchasesMutation,
  RestoreApplePurchasesMutationVariables
>;
export const VerifyGooglePurchase = gql`
  mutation VerifyGooglePurchase($purchaseToken: String!, $productId: String!) {
    verifyGooglePurchase(purchaseToken: $purchaseToken, productId: $productId) {
      success
      tier
      status
    }
  }
`;
export type VerifyGooglePurchaseMutationFn = MutationFunction<
  VerifyGooglePurchaseMutation,
  VerifyGooglePurchaseMutationVariables
>;

/**
 * __useVerifyGooglePurchaseMutation__
 *
 * To run a mutation, you first call `useVerifyGooglePurchaseMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useVerifyGooglePurchaseMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [verifyGooglePurchaseMutation, { data, loading, error }] = useVerifyGooglePurchaseMutation({
 *   variables: {
 *      purchaseToken: // value for 'purchaseToken'
 *      productId: // value for 'productId'
 *   },
 * });
 */
export function useVerifyGooglePurchaseMutation(
  baseOptions?: Apollo.MutationHookOptions<
    VerifyGooglePurchaseMutation,
    VerifyGooglePurchaseMutationVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useMutation<
    VerifyGooglePurchaseMutation,
    VerifyGooglePurchaseMutationVariables
  >(VerifyGooglePurchase, options);
}
export type VerifyGooglePurchaseMutationHookResult = ReturnType<
  typeof useVerifyGooglePurchaseMutation
>;
export type VerifyGooglePurchaseMutationResult =
  Apollo.MutationResult<VerifyGooglePurchaseMutation>;
export type VerifyGooglePurchaseMutationOptions = BaseMutationOptions<
  VerifyGooglePurchaseMutation,
  VerifyGooglePurchaseMutationVariables
>;
export const RestoreGooglePurchases = gql`
  mutation RestoreGooglePurchases(
    $purchaseToken: String!
    $productId: String!
  ) {
    restoreGooglePurchases(purchaseToken: $purchaseToken, productId: $productId)
  }
`;
export type RestoreGooglePurchasesMutationFn = MutationFunction<
  RestoreGooglePurchasesMutation,
  RestoreGooglePurchasesMutationVariables
>;

/**
 * __useRestoreGooglePurchasesMutation__
 *
 * To run a mutation, you first call `useRestoreGooglePurchasesMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useRestoreGooglePurchasesMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [restoreGooglePurchasesMutation, { data, loading, error }] = useRestoreGooglePurchasesMutation({
 *   variables: {
 *      purchaseToken: // value for 'purchaseToken'
 *      productId: // value for 'productId'
 *   },
 * });
 */
export function useRestoreGooglePurchasesMutation(
  baseOptions?: Apollo.MutationHookOptions<
    RestoreGooglePurchasesMutation,
    RestoreGooglePurchasesMutationVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useMutation<
    RestoreGooglePurchasesMutation,
    RestoreGooglePurchasesMutationVariables
  >(RestoreGooglePurchases, options);
}
export type RestoreGooglePurchasesMutationHookResult = ReturnType<
  typeof useRestoreGooglePurchasesMutation
>;
export type RestoreGooglePurchasesMutationResult =
  Apollo.MutationResult<RestoreGooglePurchasesMutation>;
export type RestoreGooglePurchasesMutationOptions = BaseMutationOptions<
  RestoreGooglePurchasesMutation,
  RestoreGooglePurchasesMutationVariables
>;
export const GetTeamMembers = gql`
  query GetTeamMembers($teamId: Int!) {
    teamMembers(teamId: $teamId) {
      ...TeamMember
    }
  }
  ${TeamMemberFragmentDoc}
`;

/**
 * __useGetTeamMembersQuery__
 *
 * To run a query within a React component, call `useGetTeamMembersQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetTeamMembersQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetTeamMembersQuery({
 *   variables: {
 *      teamId: // value for 'teamId'
 *   },
 * });
 */
export function useGetTeamMembersQuery(
  baseOptions: Apollo.QueryHookOptions<
    GetTeamMembersQuery,
    GetTeamMembersQueryVariables
  > &
    (
      | { variables: GetTeamMembersQueryVariables; skip?: boolean }
      | { skip: boolean }
    ),
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useQuery<GetTeamMembersQuery, GetTeamMembersQueryVariables>(
    GetTeamMembers,
    options,
  );
}
export function useGetTeamMembersLazyQuery(
  baseOptions?: Apollo.LazyQueryHookOptions<
    GetTeamMembersQuery,
    GetTeamMembersQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useLazyQuery<GetTeamMembersQuery, GetTeamMembersQueryVariables>(
    GetTeamMembers,
    options,
  );
}
export function useGetTeamMembersSuspenseQuery(
  baseOptions?:
    | Apollo.SkipToken
    | Apollo.SuspenseQueryHookOptions<
        GetTeamMembersQuery,
        GetTeamMembersQueryVariables
      >,
) {
  const options =
    baseOptions === Apollo.skipToken
      ? baseOptions
      : { ...defaultOptions, ...baseOptions };
  return Apollo.useSuspenseQuery<
    GetTeamMembersQuery,
    GetTeamMembersQueryVariables
  >(
    GetTeamMembers,
    options as
      | Apollo.SkipToken
      | Apollo.SuspenseQueryHookOptions<
          GetTeamMembersQuery,
          GetTeamMembersQueryVariables
        >,
  );
}
export type GetTeamMembersQueryHookResult = ReturnType<
  typeof useGetTeamMembersQuery
>;
export type GetTeamMembersLazyQueryHookResult = ReturnType<
  typeof useGetTeamMembersLazyQuery
>;
export type GetTeamMembersSuspenseQueryHookResult = ReturnType<
  typeof useGetTeamMembersSuspenseQuery
>;
export type GetTeamMembersQueryResult = Apollo.QueryResult<
  GetTeamMembersQuery,
  GetTeamMembersQueryVariables
>;
export const UpdateTeamMemberPosition = gql`
  mutation UpdateTeamMemberPosition($teamMemberId: Int!, $positionId: Int) {
    updateTeamMemberPosition(
      teamMemberId: $teamMemberId
      positionId: $positionId
    ) {
      ...TeamMember
    }
  }
  ${TeamMemberFragmentDoc}
`;
export type UpdateTeamMemberPositionMutationFn = MutationFunction<
  UpdateTeamMemberPositionMutation,
  UpdateTeamMemberPositionMutationVariables
>;

/**
 * __useUpdateTeamMemberPositionMutation__
 *
 * To run a mutation, you first call `useUpdateTeamMemberPositionMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUpdateTeamMemberPositionMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [updateTeamMemberPositionMutation, { data, loading, error }] = useUpdateTeamMemberPositionMutation({
 *   variables: {
 *      teamMemberId: // value for 'teamMemberId'
 *      positionId: // value for 'positionId'
 *   },
 * });
 */
export function useUpdateTeamMemberPositionMutation(
  baseOptions?: Apollo.MutationHookOptions<
    UpdateTeamMemberPositionMutation,
    UpdateTeamMemberPositionMutationVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useMutation<
    UpdateTeamMemberPositionMutation,
    UpdateTeamMemberPositionMutationVariables
  >(UpdateTeamMemberPosition, options);
}
export type UpdateTeamMemberPositionMutationHookResult = ReturnType<
  typeof useUpdateTeamMemberPositionMutation
>;
export type UpdateTeamMemberPositionMutationResult =
  Apollo.MutationResult<UpdateTeamMemberPositionMutation>;
export type UpdateTeamMemberPositionMutationOptions = BaseMutationOptions<
  UpdateTeamMemberPositionMutation,
  UpdateTeamMemberPositionMutationVariables
>;
export const SetTradeBlock = gql`
  mutation SetTradeBlock($teamMemberId: Int!, $onTradeBlock: Boolean!) {
    setTradeBlock(teamMemberId: $teamMemberId, onTradeBlock: $onTradeBlock) {
      ...TeamMember
    }
  }
  ${TeamMemberFragmentDoc}
`;
export type SetTradeBlockMutationFn = MutationFunction<
  SetTradeBlockMutation,
  SetTradeBlockMutationVariables
>;

/**
 * __useSetTradeBlockMutation__
 *
 * To run a mutation, you first call `useSetTradeBlockMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useSetTradeBlockMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [setTradeBlockMutation, { data, loading, error }] = useSetTradeBlockMutation({
 *   variables: {
 *      teamMemberId: // value for 'teamMemberId'
 *      onTradeBlock: // value for 'onTradeBlock'
 *   },
 * });
 */
export function useSetTradeBlockMutation(
  baseOptions?: Apollo.MutationHookOptions<
    SetTradeBlockMutation,
    SetTradeBlockMutationVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useMutation<
    SetTradeBlockMutation,
    SetTradeBlockMutationVariables
  >(SetTradeBlock, options);
}
export type SetTradeBlockMutationHookResult = ReturnType<
  typeof useSetTradeBlockMutation
>;
export type SetTradeBlockMutationResult =
  Apollo.MutationResult<SetTradeBlockMutation>;
export type SetTradeBlockMutationOptions = BaseMutationOptions<
  SetTradeBlockMutation,
  SetTradeBlockMutationVariables
>;
export const GetLeagueTradeBlock = gql`
  query GetLeagueTradeBlock($leagueId: Int!) {
    leagueTradeBlock(leagueId: $leagueId) {
      ...TeamMember
    }
  }
  ${TeamMemberFragmentDoc}
`;

/**
 * __useGetLeagueTradeBlockQuery__
 *
 * To run a query within a React component, call `useGetLeagueTradeBlockQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetLeagueTradeBlockQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetLeagueTradeBlockQuery({
 *   variables: {
 *      leagueId: // value for 'leagueId'
 *   },
 * });
 */
export function useGetLeagueTradeBlockQuery(
  baseOptions: Apollo.QueryHookOptions<
    GetLeagueTradeBlockQuery,
    GetLeagueTradeBlockQueryVariables
  > &
    (
      | { variables: GetLeagueTradeBlockQueryVariables; skip?: boolean }
      | { skip: boolean }
    ),
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useQuery<
    GetLeagueTradeBlockQuery,
    GetLeagueTradeBlockQueryVariables
  >(GetLeagueTradeBlock, options);
}
export function useGetLeagueTradeBlockLazyQuery(
  baseOptions?: Apollo.LazyQueryHookOptions<
    GetLeagueTradeBlockQuery,
    GetLeagueTradeBlockQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useLazyQuery<
    GetLeagueTradeBlockQuery,
    GetLeagueTradeBlockQueryVariables
  >(GetLeagueTradeBlock, options);
}
export function useGetLeagueTradeBlockSuspenseQuery(
  baseOptions?:
    | Apollo.SkipToken
    | Apollo.SuspenseQueryHookOptions<
        GetLeagueTradeBlockQuery,
        GetLeagueTradeBlockQueryVariables
      >,
) {
  const options =
    baseOptions === Apollo.skipToken
      ? baseOptions
      : { ...defaultOptions, ...baseOptions };
  return Apollo.useSuspenseQuery<
    GetLeagueTradeBlockQuery,
    GetLeagueTradeBlockQueryVariables
  >(
    GetLeagueTradeBlock,
    options as
      | Apollo.SkipToken
      | Apollo.SuspenseQueryHookOptions<
          GetLeagueTradeBlockQuery,
          GetLeagueTradeBlockQueryVariables
        >,
  );
}
export type GetLeagueTradeBlockQueryHookResult = ReturnType<
  typeof useGetLeagueTradeBlockQuery
>;
export type GetLeagueTradeBlockLazyQueryHookResult = ReturnType<
  typeof useGetLeagueTradeBlockLazyQuery
>;
export type GetLeagueTradeBlockSuspenseQueryHookResult = ReturnType<
  typeof useGetLeagueTradeBlockSuspenseQuery
>;
export type GetLeagueTradeBlockQueryResult = Apollo.QueryResult<
  GetLeagueTradeBlockQuery,
  GetLeagueTradeBlockQueryVariables
>;
export const GetTeamWaiverClaims = gql`
  query GetTeamWaiverClaims($teamId: Int!, $status: String) {
    teamWaiverClaims(teamId: $teamId, status: $status) {
      id
      leagueId
      teamId
      playerId
      dropPlayerId
      faabBid
      status
      errorMessage
      playerName
      dropPlayerName
      processedAt
      createdAt
    }
  }
`;

/**
 * __useGetTeamWaiverClaimsQuery__
 *
 * To run a query within a React component, call `useGetTeamWaiverClaimsQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetTeamWaiverClaimsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetTeamWaiverClaimsQuery({
 *   variables: {
 *      teamId: // value for 'teamId'
 *      status: // value for 'status'
 *   },
 * });
 */
export function useGetTeamWaiverClaimsQuery(
  baseOptions: Apollo.QueryHookOptions<
    GetTeamWaiverClaimsQuery,
    GetTeamWaiverClaimsQueryVariables
  > &
    (
      | { variables: GetTeamWaiverClaimsQueryVariables; skip?: boolean }
      | { skip: boolean }
    ),
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useQuery<
    GetTeamWaiverClaimsQuery,
    GetTeamWaiverClaimsQueryVariables
  >(GetTeamWaiverClaims, options);
}
export function useGetTeamWaiverClaimsLazyQuery(
  baseOptions?: Apollo.LazyQueryHookOptions<
    GetTeamWaiverClaimsQuery,
    GetTeamWaiverClaimsQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useLazyQuery<
    GetTeamWaiverClaimsQuery,
    GetTeamWaiverClaimsQueryVariables
  >(GetTeamWaiverClaims, options);
}
export function useGetTeamWaiverClaimsSuspenseQuery(
  baseOptions?:
    | Apollo.SkipToken
    | Apollo.SuspenseQueryHookOptions<
        GetTeamWaiverClaimsQuery,
        GetTeamWaiverClaimsQueryVariables
      >,
) {
  const options =
    baseOptions === Apollo.skipToken
      ? baseOptions
      : { ...defaultOptions, ...baseOptions };
  return Apollo.useSuspenseQuery<
    GetTeamWaiverClaimsQuery,
    GetTeamWaiverClaimsQueryVariables
  >(
    GetTeamWaiverClaims,
    options as
      | Apollo.SkipToken
      | Apollo.SuspenseQueryHookOptions<
          GetTeamWaiverClaimsQuery,
          GetTeamWaiverClaimsQueryVariables
        >,
  );
}
export type GetTeamWaiverClaimsQueryHookResult = ReturnType<
  typeof useGetTeamWaiverClaimsQuery
>;
export type GetTeamWaiverClaimsLazyQueryHookResult = ReturnType<
  typeof useGetTeamWaiverClaimsLazyQuery
>;
export type GetTeamWaiverClaimsSuspenseQueryHookResult = ReturnType<
  typeof useGetTeamWaiverClaimsSuspenseQuery
>;
export type GetTeamWaiverClaimsQueryResult = Apollo.QueryResult<
  GetTeamWaiverClaimsQuery,
  GetTeamWaiverClaimsQueryVariables
>;
export const CancelWaiverClaim = gql`
  mutation CancelWaiverClaim($claimId: Int!) {
    cancelWaiverClaim(claimId: $claimId) {
      id
      status
      errorMessage
      processedAt
    }
  }
`;
export type CancelWaiverClaimMutationFn = MutationFunction<
  CancelWaiverClaimMutation,
  CancelWaiverClaimMutationVariables
>;

/**
 * __useCancelWaiverClaimMutation__
 *
 * To run a mutation, you first call `useCancelWaiverClaimMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useCancelWaiverClaimMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [cancelWaiverClaimMutation, { data, loading, error }] = useCancelWaiverClaimMutation({
 *   variables: {
 *      claimId: // value for 'claimId'
 *   },
 * });
 */
export function useCancelWaiverClaimMutation(
  baseOptions?: Apollo.MutationHookOptions<
    CancelWaiverClaimMutation,
    CancelWaiverClaimMutationVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useMutation<
    CancelWaiverClaimMutation,
    CancelWaiverClaimMutationVariables
  >(CancelWaiverClaim, options);
}
export type CancelWaiverClaimMutationHookResult = ReturnType<
  typeof useCancelWaiverClaimMutation
>;
export type CancelWaiverClaimMutationResult =
  Apollo.MutationResult<CancelWaiverClaimMutation>;
export type CancelWaiverClaimMutationOptions = BaseMutationOptions<
  CancelWaiverClaimMutation,
  CancelWaiverClaimMutationVariables
>;
export const GetUserByEmail = gql`
  query GetUserByEmail($email: String!) {
    userByEmail(email: $email) {
      ...User
    }
  }
  ${UserFragmentDoc}
`;

/**
 * __useGetUserByEmailQuery__
 *
 * To run a query within a React component, call `useGetUserByEmailQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetUserByEmailQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetUserByEmailQuery({
 *   variables: {
 *      email: // value for 'email'
 *   },
 * });
 */
export function useGetUserByEmailQuery(
  baseOptions: Apollo.QueryHookOptions<
    GetUserByEmailQuery,
    GetUserByEmailQueryVariables
  > &
    (
      | { variables: GetUserByEmailQueryVariables; skip?: boolean }
      | { skip: boolean }
    ),
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useQuery<GetUserByEmailQuery, GetUserByEmailQueryVariables>(
    GetUserByEmail,
    options,
  );
}
export function useGetUserByEmailLazyQuery(
  baseOptions?: Apollo.LazyQueryHookOptions<
    GetUserByEmailQuery,
    GetUserByEmailQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useLazyQuery<GetUserByEmailQuery, GetUserByEmailQueryVariables>(
    GetUserByEmail,
    options,
  );
}
export function useGetUserByEmailSuspenseQuery(
  baseOptions?:
    | Apollo.SkipToken
    | Apollo.SuspenseQueryHookOptions<
        GetUserByEmailQuery,
        GetUserByEmailQueryVariables
      >,
) {
  const options =
    baseOptions === Apollo.skipToken
      ? baseOptions
      : { ...defaultOptions, ...baseOptions };
  return Apollo.useSuspenseQuery<
    GetUserByEmailQuery,
    GetUserByEmailQueryVariables
  >(
    GetUserByEmail,
    options as
      | Apollo.SkipToken
      | Apollo.SuspenseQueryHookOptions<
          GetUserByEmailQuery,
          GetUserByEmailQueryVariables
        >,
  );
}
export type GetUserByEmailQueryHookResult = ReturnType<
  typeof useGetUserByEmailQuery
>;
export type GetUserByEmailLazyQueryHookResult = ReturnType<
  typeof useGetUserByEmailLazyQuery
>;
export type GetUserByEmailSuspenseQueryHookResult = ReturnType<
  typeof useGetUserByEmailSuspenseQuery
>;
export type GetUserByEmailQueryResult = Apollo.QueryResult<
  GetUserByEmailQuery,
  GetUserByEmailQueryVariables
>;
export const GetLeaguesForUser = gql`
  query GetLeaguesForUser(
    $id: Int!
    $withMembers: Boolean = false
    $withMatchup: Boolean = false
    $withTeams: Boolean = false
  ) {
    user(id: $id) {
      ...User
    }
  }
  ${UserFragmentDoc}
`;

/**
 * __useGetLeaguesForUserQuery__
 *
 * To run a query within a React component, call `useGetLeaguesForUserQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetLeaguesForUserQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetLeaguesForUserQuery({
 *   variables: {
 *      id: // value for 'id'
 *      withMembers: // value for 'withMembers'
 *      withMatchup: // value for 'withMatchup'
 *      withTeams: // value for 'withTeams'
 *   },
 * });
 */
export function useGetLeaguesForUserQuery(
  baseOptions: Apollo.QueryHookOptions<
    GetLeaguesForUserQuery,
    GetLeaguesForUserQueryVariables
  > &
    (
      | { variables: GetLeaguesForUserQueryVariables; skip?: boolean }
      | { skip: boolean }
    ),
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useQuery<
    GetLeaguesForUserQuery,
    GetLeaguesForUserQueryVariables
  >(GetLeaguesForUser, options);
}
export function useGetLeaguesForUserLazyQuery(
  baseOptions?: Apollo.LazyQueryHookOptions<
    GetLeaguesForUserQuery,
    GetLeaguesForUserQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useLazyQuery<
    GetLeaguesForUserQuery,
    GetLeaguesForUserQueryVariables
  >(GetLeaguesForUser, options);
}
export function useGetLeaguesForUserSuspenseQuery(
  baseOptions?:
    | Apollo.SkipToken
    | Apollo.SuspenseQueryHookOptions<
        GetLeaguesForUserQuery,
        GetLeaguesForUserQueryVariables
      >,
) {
  const options =
    baseOptions === Apollo.skipToken
      ? baseOptions
      : { ...defaultOptions, ...baseOptions };
  return Apollo.useSuspenseQuery<
    GetLeaguesForUserQuery,
    GetLeaguesForUserQueryVariables
  >(
    GetLeaguesForUser,
    options as
      | Apollo.SkipToken
      | Apollo.SuspenseQueryHookOptions<
          GetLeaguesForUserQuery,
          GetLeaguesForUserQueryVariables
        >,
  );
}
export type GetLeaguesForUserQueryHookResult = ReturnType<
  typeof useGetLeaguesForUserQuery
>;
export type GetLeaguesForUserLazyQueryHookResult = ReturnType<
  typeof useGetLeaguesForUserLazyQuery
>;
export type GetLeaguesForUserSuspenseQueryHookResult = ReturnType<
  typeof useGetLeaguesForUserSuspenseQuery
>;
export type GetLeaguesForUserQueryResult = Apollo.QueryResult<
  GetLeaguesForUserQuery,
  GetLeaguesForUserQueryVariables
>;
export const GetUserById = gql`
  query GetUserById($id: Int!) {
    user(id: $id) {
      ...User
    }
  }
  ${UserFragmentDoc}
`;

/**
 * __useGetUserByIdQuery__
 *
 * To run a query within a React component, call `useGetUserByIdQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetUserByIdQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetUserByIdQuery({
 *   variables: {
 *      id: // value for 'id'
 *   },
 * });
 */
export function useGetUserByIdQuery(
  baseOptions: Apollo.QueryHookOptions<
    GetUserByIdQuery,
    GetUserByIdQueryVariables
  > &
    (
      | { variables: GetUserByIdQueryVariables; skip?: boolean }
      | { skip: boolean }
    ),
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useQuery<GetUserByIdQuery, GetUserByIdQueryVariables>(
    GetUserById,
    options,
  );
}
export function useGetUserByIdLazyQuery(
  baseOptions?: Apollo.LazyQueryHookOptions<
    GetUserByIdQuery,
    GetUserByIdQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useLazyQuery<GetUserByIdQuery, GetUserByIdQueryVariables>(
    GetUserById,
    options,
  );
}
export function useGetUserByIdSuspenseQuery(
  baseOptions?:
    | Apollo.SkipToken
    | Apollo.SuspenseQueryHookOptions<
        GetUserByIdQuery,
        GetUserByIdQueryVariables
      >,
) {
  const options =
    baseOptions === Apollo.skipToken
      ? baseOptions
      : { ...defaultOptions, ...baseOptions };
  return Apollo.useSuspenseQuery<GetUserByIdQuery, GetUserByIdQueryVariables>(
    GetUserById,
    options as
      | Apollo.SkipToken
      | Apollo.SuspenseQueryHookOptions<
          GetUserByIdQuery,
          GetUserByIdQueryVariables
        >,
  );
}
export type GetUserByIdQueryHookResult = ReturnType<typeof useGetUserByIdQuery>;
export type GetUserByIdLazyQueryHookResult = ReturnType<
  typeof useGetUserByIdLazyQuery
>;
export type GetUserByIdSuspenseQueryHookResult = ReturnType<
  typeof useGetUserByIdSuspenseQuery
>;
export type GetUserByIdQueryResult = Apollo.QueryResult<
  GetUserByIdQuery,
  GetUserByIdQueryVariables
>;
export const UpdateUsername = gql`
  mutation UpdateUsername($username: String!) {
    updateUsername(username: $username) {
      ...User
    }
  }
  ${UserFragmentDoc}
`;
export type UpdateUsernameMutationFn = MutationFunction<
  UpdateUsernameMutation,
  UpdateUsernameMutationVariables
>;

/**
 * __useUpdateUsernameMutation__
 *
 * To run a mutation, you first call `useUpdateUsernameMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUpdateUsernameMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [updateUsernameMutation, { data, loading, error }] = useUpdateUsernameMutation({
 *   variables: {
 *      username: // value for 'username'
 *   },
 * });
 */
export function useUpdateUsernameMutation(
  baseOptions?: Apollo.MutationHookOptions<
    UpdateUsernameMutation,
    UpdateUsernameMutationVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useMutation<
    UpdateUsernameMutation,
    UpdateUsernameMutationVariables
  >(UpdateUsername, options);
}
export type UpdateUsernameMutationHookResult = ReturnType<
  typeof useUpdateUsernameMutation
>;
export type UpdateUsernameMutationResult =
  Apollo.MutationResult<UpdateUsernameMutation>;
export type UpdateUsernameMutationOptions = BaseMutationOptions<
  UpdateUsernameMutation,
  UpdateUsernameMutationVariables
>;
export const UpdateUserAvatar = gql`
  mutation UpdateUserAvatar($avatarUrl: String) {
    updateUserAvatar(avatarUrl: $avatarUrl) {
      id
      username
      avatarUrl
    }
  }
`;
export type UpdateUserAvatarMutationFn = MutationFunction<
  UpdateUserAvatarMutation,
  UpdateUserAvatarMutationVariables
>;

/**
 * __useUpdateUserAvatarMutation__
 *
 * To run a mutation, you first call `useUpdateUserAvatarMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUpdateUserAvatarMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [updateUserAvatarMutation, { data, loading, error }] = useUpdateUserAvatarMutation({
 *   variables: {
 *      avatarUrl: // value for 'avatarUrl'
 *   },
 * });
 */
export function useUpdateUserAvatarMutation(
  baseOptions?: Apollo.MutationHookOptions<
    UpdateUserAvatarMutation,
    UpdateUserAvatarMutationVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useMutation<
    UpdateUserAvatarMutation,
    UpdateUserAvatarMutationVariables
  >(UpdateUserAvatar, options);
}
export type UpdateUserAvatarMutationHookResult = ReturnType<
  typeof useUpdateUserAvatarMutation
>;
export type UpdateUserAvatarMutationResult =
  Apollo.MutationResult<UpdateUserAvatarMutation>;
export type UpdateUserAvatarMutationOptions = BaseMutationOptions<
  UpdateUserAvatarMutation,
  UpdateUserAvatarMutationVariables
>;
