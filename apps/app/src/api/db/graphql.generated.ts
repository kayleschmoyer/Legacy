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

export type AdvanceLeagueWeekResponse = {
  __typename?: 'AdvanceLeagueWeekResponse';
  currentMatchupId?: Maybe<Scalars['Int']['output']>;
  matchups?: Maybe<Array<Matchup>>;
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
  playerId?: Maybe<Scalars['Int']['output']>;
  runs?: Maybe<Scalars['Int']['output']>;
  saves?: Maybe<Scalars['Int']['output']>;
  shutouts?: Maybe<Scalars['Int']['output']>;
  strikeouts?: Maybe<Scalars['Int']['output']>;
  wildPitches?: Maybe<Scalars['Int']['output']>;
  winPercentage?: Maybe<Scalars['Float']['output']>;
  wins?: Maybe<Scalars['Int']['output']>;
};

export enum ConsentType {
  Analytics = 'analytics',
  DataProcessing = 'data_processing',
  MarketingEmails = 'marketing_emails',
  ThirdPartySharing = 'third_party_sharing',
}

export type CreateLeagueAndTeamsInput = {
  draftMode?: InputMaybe<Scalars['String']['input']>;
  draftOrder?: InputMaybe<Scalars['String']['input']>;
  faabBudgetDefault?: InputMaybe<Scalars['Int']['input']>;
  isPublic?: InputMaybe<Scalars['Boolean']['input']>;
  leagueName: Scalars['String']['input'];
  maxBatters?: InputMaybe<Scalars['Int']['input']>;
  maxPitchers?: InputMaybe<Scalars['Int']['input']>;
  maxRosterSize?: InputMaybe<Scalars['Int']['input']>;
  numberOfDivisions?: InputMaybe<Scalars['Int']['input']>;
  numberOfTeams: Scalars['Int']['input'];
  playerPool: Scalars['String']['input'];
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
  playerId?: Maybe<Scalars['Int']['output']>;
  round?: Maybe<Scalars['Int']['output']>;
  team?: Maybe<Team>;
  teamId?: Maybe<Scalars['Int']['output']>;
};

