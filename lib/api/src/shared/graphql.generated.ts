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

/** Aggregated vote count for a player in an award category */
export type AwardVoteResult = {
  __typename?: 'AwardVoteResult';
  awardType?: Maybe<Scalars['String']['output']>;
  playerFirstName?: Maybe<Scalars['String']['output']>;
  playerId?: Maybe<Scalars['Int']['output']>;
  playerLastName?: Maybe<Scalars['String']['output']>;
  voteCount?: Maybe<Scalars['Int']['output']>;
};

/** A voting period for season awards in a league */
export type AwardVotingPeriod = {
  __typename?: 'AwardVotingPeriod';
  /** Award type keys included in this vote */
  awardTypes?: Maybe<Array<Scalars['String']['output']>>;
  closedAt?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  leagueId?: Maybe<Scalars['Int']['output']>;
  openedAt?: Maybe<Scalars['String']['output']>;
  season?: Maybe<Scalars['Int']['output']>;
  /** "open" or "closed" */
  status?: Maybe<Scalars['String']['output']>;
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

export type BaseballMatchupPlayer = {
  __typename?: 'BaseballMatchupPlayer';
  playerId: Scalars['Int']['output'];
  playerName: Scalars['String']['output'];
  position: Scalars['String']['output'];
  totalPoints: Scalars['Float']['output'];
};

export type BaseballMatchupStats = {
  __typename?: 'BaseballMatchupStats';
  players: Array<BaseballMatchupPlayer>;
  teamId: Scalars['Int']['output'];
  teamName: Scalars['String']['output'];
  totalPoints: Scalars['Float']['output'];
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
  /** Offensive WAR (oWAR) from Baseball Reference. Career total is the sum of per-season bwar values, rounded to one decimal. */
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

export type CleanupLeakedTestUsersResult = {
  __typename?: 'CleanupLeakedTestUsersResult';
  deleted?: Maybe<Scalars['Int']['output']>;
  dryRun?: Maybe<Scalars['Boolean']['output']>;
  errors?: Maybe<Array<Scalars['String']['output']>>;
  matched?: Maybe<Scalars['Int']['output']>;
  minAgeDays?: Maybe<Scalars['Int']['output']>;
  sampleEmails?: Maybe<Array<Scalars['String']['output']>>;
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
  baseballHofOnly?: InputMaybe<Scalars['Boolean']['input']>;
  customEraEndYear?: InputMaybe<Scalars['Int']['input']>;
  customEraStartYear?: InputMaybe<Scalars['Int']['input']>;
  defensiveFormat?: InputMaybe<DefensiveFormat>;
  draftMode?: InputMaybe<Scalars['String']['input']>;
  draftOrder?: InputMaybe<Scalars['String']['input']>;
  eraFilter?: InputMaybe<Scalars['String']['input']>;
  faabBudgetDefault?: InputMaybe<Scalars['Int']['input']>;
  gamesPerMatchup?: InputMaybe<Scalars['Int']['input']>;
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
  scoringFormat?: InputMaybe<Scalars['String']['input']>;
  selectionMethod?: InputMaybe<Scalars['String']['input']>;
  sport?: InputMaybe<Sport>;
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

/** Defensive scoring format for football leagues: dst (team defense) or idp (individual defensive players). */
export enum DefensiveFormat {
  Dst = 'dst',
  Idp = 'idp',
}

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

/** A single clue revealed during a disclosure game session */
export type DisclosureClue = {
  __typename?: 'DisclosureClue';
  /** 1-based position of this clue in the session */
  clueIndex?: Maybe<Scalars['Int']['output']>;
  /** Human-readable fact about the mystery player */
  clueText?: Maybe<Scalars['String']['output']>;
  /** Difficulty tier of this clue (vague | moderate | identifying) */
  difficultyTier?: Maybe<Scalars['String']['output']>;
  /** True when this is the final clue — calling nextClue again will end the session */
  isLastClue?: Maybe<Scalars['Boolean']['output']>;
  /** Total number of clues available for this session */
  totalClues?: Maybe<Scalars['Int']['output']>;
};

/** State of a disclosure game session */
export type DisclosureGameSession = {
  __typename?: 'DisclosureGameSession';
  /** Number of clues revealed so far */
  cluesRevealed?: Maybe<Scalars['Int']['output']>;
  completedAt?: Maybe<Scalars['String']['output']>;
  /** The correct player ID — only revealed after the session ends */
  correctPlayerId?: Maybe<Scalars['Int']['output']>;
  createdAt?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  /** Final score — null while session is active */
  score?: Maybe<Scalars['Int']['output']>;
  /** Session status */
  status?: Maybe<DisclosureSessionStatus>;
  /** Total clues available for this session */
  totalClues?: Maybe<Scalars['Int']['output']>;
};

/** Result of a guess submission */
export type DisclosureGuessResult = {
  __typename?: 'DisclosureGuessResult';
  /** Number of clues revealed before this guess */
  cluesUsed?: Maybe<Scalars['Int']['output']>;
  correct?: Maybe<Scalars['Boolean']['output']>;
  /** Correct player ID — only returned after a wrong guess when all clues are exhausted */
  correctPlayerId?: Maybe<Scalars['Int']['output']>;
  /** Points earned — only meaningful when correct is true */
  score?: Maybe<Scalars['Int']['output']>;
};

/** Current status of a disclosure game session */
export enum DisclosureSessionStatus {
  Active = 'active',
  GivenUp = 'given_up',
  Lost = 'lost',
  Won = 'won',
}

export type DonationPaymentLinkResult = {
  __typename?: 'DonationPaymentLinkResult';
  url: Scalars['String']['output'];
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
  /** The drafted player. Enables the draft board to render pick names without a secondary lookup. */
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

export type ExpireSubscriptionGracePeriodsResult = {
  __typename?: 'ExpireSubscriptionGracePeriodsResult';
  errors?: Maybe<Array<Scalars['String']['output']>>;
  expired?: Maybe<Scalars['Int']['output']>;
};

export type FootballCareerDefense = {
  __typename?: 'FootballCareerDefense';
  defTd?: Maybe<Scalars['Int']['output']>;
  fumRec?: Maybe<Scalars['Int']['output']>;
  g?: Maybe<Scalars['Int']['output']>;
  int?: Maybe<Scalars['Int']['output']>;
  ptsAllowedPerG?: Maybe<Scalars['Float']['output']>;
  sacks?: Maybe<Scalars['Float']['output']>;
  safeties?: Maybe<Scalars['Int']['output']>;
  ydsAllowedPerG?: Maybe<Scalars['Float']['output']>;
};

/** Career IDP totals aggregated from season_defense_idp (LS-4155) */
export type FootballCareerIdp = {
  __typename?: 'FootballCareerIdp';
  astTkl?: Maybe<Scalars['Int']['output']>;
  defTd?: Maybe<Scalars['Int']['output']>;
  ff?: Maybe<Scalars['Int']['output']>;
  fr?: Maybe<Scalars['Int']['output']>;
  g?: Maybe<Scalars['Int']['output']>;
  int?: Maybe<Scalars['Int']['output']>;
  pd?: Maybe<Scalars['Int']['output']>;
  sacks?: Maybe<Scalars['Float']['output']>;
  safeties?: Maybe<Scalars['Int']['output']>;
  soloTkl?: Maybe<Scalars['Int']['output']>;
  totalTkl?: Maybe<Scalars['Int']['output']>;
};

export type FootballCareerKicking = {
  __typename?: 'FootballCareerKicking';
  fg019a?: Maybe<Scalars['Int']['output']>;
  fg019m?: Maybe<Scalars['Int']['output']>;
  fg50a?: Maybe<Scalars['Int']['output']>;
  fg50m?: Maybe<Scalars['Int']['output']>;
  fg2029a?: Maybe<Scalars['Int']['output']>;
  fg2029m?: Maybe<Scalars['Int']['output']>;
  fg3039a?: Maybe<Scalars['Int']['output']>;
  fg3039m?: Maybe<Scalars['Int']['output']>;
  fg4049a?: Maybe<Scalars['Int']['output']>;
  fg4049m?: Maybe<Scalars['Int']['output']>;
  fga?: Maybe<Scalars['Int']['output']>;
  fgm?: Maybe<Scalars['Int']['output']>;
  g?: Maybe<Scalars['Int']['output']>;
  lng?: Maybe<Scalars['Int']['output']>;
  xpa?: Maybe<Scalars['Int']['output']>;
  xpm?: Maybe<Scalars['Int']['output']>;
};

export type FootballCareerPassing = {
  __typename?: 'FootballCareerPassing';
  att?: Maybe<Scalars['Int']['output']>;
  cmp?: Maybe<Scalars['Int']['output']>;
  g?: Maybe<Scalars['Int']['output']>;
  int?: Maybe<Scalars['Int']['output']>;
  rating?: Maybe<Scalars['Float']['output']>;
  sackYds?: Maybe<Scalars['Int']['output']>;
  sacked?: Maybe<Scalars['Int']['output']>;
  td?: Maybe<Scalars['Int']['output']>;
  yds?: Maybe<Scalars['Int']['output']>;
};

export type FootballCareerReceiving = {
  __typename?: 'FootballCareerReceiving';
  fumbles?: Maybe<Scalars['Int']['output']>;
  g?: Maybe<Scalars['Int']['output']>;
  lng?: Maybe<Scalars['Int']['output']>;
  rec?: Maybe<Scalars['Int']['output']>;
  td?: Maybe<Scalars['Int']['output']>;
  tgt?: Maybe<Scalars['Int']['output']>;
  yds?: Maybe<Scalars['Int']['output']>;
};

export type FootballCareerRushing = {
  __typename?: 'FootballCareerRushing';
  att?: Maybe<Scalars['Int']['output']>;
  fumbles?: Maybe<Scalars['Int']['output']>;
  g?: Maybe<Scalars['Int']['output']>;
  lng?: Maybe<Scalars['Int']['output']>;
  td?: Maybe<Scalars['Int']['output']>;
  yds?: Maybe<Scalars['Int']['output']>;
};

/** Career stat totals across all stat categories (LS-250, LS-4155) */
export type FootballCareerStats = {
  __typename?: 'FootballCareerStats';
  defense?: Maybe<FootballCareerDefense>;
  idp?: Maybe<FootballCareerIdp>;
  kicking?: Maybe<FootballCareerKicking>;
  passing?: Maybe<FootballCareerPassing>;
  receiving?: Maybe<FootballCareerReceiving>;
  rushing?: Maybe<FootballCareerRushing>;
};

/** Per-game DST (team defense) stats for a football matchup player */
export type FootballGameDefenseStats = {
  __typename?: 'FootballGameDefenseStats';
  defTd?: Maybe<Scalars['Int']['output']>;
  fumRec?: Maybe<Scalars['Int']['output']>;
  int?: Maybe<Scalars['Int']['output']>;
  ptsAllowed?: Maybe<Scalars['Int']['output']>;
  sacks?: Maybe<Scalars['Float']['output']>;
  safeties?: Maybe<Scalars['Int']['output']>;
  ydsAllowed?: Maybe<Scalars['Int']['output']>;
};

/** Per-game IDP (individual defensive player) stats */
export type FootballGameIdpStats = {
  __typename?: 'FootballGameIDPStats';
  astTkl?: Maybe<Scalars['Int']['output']>;
  defTd?: Maybe<Scalars['Int']['output']>;
  ff?: Maybe<Scalars['Int']['output']>;
  fr?: Maybe<Scalars['Int']['output']>;
  int?: Maybe<Scalars['Int']['output']>;
  pd?: Maybe<Scalars['Int']['output']>;
  sacks?: Maybe<Scalars['Float']['output']>;
  safeties?: Maybe<Scalars['Int']['output']>;
  soloTkl?: Maybe<Scalars['Int']['output']>;
};

/** Per-game kicking stats for a football matchup player */
export type FootballGameKickingStats = {
  __typename?: 'FootballGameKickingStats';
  fga?: Maybe<Scalars['Int']['output']>;
  fgm?: Maybe<Scalars['Int']['output']>;
  xpa?: Maybe<Scalars['Int']['output']>;
  xpm?: Maybe<Scalars['Int']['output']>;
};

/** Per-game passing stats for a football matchup player */
export type FootballGamePassingStats = {
  __typename?: 'FootballGamePassingStats';
  att?: Maybe<Scalars['Int']['output']>;
  cmp?: Maybe<Scalars['Int']['output']>;
  int?: Maybe<Scalars['Int']['output']>;
  td?: Maybe<Scalars['Int']['output']>;
  yds?: Maybe<Scalars['Int']['output']>;
};

/** Per-game receiving stats for a football matchup player */
export type FootballGameReceivingStats = {
  __typename?: 'FootballGameReceivingStats';
  rec?: Maybe<Scalars['Int']['output']>;
  td?: Maybe<Scalars['Int']['output']>;
  tgt?: Maybe<Scalars['Int']['output']>;
  yds?: Maybe<Scalars['Int']['output']>;
};

/** Per-game rushing stats for a football matchup player */
export type FootballGameRushingStats = {
  __typename?: 'FootballGameRushingStats';
  att?: Maybe<Scalars['Int']['output']>;
  td?: Maybe<Scalars['Int']['output']>;
  yds?: Maybe<Scalars['Int']['output']>;
};

/** A player on a football fantasy team in a matchup */
export type FootballMatchupPlayer = {
  __typename?: 'FootballMatchupPlayer';
  games: Array<FootballMatchupPlayerGame>;
  isDst: Scalars['Boolean']['output'];
  nflTeam?: Maybe<Scalars['String']['output']>;
  playerId: Scalars['Int']['output'];
  playerName: Scalars['String']['output'];
  position: Scalars['String']['output'];
  totalPoints: Scalars['Float']['output'];
};

/** A single NFL game played by a football matchup player */
export type FootballMatchupPlayerGame = {
  __typename?: 'FootballMatchupPlayerGame';
  defense?: Maybe<FootballGameDefenseStats>;
  fantasyPoints: Scalars['Float']['output'];
  gameDate?: Maybe<Scalars['String']['output']>;
  gameIdentifier: Scalars['String']['output'];
  gameNum: Scalars['Int']['output'];
  idp?: Maybe<FootballGameIdpStats>;
  kicking?: Maybe<FootballGameKickingStats>;
  opponent?: Maybe<Scalars['String']['output']>;
  passing?: Maybe<FootballGamePassingStats>;
  receiving?: Maybe<FootballGameReceivingStats>;
  rushing?: Maybe<FootballGameRushingStats>;
};

/** Stats for one team in a football matchup */
export type FootballMatchupStats = {
  __typename?: 'FootballMatchupStats';
  players: Array<FootballMatchupPlayer>;
  teamId: Scalars['Int']['output'];
  teamName: Scalars['String']['output'];
  totalPoints: Scalars['Float']['output'];
};

/** A football player (skill, IDP, or synthetic DST) with optional season and career stats (LS-255) */
export type FootballPlayer = {
  __typename?: 'FootballPlayer';
  careerStats?: Maybe<FootballCareerStats>;
  firstName: Scalars['String']['output'];
  id: Scalars['Int']['output'];
  isDst: Scalars['Boolean']['output'];
  lastName: Scalars['String']['output'];
  nflTeam?: Maybe<Scalars['String']['output']>;
  pfrId?: Maybe<Scalars['String']['output']>;
  position?: Maybe<Scalars['String']['output']>;
  seasonStats?: Maybe<FootballPlayerSeasonStats>;
};

/** A football player (skill, IDP, or synthetic DST) with optional season and career stats (LS-255) */
export type FootballPlayerSeasonStatsArgs = {
  season?: InputMaybe<Scalars['Int']['input']>;
};

/** All season stats across stat categories for a football player (LS-255) */
export type FootballPlayerSeasonStats = {
  __typename?: 'FootballPlayerSeasonStats';
  defense?: Maybe<Array<FootballSeasonDefense>>;
  idp?: Maybe<Array<FootballSeasonDefenseIdp>>;
  kicking?: Maybe<Array<FootballSeasonKicking>>;
  passing?: Maybe<Array<FootballSeasonPassing>>;
  receiving?: Maybe<Array<FootballSeasonReceiving>>;
  rushing?: Maybe<Array<FootballSeasonRushing>>;
};

/** Cursor-paginated list of football players (LS-255) */
export type FootballPlayersConnection = {
  __typename?: 'FootballPlayersConnection';
  nodes: Array<FootballPlayer>;
  pageInfo: FootballPlayersPageInfo;
};

export type FootballPlayersPageInfo = {
  __typename?: 'FootballPlayersPageInfo';
  endCursor?: Maybe<Scalars['String']['output']>;
  hasNextPage: Scalars['Boolean']['output'];
};

/** Season DST (team defense/special teams) stats for a football player (LS-247) */
export type FootballSeasonDefense = {
  __typename?: 'FootballSeasonDefense';
  defTd?: Maybe<Scalars['Int']['output']>;
  fumRec?: Maybe<Scalars['Int']['output']>;
  g?: Maybe<Scalars['Int']['output']>;
  int?: Maybe<Scalars['Int']['output']>;
  passYdsAllowed?: Maybe<Scalars['Int']['output']>;
  ptsAllowed?: Maybe<Scalars['Int']['output']>;
  rushYdsAllowed?: Maybe<Scalars['Int']['output']>;
  sacks?: Maybe<Scalars['Float']['output']>;
  safeties?: Maybe<Scalars['Int']['output']>;
  season?: Maybe<Scalars['Int']['output']>;
  team?: Maybe<Scalars['String']['output']>;
  ydsAllowed?: Maybe<Scalars['Int']['output']>;
};

/** Season individual defensive player (IDP) stats for a football player (LS-4155) */
export type FootballSeasonDefenseIdp = {
  __typename?: 'FootballSeasonDefenseIdp';
  astTkl?: Maybe<Scalars['Int']['output']>;
  defTd?: Maybe<Scalars['Int']['output']>;
  ff?: Maybe<Scalars['Int']['output']>;
  fr?: Maybe<Scalars['Int']['output']>;
  g?: Maybe<Scalars['Int']['output']>;
  gs?: Maybe<Scalars['Int']['output']>;
  int?: Maybe<Scalars['Int']['output']>;
  pd?: Maybe<Scalars['Int']['output']>;
  sacks?: Maybe<Scalars['Float']['output']>;
  safeties?: Maybe<Scalars['Int']['output']>;
  season?: Maybe<Scalars['Int']['output']>;
  soloTkl?: Maybe<Scalars['Int']['output']>;
  team?: Maybe<Scalars['String']['output']>;
  totalTkl?: Maybe<Scalars['Int']['output']>;
};

/** Season kicking stats for a football player (LS-247) */
export type FootballSeasonKicking = {
  __typename?: 'FootballSeasonKicking';
  fg019a?: Maybe<Scalars['Int']['output']>;
  fg019m?: Maybe<Scalars['Int']['output']>;
  fg50a?: Maybe<Scalars['Int']['output']>;
  fg50m?: Maybe<Scalars['Int']['output']>;
  fg2029a?: Maybe<Scalars['Int']['output']>;
  fg2029m?: Maybe<Scalars['Int']['output']>;
  fg3039a?: Maybe<Scalars['Int']['output']>;
  fg3039m?: Maybe<Scalars['Int']['output']>;
  fg4049a?: Maybe<Scalars['Int']['output']>;
  fg4049m?: Maybe<Scalars['Int']['output']>;
  fgPct?: Maybe<Scalars['Float']['output']>;
  fga?: Maybe<Scalars['Int']['output']>;
  fgm?: Maybe<Scalars['Int']['output']>;
  g?: Maybe<Scalars['Int']['output']>;
  lng?: Maybe<Scalars['Int']['output']>;
  season?: Maybe<Scalars['Int']['output']>;
  team?: Maybe<Scalars['String']['output']>;
  xpa?: Maybe<Scalars['Int']['output']>;
  xpm?: Maybe<Scalars['Int']['output']>;
};

/** Season passing stats for a football player (LS-247) */
export type FootballSeasonPassing = {
  __typename?: 'FootballSeasonPassing';
  att?: Maybe<Scalars['Int']['output']>;
  cmp?: Maybe<Scalars['Int']['output']>;
  g?: Maybe<Scalars['Int']['output']>;
  gs?: Maybe<Scalars['Int']['output']>;
  int?: Maybe<Scalars['Int']['output']>;
  lng?: Maybe<Scalars['Int']['output']>;
  rating?: Maybe<Scalars['Float']['output']>;
  sackYds?: Maybe<Scalars['Int']['output']>;
  sacked?: Maybe<Scalars['Int']['output']>;
  season?: Maybe<Scalars['Int']['output']>;
  td?: Maybe<Scalars['Int']['output']>;
  team?: Maybe<Scalars['String']['output']>;
  yds?: Maybe<Scalars['Int']['output']>;
};

/** Season receiving stats for a football player (LS-247) */
export type FootballSeasonReceiving = {
  __typename?: 'FootballSeasonReceiving';
  firstDowns?: Maybe<Scalars['Int']['output']>;
  fumbles?: Maybe<Scalars['Int']['output']>;
  g?: Maybe<Scalars['Int']['output']>;
  gs?: Maybe<Scalars['Int']['output']>;
  lng?: Maybe<Scalars['Int']['output']>;
  rec?: Maybe<Scalars['Int']['output']>;
  season?: Maybe<Scalars['Int']['output']>;
  td?: Maybe<Scalars['Int']['output']>;
  team?: Maybe<Scalars['String']['output']>;
  tgt?: Maybe<Scalars['Int']['output']>;
  yds?: Maybe<Scalars['Int']['output']>;
  ydsPerRec?: Maybe<Scalars['Float']['output']>;
};

/** Season rushing stats for a football player (LS-247) */
export type FootballSeasonRushing = {
  __typename?: 'FootballSeasonRushing';
  att?: Maybe<Scalars['Int']['output']>;
  firstDowns?: Maybe<Scalars['Int']['output']>;
  fumbles?: Maybe<Scalars['Int']['output']>;
  g?: Maybe<Scalars['Int']['output']>;
  gs?: Maybe<Scalars['Int']['output']>;
  lng?: Maybe<Scalars['Int']['output']>;
  season?: Maybe<Scalars['Int']['output']>;
  td?: Maybe<Scalars['Int']['output']>;
  team?: Maybe<Scalars['String']['output']>;
  yds?: Maybe<Scalars['Int']['output']>;
  ydsPerAtt?: Maybe<Scalars['Float']['output']>;
};

/** Result of a football stats refresh job triggered by EventBridge */
export type FootballStatsRefreshResult = {
  __typename?: 'FootballStatsRefreshResult';
  errors?: Maybe<Array<Scalars['String']['output']>>;
  /** Human-readable explanation of the outcome */
  reason?: Maybe<Scalars['String']['output']>;
  /** Whether the stats refresh was actually triggered (false when out of season or handler not yet available) */
  triggered?: Maybe<Scalars['Boolean']['output']>;
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

/** Result of giving up a disclosure game session */
export type GiveUpDisclosureGameResult = {
  __typename?: 'GiveUpDisclosureGameResult';
  /** The correct player ID revealed after forfeiting */
  correctPlayerId?: Maybe<Scalars['Int']['output']>;
  /** The correct player name revealed after forfeiting */
  correctPlayerName?: Maybe<Scalars['String']['output']>;
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
  baseballHofOnly?: Maybe<Scalars['Boolean']['output']>;
  currentMatchup?: Maybe<Scalars['Int']['output']>;
  currentWeek?: Maybe<Scalars['Int']['output']>;
  /** The current active week number for the league */
  currentWeekNumber?: Maybe<Scalars['Int']['output']>;
  customEraEndYear?: Maybe<Scalars['Int']['output']>;
  customEraStartYear?: Maybe<Scalars['Int']['output']>;
  /** Defensive scoring format for football leagues: dst (team defense) or idp (individual defensive players). Null for baseball leagues. (LS-246/LS-257) */
  defensiveFormat?: Maybe<DefensiveFormat>;
  draftStatus?: Maybe<Scalars['String']['output']>;
  eraFilter?: Maybe<Scalars['String']['output']>;
  faabBudgetDefault?: Maybe<Scalars['Int']['output']>;
  frozenAt?: Maybe<Scalars['String']['output']>;
  gamesPerMatchup?: Maybe<Scalars['Int']['output']>;
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
  pitcherStartsPerMatchup?: Maybe<Scalars['Int']['output']>;
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
  /** Sport for this league (baseball or football). (LS-4628) */
  sport?: Maybe<Sport>;
  /** ISO timestamp set when this league was frozen due to a subscription tier downgrade. Null when the league is active or frozen for a different reason (season retirement). Cleared on re-upgrade or when the owner re-selects this league as one of their active free-tier leagues. */
  tierFrozenAt?: Maybe<Scalars['String']['output']>;
  totalMatchups?: Maybe<Scalars['Int']['output']>;
  tradeDeadlineWeek?: Maybe<Scalars['Int']['output']>;
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
  pitcherStartsPerMatchup?: Maybe<Scalars['Int']['output']>;
  /** Auto-generated narrative recap, only available for completed matchups. */
  recap?: Maybe<MatchupRecap>;
  /** Number of unique games selected for this matchup */
  selectedGamesCount?: Maybe<Scalars['Int']['output']>;
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
  /** Number of games this player is expected to play in this matchup (SP uses pitcherStartsPerMatchup, others use gamesPerMatchup) */
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
  gameIdentifier?: Maybe<Scalars['String']['output']>;
  gameNum?: Maybe<Scalars['Int']['output']>;
  gamePosition?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  matchupPlayerId?: Maybe<Scalars['Int']['output']>;
  pitcherStartSkipped?: Maybe<Scalars['Boolean']['output']>;
  pitchingGame?: Maybe<GamePitching>;
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

export type MatchupStats = BaseballMatchupStats | FootballMatchupStats;

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

/** Aggregate statistics about the baseball database powering the minigames */
export type MinigamesStats = {
  __typename?: 'MinigamesStats';
  /** Earliest season year in the database */
  earliestYear?: Maybe<Scalars['Int']['output']>;
  /** Total number of player-season batting records in the database */
  playerSeasons?: Maybe<Scalars['Int']['output']>;
  /** Total number of distinct players tracked */
  playersTracked?: Maybe<Scalars['Int']['output']>;
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
  adminRegenerateLeagueSchedule?: Maybe<AdvanceLeagueWeekResponse>;
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
  /** Cast or update a vote for a season award. League membership required. Voting must be open. */
  castAwardVote?: Maybe<Scalars['Boolean']['output']>;
  claimFreeAgent?: Maybe<WaiverClaim>;
  /** Admin only: delete leaked `int-*@test.legacysports.dev` test users older than `minAgeDays` (default 7). Pass `dryRun: true` to preview the match set. */
  cleanupLeakedTestUsers?: Maybe<CleanupLeakedTestUsersResult>;
  /** Close voting and tally results. Winners are stored in league_season_awards. Commissioner access required. */
  closeAwardVoting?: Maybe<AwardVotingPeriod>;
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
  /** Create a new Season Draft Game. The creator is added automatically; others join via invite link. */
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
  /** Downgrade premium subscriptions whose grace_period_ends_at has passed. System / admin only. Triggered hourly by EventBridge. */
  expireSubscriptionGracePeriods?: Maybe<ExpireSubscriptionGracePeriodsResult>;
  /** Commissioner: force-add a player to a team, bypassing normal acquisition rules. */
  forceAddPlayer?: Maybe<CommissionerActionResult>;
  /** Commissioner: force-drop a player from a team. */
  forceDropPlayer?: Maybe<CommissionerActionResult>;
  /** Give up the current session. Reveals the correct player without awarding points. */
  giveUpDisclosureGame?: Maybe<GiveUpDisclosureGameResult>;
  /** Admin only: generate a JWT that authenticates as the specified user for debugging purposes. */
  impersonateUser?: Maybe<ImpersonateUserResult>;
  initializeDraft?: Maybe<Draft>;
  /** Create an ephemeral mock draft league to practice drafting against AI teams. Picks are recorded but rosters are not persisted to any real league. */
  initializeMockDraft?: Maybe<MockDraftInit>;
  inviteAssistantManager?: Maybe<LeagueMember>;
  joinLeague?: Maybe<JoinLeaguePayload>;
  joinLeagueByCode?: Maybe<Team>;
  joinPublicLeague?: Maybe<JoinLeaguePayload>;
  /** Join a Season Draft Game via invite code. Returns the game ID. */
  joinSeasonDraftGame?: Maybe<Scalars['Int']['output']>;
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
  /** Reveal the next clue for the given session. Increments clues-revealed counter. */
  nextClue?: Maybe<DisclosureClue>;
  nominatePlayer?: Maybe<AuctionState>;
  /** Open a voting period for season awards. Commissioner access required. */
  openAwardVoting?: Maybe<AwardVotingPeriod>;
  pauseDraft?: Maybe<Draft>;
  placeBid?: Maybe<AuctionState>;
  postLeagueAnnouncement?: Maybe<LeagueChatMessage>;
  processWaiverClaims?: Maybe<ProcessWaiverClaimsResult>;
  /** Propose a trade to another team. Provide the players you are offering and the players you want in return. */
  proposeTrade?: Maybe<TradeOffer>;
  randomizeDraftOrder?: Maybe<Draft>;
  /** Commissioner: recalculate all matchup scores for a league (or a specific week) using the current scoring profile. */
  recalculateLeagueMatchupScores?: Maybe<RecalculateMatchupScoresResult>;
  /** Record user consent for a specific data processing type */
  recordConsent?: Maybe<UserConsent>;
  /** Refresh PFR career stats for all football players after the NFL season ends. Triggered once per year on March 1 by EventBridge; system-only. */
  refreshFootballCareerStats?: Maybe<FootballStatsRefreshResult>;
  /** Refresh PFR season-totals for players on active football leagues. No-ops outside the NFL season window (Sept 1 – Feb 15). Triggered weekly by EventBridge; system-only. */
  refreshFootballWeeklySeasonStats?: Maybe<FootballStatsRefreshResult>;
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
  /** Start a new progressive disclosure game session. Returns session ID and total clue count. */
  startDisclosureGame?: Maybe<StartDisclosureGameResult>;
  startDraft?: Maybe<League>;
  startSeason?: Maybe<League>;
  /** Start a Season Draft Game (move from setup to drafting) */
  startSeasonDraftGame?: Maybe<Scalars['Boolean']['output']>;
  /** Submit a player ID as a guess. Returns correct/incorrect and score (if correct). */
  submitGuess?: Maybe<DisclosureGuessResult>;
  swapMatchupPlayerPositions?: Maybe<Array<MatchupPlayer>>;
  /** Commissioner: swap the team assignments between two matchups in the same league. */
  swapMatchupTeams?: Maybe<CommissionerActionResult>;
  swapTeamMemberPositions?: Maybe<Array<TeamMember>>;
  /** Enable or disable auto-pick for the current user's team in a live draft. When enabled the system immediately picks for them as soon as their turn begins. Enabling also activates automatically when a team misses a pick. */
  toggleDraftAutoPick?: Maybe<Scalars['Boolean']['output']>;
  /** Trigger stat loading for a baseball player if stats have not been fetched yet. Returns true if loading was triggered, false if stats already exist. */
  triggerSeasonDraftStatLoading?: Maybe<Scalars['Boolean']['output']>;
  /** Abandon an active game — returns final game state */
  twentyQuestionsAbandon?: Maybe<TwentyQuestionsGame>;
  /** Ask a yes/no question — returns updated game state */
  twentyQuestionsAsk?: Maybe<TwentyQuestionsGame>;
  /** Guess the player identity — returns updated game state (with targetPlayer if won/lost) */
  twentyQuestionsGuess?: Maybe<TwentyQuestionsGame>;
  /** Start a new 20 Questions game (errors if an active game exists) */
  twentyQuestionsStart?: Maybe<TwentyQuestionsGame>;
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
  /** Update the theme preference ("system" | "light" | "dark") for the currently authenticated user. Syncs the choice across devices (LS-4913). */
  updateUserTheme?: Maybe<User>;
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

export type MutationAdminRegenerateLeagueScheduleArgs = {
  leagueId: Scalars['Int']['input'];
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

export type MutationCastAwardVoteArgs = {
  awardType: Scalars['String']['input'];
  leagueId: Scalars['Int']['input'];
  playerId: Scalars['Int']['input'];
  season: Scalars['Int']['input'];
};

export type MutationClaimFreeAgentArgs = {
  dropPlayerId?: InputMaybe<Scalars['Int']['input']>;
  faabBid?: InputMaybe<Scalars['Int']['input']>;
  leagueId: Scalars['Int']['input'];
  playerId: Scalars['Int']['input'];
};

export type MutationCleanupLeakedTestUsersArgs = {
  dryRun: Scalars['Boolean']['input'];
  minAgeDays?: InputMaybe<Scalars['Int']['input']>;
};

export type MutationCloseAwardVotingArgs = {
  leagueId: Scalars['Int']['input'];
  season: Scalars['Int']['input'];
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
  sport?: InputMaybe<Sport>;
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
  playerType?: InputMaybe<Scalars['String']['input']>;
  sport?: InputMaybe<Sport>;
  statKey?: InputMaybe<Scalars['String']['input']>;
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

export type MutationGiveUpDisclosureGameArgs = {
  sessionId: Scalars['Int']['input'];
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
  draftOrder?: InputMaybe<Scalars['String']['input']>;
  numTeams: Scalars['Int']['input'];
  pickTimeLimitSeconds?: InputMaybe<Scalars['Int']['input']>;
  playerPool?: InputMaybe<Scalars['String']['input']>;
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

export type MutationJoinSeasonDraftGameArgs = {
  inviteCode: Scalars['String']['input'];
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

export type MutationNextClueArgs = {
  sessionId: Scalars['Int']['input'];
};

export type MutationNominatePlayerArgs = {
  draftId: Scalars['Int']['input'];
  playerId: Scalars['Int']['input'];
};

export type MutationOpenAwardVotingArgs = {
  awardTypes: Array<Scalars['String']['input']>;
  leagueId: Scalars['Int']['input'];
  season: Scalars['Int']['input'];
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

export type MutationRecalculateLeagueMatchupScoresArgs = {
  input: RecalculateMatchupScoresInput;
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

export type MutationSubmitGuessArgs = {
  guessedPlayerId: Scalars['Int']['input'];
  sessionId: Scalars['Int']['input'];
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

export type MutationTwentyQuestionsAbandonArgs = {
  gameId: Scalars['String']['input'];
};

export type MutationTwentyQuestionsAskArgs = {
  input: TwentyQuestionsAskInput;
};

export type MutationTwentyQuestionsGuessArgs = {
  gameId: Scalars['String']['input'];
  playerId: Scalars['Int']['input'];
};

export type MutationTwentyQuestionsStartArgs = {
  difficulty?: InputMaybe<TwentyQuestionsDifficulty>;
  sport?: InputMaybe<Sport>;
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

export type MutationUpdateUserThemeArgs = {
  themePreference: Scalars['String']['input'];
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

/** The current user's vote for a specific award type */
export type MyAwardVote = {
  __typename?: 'MyAwardVote';
  awardType?: Maybe<Scalars['String']['output']>;
  playerFirstName?: Maybe<Scalars['String']['output']>;
  playerId?: Maybe<Scalars['Int']['output']>;
  playerLastName?: Maybe<Scalars['String']['output']>;
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
  /** MLB Stats API player ID for cross-referencing with the external data provider. Null for players without a known mapping. */
  mlbPlayerId?: Maybe<Scalars['Int']['output']>;
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
  /** Aggregated vote results for a league season. No voter identity is exposed. */
  awardVoteResults?: Maybe<Array<AwardVoteResult>>;
  /** Get the voting period for a league and season (if any) */
  awardVotingPeriod?: Maybe<AwardVotingPeriod>;
  careerBattingStats?: Maybe<CareerBattingConnection>;
  careerFieldingStats?: Maybe<Array<CareerFielding>>;
  careerPitchingStats?: Maybe<Array<CareerPitching>>;
  careerPitchingStatsCount?: Maybe<Scalars['Int']['output']>;
  /** Commissioner: fetch the audit log for all commissioner actions in a league. */
  commissionerAuditLogs?: Maybe<Array<CommissionerAuditLog>>;
  defaultScoringProfile?: Maybe<ScoringConfig>;
  /** The current user's best score across all won disclosure game sessions */
  disclosureGameBestScore?: Maybe<Scalars['Int']['output']>;
  /** Fetch the current state of a disclosure game session */
  disclosureGameSession?: Maybe<DisclosureGameSession>;
  /** Return the Stripe Payment Link URL for one-time donations. No authentication required. Returns null when not configured. */
  donationPaymentLink?: Maybe<DonationPaymentLinkResult>;
  /** Get a complete export of all personal data for the authenticated user */
  exportMyData?: Maybe<UserDataExport>;
  /** Fetch a single football player by ID (LS-255) */
  footballPlayer?: Maybe<FootballPlayer>;
  /** Paginated list of football players, optionally filtered by position (LS-255) */
  footballPlayers?: Maybe<FootballPlayersConnection>;
  freeAgents?: Maybe<Array<Player>>;
  /** Detailed state for a single MLB game by its primary key (gamePk). Returns null until LS-1864 delivers @legacy-sports/mlb-client. */
  game?: Maybe<ScoreboardGame>;
  /** Get all-time records across all seasons in a league's history (most wins, highest score, longest win streak, most points in a season). */
  getAllTimeRecords?: Maybe<Array<AllTimeRecord>>;
  getArchivedUserLeagueSummaries: Array<UserLeagueSummary>;
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
  getUserLeagueSummaries: Array<UserLeagueSummary>;
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
  matchupScores: Array<MatchupStats>;
  /** Aggregate statistics about the baseball database powering the minigames hub */
  minigamesStats?: Maybe<MinigamesStats>;
  /** Get the current user's votes for a league season */
  myAwardVotes?: Maybe<Array<MyAwardVote>>;
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
  /** Look up a player by their MLB Stats API player ID. Returns null if no mapping exists. */
  playerByMlbId?: Maybe<Player>;
  playerCareerBatting?: Maybe<CareerBatting>;
  playerCareerFielding?: Maybe<CareerFielding>;
  playerCareerPitching?: Maybe<CareerPitching>;
  /** Total number of players in the database */
  playerCount?: Maybe<Scalars['Int']['output']>;
  /** Fetch MLB season stats for a player from the external data provider. Stub resolver — full implementation added in LS-1864 via MlbDataProvider. */
  playerMlbStats?: Maybe<Scalars['String']['output']>;
  playerSeasonBatting?: Maybe<Array<SeasonBatting>>;
  playerSeasonFielding?: Maybe<Array<SeasonFielding>>;
  playerSeasonPitching?: Maybe<Array<SeasonPitching>>;
  players?: Maybe<Array<Player>>;
  /** Check if the authenticated user has accepted the privacy policy */
  privacyPolicyStatus?: Maybe<PrivacyPolicyStatus>;
  publicLeagues: Array<PublicLeagueInfo>;
  /** Live MLB scoreboard for the given date (defaults to today). Uses the provider configured via MLB_DATA_PROVIDER (defaults to mlb-statsapi in dev). */
  scoreboard?: Maybe<Scoreboard>;
  scoringDefinitions?: Maybe<Array<ScoringStatDefinition>>;
  searchPlayers?: Maybe<Array<Player>>;
  searchUsers?: Maybe<Array<User>>;
  seasonBattingStats?: Maybe<Array<SeasonBatting>>;
  seasonDraftGame?: Maybe<SeasonDraftGame>;
  /** Get list of available positions to draft for */
  seasonDraftGameAvailablePositions?: Maybe<Array<Scalars['String']['output']>>;
  /** Get basic game info by invite code (for join page preview) */
  seasonDraftGameByInviteCode?: Maybe<SeasonDraftGameLobbyInfo>;
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
  /** List the available era windows for a sport with their start/end year ranges. */
  sportEras: Array<SportEra>;
  /** List the available player pool keys for a sport (e.g. baseball, football). */
  sportPlayerPools: Array<SportPlayerPool>;
  /** Return live subscription prices from Stripe. No authentication required — pricing is public. Results are cached server-side for 5 minutes. */
  stripePrices?: Maybe<StripePriceInfo>;
  /** Return earned badges for a team in a league */
  teamBadges?: Maybe<Array<UserBadge>>;
  teamById?: Maybe<Team>;
  teamLeagueMembers?: Maybe<Array<LeagueMember>>;
  teamMembers?: Maybe<Array<TeamMember>>;
  teamTradeOffers?: Maybe<Array<TradeOffer>>;
  teamWaiverClaims?: Maybe<Array<WaiverClaim>>;
  /** Return the caller's current active game, or null if none */
  twentyQuestionsActiveGame?: Maybe<TwentyQuestionsGame>;
  /** Paginated history of the caller's past games */
  twentyQuestionsHistory?: Maybe<Array<TwentyQuestionsGame>>;
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

export type QueryAwardVoteResultsArgs = {
  leagueId: Scalars['Int']['input'];
  season: Scalars['Int']['input'];
};

export type QueryAwardVotingPeriodArgs = {
  leagueId: Scalars['Int']['input'];
  season: Scalars['Int']['input'];
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
  team?: InputMaybe<Scalars['String']['input']>;
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
  position?: InputMaybe<Scalars['String']['input']>;
  searchTerm?: InputMaybe<Scalars['String']['input']>;
  team?: InputMaybe<Scalars['String']['input']>;
};

export type QueryCareerPitchingStatsCountArgs = {
  minGames?: InputMaybe<Scalars['Int']['input']>;
  minStrikeouts?: InputMaybe<Scalars['Int']['input']>;
  minWins?: InputMaybe<Scalars['Int']['input']>;
  position?: InputMaybe<Scalars['String']['input']>;
  searchTerm?: InputMaybe<Scalars['String']['input']>;
  team?: InputMaybe<Scalars['String']['input']>;
};

export type QueryCommissionerAuditLogsArgs = {
  leagueId: Scalars['Int']['input'];
  limit?: InputMaybe<Scalars['Int']['input']>;
};

export type QueryDisclosureGameSessionArgs = {
  sessionId: Scalars['Int']['input'];
};

export type QueryFootballPlayerArgs = {
  id: Scalars['Int']['input'];
};

export type QueryFootballPlayersArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  nflTeam?: InputMaybe<Scalars['String']['input']>;
  position?: InputMaybe<Scalars['String']['input']>;
  search?: InputMaybe<Scalars['String']['input']>;
};

export type QueryFreeAgentsArgs = {
  leagueId: Scalars['Int']['input'];
};

export type QueryGameArgs = {
  gamePk: Scalars['Int']['input'];
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

export type QueryMatchupScoresArgs = {
  leagueId: Scalars['Int']['input'];
  weekNum: Scalars['Int']['input'];
};

export type QueryMyAwardVotesArgs = {
  leagueId: Scalars['Int']['input'];
  season: Scalars['Int']['input'];
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

export type QueryPlayerByMlbIdArgs = {
  mlbPlayerId: Scalars['Int']['input'];
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

export type QueryPlayerMlbStatsArgs = {
  mlbPlayerId: Scalars['Int']['input'];
  season: Scalars['Int']['input'];
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
  sport?: InputMaybe<Sport>;
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
  sport?: InputMaybe<Sport>;
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

export type QuerySeasonDraftGameByInviteCodeArgs = {
  inviteCode: Scalars['String']['input'];
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

export type QuerySportErasArgs = {
  sport: Scalars['String']['input'];
};

export type QuerySportPlayerPoolsArgs = {
  sport: Scalars['String']['input'];
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

export type QueryTwentyQuestionsHistoryArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
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
  accessLevel?: InputMaybe<Scalars['String']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Scalars['String']['input']>;
  orderDirection?: InputMaybe<Scalars['String']['input']>;
  search?: InputMaybe<Scalars['String']['input']>;
};

export type QueryUsersCountArgs = {
  accessLevel?: InputMaybe<Scalars['String']['input']>;
  search?: InputMaybe<Scalars['String']['input']>;
};

export type QueryValidateInviteCodeArgs = {
  code: Scalars['String']['input'];
};

export type RecalculateMatchupScoresInput = {
  leagueId: Scalars['Int']['input'];
  weekNumber?: InputMaybe<Scalars['Int']['input']>;
};

/** Result of a bulk matchup score recalculation */
export type RecalculateMatchupScoresResult = {
  __typename?: 'RecalculateMatchupScoresResult';
  matchupsFailed?: Maybe<Scalars['Int']['output']>;
  matchupsRecalculated?: Maybe<Scalars['Int']['output']>;
  message?: Maybe<Scalars['String']['output']>;
  success?: Maybe<Scalars['Boolean']['output']>;
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
  /** Game status: "Preview", "Live", "Final", "Postponed", or "Suspended" */
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
  Defense = 'defense',
  Fielding = 'fielding',
  Idp = 'idp',
  Kicking = 'kicking',
  Passing = 'passing',
  Pitching = 'pitching',
  Receiving = 'receiving',
  Rushing = 'rushing',
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
  currentPickDeadline?: Maybe<Scalars['String']['output']>;
  currentTurn?: Maybe<Scalars['Int']['output']>;
  gameMode?: Maybe<SeasonDraftGameMode>;
  id?: Maybe<Scalars['Int']['output']>;
  inviteCode?: Maybe<Scalars['String']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  pickDeadlineSeconds?: Maybe<Scalars['Int']['output']>;
  picks?: Maybe<Array<SeasonDraftGamePickHistory>>;
  playerType?: Maybe<SeasonDraftPlayerType>;
  players?: Maybe<Array<SeasonDraftPlayer>>;
  sport?: Maybe<Sport>;
  statKey?: Maybe<Scalars['String']['output']>;
  status?: Maybe<SeasonDraftGameStatus>;
};

/** Basic info about a Season Draft Game for the join page */
export type SeasonDraftGameLobbyInfo = {
  __typename?: 'SeasonDraftGameLobbyInfo';
  creatorName?: Maybe<Scalars['String']['output']>;
  gameMode?: Maybe<SeasonDraftGameMode>;
  id?: Maybe<Scalars['Int']['output']>;
  maxPlayers?: Maybe<Scalars['Int']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  playerCount?: Maybe<Scalars['Int']['output']>;
  playerType?: Maybe<SeasonDraftPlayerType>;
  players: Array<SeasonDraftLobbyPlayer>;
  sport?: Maybe<Sport>;
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
  inviteCode?: Maybe<Scalars['String']['output']>;
  isMyTurn?: Maybe<Scalars['Boolean']['output']>;
  maxPlayers?: Maybe<Scalars['Int']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  picksMade?: Maybe<Scalars['Int']['output']>;
  playerCount?: Maybe<Scalars['Int']['output']>;
  playerType?: Maybe<SeasonDraftPlayerType>;
  players: Array<SeasonDraftLobbyPlayer>;
  sport?: Maybe<Sport>;
  statKey?: Maybe<Scalars['String']['output']>;
  status?: Maybe<SeasonDraftGameStatus>;
  totalPicks?: Maybe<Scalars['Int']['output']>;
  winnerName?: Maybe<Scalars['String']['output']>;
};

/** Lightweight player entry for lobby/join displays */
export type SeasonDraftLobbyPlayer = {
  __typename?: 'SeasonDraftLobbyPlayer';
  id: Scalars['Int']['output'];
  playerName: Scalars['String']['output'];
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

/** Sport for a league (baseball or football). */
export enum Sport {
  Baseball = 'baseball',
  Football = 'football',
}

/** A historical era window for a sport. startYear/endYear may be null when unbounded. */
export type SportEra = {
  __typename?: 'SportEra';
  endYear?: Maybe<Scalars['Int']['output']>;
  key: Scalars['String']['output'];
  label: Scalars['String']['output'];
  sortOrder: Scalars['Int']['output'];
  sport: Scalars['String']['output'];
  startYear?: Maybe<Scalars['Int']['output']>;
};

/** A player pool option available for a given sport (e.g. AL/NL for baseball, AFC/NFC for football). */
export type SportPlayerPool = {
  __typename?: 'SportPlayerPool';
  key: Scalars['String']['output'];
  label: Scalars['String']['output'];
  sortOrder: Scalars['Int']['output'];
  sport: Scalars['String']['output'];
};

/** Result of starting a new disclosure game session */
export type StartDisclosureGameResult = {
  __typename?: 'StartDisclosureGameResult';
  sessionId?: Maybe<Scalars['Int']['output']>;
  /** Total number of clues available in this session */
  totalClues?: Maybe<Scalars['Int']['output']>;
};

export enum StatsLoadingStatus {
  Completed = 'completed',
  Failed = 'failed',
  Loading = 'loading',
  NotStarted = 'not_started',
  Queued = 'queued',
  Retry = 'retry',
}

export type StripePriceInfo = {
  __typename?: 'StripePriceInfo';
  annualPriceId: Scalars['String']['output'];
  annualTotalCents: Scalars['Int']['output'];
  monthlyPriceCents: Scalars['Int']['output'];
  monthlyPriceId: Scalars['String']['output'];
};

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

export type TwentyQuestionsAskInput = {
  category: TwentyQuestionsCategory;
  gameId: Scalars['String']['input'];
  /** JSON-encoded question parameters */
  parameter: Scalars['String']['input'];
};

export enum TwentyQuestionsCategory {
  ActiveStatus = 'active_status',
  BattingHand = 'batting_hand',
  Era = 'era',
  HallOfFame = 'hall_of_fame',
  Position = 'position',
  StatThreshold = 'stat_threshold',
  Team = 'team',
  ThrowingHand = 'throwing_hand',
}

export enum TwentyQuestionsDifficulty {
  Easy = 'easy',
  Hard = 'hard',
  Medium = 'medium',
}

/** State of a 20 Questions game session */
export type TwentyQuestionsGame = {
  __typename?: 'TwentyQuestionsGame';
  completedAt?: Maybe<Scalars['String']['output']>;
  difficulty?: Maybe<TwentyQuestionsDifficulty>;
  id?: Maybe<Scalars['String']['output']>;
  maxQuestions?: Maybe<Scalars['Int']['output']>;
  questions?: Maybe<Array<TwentyQuestionsQuestion>>;
  questionsUsed?: Maybe<Scalars['Int']['output']>;
  /** Sport the player pool was drawn from */
  sport?: Maybe<Sport>;
  startedAt?: Maybe<Scalars['String']['output']>;
  status?: Maybe<TwentyQuestionsStatus>;
  /** Revealed only when status is won or lost */
  targetPlayer?: Maybe<Player>;
  tokensEarned?: Maybe<Scalars['Int']['output']>;
};

/** A single yes/no question asked during a 20 Questions game */
export type TwentyQuestionsQuestion = {
  __typename?: 'TwentyQuestionsQuestion';
  answer?: Maybe<Scalars['Boolean']['output']>;
  category?: Maybe<TwentyQuestionsCategory>;
  guessPlayer?: Maybe<Player>;
  isGuess?: Maybe<Scalars['Boolean']['output']>;
  /** JSON-encoded question parameters (e.g. position, team, decade) */
  parameter?: Maybe<Scalars['String']['output']>;
  questionNumber?: Maybe<Scalars['Int']['output']>;
};

export enum TwentyQuestionsStatus {
  Abandoned = 'abandoned',
  Active = 'active',
  Lost = 'lost',
  Won = 'won',
}

export type UpdateCommissionerNoteInput = {
  leagueId: Scalars['Int']['input'];
  note?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateDraftSettingsInput = {
  baseballHofOnly?: InputMaybe<Scalars['Boolean']['input']>;
  customEraEndYear?: InputMaybe<Scalars['Int']['input']>;
  customEraStartYear?: InputMaybe<Scalars['Int']['input']>;
  draftMode?: InputMaybe<Scalars['String']['input']>;
  draftOrder?: InputMaybe<Scalars['String']['input']>;
  eraFilter?: InputMaybe<Scalars['String']['input']>;
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
  pitcherStartsPerMatchup?: InputMaybe<Scalars['Int']['input']>;
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
  themePreference?: Maybe<Scalars['String']['output']>;
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

/** Dashboard summary combining league phase, draft state, standings, and current matchup for a single league. */
export type UserLeagueSummary = {
  __typename?: 'UserLeagueSummary';
  currentWeekNumber?: Maybe<Scalars['Int']['output']>;
  draftMode?: Maybe<Scalars['String']['output']>;
  draftScheduledAt?: Maybe<Scalars['String']['output']>;
  draftStatus?: Maybe<Scalars['String']['output']>;
  leagueId?: Maybe<Scalars['Int']['output']>;
  leagueName?: Maybe<Scalars['String']['output']>;
  leaguePhase?: Maybe<Scalars['String']['output']>;
  losses?: Maybe<Scalars['Int']['output']>;
  matchupId?: Maybe<Scalars['Int']['output']>;
  matchupStatus?: Maybe<Scalars['String']['output']>;
  opponentScore?: Maybe<Scalars['Float']['output']>;
  opponentTeamName?: Maybe<Scalars['String']['output']>;
  pointsFor?: Maybe<Scalars['Float']['output']>;
  rank?: Maybe<Scalars['Int']['output']>;
  seasonNumber?: Maybe<Scalars['Int']['output']>;
  selectionMethod?: Maybe<Scalars['String']['output']>;
  sport?: Maybe<Scalars['String']['output']>;
  teamCount?: Maybe<Scalars['Int']['output']>;
  ties?: Maybe<Scalars['Int']['output']>;
  totalMatchups?: Maybe<Scalars['Int']['output']>;
  totalTeams?: Maybe<Scalars['Int']['output']>;
  userScore?: Maybe<Scalars['Float']['output']>;
  wins?: Maybe<Scalars['Int']['output']>;
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

export type GetAllPlayersQueryVariables = Exact<{
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Scalars['String']['input']>;
  orderDirection?: InputMaybe<Scalars['String']['input']>;
}>;

export type GetAllPlayersQuery = {
  __typename?: 'Query';
  players?: Array<{
    __typename?: 'Player';
    id?: number | null;
    firstName?: string | null;
    lastName?: string | null;
    brefId?: string | null;
  }> | null;
};

export type GetPlayerQueryVariables = Exact<{
  id: Scalars['Int']['input'];
}>;

export type GetPlayerQuery = {
  __typename?: 'Query';
  player?: {
    __typename?: 'Player';
    id?: number | null;
    firstName?: string | null;
    lastName?: string | null;
    brefId?: string | null;
  } | null;
};

export type GetPlayerByBrefIdQueryVariables = Exact<{
  brefId: Scalars['String']['input'];
}>;

export type GetPlayerByBrefIdQuery = {
  __typename?: 'Query';
  playerByBrefId?: {
    __typename?: 'Player';
    id?: number | null;
    firstName?: string | null;
    lastName?: string | null;
    brefId?: string | null;
  } | null;
};

export type PlayerFragment = {
  __typename?: 'Player';
  id?: number | null;
  firstName?: string | null;
  lastName?: string | null;
  brefId?: string | null;
};

export type GetHelloQueryVariables = Exact<{ [key: string]: never }>;

export type GetHelloQuery = { __typename?: 'Query'; hello?: string | null };

export const PlayerFragmentDoc = gql`
  fragment Player on Player {
    id
    firstName
    lastName
    brefId
  }
`;
export const GetAllPlayers = gql`
  query GetAllPlayers(
    $limit: Int
    $offset: Int
    $orderBy: String
    $orderDirection: String
  ) {
    players(
      limit: $limit
      offset: $offset
      orderBy: $orderBy
      orderDirection: $orderDirection
    ) {
      id
      firstName
      lastName
      brefId
    }
  }
`;

/**
 * __useGetAllPlayersQuery__
 *
 * To run a query within a React component, call `useGetAllPlayersQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetAllPlayersQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetAllPlayersQuery({
 *   variables: {
 *      limit: // value for 'limit'
 *      offset: // value for 'offset'
 *      orderBy: // value for 'orderBy'
 *      orderDirection: // value for 'orderDirection'
 *   },
 * });
 */
export function useGetAllPlayersQuery(
  baseOptions?: Apollo.QueryHookOptions<
    GetAllPlayersQuery,
    GetAllPlayersQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useQuery<GetAllPlayersQuery, GetAllPlayersQueryVariables>(
    GetAllPlayers,
    options,
  );
}
export function useGetAllPlayersLazyQuery(
  baseOptions?: Apollo.LazyQueryHookOptions<
    GetAllPlayersQuery,
    GetAllPlayersQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useLazyQuery<GetAllPlayersQuery, GetAllPlayersQueryVariables>(
    GetAllPlayers,
    options,
  );
}
export function useGetAllPlayersSuspenseQuery(
  baseOptions?:
    | Apollo.SkipToken
    | Apollo.SuspenseQueryHookOptions<
        GetAllPlayersQuery,
        GetAllPlayersQueryVariables
      >,
) {
  const options =
    baseOptions === Apollo.skipToken
      ? baseOptions
      : { ...defaultOptions, ...baseOptions };
  return Apollo.useSuspenseQuery<
    GetAllPlayersQuery,
    GetAllPlayersQueryVariables
  >(
    GetAllPlayers,
    options as
      | Apollo.SkipToken
      | Apollo.SuspenseQueryHookOptions<
          GetAllPlayersQuery,
          GetAllPlayersQueryVariables
        >,
  );
}
export type GetAllPlayersQueryHookResult = ReturnType<
  typeof useGetAllPlayersQuery
>;
export type GetAllPlayersLazyQueryHookResult = ReturnType<
  typeof useGetAllPlayersLazyQuery
>;
export type GetAllPlayersSuspenseQueryHookResult = ReturnType<
  typeof useGetAllPlayersSuspenseQuery
>;
export type GetAllPlayersQueryResult = Apollo.QueryResult<
  GetAllPlayersQuery,
  GetAllPlayersQueryVariables
>;
export const GetPlayer = gql`
  query GetPlayer($id: Int!) {
    player(id: $id) {
      id
      firstName
      lastName
      brefId
    }
  }
`;

/**
 * __useGetPlayerQuery__
 *
 * To run a query within a React component, call `useGetPlayerQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetPlayerQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetPlayerQuery({
 *   variables: {
 *      id: // value for 'id'
 *   },
 * });
 */
export function useGetPlayerQuery(
  baseOptions: Apollo.QueryHookOptions<
    GetPlayerQuery,
    GetPlayerQueryVariables
  > &
    (
      | { variables: GetPlayerQueryVariables; skip?: boolean }
      | { skip: boolean }
    ),
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useQuery<GetPlayerQuery, GetPlayerQueryVariables>(
    GetPlayer,
    options,
  );
}
export function useGetPlayerLazyQuery(
  baseOptions?: Apollo.LazyQueryHookOptions<
    GetPlayerQuery,
    GetPlayerQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useLazyQuery<GetPlayerQuery, GetPlayerQueryVariables>(
    GetPlayer,
    options,
  );
}
export function useGetPlayerSuspenseQuery(
  baseOptions?:
    | Apollo.SkipToken
    | Apollo.SuspenseQueryHookOptions<GetPlayerQuery, GetPlayerQueryVariables>,
) {
  const options =
    baseOptions === Apollo.skipToken
      ? baseOptions
      : { ...defaultOptions, ...baseOptions };
  return Apollo.useSuspenseQuery<GetPlayerQuery, GetPlayerQueryVariables>(
    GetPlayer,
    options as
      | Apollo.SkipToken
      | Apollo.SuspenseQueryHookOptions<
          GetPlayerQuery,
          GetPlayerQueryVariables
        >,
  );
}
export type GetPlayerQueryHookResult = ReturnType<typeof useGetPlayerQuery>;
export type GetPlayerLazyQueryHookResult = ReturnType<
  typeof useGetPlayerLazyQuery
>;
export type GetPlayerSuspenseQueryHookResult = ReturnType<
  typeof useGetPlayerSuspenseQuery
>;
export type GetPlayerQueryResult = Apollo.QueryResult<
  GetPlayerQuery,
  GetPlayerQueryVariables
>;
export const GetPlayerByBrefId = gql`
  query GetPlayerByBrefId($brefId: String!) {
    playerByBrefId(brefId: $brefId) {
      id
      firstName
      lastName
      brefId
    }
  }
`;

/**
 * __useGetPlayerByBrefIdQuery__
 *
 * To run a query within a React component, call `useGetPlayerByBrefIdQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetPlayerByBrefIdQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetPlayerByBrefIdQuery({
 *   variables: {
 *      brefId: // value for 'brefId'
 *   },
 * });
 */
export function useGetPlayerByBrefIdQuery(
  baseOptions: Apollo.QueryHookOptions<
    GetPlayerByBrefIdQuery,
    GetPlayerByBrefIdQueryVariables
  > &
    (
      | { variables: GetPlayerByBrefIdQueryVariables; skip?: boolean }
      | { skip: boolean }
    ),
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useQuery<
    GetPlayerByBrefIdQuery,
    GetPlayerByBrefIdQueryVariables
  >(GetPlayerByBrefId, options);
}
export function useGetPlayerByBrefIdLazyQuery(
  baseOptions?: Apollo.LazyQueryHookOptions<
    GetPlayerByBrefIdQuery,
    GetPlayerByBrefIdQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useLazyQuery<
    GetPlayerByBrefIdQuery,
    GetPlayerByBrefIdQueryVariables
  >(GetPlayerByBrefId, options);
}
export function useGetPlayerByBrefIdSuspenseQuery(
  baseOptions?:
    | Apollo.SkipToken
    | Apollo.SuspenseQueryHookOptions<
        GetPlayerByBrefIdQuery,
        GetPlayerByBrefIdQueryVariables
      >,
) {
  const options =
    baseOptions === Apollo.skipToken
      ? baseOptions
      : { ...defaultOptions, ...baseOptions };
  return Apollo.useSuspenseQuery<
    GetPlayerByBrefIdQuery,
    GetPlayerByBrefIdQueryVariables
  >(
    GetPlayerByBrefId,
    options as
      | Apollo.SkipToken
      | Apollo.SuspenseQueryHookOptions<
          GetPlayerByBrefIdQuery,
          GetPlayerByBrefIdQueryVariables
        >,
  );
}
export type GetPlayerByBrefIdQueryHookResult = ReturnType<
  typeof useGetPlayerByBrefIdQuery
>;
export type GetPlayerByBrefIdLazyQueryHookResult = ReturnType<
  typeof useGetPlayerByBrefIdLazyQuery
>;
export type GetPlayerByBrefIdSuspenseQueryHookResult = ReturnType<
  typeof useGetPlayerByBrefIdSuspenseQuery
>;
export type GetPlayerByBrefIdQueryResult = Apollo.QueryResult<
  GetPlayerByBrefIdQuery,
  GetPlayerByBrefIdQueryVariables
>;
export const GetHello = gql`
  query GetHello {
    hello
  }
`;

/**
 * __useGetHelloQuery__
 *
 * To run a query within a React component, call `useGetHelloQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetHelloQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetHelloQuery({
 *   variables: {
 *   },
 * });
 */
export function useGetHelloQuery(
  baseOptions?: Apollo.QueryHookOptions<GetHelloQuery, GetHelloQueryVariables>,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useQuery<GetHelloQuery, GetHelloQueryVariables>(
    GetHello,
    options,
  );
}
export function useGetHelloLazyQuery(
  baseOptions?: Apollo.LazyQueryHookOptions<
    GetHelloQuery,
    GetHelloQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useLazyQuery<GetHelloQuery, GetHelloQueryVariables>(
    GetHello,
    options,
  );
}
export function useGetHelloSuspenseQuery(
  baseOptions?:
    | Apollo.SkipToken
    | Apollo.SuspenseQueryHookOptions<GetHelloQuery, GetHelloQueryVariables>,
) {
  const options =
    baseOptions === Apollo.skipToken
      ? baseOptions
      : { ...defaultOptions, ...baseOptions };
  return Apollo.useSuspenseQuery<GetHelloQuery, GetHelloQueryVariables>(
    GetHello,
    options as
      | Apollo.SkipToken
      | Apollo.SuspenseQueryHookOptions<GetHelloQuery, GetHelloQueryVariables>,
  );
}
export type GetHelloQueryHookResult = ReturnType<typeof useGetHelloQuery>;
export type GetHelloLazyQueryHookResult = ReturnType<
  typeof useGetHelloLazyQuery
>;
export type GetHelloSuspenseQueryHookResult = ReturnType<
  typeof useGetHelloSuspenseQuery
>;
export type GetHelloQueryResult = Apollo.QueryResult<
  GetHelloQuery,
  GetHelloQueryVariables
>;