/** A player in the context of a draft */
export type DraftPlayer = {
  __typename?: 'DraftPlayer';
  brefId?: Maybe<Scalars['String']['output']>;
  firstName?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  lastName?: Maybe<Scalars['String']['output']>;
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

export type InviteCodeInfo = {
  __typename?: 'InviteCodeInfo';
  availableSpots?: Maybe<Scalars['Int']['output']>;
  isFull?: Maybe<Scalars['Boolean']['output']>;
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
  currentMatchup?: Maybe<Scalars['Int']['output']>;
  /** The week number of the current matchup (resolved from the matchup record) */
  currentWeekNumber?: Maybe<Scalars['Int']['output']>;
  draftStatus?: Maybe<Scalars['String']['output']>;
  faabBudgetDefault?: Maybe<Scalars['Int']['output']>;
  gamesPerMatchup?: Maybe<Scalars['Int']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  inviteCode?: Maybe<Scalars['String']['output']>;
  maxRosterSize?: Maybe<Scalars['Int']['output']>;
  minCareerGames?: Maybe<Scalars['Int']['output']>;
  minCareerSeasons?: Maybe<Scalars['Int']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  owner?: Maybe<Scalars['Int']['output']>;
  playerPool?: Maybe<Scalars['String']['output']>;
  scoringProfile?: Maybe<ScoringConfig>;
  spStartsPerMatchup?: Maybe<Scalars['Int']['output']>;
  totalMatchups?: Maybe<Scalars['Int']['output']>;
  userMembership?: Maybe<LeagueMember>;
  waiverEnabled?: Maybe<Scalars['Boolean']['output']>;
  waiverType?: Maybe<Scalars['String']['output']>;
  weekAdvanceStatus?: Maybe<Scalars['String']['output']>;
};

/** A message posted to the league-wide chat room */
export type LeagueChatMessage = {
  __typename?: 'LeagueChatMessage';
  id?: Maybe<Scalars['ID']['output']>;
  leagueId?: Maybe<Scalars['Int']['output']>;
  messageText?: Maybe<Scalars['String']['output']>;
  messageType?: Maybe<Scalars['String']['output']>;
  metadata?: Maybe<Scalars['String']['output']>;
  sender?: Maybe<User>;
  timestamp?: Maybe<Scalars['String']['output']>;
  userId?: Maybe<Scalars['Int']['output']>;
};

/** A member of a league */
export type LeagueMember = {
  __typename?: 'LeagueMember';
  leagueId?: Maybe<Scalars['Int']['output']>;
  permissionLevel?: Maybe<Scalars['String']['output']>;
  team?: Maybe<Team>;
  teamId?: Maybe<Scalars['Int']['output']>;
  userId?: Maybe<Scalars['Int']['output']>;
};

/** A position configuration in a league */
export type LeaguePosition = {
  __typename?: 'LeaguePosition';
  id?: Maybe<Scalars['Int']['output']>;
  leagueId?: Maybe<Scalars['Int']['output']>;
  positionType?: Maybe<Scalars['String']['output']>;
};

/** A head-to-head matchup between two teams in a league */
export type Matchup = {
  __typename?: 'Matchup';
  endTime?: Maybe<Scalars['String']['output']>;
  gamesPerMatchup?: Maybe<Scalars['Int']['output']>;
  id?: Maybe<Scalars['ID']['output']>;
  leagueId?: Maybe<Scalars['Int']['output']>;
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

export type Mutation = {
  __typename?: 'Mutation';
  _placeholder?: Maybe<Scalars['Boolean']['output']>;
  /** Record that the user has accepted the privacy policy */
  acceptPrivacyPolicy?: Maybe<PrivacyPolicyStatus>;
  /** Accept a pending trade offer. Players are swapped between teams immediately. */
  acceptTrade?: Maybe<TradeOffer>;
  addDefaultPositionsToLeague?: Maybe<Array<LeaguePosition>>;
  /** Automatically advance matchups for leagues where all games are complete. When leagueId is provided, processes only that league (commissioner access). Without leagueId, processes all leagues (admin / system only). Triggered Sundays at 3am EST by EventBridge. */
  autoAdvanceMatchups?: Maybe<AutoAdvanceMatchupsResult>;
  /** Automatically make draft picks for teams that have exceeded their pick deadline. Triggered every minute by EventBridge. */
  autoProcessDraftPicks?: Maybe<AutoProcessDraftPicksResult>;
  /** Automatically select the next game for active leagues. When leagueId is provided, processes only that league (commissioner access). Without leagueId, processes all leagues (admin / system only). Triggered nightly at midnight EST by EventBridge. */
  autoSelectGames?: Maybe<AutoSelectGamesResult>;
  /** Cancel a pending trade offer as the team that proposed it. */
  cancelTrade?: Maybe<TradeOffer>;
  cancelWaiverClaim?: Maybe<WaiverClaim>;
  claimFreeAgent?: Maybe<WaiverClaim>;
  commissionerPick?: Maybe<DraftPick>;
  createAllMatchups?: Maybe<AdvanceLeagueWeekResponse>;
  createLeague?: Maybe<League>;
  createLeagueAndTeams?: Maybe<CreateLeagueAndTeamsPayload>;
  createMatchup?: Maybe<Matchup>;
  createTiebreakerRules?: Maybe<TiebreakerRule>;
  /** Remove an achievement restriction from a league. Commissioner / owner access required. */
  deleteAchievementRestriction?: Maybe<Scalars['Boolean']['output']>;
  deleteAllLeagues?: Maybe<Scalars['String']['output']>;
  deleteLeague?: Maybe<Scalars['String']['output']>;
  disableDeviceToken?: Maybe<Scalars['Boolean']['output']>;
  initializeDraft?: Maybe<Draft>;
  joinLeague?: Maybe<JoinLeaguePayload>;
  joinLeagueByCode?: Maybe<Team>;
  makeDraftPick?: Maybe<DraftPick>;
  markAllNotificationsAsRead?: Maybe<Scalars['Boolean']['output']>;
  markNotificationAsRead?: Maybe<Scalars['Boolean']['output']>;
  pauseDraft?: Maybe<Draft>;
  processWaiverClaims?: Maybe<ProcessWaiverClaimsResult>;
  /** Propose a trade to another team. Provide the players you are offering and the players you want in return. */
  proposeTrade?: Maybe<TradeOffer>;
  /** Record user consent for a specific data processing type */
  recordConsent?: Maybe<UserConsent>;
  registerDeviceToken?: Maybe<DeviceToken>;
  /** Reject a pending trade offer as the receiving team manager. */
  rejectTrade?: Maybe<TradeOffer>;
  renameTeam?: Maybe<Team>;
  /** Request deletion of all personal data (GDPR Art. 17 - Right to Erasure) */
  requestDataDeletion?: Maybe<DataRequest>;
  /** Request an export of all personal data (GDPR Art. 15 - Right of Access) */
  requestDataExport?: Maybe<DataRequest>;
  resumeDraft?: Maybe<Draft>;
  /** Revoke a previously granted consent */
  revokeConsent?: Maybe<UserConsent>;
  sendDirectMessage?: Maybe<DirectMessage>;
  sendLeagueMessage?: Maybe<LeagueChatMessage>;
  sendMatchupMessage?: Maybe<MatchupMessage>;
  startDraft?: Maybe<League>;
  swapMatchupPlayerPositions?: Maybe<Array<MatchupPlayer>>;
  swapTeamMemberPositions?: Maybe<Array<TeamMember>>;
  updateDraftSettings?: Maybe<UpdateDraftSettingsPayload>;
  updateLeagueScoringProfile?: Maybe<ScoringConfig>;
  updateLeagueSettings?: Maybe<League>;
  updateMatchupPlayerPosition?: Maybe<MatchupPlayer>;
  updateMatchupScore?: Maybe<Matchup>;
  updateMatchupStatus?: Maybe<Matchup>;
  updateNotificationPreferences?: Maybe<NotificationPreference>;
  updateTeamMemberPosition?: Maybe<TeamMember>;
  /** Update a user's access level. Requires admin access. Use "admin" to grant admin privileges or "none" to revoke them. */
  updateUserRole?: Maybe<User>;
  /** Create or update a single achievement restriction for a league. Commissioner / owner access required. */
  upsertAchievementRestriction?: Maybe<AchievementRestriction>;
  /** Commissioner-only: veto an accepted trade, reversing the player swap. */
  vetoTrade?: Maybe<TradeOffer>;
};

export type MutationAcceptTradeArgs = {
  tradeId: Scalars['Int']['input'];
};

export type MutationAddDefaultPositionsToLeagueArgs = {
  leagueId: Scalars['Int']['input'];
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

export type MutationCreateAllMatchupsArgs = {
  leagueId: Scalars['Int']['input'];
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

export type MutationDisableDeviceTokenArgs = {
  deviceToken: Scalars['String']['input'];
};

export type MutationInitializeDraftArgs = {
  draftMode?: InputMaybe<Scalars['String']['input']>;
  draftOrder?: InputMaybe<Scalars['String']['input']>;
  leagueId: Scalars['Int']['input'];
  selectionMethod?: InputMaybe<Scalars['String']['input']>;
};

export type MutationJoinLeagueArgs = {
  inviteCode: Scalars['String']['input'];
  teamName: Scalars['String']['input'];
};

export type MutationJoinLeagueByCodeArgs = {
  inviteCode: Scalars['String']['input'];
  teamName: Scalars['String']['input'];
};

export type MutationMakeDraftPickArgs = {
  draftId: Scalars['Int']['input'];
  playerId: Scalars['Int']['input'];
};

export type MutationMarkNotificationAsReadArgs = {
  notificationId: Scalars['Int']['input'];
};

export type MutationPauseDraftArgs = {
  leagueId: Scalars['Int']['input'];
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

export type MutationRecordConsentArgs = {
  input: RecordConsentInput;
};

export type MutationRegisterDeviceTokenArgs = {
  input: DeviceTokenInput;
};

export type MutationRejectTradeArgs = {
  tradeId: Scalars['Int']['input'];
};

export type MutationRenameTeamArgs = {
  leagueId: Scalars['Int']['input'];
  newName: Scalars['String']['input'];
  teamId: Scalars['Int']['input'];
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

export type MutationSendLeagueMessageArgs = {
  leagueId: Scalars['Int']['input'];
  messageText: Scalars['String']['input'];
};

export type MutationSendMatchupMessageArgs = {
  gifUrl?: InputMaybe<Scalars['String']['input']>;
  matchupId: Scalars['Int']['input'];
  message: Scalars['String']['input'];
  replyToMessageId?: InputMaybe<Scalars['Int']['input']>;
};

export type MutationStartDraftArgs = {
  draftMode?: InputMaybe<Scalars['String']['input']>;
  draftOrder?: InputMaybe<Scalars['String']['input']>;
  leagueId: Scalars['Int']['input'];
  selectionMethod?: InputMaybe<Scalars['String']['input']>;
};

export type MutationSwapMatchupPlayerPositionsArgs = {
  matchupPlayerIdA: Scalars['Int']['input'];
  matchupPlayerIdB: Scalars['Int']['input'];
  positionIdA?: InputMaybe<Scalars['Int']['input']>;
  positionIdB?: InputMaybe<Scalars['Int']['input']>;
};

export type MutationSwapTeamMemberPositionsArgs = {
  positionIdA?: InputMaybe<Scalars['Int']['input']>;
  positionIdB?: InputMaybe<Scalars['Int']['input']>;
  teamMemberIdA: Scalars['Int']['input'];
  teamMemberIdB: Scalars['Int']['input'];
};

export type MutationUpdateDraftSettingsArgs = {
  input: UpdateDraftSettingsInput;
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

export type MutationUpdateTeamMemberPositionArgs = {
  positionId?: InputMaybe<Scalars['Int']['input']>;
  teamMemberId: Scalars['Int']['input'];
};

export type MutationUpdateUserRoleArgs = {
  accessLevel: Scalars['String']['input'];
  userId: Scalars['Int']['input'];
};

export type MutationUpsertAchievementRestrictionArgs = {
  input: UpsertAchievementRestrictionInput;
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
  /** Fantasy scoring data (only populated when using scoring-based sort) */
  scoring?: Maybe<PlayerScoring>;
  /** Number of distinct MLB seasons the player has batting stats for (AL/NL only) */
  seasonsPlayed?: Maybe<Scalars['Int']['output']>;
  statsLastFetchedAt?: Maybe<Scalars['String']['output']>;
};

export type PlayerGameScore = {
  __typename?: 'PlayerGameScore';
  battingScore?: Maybe<Scalars['Float']['output']>;
  computedAt?: Maybe<Scalars['String']['output']>;
  fieldingScore?: Maybe<Scalars['Float']['output']>;
  gameNum?: Maybe<Scalars['Int']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  pitchingScore?: Maybe<Scalars['Float']['output']>;
  playerId?: Maybe<Scalars['Int']['output']>;
  season?: Maybe<Scalars['Int']['output']>;
  totalScore?: Maybe<Scalars['Float']['output']>;
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

/** Playoff qualification status for a team */
export type PlayoffQualification = {
  __typename?: 'PlayoffQualification';
  isQualified?: Maybe<Scalars['Boolean']['output']>;
  seedNumber?: Maybe<Scalars['Int']['output']>;
  standing?: Maybe<TeamStanding>;
  teamId?: Maybe<Scalars['ID']['output']>;
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

export type Query = {
  __typename?: 'Query';
  /** Return all achievement restrictions configured for a league, sorted by achievement type */
  achievementRestrictions?: Maybe<Array<AchievementRestriction>>;
  careerBattingStats?: Maybe<CareerBattingConnection>;
  careerFieldingStats?: Maybe<Array<CareerFielding>>;
  careerPitchingStats?: Maybe<Array<CareerPitching>>;
  defaultScoringProfile?: Maybe<ScoringConfig>;
  /** Get a complete export of all personal data for the authenticated user */
  exportMyData?: Maybe<UserDataExport>;
  getAvailableDraftPlayers?: Maybe<Array<DraftPlayer>>;
  getCurrentDraftPick?: Maybe<CurrentDraftPick>;
  getCurrentMatchupForLeague?: Maybe<Matchup>;
  getDirectMessages?: Maybe<Array<DirectMessage>>;
  getDraft?: Maybe<Draft>;
  getDraftPicks?: Maybe<Array<DraftPick>>;
  getHeadToHeadRecord?: Maybe<HeadToHeadRecord>;
  getLeagueDraft?: Maybe<Draft>;
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
  getNotificationHistory?: Maybe<Array<NotificationHistoryItem>>;
  getPlayerGameScores?: Maybe<Array<PlayerGameScore>>;
  getPlayoffRace?: Maybe<Array<PlayoffQualification>>;
  getPowerRankings?: Maybe<Array<TeamStanding>>;
  getSeasonResults?: Maybe<SeasonResults>;
  getTeamMatchupHistory?: Maybe<Array<Matchup>>;
  getTeamRecentMatchups?: Maybe<Array<Matchup>>;
  getTiebreakerHistory?: Maybe<Array<TiebreakerHistory>>;
  getTiebreakerRules?: Maybe<TiebreakerRule>;
  getUnreadNotificationCount?: Maybe<Scalars['Int']['output']>;
  getUserDeviceTokens?: Maybe<Array<DeviceToken>>;
  getUserNotificationPreferences?: Maybe<NotificationPreference>;
  hello?: Maybe<Scalars['String']['output']>;
  league?: Maybe<League>;
  leaguePositions?: Maybe<Array<LeaguePosition>>;
  leagueScoringProfile?: Maybe<ScoringConfig>;
  leagueTeams?: Maybe<Array<Team>>;
  leagueTradeOffers?: Maybe<Array<TradeOffer>>;
  /** Get all consent records for the authenticated user */
  myConsents?: Maybe<Array<UserConsent>>;
  /** Get all data export/deletion requests for the authenticated user */
  myDataRequests?: Maybe<Array<DataRequest>>;
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
  scoringDefinitions?: Maybe<Array<ScoringStatDefinition>>;
  searchPlayers?: Maybe<Array<Player>>;
  searchUsers?: Maybe<Array<User>>;
  seasonBattingStats?: Maybe<Array<SeasonBatting>>;
  seasonFieldingStats?: Maybe<Array<SeasonFielding>>;
  seasonPitchingStats?: Maybe<Array<SeasonPitching>>;
  teamMembers?: Maybe<Array<TeamMember>>;
  teamTradeOffers?: Maybe<Array<TradeOffer>>;
  teamWaiverClaims?: Maybe<Array<WaiverClaim>>;
  user?: Maybe<User>;
  userByEmail?: Maybe<User>;
  userLeagues: Array<League>;
  userTeamId?: Maybe<Scalars['Int']['output']>;
  users?: Maybe<Array<User>>;
  validateInviteCode?: Maybe<InviteCodeInfo>;
  /** Get version and deployment information for the GraphQL API */
  version?: Maybe<VersionInfo>;
};

export type QueryAchievementRestrictionsArgs = {
  leagueId: Scalars['Int']['input'];
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
};

export type QueryGetAvailableDraftPlayersArgs = {
  draftId: Scalars['Int']['input'];
  limit?: InputMaybe<Scalars['Int']['input']>;
  search?: InputMaybe<Scalars['String']['input']>;
};

export type QueryGetCurrentDraftPickArgs = {
  draftId: Scalars['Int']['input'];
};

export type QueryGetCurrentMatchupForLeagueArgs = {
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

export type QueryGetHeadToHeadRecordArgs = {
  leagueId: Scalars['Int']['input'];
  team1Id: Scalars['Int']['input'];
  team2Id: Scalars['Int']['input'];
};

export type QueryGetLeagueDraftArgs = {
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

export type QueryGetNotificationHistoryArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
};

export type QueryGetPlayerGameScoresArgs = {
  gameNum?: InputMaybe<Scalars['Int']['input']>;
  playerId: Scalars['Int']['input'];
  season?: InputMaybe<Scalars['Int']['input']>;
};

export type QueryGetPlayoffRaceArgs = {
  leagueId: Scalars['Int']['input'];
  playoffSpots: Scalars['Int']['input'];
  season?: InputMaybe<Scalars['Int']['input']>;
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

export type QueryLeaguePositionsArgs = {
  leagueId: Scalars['Int']['input'];
};

export type QueryLeagueScoringProfileArgs = {
  leagueId: Scalars['Int']['input'];
};

export type QueryLeagueTeamsArgs = {
  leagueId: Scalars['Int']['input'];
};

export type QueryLeagueTradeOffersArgs = {
  leagueId: Scalars['Int']['input'];
  status?: InputMaybe<Scalars['String']['input']>;
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
};

export type QueryValidateInviteCodeArgs = {
  code: Scalars['String']['input'];
};

export type RecordConsentInput = {
  consentType: ConsentType;
  ipAddress?: InputMaybe<Scalars['String']['input']>;
  userAgent?: InputMaybe<Scalars['String']['input']>;
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
  league?: Maybe<Scalars['String']['output']>;
  onBasePercentage?: Maybe<Scalars['Float']['output']>;
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

export enum StatsLoadingStatus {
  Completed = 'completed',
  Failed = 'failed',
  Loading = 'loading',
  NotStarted = 'not_started',
  Queued = 'queued',
  Retry = 'retry',
}

/** A team in a league */
export type Team = {
  __typename?: 'Team';
  createdAt?: Maybe<Scalars['String']['output']>;
  divisionId?: Maybe<Scalars['Int']['output']>;
  faabBudget?: Maybe<Scalars['Int']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  leagueId?: Maybe<Scalars['Int']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  updatedAt?: Maybe<Scalars['String']['output']>;
  waiverOrder?: Maybe<Scalars['Int']['output']>;
};

/** A member of a team */
export type TeamMember = {
  __typename?: 'TeamMember';
  id?: Maybe<Scalars['Int']['output']>;
  leagueId?: Maybe<Scalars['Int']['output']>;
  player?: Maybe<Player>;
  playerId?: Maybe<Scalars['Int']['output']>;
  positionId?: Maybe<Scalars['Int']['output']>;
  teamId?: Maybe<Scalars['Int']['output']>;
};

/** Team standing information with wins, losses, and scoring stats */
export type TeamStanding = {
  __typename?: 'TeamStanding';
  averagePointsAgainst?: Maybe<Scalars['Float']['output']>;
  averagePointsFor?: Maybe<Scalars['Float']['output']>;
  losses?: Maybe<Scalars['Int']['output']>;
  pointsAgainst?: Maybe<Scalars['Float']['output']>;
  pointsFor?: Maybe<Scalars['Float']['output']>;
  rank?: Maybe<Scalars['Int']['output']>;
  teamId?: Maybe<Scalars['ID']['output']>;
  teamName?: Maybe<Scalars['String']['output']>;
  ties?: Maybe<Scalars['Int']['output']>;
  totalMatchups?: Maybe<Scalars['Int']['output']>;
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

export type UpdateDraftSettingsInput = {
  draftMode?: InputMaybe<Scalars['String']['input']>;
  draftOrder?: InputMaybe<Scalars['String']['input']>;
  leagueId: Scalars['Int']['input'];
  pickTimeLimitSeconds?: InputMaybe<Scalars['Int']['input']>;
  playerPool?: InputMaybe<Scalars['String']['input']>;
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
  selectionMethod?: Maybe<Scalars['String']['output']>;
};

export type UpdateLeagueScoringMultiplierInput = {
  isEnabled?: InputMaybe<Scalars['Boolean']['input']>;
  multiplier?: InputMaybe<Scalars['Float']['input']>;
  statDefinitionId: Scalars['Int']['input'];
};

export type UpdateLeagueSettingsInput = {
  gamesPerMatchup?: InputMaybe<Scalars['Int']['input']>;
  leagueId: Scalars['Int']['input'];
  minCareerGames?: InputMaybe<Scalars['Int']['input']>;
  minCareerSeasons?: InputMaybe<Scalars['Int']['input']>;
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

export type User = {
  __typename?: 'User';
  accessLevel?: Maybe<Scalars['String']['output']>;
  email?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  username?: Maybe<Scalars['String']['output']>;
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

export type LeagueFragment = {
  __typename?: 'League';
  id?: number | null;
  name?: string | null;
  owner?: number | null;
  maxRosterSize?: number | null;
  currentMatchup?: number | null;
  currentWeekNumber?: number | null;
  draftStatus?: string | null;
  inviteCode?: string | null;
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
    inviteCode?: string | null;
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
      inviteCode?: string | null;
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
    inviteCode?: string | null;
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
    inviteCode?: string | null;
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
  gamesPerMatchup?: number | null;
  spStartsPerMatchup?: number | null;
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
    gamesPerMatchup?: number | null;
    spStartsPerMatchup?: number | null;
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
    gamesPerMatchup?: number | null;
    spStartsPerMatchup?: number | null;
    startTime?: string | null;
    endTime?: string | null;
  }> | null;
};

export type GetCurrentMatchupForLeagueQueryVariables = Exact<{
  leagueId: Scalars['Int']['input'];
}>;

export type GetCurrentMatchupForLeagueQuery = {
  __typename?: 'Query';
  getCurrentMatchupForLeague?: {
    __typename?: 'Matchup';
    id?: string | null;
    weekNumber?: number | null;
    leagueId?: number | null;
    team1Id?: number | null;
    team2Id?: number | null;
    team1Score?: number | null;
    team2Score?: number | null;
    status?: MatchupStatus | null;
    gamesPerMatchup?: number | null;
    spStartsPerMatchup?: number | null;
    startTime?: string | null;
    endTime?: string | null;
  } | null;
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
    gamesPerMatchup?: number | null;
    spStartsPerMatchup?: number | null;
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
    gamesPerMatchup?: number | null;
    spStartsPerMatchup?: number | null;
    startTime?: string | null;
    endTime?: string | null;
  }> | null;
};

export type LeagueChatMessageFieldsFragment = {
  __typename?: 'LeagueChatMessage';
  id?: string | null;
  leagueId?: number | null;
  userId?: number | null;
  messageText?: string | null;
  timestamp?: string | null;
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

export type TeamFragment = {
  __typename?: 'Team';
  id?: number | null;
  leagueId?: number | null;
  name?: string | null;
};

export type TeamMemberFragment = {
  __typename?: 'TeamMember';
  id?: number | null;
  playerId?: number | null;
  positionId?: number | null;
  teamId?: number | null;
  leagueId?: number | null;
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

export type UserFragment = {
  __typename?: 'User';
  id?: number | null;
  email?: string | null;
  username?: string | null;
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
  } | null;
};

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
    inviteCode
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
    gamesPerMatchup
    spStartsPerMatchup
    startTime
    endTime
  }
`;
export const LeagueChatMessageFieldsFragmentDoc = gql`
  fragment LeagueChatMessageFields on LeagueChatMessage {
    id
    leagueId
    userId
    messageText
    timestamp
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
export const TeamFragmentDoc = gql`
  fragment Team on Team {
    id
    leagueId
    name
  }
`;
export const TeamMemberFragmentDoc = gql`
  fragment TeamMember on TeamMember {
    id
    playerId
    positionId
    teamId
    leagueId
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
  }
`;
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
export const GetCurrentMatchupForLeague = gql`
  query GetCurrentMatchupForLeague($leagueId: Int!) {
    getCurrentMatchupForLeague(leagueId: $leagueId) {
      ...Matchup
    }
  }
  ${MatchupFragmentDoc}
`;

/**
 * __useGetCurrentMatchupForLeagueQuery__
 *
 * To run a query within a React component, call `useGetCurrentMatchupForLeagueQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetCurrentMatchupForLeagueQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetCurrentMatchupForLeagueQuery({
 *   variables: {
 *      leagueId: // value for 'leagueId'
 *   },
 * });
 */
export function useGetCurrentMatchupForLeagueQuery(
  baseOptions: Apollo.QueryHookOptions<
    GetCurrentMatchupForLeagueQuery,
    GetCurrentMatchupForLeagueQueryVariables
  > &
    (
      | { variables: GetCurrentMatchupForLeagueQueryVariables; skip?: boolean }
      | { skip: boolean }
    ),
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useQuery<
    GetCurrentMatchupForLeagueQuery,
    GetCurrentMatchupForLeagueQueryVariables
  >(GetCurrentMatchupForLeague, options);
}
export function useGetCurrentMatchupForLeagueLazyQuery(
  baseOptions?: Apollo.LazyQueryHookOptions<
    GetCurrentMatchupForLeagueQuery,
    GetCurrentMatchupForLeagueQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useLazyQuery<
    GetCurrentMatchupForLeagueQuery,
    GetCurrentMatchupForLeagueQueryVariables
  >(GetCurrentMatchupForLeague, options);
}
export function useGetCurrentMatchupForLeagueSuspenseQuery(
  baseOptions?:
    | Apollo.SkipToken
    | Apollo.SuspenseQueryHookOptions<
        GetCurrentMatchupForLeagueQuery,
        GetCurrentMatchupForLeagueQueryVariables
      >,
) {
  const options =
    baseOptions === Apollo.skipToken
      ? baseOptions
      : { ...defaultOptions, ...baseOptions };
  return Apollo.useSuspenseQuery<
    GetCurrentMatchupForLeagueQuery,
    GetCurrentMatchupForLeagueQueryVariables
  >(
    GetCurrentMatchupForLeague,
    options as
      | Apollo.SkipToken
      | Apollo.SuspenseQueryHookOptions<
          GetCurrentMatchupForLeagueQuery,
          GetCurrentMatchupForLeagueQueryVariables
        >,
  );
}
export type GetCurrentMatchupForLeagueQueryHookResult = ReturnType<
  typeof useGetCurrentMatchupForLeagueQuery
>;
export type GetCurrentMatchupForLeagueLazyQueryHookResult = ReturnType<
  typeof useGetCurrentMatchupForLeagueLazyQuery
>;
export type GetCurrentMatchupForLeagueSuspenseQueryHookResult = ReturnType<
  typeof useGetCurrentMatchupForLeagueSuspenseQuery
>;
export type GetCurrentMatchupForLeagueQueryResult = Apollo.QueryResult<
  GetCurrentMatchupForLeagueQuery,
  GetCurrentMatchupForLeagueQueryVariables
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
  mutation SendLeagueMessage($leagueId: Int!, $messageText: String!) {
    sendLeagueMessage(leagueId: $leagueId, messageText: $messageText) {
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
