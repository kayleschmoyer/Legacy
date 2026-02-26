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

export type AchievementRestrictionFragment = {
  __typename?: 'AchievementRestriction';
  id?: number | null;
  leagueId?: number | null;
  achievementType?: string | null;
  isRepeatable?: boolean | null;
  playerMinCount?: number | null;
  rosterMin?: number | null;
  rosterMax?: number | null;
  repeatableRosterMax?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type GetAchievementRestrictionsQueryVariables = Exact<{
  leagueId: Scalars['Int']['input'];
}>;

export type GetAchievementRestrictionsQuery = {
  __typename?: 'Query';
  achievementRestrictions?: Array<{
    __typename?: 'AchievementRestriction';
    id?: number | null;
    leagueId?: number | null;
    achievementType?: string | null;
    isRepeatable?: boolean | null;
    playerMinCount?: number | null;
    rosterMin?: number | null;
    rosterMax?: number | null;
    repeatableRosterMax?: number | null;
    createdAt?: string | null;
    updatedAt?: string | null;
  }> | null;
};

export type UpsertAchievementRestrictionMutationVariables = Exact<{
  input: UpsertAchievementRestrictionInput;
}>;

export type UpsertAchievementRestrictionMutation = {
  __typename?: 'Mutation';
  upsertAchievementRestriction?: {
    __typename?: 'AchievementRestriction';
    id?: number | null;
    leagueId?: number | null;
    achievementType?: string | null;
    isRepeatable?: boolean | null;
    playerMinCount?: number | null;
    rosterMin?: number | null;
    rosterMax?: number | null;
    repeatableRosterMax?: number | null;
    createdAt?: string | null;
    updatedAt?: string | null;
  } | null;
};

export type DeleteAchievementRestrictionMutationVariables = Exact<{
  leagueId: Scalars['Int']['input'];
  achievementType: Scalars['String']['input'];
}>;

export type DeleteAchievementRestrictionMutation = {
  __typename?: 'Mutation';
  deleteAchievementRestriction?: boolean | null;
};

export type GetLeagueChatMessagesQueryVariables = Exact<{
  leagueId: Scalars['Int']['input'];
  limit?: InputMaybe<Scalars['Int']['input']>;
}>;

export type GetLeagueChatMessagesQuery = {
  __typename?: 'Query';
  getLeagueMessages?: Array<{
    __typename?: 'LeagueChatMessage';
    id?: string | null;
    userId?: number | null;
    messageText?: string | null;
    timestamp?: string | null;
    messageType?: string | null;
    metadata?: string | null;
    sender?: { __typename?: 'User'; username?: string | null } | null;
  }> | null;
};

export type SendLeagueChatMessageMutationVariables = Exact<{
  leagueId: Scalars['Int']['input'];
  messageText: Scalars['String']['input'];
}>;

export type SendLeagueChatMessageMutation = {
  __typename?: 'Mutation';
  sendLeagueMessage?: {
    __typename?: 'LeagueChatMessage';
    id?: string | null;
    userId?: number | null;
    messageText?: string | null;
    timestamp?: string | null;
    messageType?: string | null;
    metadata?: string | null;
    sender?: { __typename?: 'User'; username?: string | null } | null;
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
  inviteCode?: string | null;
  playerPool?: string | null;
  weekAdvanceStatus?: string | null;
  waiverType?: string | null;
  waiverEnabled?: boolean | null;
  faabBudgetDefault?: number | null;
  spStartsPerMatchup?: number | null;
  gamesPerMatchup?: number | null;
  minCareerGames?: number | null;
  minCareerSeasons?: number | null;
  totalMatchups?: number | null;
  userMembership?: {
    __typename?: 'LeagueMember';
    leagueId?: number | null;
    userId?: number | null;
    teamId?: number | null;
    permissionLevel?: string | null;
  } | null;
};

export type LeagueMemberFragment = {
  __typename?: 'LeagueMember';
  leagueId?: number | null;
  userId?: number | null;
  teamId?: number | null;
  permissionLevel?: string | null;
};

export type LeaguePositionFragment = {
  __typename?: 'LeaguePosition';
  id?: number | null;
  leagueId?: number | null;
  positionType?: string | null;
};

export type GetLeagueByIdQueryVariables = Exact<{
  id: Scalars['Int']['input'];
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
    playerPool?: string | null;
    weekAdvanceStatus?: string | null;
    waiverType?: string | null;
    waiverEnabled?: boolean | null;
    faabBudgetDefault?: number | null;
    spStartsPerMatchup?: number | null;
    gamesPerMatchup?: number | null;
    minCareerGames?: number | null;
    minCareerSeasons?: number | null;
    totalMatchups?: number | null;
    userMembership?: {
      __typename?: 'LeagueMember';
      leagueId?: number | null;
      userId?: number | null;
      teamId?: number | null;
      permissionLevel?: string | null;
    } | null;
  } | null;
};

export type CreateLeagueAndTeamsMutationVariables = Exact<{
  input: CreateLeagueAndTeamsInput;
}>;

export type CreateLeagueAndTeamsMutation = {
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
      playerPool?: string | null;
      weekAdvanceStatus?: string | null;
      waiverType?: string | null;
      waiverEnabled?: boolean | null;
      faabBudgetDefault?: number | null;
      spStartsPerMatchup?: number | null;
      gamesPerMatchup?: number | null;
      minCareerGames?: number | null;
      minCareerSeasons?: number | null;
      totalMatchups?: number | null;
      userMembership?: {
        __typename?: 'LeagueMember';
        leagueId?: number | null;
        userId?: number | null;
        teamId?: number | null;
        permissionLevel?: string | null;
      } | null;
    } | null;
  } | null;
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
    playerPool?: string | null;
    weekAdvanceStatus?: string | null;
    waiverType?: string | null;
    waiverEnabled?: boolean | null;
    faabBudgetDefault?: number | null;
    spStartsPerMatchup?: number | null;
    gamesPerMatchup?: number | null;
    minCareerGames?: number | null;
    minCareerSeasons?: number | null;
    totalMatchups?: number | null;
    userMembership?: {
      __typename?: 'LeagueMember';
      leagueId?: number | null;
      userId?: number | null;
      teamId?: number | null;
      permissionLevel?: string | null;
    } | null;
  }>;
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

export type DeleteAllLeaguesMutationVariables = Exact<{ [key: string]: never }>;

export type DeleteAllLeaguesMutation = {
  __typename?: 'Mutation';
  deleteAllLeagues?: string | null;
};

export type DeleteLeagueMutationVariables = Exact<{
  leagueId: Scalars['Int']['input'];
}>;

export type DeleteLeagueMutation = {
  __typename?: 'Mutation';
  deleteLeague?: string | null;
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
    playerPool?: string | null;
    weekAdvanceStatus?: string | null;
    waiverType?: string | null;
    waiverEnabled?: boolean | null;
    faabBudgetDefault?: number | null;
    spStartsPerMatchup?: number | null;
    gamesPerMatchup?: number | null;
    minCareerGames?: number | null;
    minCareerSeasons?: number | null;
    totalMatchups?: number | null;
    userMembership?: {
      __typename?: 'LeagueMember';
      leagueId?: number | null;
      userId?: number | null;
      teamId?: number | null;
      permissionLevel?: string | null;
    } | null;
  } | null;
};

export type InitializeDraftMutationVariables = Exact<{
  leagueId: Scalars['Int']['input'];
  draftOrder?: InputMaybe<Scalars['String']['input']>;
  draftMode?: InputMaybe<Scalars['String']['input']>;
  selectionMethod?: InputMaybe<Scalars['String']['input']>;
}>;

export type InitializeDraftMutation = {
  __typename?: 'Mutation';
  initializeDraft?: {
    __typename?: 'Draft';
    id?: number | null;
    leagueId?: number | null;
    draftMode?: string | null;
    selectionMethod?: string | null;
    draftOrder?: string | null;
    currentPick?: number | null;
    pickTimeLimitSeconds?: number | null;
    currentPickDeadline?: string | null;
    draftStartedAt?: string | null;
    draftCompletedAt?: string | null;
  } | null;
};

export type JoinLeagueByCodeMutationVariables = Exact<{
  inviteCode: Scalars['String']['input'];
  teamName: Scalars['String']['input'];
}>;

export type JoinLeagueByCodeMutation = {
  __typename?: 'Mutation';
  joinLeagueByCode?: {
    __typename?: 'Team';
    id?: number | null;
    name?: string | null;
    leagueId?: number | null;
  } | null;
};

export type ValidateInviteCodeQueryVariables = Exact<{
  code: Scalars['String']['input'];
}>;

export type ValidateInviteCodeQuery = {
  __typename?: 'Query';
  validateInviteCode?: {
    __typename?: 'InviteCodeInfo';
    leagueName?: string | null;
    totalSpots?: number | null;
    availableSpots?: number | null;
    isFull?: boolean | null;
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
    waiverOrder?: number | null;
    faabBudget?: number | null;
  }> | null;
};

export type GetLeagueDraftQueryVariables = Exact<{
  leagueId: Scalars['Int']['input'];
}>;

export type GetLeagueDraftQuery = {
  __typename?: 'Query';
  getLeagueDraft?: {
    __typename?: 'Draft';
    id?: number | null;
    leagueId?: number | null;
    draftMode?: string | null;
    selectionMethod?: string | null;
    draftOrder?: string | null;
    currentPick?: number | null;
    draftStartedAt?: string | null;
    draftCompletedAt?: string | null;
  } | null;
};

export type UpdateDraftSettingsMutationVariables = Exact<{
  input: UpdateDraftSettingsInput;
}>;

export type UpdateDraftSettingsMutation = {
  __typename?: 'Mutation';
  updateDraftSettings?: {
    __typename?: 'UpdateDraftSettingsPayload';
    id?: number | null;
    leagueId?: number | null;
    draftMode?: string | null;
    selectionMethod?: string | null;
    draftOrder?: string | null;
    currentPick?: number | null;
    playerPool?: string | null;
    draftStartedAt?: string | null;
    draftCompletedAt?: string | null;
  } | null;
};

export type RenameTeamMutationVariables = Exact<{
  teamId: Scalars['Int']['input'];
  leagueId: Scalars['Int']['input'];
  newName: Scalars['String']['input'];
}>;

export type RenameTeamMutation = {
  __typename?: 'Mutation';
  renameTeam?: {
    __typename?: 'Team';
    id?: number | null;
    name?: string | null;
    leagueId?: number | null;
  } | null;
};

export type UpdateLeagueSettingsMutationVariables = Exact<{
  input: UpdateLeagueSettingsInput;
}>;

export type UpdateLeagueSettingsMutation = {
  __typename?: 'Mutation';
  updateLeagueSettings?: {
    __typename?: 'League';
    id?: number | null;
    name?: string | null;
    owner?: number | null;
    maxRosterSize?: number | null;
    currentMatchup?: number | null;
    currentWeekNumber?: number | null;
    draftStatus?: string | null;
    inviteCode?: string | null;
    playerPool?: string | null;
    weekAdvanceStatus?: string | null;
    waiverType?: string | null;
    waiverEnabled?: boolean | null;
    faabBudgetDefault?: number | null;
    spStartsPerMatchup?: number | null;
    gamesPerMatchup?: number | null;
    minCareerGames?: number | null;
    minCareerSeasons?: number | null;
    totalMatchups?: number | null;
    userMembership?: {
      __typename?: 'LeagueMember';
      leagueId?: number | null;
      userId?: number | null;
      teamId?: number | null;
      permissionLevel?: string | null;
    } | null;
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
    statsLoadingStatus?: StatsLoadingStatus | null;
    gamesPerMatchup?: number | null;
    spStartsPerMatchup?: number | null;
    selectedGamesCount?: number | null;
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

export type MatchupPlayerFragment = {
  __typename?: 'MatchupPlayer';
  id?: string | null;
  matchupId?: number | null;
  playerId?: number | null;
  teamId?: number | null;
  positionId?: number | null;
  season?: number | null;
  numberOfGames?: number | null;
  player?: {
    __typename?: 'Player';
    id?: number | null;
    firstName?: string | null;
    lastName?: string | null;
    brefId?: string | null;
    eligiblePositions?: Array<string> | null;
  } | null;
  seasonBatting?: {
    __typename?: 'SeasonBatting';
    games?: number | null;
    plateAppearances?: number | null;
    atBats?: number | null;
    runs?: number | null;
    hits?: number | null;
    doubles?: number | null;
    triples?: number | null;
    homeRuns?: number | null;
    rbi?: number | null;
    stolenBases?: number | null;
    caughtStealing?: number | null;
    baseOnBalls?: number | null;
    strikeouts?: number | null;
    groundedIntoDoublePlays?: number | null;
    hitByPitch?: number | null;
    sacrificeHits?: number | null;
    intentionalBaseOnBalls?: number | null;
    battingAverage?: number | null;
    onBasePercentage?: number | null;
    sluggingPercentage?: number | null;
  } | null;
  seasonPitching?: {
    __typename?: 'SeasonPitching';
    wins?: number | null;
    losses?: number | null;
    winLossPercentage?: string | null;
    earnedRunAverage?: string | null;
    games?: number | null;
    gamesStarted?: number | null;
    gamesFinished?: number | null;
    completeGames?: number | null;
    shutouts?: number | null;
    saves?: number | null;
    inningsPitched?: number | null;
    hits?: number | null;
    runs?: number | null;
    earnedRuns?: number | null;
    homeRuns?: number | null;
    baseOnBalls?: number | null;
    intentionalBaseOnBalls?: number | null;
    strikeouts?: number | null;
    hitByPitch?: number | null;
    balks?: number | null;
    wildPitches?: number | null;
    battersFaced?: number | null;
    outsRecorded?: number | null;
  } | null;
  seasonFielding?: {
    __typename?: 'SeasonFielding';
    games?: number | null;
    gamesStarted?: number | null;
    inningsDefended?: number | null;
    chances?: number | null;
    putouts?: number | null;
    assists?: number | null;
    errors?: number | null;
    doublePlays?: number | null;
    fieldingPercentage?: number | null;
  } | null;
  games?: Array<{
    __typename?: 'MatchupPlayerGame';
    id?: number | null;
    matchupPlayerId?: number | null;
    gameNum?: number | null;
    gameIdentifier?: string | null;
    fieldingGamePos?: string | null;
    statsLoadingStatus?: string | null;
    spSkipped?: boolean | null;
    battingGame?: {
      __typename?: 'GameBatting';
      playerId?: number | null;
      season?: number | null;
      gameNum?: number | null;
      gameIdentifier?: string | null;
      plateAppearances?: number | null;
      atBats?: number | null;
      runs?: number | null;
      hits?: number | null;
      doubles?: number | null;
      triples?: number | null;
      homeRuns?: number | null;
      rbi?: number | null;
      stolenBases?: number | null;
      caughtStealing?: number | null;
      baseOnBalls?: number | null;
      strikeouts?: number | null;
      groundedIntoDoublePlays?: number | null;
      hitByPitch?: number | null;
      sacrificeHits?: number | null;
      sacrificeFlies?: string | null;
      intentionalBaseOnBalls?: number | null;
      battingAverage?: number | null;
    } | null;
    pitchingGame?: {
      __typename?: 'GamePitching';
      playerId?: number | null;
      season?: number | null;
      gameNum?: number | null;
      gameIdentifier?: string | null;
      wins?: number | null;
      losses?: number | null;
      gamesStarted?: number | null;
      gamesFinished?: number | null;
      completeGames?: number | null;
      shutouts?: number | null;
      saves?: number | null;
      inningsPitched?: number | null;
      hits?: number | null;
      runs?: number | null;
      earnedRuns?: number | null;
      homeRuns?: number | null;
      baseOnBalls?: number | null;
      intentionalBaseOnBalls?: number | null;
      strikeouts?: number | null;
      hitByPitch?: number | null;
      battersFaced?: number | null;
      outsRecorded?: number | null;
      era?: number | null;
    } | null;
    fieldingGame?: {
      __typename?: 'GameFielding';
      playerId?: number | null;
      season?: number | null;
      gameNum?: number | null;
      gameIdentifier?: string | null;
      position?: string | null;
      games?: number | null;
      gamesStarted?: number | null;
      inningsPlayed?: number | null;
      putouts?: number | null;
      assists?: number | null;
      errors?: number | null;
      doublePlays?: number | null;
      passedBalls?: number | null;
      stolenBasesAllowed?: number | null;
      caughtStealing?: number | null;
      fieldingPercentage?: number | null;
    } | null;
  }> | null;
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
    numberOfGames?: number | null;
    player?: {
      __typename?: 'Player';
      id?: number | null;
      firstName?: string | null;
      lastName?: string | null;
      brefId?: string | null;
      eligiblePositions?: Array<string> | null;
    } | null;
    seasonBatting?: {
      __typename?: 'SeasonBatting';
      games?: number | null;
      plateAppearances?: number | null;
      atBats?: number | null;
      runs?: number | null;
      hits?: number | null;
      doubles?: number | null;
      triples?: number | null;
      homeRuns?: number | null;
      rbi?: number | null;
      stolenBases?: number | null;
      caughtStealing?: number | null;
      baseOnBalls?: number | null;
      strikeouts?: number | null;
      groundedIntoDoublePlays?: number | null;
      hitByPitch?: number | null;
      sacrificeHits?: number | null;
      intentionalBaseOnBalls?: number | null;
      battingAverage?: number | null;
      onBasePercentage?: number | null;
      sluggingPercentage?: number | null;
    } | null;
    seasonPitching?: {
      __typename?: 'SeasonPitching';
      wins?: number | null;
      losses?: number | null;
      winLossPercentage?: string | null;
      earnedRunAverage?: string | null;
      games?: number | null;
      gamesStarted?: number | null;
      gamesFinished?: number | null;
      completeGames?: number | null;
      shutouts?: number | null;
      saves?: number | null;
      inningsPitched?: number | null;
      hits?: number | null;
      runs?: number | null;
      earnedRuns?: number | null;
      homeRuns?: number | null;
      baseOnBalls?: number | null;
      intentionalBaseOnBalls?: number | null;
      strikeouts?: number | null;
      hitByPitch?: number | null;
      balks?: number | null;
      wildPitches?: number | null;
      battersFaced?: number | null;
      outsRecorded?: number | null;
    } | null;
    seasonFielding?: {
      __typename?: 'SeasonFielding';
      games?: number | null;
      gamesStarted?: number | null;
      inningsDefended?: number | null;
      chances?: number | null;
      putouts?: number | null;
      assists?: number | null;
      errors?: number | null;
      doublePlays?: number | null;
      fieldingPercentage?: number | null;
    } | null;
    games?: Array<{
      __typename?: 'MatchupPlayerGame';
      id?: number | null;
      matchupPlayerId?: number | null;
      gameNum?: number | null;
      gameIdentifier?: string | null;
      fieldingGamePos?: string | null;
      statsLoadingStatus?: string | null;
      spSkipped?: boolean | null;
      battingGame?: {
        __typename?: 'GameBatting';
        playerId?: number | null;
        season?: number | null;
        gameNum?: number | null;
        gameIdentifier?: string | null;
        plateAppearances?: number | null;
        atBats?: number | null;
        runs?: number | null;
        hits?: number | null;
        doubles?: number | null;
        triples?: number | null;
        homeRuns?: number | null;
        rbi?: number | null;
        stolenBases?: number | null;
        caughtStealing?: number | null;
        baseOnBalls?: number | null;
        strikeouts?: number | null;
        groundedIntoDoublePlays?: number | null;
        hitByPitch?: number | null;
        sacrificeHits?: number | null;
        sacrificeFlies?: string | null;
        intentionalBaseOnBalls?: number | null;
        battingAverage?: number | null;
      } | null;
      pitchingGame?: {
        __typename?: 'GamePitching';
        playerId?: number | null;
        season?: number | null;
        gameNum?: number | null;
        gameIdentifier?: string | null;
        wins?: number | null;
        losses?: number | null;
        gamesStarted?: number | null;
        gamesFinished?: number | null;
        completeGames?: number | null;
        shutouts?: number | null;
        saves?: number | null;
        inningsPitched?: number | null;
        hits?: number | null;
        runs?: number | null;
        earnedRuns?: number | null;
        homeRuns?: number | null;
        baseOnBalls?: number | null;
        intentionalBaseOnBalls?: number | null;
        strikeouts?: number | null;
        hitByPitch?: number | null;
        battersFaced?: number | null;
        outsRecorded?: number | null;
        era?: number | null;
      } | null;
      fieldingGame?: {
        __typename?: 'GameFielding';
        playerId?: number | null;
        season?: number | null;
        gameNum?: number | null;
        gameIdentifier?: string | null;
        position?: string | null;
        games?: number | null;
        gamesStarted?: number | null;
        inningsPlayed?: number | null;
        putouts?: number | null;
        assists?: number | null;
        errors?: number | null;
        doublePlays?: number | null;
        passedBalls?: number | null;
        stolenBasesAllowed?: number | null;
        caughtStealing?: number | null;
        fieldingPercentage?: number | null;
      } | null;
    }> | null;
  }> | null;
};

export type AutoSelectGamesMutationVariables = Exact<{
  leagueId?: InputMaybe<Scalars['Int']['input']>;
}>;

export type AutoSelectGamesMutation = {
  __typename?: 'Mutation';
  autoSelectGames?: {
    __typename?: 'AutoSelectGamesResult';
    leaguesProcessed?: number | null;
    gamesTriggered?: number | null;
    errors?: Array<string> | null;
  } | null;
};

export type AutoAdvanceMatchupsMutationVariables = Exact<{
  leagueId?: InputMaybe<Scalars['Int']['input']>;
}>;

export type AutoAdvanceMatchupsMutation = {
  __typename?: 'Mutation';
  autoAdvanceMatchups?: {
    __typename?: 'AutoAdvanceMatchupsResult';
    leaguesProcessed?: number | null;
    leaguesAdvanced?: number | null;
    leaguesSkipped?: number | null;
    errors?: Array<string> | null;
  } | null;
};

export type GetMatchupRosterQueryVariables = Exact<{
  matchupId: Scalars['Int']['input'];
  teamId: Scalars['Int']['input'];
}>;

export type GetMatchupRosterQuery = {
  __typename?: 'Query';
  getMatchupRoster?: Array<{
    __typename?: 'MatchupPlayer';
    id?: string | null;
    matchupId?: number | null;
    playerId?: number | null;
    teamId?: number | null;
    positionId?: number | null;
    season?: number | null;
    numberOfGames?: number | null;
    player?: {
      __typename?: 'Player';
      id?: number | null;
      firstName?: string | null;
      lastName?: string | null;
      brefId?: string | null;
      eligiblePositions?: Array<string> | null;
    } | null;
    seasonBatting?: {
      __typename?: 'SeasonBatting';
      games?: number | null;
      plateAppearances?: number | null;
      atBats?: number | null;
      runs?: number | null;
      hits?: number | null;
      doubles?: number | null;
      triples?: number | null;
      homeRuns?: number | null;
      rbi?: number | null;
      stolenBases?: number | null;
      caughtStealing?: number | null;
      baseOnBalls?: number | null;
      strikeouts?: number | null;
      groundedIntoDoublePlays?: number | null;
      hitByPitch?: number | null;
      sacrificeHits?: number | null;
      intentionalBaseOnBalls?: number | null;
      battingAverage?: number | null;
      onBasePercentage?: number | null;
      sluggingPercentage?: number | null;
    } | null;
    seasonPitching?: {
      __typename?: 'SeasonPitching';
      wins?: number | null;
      losses?: number | null;
      winLossPercentage?: string | null;
      earnedRunAverage?: string | null;
      games?: number | null;
      gamesStarted?: number | null;
      gamesFinished?: number | null;
      completeGames?: number | null;
      shutouts?: number | null;
      saves?: number | null;
      inningsPitched?: number | null;
      hits?: number | null;
      runs?: number | null;
      earnedRuns?: number | null;
      homeRuns?: number | null;
      baseOnBalls?: number | null;
      intentionalBaseOnBalls?: number | null;
      strikeouts?: number | null;
      hitByPitch?: number | null;
      balks?: number | null;
      wildPitches?: number | null;
      battersFaced?: number | null;
      outsRecorded?: number | null;
    } | null;
    seasonFielding?: {
      __typename?: 'SeasonFielding';
      games?: number | null;
      gamesStarted?: number | null;
      inningsDefended?: number | null;
      chances?: number | null;
      putouts?: number | null;
      assists?: number | null;
      errors?: number | null;
      doublePlays?: number | null;
      fieldingPercentage?: number | null;
    } | null;
    games?: Array<{
      __typename?: 'MatchupPlayerGame';
      id?: number | null;
      matchupPlayerId?: number | null;
      gameNum?: number | null;
      gameIdentifier?: string | null;
      fieldingGamePos?: string | null;
      statsLoadingStatus?: string | null;
      spSkipped?: boolean | null;
      battingGame?: {
        __typename?: 'GameBatting';
        playerId?: number | null;
        season?: number | null;
        gameNum?: number | null;
        gameIdentifier?: string | null;
        plateAppearances?: number | null;
        atBats?: number | null;
        runs?: number | null;
        hits?: number | null;
        doubles?: number | null;
        triples?: number | null;
        homeRuns?: number | null;
        rbi?: number | null;
        stolenBases?: number | null;
        caughtStealing?: number | null;
        baseOnBalls?: number | null;
        strikeouts?: number | null;
        groundedIntoDoublePlays?: number | null;
        hitByPitch?: number | null;
        sacrificeHits?: number | null;
        sacrificeFlies?: string | null;
        intentionalBaseOnBalls?: number | null;
        battingAverage?: number | null;
      } | null;
      pitchingGame?: {
        __typename?: 'GamePitching';
        playerId?: number | null;
        season?: number | null;
        gameNum?: number | null;
        gameIdentifier?: string | null;
        wins?: number | null;
        losses?: number | null;
        gamesStarted?: number | null;
        gamesFinished?: number | null;
        completeGames?: number | null;
        shutouts?: number | null;
        saves?: number | null;
        inningsPitched?: number | null;
        hits?: number | null;
        runs?: number | null;
        earnedRuns?: number | null;
        homeRuns?: number | null;
        baseOnBalls?: number | null;
        intentionalBaseOnBalls?: number | null;
        strikeouts?: number | null;
        hitByPitch?: number | null;
        battersFaced?: number | null;
        outsRecorded?: number | null;
        era?: number | null;
      } | null;
      fieldingGame?: {
        __typename?: 'GameFielding';
        playerId?: number | null;
        season?: number | null;
        gameNum?: number | null;
        gameIdentifier?: string | null;
        position?: string | null;
        games?: number | null;
        gamesStarted?: number | null;
        inningsPlayed?: number | null;
        putouts?: number | null;
        assists?: number | null;
        errors?: number | null;
        doublePlays?: number | null;
        passedBalls?: number | null;
        stolenBasesAllowed?: number | null;
        caughtStealing?: number | null;
        fieldingPercentage?: number | null;
      } | null;
    }> | null;
  }> | null;
};

export type GetTeamMatchupHistoryQueryVariables = Exact<{
  leagueId: Scalars['Int']['input'];
  teamId: Scalars['Int']['input'];
  limit?: InputMaybe<Scalars['Int']['input']>;
}>;

export type GetTeamMatchupHistoryQuery = {
  __typename?: 'Query';
  getTeamMatchupHistory?: Array<{
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
    numberOfGames?: number | null;
    player?: {
      __typename?: 'Player';
      id?: number | null;
      firstName?: string | null;
      lastName?: string | null;
      brefId?: string | null;
      eligiblePositions?: Array<string> | null;
    } | null;
    seasonBatting?: {
      __typename?: 'SeasonBatting';
      games?: number | null;
      plateAppearances?: number | null;
      atBats?: number | null;
      runs?: number | null;
      hits?: number | null;
      doubles?: number | null;
      triples?: number | null;
      homeRuns?: number | null;
      rbi?: number | null;
      stolenBases?: number | null;
      caughtStealing?: number | null;
      baseOnBalls?: number | null;
      strikeouts?: number | null;
      groundedIntoDoublePlays?: number | null;
      hitByPitch?: number | null;
      sacrificeHits?: number | null;
      intentionalBaseOnBalls?: number | null;
      battingAverage?: number | null;
      onBasePercentage?: number | null;
      sluggingPercentage?: number | null;
    } | null;
    seasonPitching?: {
      __typename?: 'SeasonPitching';
      wins?: number | null;
      losses?: number | null;
      winLossPercentage?: string | null;
      earnedRunAverage?: string | null;
      games?: number | null;
      gamesStarted?: number | null;
      gamesFinished?: number | null;
      completeGames?: number | null;
      shutouts?: number | null;
      saves?: number | null;
      inningsPitched?: number | null;
      hits?: number | null;
      runs?: number | null;
      earnedRuns?: number | null;
      homeRuns?: number | null;
      baseOnBalls?: number | null;
      intentionalBaseOnBalls?: number | null;
      strikeouts?: number | null;
      hitByPitch?: number | null;
      balks?: number | null;
      wildPitches?: number | null;
      battersFaced?: number | null;
      outsRecorded?: number | null;
    } | null;
    seasonFielding?: {
      __typename?: 'SeasonFielding';
      games?: number | null;
      gamesStarted?: number | null;
      inningsDefended?: number | null;
      chances?: number | null;
      putouts?: number | null;
      assists?: number | null;
      errors?: number | null;
      doublePlays?: number | null;
      fieldingPercentage?: number | null;
    } | null;
    games?: Array<{
      __typename?: 'MatchupPlayerGame';
      id?: number | null;
      matchupPlayerId?: number | null;
      gameNum?: number | null;
      gameIdentifier?: string | null;
      fieldingGamePos?: string | null;
      statsLoadingStatus?: string | null;
      spSkipped?: boolean | null;
      battingGame?: {
        __typename?: 'GameBatting';
        playerId?: number | null;
        season?: number | null;
        gameNum?: number | null;
        gameIdentifier?: string | null;
        plateAppearances?: number | null;
        atBats?: number | null;
        runs?: number | null;
        hits?: number | null;
        doubles?: number | null;
        triples?: number | null;
        homeRuns?: number | null;
        rbi?: number | null;
        stolenBases?: number | null;
        caughtStealing?: number | null;
        baseOnBalls?: number | null;
        strikeouts?: number | null;
        groundedIntoDoublePlays?: number | null;
        hitByPitch?: number | null;
        sacrificeHits?: number | null;
        sacrificeFlies?: string | null;
        intentionalBaseOnBalls?: number | null;
        battingAverage?: number | null;
      } | null;
      pitchingGame?: {
        __typename?: 'GamePitching';
        playerId?: number | null;
        season?: number | null;
        gameNum?: number | null;
        gameIdentifier?: string | null;
        wins?: number | null;
        losses?: number | null;
        gamesStarted?: number | null;
        gamesFinished?: number | null;
        completeGames?: number | null;
        shutouts?: number | null;
        saves?: number | null;
        inningsPitched?: number | null;
        hits?: number | null;
        runs?: number | null;
        earnedRuns?: number | null;
        homeRuns?: number | null;
        baseOnBalls?: number | null;
        intentionalBaseOnBalls?: number | null;
        strikeouts?: number | null;
        hitByPitch?: number | null;
        battersFaced?: number | null;
        outsRecorded?: number | null;
        era?: number | null;
      } | null;
      fieldingGame?: {
        __typename?: 'GameFielding';
        playerId?: number | null;
        season?: number | null;
        gameNum?: number | null;
        gameIdentifier?: string | null;
        position?: string | null;
        games?: number | null;
        gamesStarted?: number | null;
        inningsPlayed?: number | null;
        putouts?: number | null;
        assists?: number | null;
        errors?: number | null;
        doublePlays?: number | null;
        passedBalls?: number | null;
        stolenBasesAllowed?: number | null;
        caughtStealing?: number | null;
        fieldingPercentage?: number | null;
      } | null;
    }> | null;
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
    numberOfGames?: number | null;
    player?: {
      __typename?: 'Player';
      id?: number | null;
      firstName?: string | null;
      lastName?: string | null;
      brefId?: string | null;
      eligiblePositions?: Array<string> | null;
    } | null;
    seasonBatting?: {
      __typename?: 'SeasonBatting';
      games?: number | null;
      plateAppearances?: number | null;
      atBats?: number | null;
      runs?: number | null;
      hits?: number | null;
      doubles?: number | null;
      triples?: number | null;
      homeRuns?: number | null;
      rbi?: number | null;
      stolenBases?: number | null;
      caughtStealing?: number | null;
      baseOnBalls?: number | null;
      strikeouts?: number | null;
      groundedIntoDoublePlays?: number | null;
      hitByPitch?: number | null;
      sacrificeHits?: number | null;
      intentionalBaseOnBalls?: number | null;
      battingAverage?: number | null;
      onBasePercentage?: number | null;
      sluggingPercentage?: number | null;
    } | null;
    seasonPitching?: {
      __typename?: 'SeasonPitching';
      wins?: number | null;
      losses?: number | null;
      winLossPercentage?: string | null;
      earnedRunAverage?: string | null;
      games?: number | null;
      gamesStarted?: number | null;
      gamesFinished?: number | null;
      completeGames?: number | null;
      shutouts?: number | null;
      saves?: number | null;
      inningsPitched?: number | null;
      hits?: number | null;
      runs?: number | null;
      earnedRuns?: number | null;
      homeRuns?: number | null;
      baseOnBalls?: number | null;
      intentionalBaseOnBalls?: number | null;
      strikeouts?: number | null;
      hitByPitch?: number | null;
      balks?: number | null;
      wildPitches?: number | null;
      battersFaced?: number | null;
      outsRecorded?: number | null;
    } | null;
    seasonFielding?: {
      __typename?: 'SeasonFielding';
      games?: number | null;
      gamesStarted?: number | null;
      inningsDefended?: number | null;
      chances?: number | null;
      putouts?: number | null;
      assists?: number | null;
      errors?: number | null;
      doublePlays?: number | null;
      fieldingPercentage?: number | null;
    } | null;
    games?: Array<{
      __typename?: 'MatchupPlayerGame';
      id?: number | null;
      matchupPlayerId?: number | null;
      gameNum?: number | null;
      gameIdentifier?: string | null;
      fieldingGamePos?: string | null;
      statsLoadingStatus?: string | null;
      spSkipped?: boolean | null;
      battingGame?: {
        __typename?: 'GameBatting';
        playerId?: number | null;
        season?: number | null;
        gameNum?: number | null;
        gameIdentifier?: string | null;
        plateAppearances?: number | null;
        atBats?: number | null;
        runs?: number | null;
        hits?: number | null;
        doubles?: number | null;
        triples?: number | null;
        homeRuns?: number | null;
        rbi?: number | null;
        stolenBases?: number | null;
        caughtStealing?: number | null;
        baseOnBalls?: number | null;
        strikeouts?: number | null;
        groundedIntoDoublePlays?: number | null;
        hitByPitch?: number | null;
        sacrificeHits?: number | null;
        sacrificeFlies?: string | null;
        intentionalBaseOnBalls?: number | null;
        battingAverage?: number | null;
      } | null;
      pitchingGame?: {
        __typename?: 'GamePitching';
        playerId?: number | null;
        season?: number | null;
        gameNum?: number | null;
        gameIdentifier?: string | null;
        wins?: number | null;
        losses?: number | null;
        gamesStarted?: number | null;
        gamesFinished?: number | null;
        completeGames?: number | null;
        shutouts?: number | null;
        saves?: number | null;
        inningsPitched?: number | null;
        hits?: number | null;
        runs?: number | null;
        earnedRuns?: number | null;
        homeRuns?: number | null;
        baseOnBalls?: number | null;
        intentionalBaseOnBalls?: number | null;
        strikeouts?: number | null;
        hitByPitch?: number | null;
        battersFaced?: number | null;
        outsRecorded?: number | null;
        era?: number | null;
      } | null;
      fieldingGame?: {
        __typename?: 'GameFielding';
        playerId?: number | null;
        season?: number | null;
        gameNum?: number | null;
        gameIdentifier?: string | null;
        position?: string | null;
        games?: number | null;
        gamesStarted?: number | null;
        inningsPlayed?: number | null;
        putouts?: number | null;
        assists?: number | null;
        errors?: number | null;
        doublePlays?: number | null;
        passedBalls?: number | null;
        stolenBasesAllowed?: number | null;
        caughtStealing?: number | null;
        fieldingPercentage?: number | null;
      } | null;
    }> | null;
  }> | null;
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

export type GetAllPlayerSeasonStatsQueryVariables = Exact<{
  playerId: Scalars['Int']['input'];
}>;

export type GetAllPlayerSeasonStatsQuery = {
  __typename?: 'Query';
  playerSeasonBatting?: Array<{
    __typename?: 'SeasonBatting';
    season?: number | null;
    team?: string | null;
    games?: number | null;
    plateAppearances?: number | null;
    atBats?: number | null;
    runs?: number | null;
    hits?: number | null;
    doubles?: number | null;
    triples?: number | null;
    homeRuns?: number | null;
    rbi?: number | null;
    stolenBases?: number | null;
    caughtStealing?: number | null;
    baseOnBalls?: number | null;
    strikeouts?: number | null;
    battingAverage?: number | null;
    onBasePercentage?: number | null;
    sluggingPercentage?: number | null;
  }> | null;
  playerSeasonPitching?: Array<{
    __typename?: 'SeasonPitching';
    season?: number | null;
    team?: string | null;
    games?: number | null;
    wins?: number | null;
    losses?: number | null;
    gamesStarted?: number | null;
    completeGames?: number | null;
    shutouts?: number | null;
    saves?: number | null;
    inningsPitched?: number | null;
    hits?: number | null;
    runs?: number | null;
    earnedRuns?: number | null;
    homeRuns?: number | null;
    baseOnBalls?: number | null;
    strikeouts?: number | null;
    earnedRunAverage?: string | null;
    whip?: number | null;
  }> | null;
  playerSeasonFielding?: Array<{
    __typename?: 'SeasonFielding';
    season?: number | null;
    team?: string | null;
    position?: string | null;
    games?: number | null;
    gamesStarted?: number | null;
    inningsDefended?: number | null;
    putouts?: number | null;
    assists?: number | null;
    errors?: number | null;
    doublePlays?: number | null;
    fieldingPercentage?: number | null;
  }> | null;
};

export type GetPlayersWithStatsQueryVariables = Exact<{
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Scalars['String']['input']>;
  orderDirection?: InputMaybe<Scalars['String']['input']>;
  position?: InputMaybe<Scalars['String']['input']>;
  leagueId?: InputMaybe<Scalars['Int']['input']>;
  search?: InputMaybe<Scalars['String']['input']>;
}>;

export type GetPlayersWithStatsQuery = {
  __typename?: 'Query';
  players?: Array<{
    __typename?: 'Player';
    id?: number | null;
    firstName?: string | null;
    lastName?: string | null;
    brefId?: string | null;
    eligiblePositions?: Array<string> | null;
    scoring?: {
      __typename?: 'PlayerScoring';
      battingScore?: number | null;
      pitchingScore?: number | null;
      fieldingScore?: number | null;
      hitterScore?: number | null;
      hitterAvgPointsPerGame?: number | null;
      pitchingAvgPointsPerGame?: number | null;
      totalScore?: number | null;
      careerGames?: number | null;
      avgPointsPerGame?: number | null;
    } | null;
    averageSeasonBatting?: {
      __typename?: 'AverageSeasonBatting';
      seasons?: number | null;
      games?: number | null;
      atBats?: number | null;
      runs?: number | null;
      hits?: number | null;
      homeRuns?: number | null;
      rbi?: number | null;
      stolenBases?: number | null;
      battingAverage?: number | null;
      onBasePercentage?: number | null;
      sluggingPercentage?: number | null;
    } | null;
    careerBatting?: {
      __typename?: 'CareerBatting';
      games?: number | null;
      runs?: number | null;
      homeRuns?: number | null;
      rbi?: number | null;
      stolenBases?: number | null;
      hits?: number | null;
      atBats?: number | null;
      plateAppearances?: number | null;
      baseOnBalls?: number | null;
      hitByPitch?: number | null;
      sacrificeHits?: number | null;
      totalBases?: number | null;
    } | null;
    careerPitching?: {
      __typename?: 'CareerPitching';
      wins?: number | null;
      losses?: number | null;
      era?: string | null;
      games?: number | null;
      gamesStarted?: number | null;
      saves?: number | null;
      strikeouts?: number | null;
      baseOnBalls?: number | null;
      hits?: number | null;
      earnedRuns?: number | null;
      outsRecorded?: number | null;
      winPercentage?: number | null;
    } | null;
    careerAchievements?: {
      __typename?: 'CareerAchievements';
      allStarSelections?: number | null;
      mvpAwards?: number | null;
      cyYoungAwards?: number | null;
      goldGloves?: number | null;
      silverSluggers?: number | null;
      worldSeriesRings?: number | null;
      hallOfFame?: boolean | null;
      rookieOfTheYear?: boolean | null;
    } | null;
  }> | null;
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

export type TeamFragment = {
  __typename?: 'Team';
  id?: number | null;
  leagueId?: number | null;
  name?: string | null;
  waiverOrder?: number | null;
  faabBudget?: number | null;
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
    seasonsPlayed?: number | null;
    careerBatting?: {
      __typename?: 'CareerBatting';
      games?: number | null;
    } | null;
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
      seasonsPlayed?: number | null;
      careerBatting?: {
        __typename?: 'CareerBatting';
        games?: number | null;
      } | null;
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
      seasonsPlayed?: number | null;
      careerBatting?: {
        __typename?: 'CareerBatting';
        games?: number | null;
      } | null;
    } | null;
  } | null;
};

export type SwapTeamMemberPositionsMutationVariables = Exact<{
  teamMemberIdA: Scalars['Int']['input'];
  positionIdA?: InputMaybe<Scalars['Int']['input']>;
  teamMemberIdB: Scalars['Int']['input'];
  positionIdB?: InputMaybe<Scalars['Int']['input']>;
}>;

export type SwapTeamMemberPositionsMutation = {
  __typename?: 'Mutation';
  swapTeamMemberPositions?: Array<{
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
      seasonsPlayed?: number | null;
      careerBatting?: {
        __typename?: 'CareerBatting';
        games?: number | null;
      } | null;
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

export type ProcessWaiverClaimsMutationVariables = Exact<{
  leagueId?: InputMaybe<Scalars['Int']['input']>;
}>;

export type ProcessWaiverClaimsMutation = {
  __typename?: 'Mutation';
  processWaiverClaims?: {
    __typename?: 'ProcessWaiverClaimsResult';
    processed?: number | null;
    succeeded?: number | null;
    failed?: number | null;
  } | null;
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

export type TradeOfferPlayerFragment = {
  __typename?: 'TradeOfferPlayer';
  id?: number | null;
  tradeOfferId?: number | null;
  playerId?: number | null;
  fromTeamId?: number | null;
  playerName?: string | null;
  playerPosition?: string | null;
};

export type TradeOfferFragment = {
  __typename?: 'TradeOffer';
  id?: number | null;
  leagueId?: number | null;
  proposingTeamId?: number | null;
  receivingTeamId?: number | null;
  status?: string | null;
  message?: string | null;
  expiresAt?: string | null;
  respondedAt?: string | null;
  vetoedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  proposingTeamName?: string | null;
  receivingTeamName?: string | null;
  players?: Array<{
    __typename?: 'TradeOfferPlayer';
    id?: number | null;
    tradeOfferId?: number | null;
    playerId?: number | null;
    fromTeamId?: number | null;
    playerName?: string | null;
    playerPosition?: string | null;
  }> | null;
};

export type GetTeamTradeOffersQueryVariables = Exact<{
  teamId: Scalars['Int']['input'];
  status?: InputMaybe<Scalars['String']['input']>;
}>;

export type GetTeamTradeOffersQuery = {
  __typename?: 'Query';
  teamTradeOffers?: Array<{
    __typename?: 'TradeOffer';
    id?: number | null;
    leagueId?: number | null;
    proposingTeamId?: number | null;
    receivingTeamId?: number | null;
    status?: string | null;
    message?: string | null;
    expiresAt?: string | null;
    respondedAt?: string | null;
    vetoedAt?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
    proposingTeamName?: string | null;
    receivingTeamName?: string | null;
    players?: Array<{
      __typename?: 'TradeOfferPlayer';
      id?: number | null;
      tradeOfferId?: number | null;
      playerId?: number | null;
      fromTeamId?: number | null;
      playerName?: string | null;
      playerPosition?: string | null;
    }> | null;
  }> | null;
};

export type GetLeagueTradeOffersQueryVariables = Exact<{
  leagueId: Scalars['Int']['input'];
  status?: InputMaybe<Scalars['String']['input']>;
}>;

export type GetLeagueTradeOffersQuery = {
  __typename?: 'Query';
  leagueTradeOffers?: Array<{
    __typename?: 'TradeOffer';
    id?: number | null;
    leagueId?: number | null;
    proposingTeamId?: number | null;
    receivingTeamId?: number | null;
    status?: string | null;
    message?: string | null;
    expiresAt?: string | null;
    respondedAt?: string | null;
    vetoedAt?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
    proposingTeamName?: string | null;
    receivingTeamName?: string | null;
    players?: Array<{
      __typename?: 'TradeOfferPlayer';
      id?: number | null;
      tradeOfferId?: number | null;
      playerId?: number | null;
      fromTeamId?: number | null;
      playerName?: string | null;
      playerPosition?: string | null;
    }> | null;
  }> | null;
};

export type ProposeTradeMutationVariables = Exact<{
  leagueId: Scalars['Int']['input'];
  receivingTeamId: Scalars['Int']['input'];
  offeringPlayerIds: Array<Scalars['Int']['input']> | Scalars['Int']['input'];
  requestingPlayerIds: Array<Scalars['Int']['input']> | Scalars['Int']['input'];
  message?: InputMaybe<Scalars['String']['input']>;
  expiresInDays?: InputMaybe<Scalars['Int']['input']>;
}>;

export type ProposeTradeMutation = {
  __typename?: 'Mutation';
  proposeTrade?: {
    __typename?: 'TradeOffer';
    id?: number | null;
    leagueId?: number | null;
    proposingTeamId?: number | null;
    receivingTeamId?: number | null;
    status?: string | null;
    message?: string | null;
    expiresAt?: string | null;
    respondedAt?: string | null;
    vetoedAt?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
    proposingTeamName?: string | null;
    receivingTeamName?: string | null;
    players?: Array<{
      __typename?: 'TradeOfferPlayer';
      id?: number | null;
      tradeOfferId?: number | null;
      playerId?: number | null;
      fromTeamId?: number | null;
      playerName?: string | null;
      playerPosition?: string | null;
    }> | null;
  } | null;
};

export type AcceptTradeMutationVariables = Exact<{
  tradeId: Scalars['Int']['input'];
}>;

export type AcceptTradeMutation = {
  __typename?: 'Mutation';
  acceptTrade?: {
    __typename?: 'TradeOffer';
    id?: number | null;
    leagueId?: number | null;
    proposingTeamId?: number | null;
    receivingTeamId?: number | null;
    status?: string | null;
    message?: string | null;
    expiresAt?: string | null;
    respondedAt?: string | null;
    vetoedAt?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
    proposingTeamName?: string | null;
    receivingTeamName?: string | null;
    players?: Array<{
      __typename?: 'TradeOfferPlayer';
      id?: number | null;
      tradeOfferId?: number | null;
      playerId?: number | null;
      fromTeamId?: number | null;
      playerName?: string | null;
      playerPosition?: string | null;
    }> | null;
  } | null;
};

export type RejectTradeMutationVariables = Exact<{
  tradeId: Scalars['Int']['input'];
}>;

export type RejectTradeMutation = {
  __typename?: 'Mutation';
  rejectTrade?: {
    __typename?: 'TradeOffer';
    id?: number | null;
    leagueId?: number | null;
    proposingTeamId?: number | null;
    receivingTeamId?: number | null;
    status?: string | null;
    message?: string | null;
    expiresAt?: string | null;
    respondedAt?: string | null;
    vetoedAt?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
    proposingTeamName?: string | null;
    receivingTeamName?: string | null;
    players?: Array<{
      __typename?: 'TradeOfferPlayer';
      id?: number | null;
      tradeOfferId?: number | null;
      playerId?: number | null;
      fromTeamId?: number | null;
      playerName?: string | null;
      playerPosition?: string | null;
    }> | null;
  } | null;
};

export type CancelTradeMutationVariables = Exact<{
  tradeId: Scalars['Int']['input'];
}>;

export type CancelTradeMutation = {
  __typename?: 'Mutation';
  cancelTrade?: {
    __typename?: 'TradeOffer';
    id?: number | null;
    leagueId?: number | null;
    proposingTeamId?: number | null;
    receivingTeamId?: number | null;
    status?: string | null;
    message?: string | null;
    expiresAt?: string | null;
    respondedAt?: string | null;
    vetoedAt?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
    proposingTeamName?: string | null;
    receivingTeamName?: string | null;
    players?: Array<{
      __typename?: 'TradeOfferPlayer';
      id?: number | null;
      tradeOfferId?: number | null;
      playerId?: number | null;
      fromTeamId?: number | null;
      playerName?: string | null;
      playerPosition?: string | null;
    }> | null;
  } | null;
};

export type VetoTradeMutationVariables = Exact<{
  tradeId: Scalars['Int']['input'];
}>;

export type VetoTradeMutation = {
  __typename?: 'Mutation';
  vetoTrade?: {
    __typename?: 'TradeOffer';
    id?: number | null;
    leagueId?: number | null;
    proposingTeamId?: number | null;
    receivingTeamId?: number | null;
    status?: string | null;
    message?: string | null;
    expiresAt?: string | null;
    respondedAt?: string | null;
    vetoedAt?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
    proposingTeamName?: string | null;
    receivingTeamName?: string | null;
    players?: Array<{
      __typename?: 'TradeOfferPlayer';
      id?: number | null;
      tradeOfferId?: number | null;
      playerId?: number | null;
      fromTeamId?: number | null;
      playerName?: string | null;
      playerPosition?: string | null;
    }> | null;
  } | null;
};

export type UserFragment = {
  __typename?: 'User';
  id?: number | null;
  email?: string | null;
  username?: string | null;
  accessLevel?: string | null;
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
    accessLevel?: string | null;
  } | null;
};

export type GetAllUsersQueryVariables = Exact<{
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
}>;

export type GetAllUsersQuery = {
  __typename?: 'Query';
  users?: Array<{
    __typename?: 'User';
    id?: number | null;
    email?: string | null;
    username?: string | null;
    accessLevel?: string | null;
  }> | null;
};

export type UpdateUserRoleMutationVariables = Exact<{
  userId: Scalars['Int']['input'];
  accessLevel: Scalars['String']['input'];
}>;

export type UpdateUserRoleMutation = {
  __typename?: 'Mutation';
  updateUserRole?: {
    __typename?: 'User';
    id?: number | null;
    email?: string | null;
    username?: string | null;
    accessLevel?: string | null;
  } | null;
};

export const AchievementRestrictionFragmentDoc = gql`
  fragment AchievementRestriction on AchievementRestriction {
    id
    leagueId
    achievementType
    isRepeatable
    playerMinCount
    rosterMin
    rosterMax
    repeatableRosterMax
    createdAt
    updatedAt
  }
`;
export const LeagueMemberFragmentDoc = gql`
  fragment LeagueMember on LeagueMember {
    leagueId
    userId
    teamId
    permissionLevel
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
    playerPool
    weekAdvanceStatus
    waiverType
    waiverEnabled
    faabBudgetDefault
    spStartsPerMatchup
    gamesPerMatchup
    minCareerGames
    minCareerSeasons
    totalMatchups
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
    numberOfGames
    player {
      id
      firstName
      lastName
      brefId
      eligiblePositions
    }
    seasonBatting {
      games
      plateAppearances
      atBats
      runs
      hits
      doubles
      triples
      homeRuns
      rbi
      stolenBases
      caughtStealing
      baseOnBalls
      strikeouts
      groundedIntoDoublePlays
      hitByPitch
      sacrificeHits
      intentionalBaseOnBalls
      battingAverage
      onBasePercentage
      sluggingPercentage
    }
    seasonPitching {
      wins
      losses
      winLossPercentage
      earnedRunAverage
      games
      gamesStarted
      gamesFinished
      completeGames
      shutouts
      saves
      inningsPitched
      hits
      runs
      earnedRuns
      homeRuns
      baseOnBalls
      intentionalBaseOnBalls
      strikeouts
      hitByPitch
      balks
      wildPitches
      battersFaced
      outsRecorded
    }
    seasonFielding {
      games
      gamesStarted
      inningsDefended
      chances
      putouts
      assists
      errors
      doublePlays
      fieldingPercentage
    }
    games {
      id
      matchupPlayerId
      gameNum
      gameIdentifier
      fieldingGamePos
      statsLoadingStatus
      spSkipped
      battingGame {
        playerId
        season
        gameNum
        gameIdentifier
        plateAppearances
        atBats
        runs
        hits
        doubles
        triples
        homeRuns
        rbi
        stolenBases
        caughtStealing
        baseOnBalls
        strikeouts
        groundedIntoDoublePlays
        hitByPitch
        sacrificeHits
        sacrificeFlies
        intentionalBaseOnBalls
        battingAverage
      }
      pitchingGame {
        playerId
        season
        gameNum
        gameIdentifier
        wins
        losses
        gamesStarted
        gamesFinished
        completeGames
        shutouts
        saves
        inningsPitched
        hits
        runs
        earnedRuns
        homeRuns
        baseOnBalls
        intentionalBaseOnBalls
        strikeouts
        hitByPitch
        battersFaced
        outsRecorded
        era
      }
      fieldingGame {
        playerId
        season
        gameNum
        gameIdentifier
        position
        games
        gamesStarted
        inningsPlayed
        putouts
        assists
        errors
        doublePlays
        passedBalls
        stolenBasesAllowed
        caughtStealing
        fieldingPercentage
      }
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
export const TeamFragmentDoc = gql`
  fragment Team on Team {
    id
    leagueId
    name
    waiverOrder
    faabBudget
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
      careerBatting {
        games
      }
      seasonsPlayed
    }
  }
`;
export const TradeOfferPlayerFragmentDoc = gql`
  fragment TradeOfferPlayer on TradeOfferPlayer {
    id
    tradeOfferId
    playerId
    fromTeamId
    playerName
    playerPosition
  }
`;
export const TradeOfferFragmentDoc = gql`
  fragment TradeOffer on TradeOffer {
    id
    leagueId
    proposingTeamId
    receivingTeamId
    status
    message
    expiresAt
    respondedAt
    vetoedAt
    createdAt
    updatedAt
    proposingTeamName
    receivingTeamName
    players {
      ...TradeOfferPlayer
    }
  }
  ${TradeOfferPlayerFragmentDoc}
`;
export const UserFragmentDoc = gql`
  fragment User on User {
    id
    email
    username
    accessLevel
  }
`;
export const GetAchievementRestrictions = gql`
  query GetAchievementRestrictions($leagueId: Int!) {
    achievementRestrictions(leagueId: $leagueId) {
      ...AchievementRestriction
    }
  }
  ${AchievementRestrictionFragmentDoc}
`;

/**
 * __useGetAchievementRestrictionsQuery__
 *
 * To run a query within a React component, call `useGetAchievementRestrictionsQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetAchievementRestrictionsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetAchievementRestrictionsQuery({
 *   variables: {
 *      leagueId: // value for 'leagueId'
 *   },
 * });
 */
export function useGetAchievementRestrictionsQuery(
  baseOptions: Apollo.QueryHookOptions<
    GetAchievementRestrictionsQuery,
    GetAchievementRestrictionsQueryVariables
  > &
    (
      | { variables: GetAchievementRestrictionsQueryVariables; skip?: boolean }
      | { skip: boolean }
    ),
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useQuery<
    GetAchievementRestrictionsQuery,
    GetAchievementRestrictionsQueryVariables
  >(GetAchievementRestrictions, options);
}
export function useGetAchievementRestrictionsLazyQuery(
  baseOptions?: Apollo.LazyQueryHookOptions<
    GetAchievementRestrictionsQuery,
    GetAchievementRestrictionsQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useLazyQuery<
    GetAchievementRestrictionsQuery,
    GetAchievementRestrictionsQueryVariables
  >(GetAchievementRestrictions, options);
}
export function useGetAchievementRestrictionsSuspenseQuery(
  baseOptions?:
    | Apollo.SkipToken
    | Apollo.SuspenseQueryHookOptions<
        GetAchievementRestrictionsQuery,
        GetAchievementRestrictionsQueryVariables
      >,
) {
  const options =
    baseOptions === Apollo.skipToken
      ? baseOptions
      : { ...defaultOptions, ...baseOptions };
  return Apollo.useSuspenseQuery<
    GetAchievementRestrictionsQuery,
    GetAchievementRestrictionsQueryVariables
  >(
    GetAchievementRestrictions,
    options as
      | Apollo.SkipToken
      | Apollo.SuspenseQueryHookOptions<
          GetAchievementRestrictionsQuery,
          GetAchievementRestrictionsQueryVariables
        >,
  );
}
export type GetAchievementRestrictionsQueryHookResult = ReturnType<
  typeof useGetAchievementRestrictionsQuery
>;
export type GetAchievementRestrictionsLazyQueryHookResult = ReturnType<
  typeof useGetAchievementRestrictionsLazyQuery
>;
export type GetAchievementRestrictionsSuspenseQueryHookResult = ReturnType<
  typeof useGetAchievementRestrictionsSuspenseQuery
>;
export type GetAchievementRestrictionsQueryResult = Apollo.QueryResult<
  GetAchievementRestrictionsQuery,
  GetAchievementRestrictionsQueryVariables
>;
export const UpsertAchievementRestriction = gql`
  mutation UpsertAchievementRestriction(
    $input: UpsertAchievementRestrictionInput!
  ) {
    upsertAchievementRestriction(input: $input) {
      ...AchievementRestriction
    }
  }
  ${AchievementRestrictionFragmentDoc}
`;
export type UpsertAchievementRestrictionMutationFn = MutationFunction<
  UpsertAchievementRestrictionMutation,
  UpsertAchievementRestrictionMutationVariables
>;

/**
 * __useUpsertAchievementRestrictionMutation__
 *
 * To run a mutation, you first call `useUpsertAchievementRestrictionMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUpsertAchievementRestrictionMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [upsertAchievementRestrictionMutation, { data, loading, error }] = useUpsertAchievementRestrictionMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
export function useUpsertAchievementRestrictionMutation(
  baseOptions?: Apollo.MutationHookOptions<
    UpsertAchievementRestrictionMutation,
    UpsertAchievementRestrictionMutationVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useMutation<
    UpsertAchievementRestrictionMutation,
    UpsertAchievementRestrictionMutationVariables
  >(UpsertAchievementRestriction, options);
}
export type UpsertAchievementRestrictionMutationHookResult = ReturnType<
  typeof useUpsertAchievementRestrictionMutation
>;
export type UpsertAchievementRestrictionMutationResult =
  Apollo.MutationResult<UpsertAchievementRestrictionMutation>;
export type UpsertAchievementRestrictionMutationOptions = BaseMutationOptions<
  UpsertAchievementRestrictionMutation,
  UpsertAchievementRestrictionMutationVariables
>;
export const DeleteAchievementRestriction = gql`
  mutation DeleteAchievementRestriction(
    $leagueId: Int!
    $achievementType: String!
  ) {
    deleteAchievementRestriction(
      leagueId: $leagueId
      achievementType: $achievementType
    )
  }
`;
export type DeleteAchievementRestrictionMutationFn = MutationFunction<
  DeleteAchievementRestrictionMutation,
  DeleteAchievementRestrictionMutationVariables
>;

/**
 * __useDeleteAchievementRestrictionMutation__
 *
 * To run a mutation, you first call `useDeleteAchievementRestrictionMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useDeleteAchievementRestrictionMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [deleteAchievementRestrictionMutation, { data, loading, error }] = useDeleteAchievementRestrictionMutation({
 *   variables: {
 *      leagueId: // value for 'leagueId'
 *      achievementType: // value for 'achievementType'
 *   },
 * });
 */
export function useDeleteAchievementRestrictionMutation(
  baseOptions?: Apollo.MutationHookOptions<
    DeleteAchievementRestrictionMutation,
    DeleteAchievementRestrictionMutationVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useMutation<
    DeleteAchievementRestrictionMutation,
    DeleteAchievementRestrictionMutationVariables
  >(DeleteAchievementRestriction, options);
}
export type DeleteAchievementRestrictionMutationHookResult = ReturnType<
  typeof useDeleteAchievementRestrictionMutation
>;
export type DeleteAchievementRestrictionMutationResult =
  Apollo.MutationResult<DeleteAchievementRestrictionMutation>;
export type DeleteAchievementRestrictionMutationOptions = BaseMutationOptions<
  DeleteAchievementRestrictionMutation,
  DeleteAchievementRestrictionMutationVariables
>;
export const GetLeagueChatMessages = gql`
  query GetLeagueChatMessages($leagueId: Int!, $limit: Int) {
    getLeagueMessages(leagueId: $leagueId, limit: $limit) {
      id
      userId
      messageText
      timestamp
      messageType
      metadata
      sender {
        username
      }
    }
  }
`;

/**
 * __useGetLeagueChatMessagesQuery__
 *
 * To run a query within a React component, call `useGetLeagueChatMessagesQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetLeagueChatMessagesQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetLeagueChatMessagesQuery({
 *   variables: {
 *      leagueId: // value for 'leagueId'
 *      limit: // value for 'limit'
 *   },
 * });
 */
export function useGetLeagueChatMessagesQuery(
  baseOptions: Apollo.QueryHookOptions<
    GetLeagueChatMessagesQuery,
    GetLeagueChatMessagesQueryVariables
  > &
    (
      | { variables: GetLeagueChatMessagesQueryVariables; skip?: boolean }
      | { skip: boolean }
    ),
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useQuery<
    GetLeagueChatMessagesQuery,
    GetLeagueChatMessagesQueryVariables
  >(GetLeagueChatMessages, options);
}
export function useGetLeagueChatMessagesLazyQuery(
  baseOptions?: Apollo.LazyQueryHookOptions<
    GetLeagueChatMessagesQuery,
    GetLeagueChatMessagesQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useLazyQuery<
    GetLeagueChatMessagesQuery,
    GetLeagueChatMessagesQueryVariables
  >(GetLeagueChatMessages, options);
}
export function useGetLeagueChatMessagesSuspenseQuery(
  baseOptions?:
    | Apollo.SkipToken
    | Apollo.SuspenseQueryHookOptions<
        GetLeagueChatMessagesQuery,
        GetLeagueChatMessagesQueryVariables
      >,
) {
  const options =
    baseOptions === Apollo.skipToken
      ? baseOptions
      : { ...defaultOptions, ...baseOptions };
  return Apollo.useSuspenseQuery<
    GetLeagueChatMessagesQuery,
    GetLeagueChatMessagesQueryVariables
  >(
    GetLeagueChatMessages,
    options as
      | Apollo.SkipToken
      | Apollo.SuspenseQueryHookOptions<
          GetLeagueChatMessagesQuery,
          GetLeagueChatMessagesQueryVariables
        >,
  );
}
export type GetLeagueChatMessagesQueryHookResult = ReturnType<
  typeof useGetLeagueChatMessagesQuery
>;
export type GetLeagueChatMessagesLazyQueryHookResult = ReturnType<
  typeof useGetLeagueChatMessagesLazyQuery
>;
export type GetLeagueChatMessagesSuspenseQueryHookResult = ReturnType<
  typeof useGetLeagueChatMessagesSuspenseQuery
>;
export type GetLeagueChatMessagesQueryResult = Apollo.QueryResult<
  GetLeagueChatMessagesQuery,
  GetLeagueChatMessagesQueryVariables
>;
export const SendLeagueChatMessage = gql`
  mutation SendLeagueChatMessage($leagueId: Int!, $messageText: String!) {
    sendLeagueMessage(leagueId: $leagueId, messageText: $messageText) {
      id
      userId
      messageText
      timestamp
      messageType
      metadata
      sender {
        username
      }
    }
  }
`;
export type SendLeagueChatMessageMutationFn = MutationFunction<
  SendLeagueChatMessageMutation,
  SendLeagueChatMessageMutationVariables
>;

/**
 * __useSendLeagueChatMessageMutation__
 *
 * To run a mutation, you first call `useSendLeagueChatMessageMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useSendLeagueChatMessageMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [sendLeagueChatMessageMutation, { data, loading, error }] = useSendLeagueChatMessageMutation({
 *   variables: {
 *      leagueId: // value for 'leagueId'
 *      messageText: // value for 'messageText'
 *   },
 * });
 */
export function useSendLeagueChatMessageMutation(
  baseOptions?: Apollo.MutationHookOptions<
    SendLeagueChatMessageMutation,
    SendLeagueChatMessageMutationVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useMutation<
    SendLeagueChatMessageMutation,
    SendLeagueChatMessageMutationVariables
  >(SendLeagueChatMessage, options);
}
export type SendLeagueChatMessageMutationHookResult = ReturnType<
  typeof useSendLeagueChatMessageMutation
>;
export type SendLeagueChatMessageMutationResult =
  Apollo.MutationResult<SendLeagueChatMessageMutation>;
export type SendLeagueChatMessageMutationOptions = BaseMutationOptions<
  SendLeagueChatMessageMutation,
  SendLeagueChatMessageMutationVariables
>;
export const GetLeagueById = gql`
  query GetLeagueById($id: Int!) {
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
export const CreateLeagueAndTeams = gql`
  mutation CreateLeagueAndTeams($input: CreateLeagueAndTeamsInput!) {
    createLeagueAndTeams(input: $input) {
      league {
        ...League
      }
    }
  }
  ${LeagueFragmentDoc}
`;
export type CreateLeagueAndTeamsMutationFn = MutationFunction<
  CreateLeagueAndTeamsMutation,
  CreateLeagueAndTeamsMutationVariables
>;

/**
 * __useCreateLeagueAndTeamsMutation__
 *
 * To run a mutation, you first call `useCreateLeagueAndTeamsMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useCreateLeagueAndTeamsMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [createLeagueAndTeamsMutation, { data, loading, error }] = useCreateLeagueAndTeamsMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
export function useCreateLeagueAndTeamsMutation(
  baseOptions?: Apollo.MutationHookOptions<
    CreateLeagueAndTeamsMutation,
    CreateLeagueAndTeamsMutationVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useMutation<
    CreateLeagueAndTeamsMutation,
    CreateLeagueAndTeamsMutationVariables
  >(CreateLeagueAndTeams, options);
}
export type CreateLeagueAndTeamsMutationHookResult = ReturnType<
  typeof useCreateLeagueAndTeamsMutation
>;
export type CreateLeagueAndTeamsMutationResult =
  Apollo.MutationResult<CreateLeagueAndTeamsMutation>;
export type CreateLeagueAndTeamsMutationOptions = BaseMutationOptions<
  CreateLeagueAndTeamsMutation,
  CreateLeagueAndTeamsMutationVariables
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
export const DeleteLeague = gql`
  mutation DeleteLeague($leagueId: Int!) {
    deleteLeague(leagueId: $leagueId)
  }
`;
export type DeleteLeagueMutationFn = MutationFunction<
  DeleteLeagueMutation,
  DeleteLeagueMutationVariables
>;

/**
 * __useDeleteLeagueMutation__
 *
 * To run a mutation, you first call `useDeleteLeagueMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useDeleteLeagueMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [deleteLeagueMutation, { data, loading, error }] = useDeleteLeagueMutation({
 *   variables: {
 *      leagueId: // value for 'leagueId'
 *   },
 * });
 */
export function useDeleteLeagueMutation(
  baseOptions?: Apollo.MutationHookOptions<
    DeleteLeagueMutation,
    DeleteLeagueMutationVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useMutation<
    DeleteLeagueMutation,
    DeleteLeagueMutationVariables
  >(DeleteLeague, options);
}
export type DeleteLeagueMutationHookResult = ReturnType<
  typeof useDeleteLeagueMutation
>;
export type DeleteLeagueMutationResult =
  Apollo.MutationResult<DeleteLeagueMutation>;
export type DeleteLeagueMutationOptions = BaseMutationOptions<
  DeleteLeagueMutation,
  DeleteLeagueMutationVariables
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
export const InitializeDraft = gql`
  mutation InitializeDraft(
    $leagueId: Int!
    $draftOrder: String
    $draftMode: String
    $selectionMethod: String
  ) {
    initializeDraft(
      leagueId: $leagueId
      draftOrder: $draftOrder
      draftMode: $draftMode
      selectionMethod: $selectionMethod
    ) {
      id
      leagueId
      draftMode
      selectionMethod
      draftOrder
      currentPick
      pickTimeLimitSeconds
      currentPickDeadline
      draftStartedAt
      draftCompletedAt
    }
  }
`;
export type InitializeDraftMutationFn = MutationFunction<
  InitializeDraftMutation,
  InitializeDraftMutationVariables
>;

/**
 * __useInitializeDraftMutation__
 *
 * To run a mutation, you first call `useInitializeDraftMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useInitializeDraftMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [initializeDraftMutation, { data, loading, error }] = useInitializeDraftMutation({
 *   variables: {
 *      leagueId: // value for 'leagueId'
 *      draftOrder: // value for 'draftOrder'
 *      draftMode: // value for 'draftMode'
 *      selectionMethod: // value for 'selectionMethod'
 *   },
 * });
 */
export function useInitializeDraftMutation(
  baseOptions?: Apollo.MutationHookOptions<
    InitializeDraftMutation,
    InitializeDraftMutationVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useMutation<
    InitializeDraftMutation,
    InitializeDraftMutationVariables
  >(InitializeDraft, options);
}
export type InitializeDraftMutationHookResult = ReturnType<
  typeof useInitializeDraftMutation
>;
export type InitializeDraftMutationResult =
  Apollo.MutationResult<InitializeDraftMutation>;
export type InitializeDraftMutationOptions = BaseMutationOptions<
  InitializeDraftMutation,
  InitializeDraftMutationVariables
>;
export const JoinLeagueByCode = gql`
  mutation JoinLeagueByCode($inviteCode: String!, $teamName: String!) {
    joinLeagueByCode(inviteCode: $inviteCode, teamName: $teamName) {
      id
      name
      leagueId
    }
  }
`;
export type JoinLeagueByCodeMutationFn = MutationFunction<
  JoinLeagueByCodeMutation,
  JoinLeagueByCodeMutationVariables
>;

/**
 * __useJoinLeagueByCodeMutation__
 *
 * To run a mutation, you first call `useJoinLeagueByCodeMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useJoinLeagueByCodeMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [joinLeagueByCodeMutation, { data, loading, error }] = useJoinLeagueByCodeMutation({
 *   variables: {
 *      inviteCode: // value for 'inviteCode'
 *      teamName: // value for 'teamName'
 *   },
 * });
 */
export function useJoinLeagueByCodeMutation(
  baseOptions?: Apollo.MutationHookOptions<
    JoinLeagueByCodeMutation,
    JoinLeagueByCodeMutationVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useMutation<
    JoinLeagueByCodeMutation,
    JoinLeagueByCodeMutationVariables
  >(JoinLeagueByCode, options);
}
export type JoinLeagueByCodeMutationHookResult = ReturnType<
  typeof useJoinLeagueByCodeMutation
>;
export type JoinLeagueByCodeMutationResult =
  Apollo.MutationResult<JoinLeagueByCodeMutation>;
export type JoinLeagueByCodeMutationOptions = BaseMutationOptions<
  JoinLeagueByCodeMutation,
  JoinLeagueByCodeMutationVariables
>;
export const ValidateInviteCode = gql`
  query ValidateInviteCode($code: String!) {
    validateInviteCode(code: $code) {
      leagueName
      totalSpots
      availableSpots
      isFull
    }
  }
`;

/**
 * __useValidateInviteCodeQuery__
 *
 * To run a query within a React component, call `useValidateInviteCodeQuery` and pass it any options that fit your needs.
 * When your component renders, `useValidateInviteCodeQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useValidateInviteCodeQuery({
 *   variables: {
 *      code: // value for 'code'
 *   },
 * });
 */
export function useValidateInviteCodeQuery(
  baseOptions: Apollo.QueryHookOptions<
    ValidateInviteCodeQuery,
    ValidateInviteCodeQueryVariables
  > &
    (
      | { variables: ValidateInviteCodeQueryVariables; skip?: boolean }
      | { skip: boolean }
    ),
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useQuery<
    ValidateInviteCodeQuery,
    ValidateInviteCodeQueryVariables
  >(ValidateInviteCode, options);
}
export function useValidateInviteCodeLazyQuery(
  baseOptions?: Apollo.LazyQueryHookOptions<
    ValidateInviteCodeQuery,
    ValidateInviteCodeQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useLazyQuery<
    ValidateInviteCodeQuery,
    ValidateInviteCodeQueryVariables
  >(ValidateInviteCode, options);
}
export function useValidateInviteCodeSuspenseQuery(
  baseOptions?:
    | Apollo.SkipToken
    | Apollo.SuspenseQueryHookOptions<
        ValidateInviteCodeQuery,
        ValidateInviteCodeQueryVariables
      >,
) {
  const options =
    baseOptions === Apollo.skipToken
      ? baseOptions
      : { ...defaultOptions, ...baseOptions };
  return Apollo.useSuspenseQuery<
    ValidateInviteCodeQuery,
    ValidateInviteCodeQueryVariables
  >(
    ValidateInviteCode,
    options as
      | Apollo.SkipToken
      | Apollo.SuspenseQueryHookOptions<
          ValidateInviteCodeQuery,
          ValidateInviteCodeQueryVariables
        >,
  );
}
export type ValidateInviteCodeQueryHookResult = ReturnType<
  typeof useValidateInviteCodeQuery
>;
export type ValidateInviteCodeLazyQueryHookResult = ReturnType<
  typeof useValidateInviteCodeLazyQuery
>;
export type ValidateInviteCodeSuspenseQueryHookResult = ReturnType<
  typeof useValidateInviteCodeSuspenseQuery
>;
export type ValidateInviteCodeQueryResult = Apollo.QueryResult<
  ValidateInviteCodeQuery,
  ValidateInviteCodeQueryVariables
>;
export const GetLeagueTeams = gql`
  query GetLeagueTeams($leagueId: Int!) {
    leagueTeams(leagueId: $leagueId) {
      id
      name
      leagueId
      waiverOrder
      faabBudget
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
export const GetLeagueDraft = gql`
  query GetLeagueDraft($leagueId: Int!) {
    getLeagueDraft(leagueId: $leagueId) {
      id
      leagueId
      draftMode
      selectionMethod
      draftOrder
      currentPick
      draftStartedAt
      draftCompletedAt
    }
  }
`;

/**
 * __useGetLeagueDraftQuery__
 *
 * To run a query within a React component, call `useGetLeagueDraftQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetLeagueDraftQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetLeagueDraftQuery({
 *   variables: {
 *      leagueId: // value for 'leagueId'
 *   },
 * });
 */
export function useGetLeagueDraftQuery(
  baseOptions: Apollo.QueryHookOptions<
    GetLeagueDraftQuery,
    GetLeagueDraftQueryVariables
  > &
    (
      | { variables: GetLeagueDraftQueryVariables; skip?: boolean }
      | { skip: boolean }
    ),
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useQuery<GetLeagueDraftQuery, GetLeagueDraftQueryVariables>(
    GetLeagueDraft,
    options,
  );
}
export function useGetLeagueDraftLazyQuery(
  baseOptions?: Apollo.LazyQueryHookOptions<
    GetLeagueDraftQuery,
    GetLeagueDraftQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useLazyQuery<GetLeagueDraftQuery, GetLeagueDraftQueryVariables>(
    GetLeagueDraft,
    options,
  );
}
export function useGetLeagueDraftSuspenseQuery(
  baseOptions?:
    | Apollo.SkipToken
    | Apollo.SuspenseQueryHookOptions<
        GetLeagueDraftQuery,
        GetLeagueDraftQueryVariables
      >,
) {
  const options =
    baseOptions === Apollo.skipToken
      ? baseOptions
      : { ...defaultOptions, ...baseOptions };
  return Apollo.useSuspenseQuery<
    GetLeagueDraftQuery,
    GetLeagueDraftQueryVariables
  >(
    GetLeagueDraft,
    options as
      | Apollo.SkipToken
      | Apollo.SuspenseQueryHookOptions<
          GetLeagueDraftQuery,
          GetLeagueDraftQueryVariables
        >,
  );
}
export type GetLeagueDraftQueryHookResult = ReturnType<
  typeof useGetLeagueDraftQuery
>;
export type GetLeagueDraftLazyQueryHookResult = ReturnType<
  typeof useGetLeagueDraftLazyQuery
>;
export type GetLeagueDraftSuspenseQueryHookResult = ReturnType<
  typeof useGetLeagueDraftSuspenseQuery
>;
export type GetLeagueDraftQueryResult = Apollo.QueryResult<
  GetLeagueDraftQuery,
  GetLeagueDraftQueryVariables
>;
export const UpdateDraftSettings = gql`
  mutation UpdateDraftSettings($input: UpdateDraftSettingsInput!) {
    updateDraftSettings(input: $input) {
      id
      leagueId
      draftMode
      selectionMethod
      draftOrder
      currentPick
      playerPool
      draftStartedAt
      draftCompletedAt
    }
  }
`;
export type UpdateDraftSettingsMutationFn = MutationFunction<
  UpdateDraftSettingsMutation,
  UpdateDraftSettingsMutationVariables
>;

/**
 * __useUpdateDraftSettingsMutation__
 *
 * To run a mutation, you first call `useUpdateDraftSettingsMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUpdateDraftSettingsMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [updateDraftSettingsMutation, { data, loading, error }] = useUpdateDraftSettingsMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
export function useUpdateDraftSettingsMutation(
  baseOptions?: Apollo.MutationHookOptions<
    UpdateDraftSettingsMutation,
    UpdateDraftSettingsMutationVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useMutation<
    UpdateDraftSettingsMutation,
    UpdateDraftSettingsMutationVariables
  >(UpdateDraftSettings, options);
}
export type UpdateDraftSettingsMutationHookResult = ReturnType<
  typeof useUpdateDraftSettingsMutation
>;
export type UpdateDraftSettingsMutationResult =
  Apollo.MutationResult<UpdateDraftSettingsMutation>;
export type UpdateDraftSettingsMutationOptions = BaseMutationOptions<
  UpdateDraftSettingsMutation,
  UpdateDraftSettingsMutationVariables
>;
export const RenameTeam = gql`
  mutation RenameTeam($teamId: Int!, $leagueId: Int!, $newName: String!) {
    renameTeam(teamId: $teamId, leagueId: $leagueId, newName: $newName) {
      id
      name
      leagueId
    }
  }
`;
export type RenameTeamMutationFn = MutationFunction<
  RenameTeamMutation,
  RenameTeamMutationVariables
>;

/**
 * __useRenameTeamMutation__
 *
 * To run a mutation, you first call `useRenameTeamMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useRenameTeamMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [renameTeamMutation, { data, loading, error }] = useRenameTeamMutation({
 *   variables: {
 *      teamId: // value for 'teamId'
 *      leagueId: // value for 'leagueId'
 *      newName: // value for 'newName'
 *   },
 * });
 */
export function useRenameTeamMutation(
  baseOptions?: Apollo.MutationHookOptions<
    RenameTeamMutation,
    RenameTeamMutationVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useMutation<RenameTeamMutation, RenameTeamMutationVariables>(
    RenameTeam,
    options,
  );
}
export type RenameTeamMutationHookResult = ReturnType<
  typeof useRenameTeamMutation
>;
export type RenameTeamMutationResult =
  Apollo.MutationResult<RenameTeamMutation>;
export type RenameTeamMutationOptions = BaseMutationOptions<
  RenameTeamMutation,
  RenameTeamMutationVariables
>;
export const UpdateLeagueSettings = gql`
  mutation UpdateLeagueSettings($input: UpdateLeagueSettingsInput!) {
    updateLeagueSettings(input: $input) {
      ...League
    }
  }
  ${LeagueFragmentDoc}
`;
export type UpdateLeagueSettingsMutationFn = MutationFunction<
  UpdateLeagueSettingsMutation,
  UpdateLeagueSettingsMutationVariables
>;

/**
 * __useUpdateLeagueSettingsMutation__
 *
 * To run a mutation, you first call `useUpdateLeagueSettingsMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUpdateLeagueSettingsMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [updateLeagueSettingsMutation, { data, loading, error }] = useUpdateLeagueSettingsMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
export function useUpdateLeagueSettingsMutation(
  baseOptions?: Apollo.MutationHookOptions<
    UpdateLeagueSettingsMutation,
    UpdateLeagueSettingsMutationVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useMutation<
    UpdateLeagueSettingsMutation,
    UpdateLeagueSettingsMutationVariables
  >(UpdateLeagueSettings, options);
}
export type UpdateLeagueSettingsMutationHookResult = ReturnType<
  typeof useUpdateLeagueSettingsMutation
>;
export type UpdateLeagueSettingsMutationResult =
  Apollo.MutationResult<UpdateLeagueSettingsMutation>;
export type UpdateLeagueSettingsMutationOptions = BaseMutationOptions<
  UpdateLeagueSettingsMutation,
  UpdateLeagueSettingsMutationVariables
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
export const AutoSelectGames = gql`
  mutation AutoSelectGames($leagueId: Int) {
    autoSelectGames(leagueId: $leagueId) {
      leaguesProcessed
      gamesTriggered
      errors
    }
  }
`;
export type AutoSelectGamesMutationFn = MutationFunction<
  AutoSelectGamesMutation,
  AutoSelectGamesMutationVariables
>;

/**
 * __useAutoSelectGamesMutation__
 *
 * To run a mutation, you first call `useAutoSelectGamesMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useAutoSelectGamesMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [autoSelectGamesMutation, { data, loading, error }] = useAutoSelectGamesMutation({
 *   variables: {
 *      leagueId: // value for 'leagueId'
 *   },
 * });
 */
export function useAutoSelectGamesMutation(
  baseOptions?: Apollo.MutationHookOptions<
    AutoSelectGamesMutation,
    AutoSelectGamesMutationVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useMutation<
    AutoSelectGamesMutation,
    AutoSelectGamesMutationVariables
  >(AutoSelectGames, options);
}
export type AutoSelectGamesMutationHookResult = ReturnType<
  typeof useAutoSelectGamesMutation
>;
export type AutoSelectGamesMutationResult =
  Apollo.MutationResult<AutoSelectGamesMutation>;
export type AutoSelectGamesMutationOptions = BaseMutationOptions<
  AutoSelectGamesMutation,
  AutoSelectGamesMutationVariables
>;
export const AutoAdvanceMatchups = gql`
  mutation AutoAdvanceMatchups($leagueId: Int) {
    autoAdvanceMatchups(leagueId: $leagueId) {
      leaguesProcessed
      leaguesAdvanced
      leaguesSkipped
      errors
    }
  }
`;
export type AutoAdvanceMatchupsMutationFn = MutationFunction<
  AutoAdvanceMatchupsMutation,
  AutoAdvanceMatchupsMutationVariables
>;

/**
 * __useAutoAdvanceMatchupsMutation__
 *
 * To run a mutation, you first call `useAutoAdvanceMatchupsMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useAutoAdvanceMatchupsMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [autoAdvanceMatchupsMutation, { data, loading, error }] = useAutoAdvanceMatchupsMutation({
 *   variables: {
 *      leagueId: // value for 'leagueId'
 *   },
 * });
 */
export function useAutoAdvanceMatchupsMutation(
  baseOptions?: Apollo.MutationHookOptions<
    AutoAdvanceMatchupsMutation,
    AutoAdvanceMatchupsMutationVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useMutation<
    AutoAdvanceMatchupsMutation,
    AutoAdvanceMatchupsMutationVariables
  >(AutoAdvanceMatchups, options);
}
export type AutoAdvanceMatchupsMutationHookResult = ReturnType<
  typeof useAutoAdvanceMatchupsMutation
>;
export type AutoAdvanceMatchupsMutationResult =
  Apollo.MutationResult<AutoAdvanceMatchupsMutation>;
export type AutoAdvanceMatchupsMutationOptions = BaseMutationOptions<
  AutoAdvanceMatchupsMutation,
  AutoAdvanceMatchupsMutationVariables
>;
export const GetMatchupRoster = gql`
  query GetMatchupRoster($matchupId: Int!, $teamId: Int!) {
    getMatchupRoster(matchupId: $matchupId, teamId: $teamId) {
      ...MatchupPlayer
    }
  }
  ${MatchupPlayerFragmentDoc}
`;

/**
 * __useGetMatchupRosterQuery__
 *
 * To run a query within a React component, call `useGetMatchupRosterQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetMatchupRosterQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetMatchupRosterQuery({
 *   variables: {
 *      matchupId: // value for 'matchupId'
 *      teamId: // value for 'teamId'
 *   },
 * });
 */
export function useGetMatchupRosterQuery(
  baseOptions: Apollo.QueryHookOptions<
    GetMatchupRosterQuery,
    GetMatchupRosterQueryVariables
  > &
    (
      | { variables: GetMatchupRosterQueryVariables; skip?: boolean }
      | { skip: boolean }
    ),
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useQuery<GetMatchupRosterQuery, GetMatchupRosterQueryVariables>(
    GetMatchupRoster,
    options,
  );
}
export function useGetMatchupRosterLazyQuery(
  baseOptions?: Apollo.LazyQueryHookOptions<
    GetMatchupRosterQuery,
    GetMatchupRosterQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useLazyQuery<
    GetMatchupRosterQuery,
    GetMatchupRosterQueryVariables
  >(GetMatchupRoster, options);
}
export function useGetMatchupRosterSuspenseQuery(
  baseOptions?:
    | Apollo.SkipToken
    | Apollo.SuspenseQueryHookOptions<
        GetMatchupRosterQuery,
        GetMatchupRosterQueryVariables
      >,
) {
  const options =
    baseOptions === Apollo.skipToken
      ? baseOptions
      : { ...defaultOptions, ...baseOptions };
  return Apollo.useSuspenseQuery<
    GetMatchupRosterQuery,
    GetMatchupRosterQueryVariables
  >(
    GetMatchupRoster,
    options as
      | Apollo.SkipToken
      | Apollo.SuspenseQueryHookOptions<
          GetMatchupRosterQuery,
          GetMatchupRosterQueryVariables
        >,
  );
}
export type GetMatchupRosterQueryHookResult = ReturnType<
  typeof useGetMatchupRosterQuery
>;
export type GetMatchupRosterLazyQueryHookResult = ReturnType<
  typeof useGetMatchupRosterLazyQuery
>;
export type GetMatchupRosterSuspenseQueryHookResult = ReturnType<
  typeof useGetMatchupRosterSuspenseQuery
>;
export type GetMatchupRosterQueryResult = Apollo.QueryResult<
  GetMatchupRosterQuery,
  GetMatchupRosterQueryVariables
>;
export const GetTeamMatchupHistory = gql`
  query GetTeamMatchupHistory($leagueId: Int!, $teamId: Int!, $limit: Int) {
    getTeamMatchupHistory(leagueId: $leagueId, teamId: $teamId, limit: $limit) {
      ...Matchup
    }
  }
  ${MatchupFragmentDoc}
`;

/**
 * __useGetTeamMatchupHistoryQuery__
 *
 * To run a query within a React component, call `useGetTeamMatchupHistoryQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetTeamMatchupHistoryQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetTeamMatchupHistoryQuery({
 *   variables: {
 *      leagueId: // value for 'leagueId'
 *      teamId: // value for 'teamId'
 *      limit: // value for 'limit'
 *   },
 * });
 */
export function useGetTeamMatchupHistoryQuery(
  baseOptions: Apollo.QueryHookOptions<
    GetTeamMatchupHistoryQuery,
    GetTeamMatchupHistoryQueryVariables
  > &
    (
      | { variables: GetTeamMatchupHistoryQueryVariables; skip?: boolean }
      | { skip: boolean }
    ),
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useQuery<
    GetTeamMatchupHistoryQuery,
    GetTeamMatchupHistoryQueryVariables
  >(GetTeamMatchupHistory, options);
}
export function useGetTeamMatchupHistoryLazyQuery(
  baseOptions?: Apollo.LazyQueryHookOptions<
    GetTeamMatchupHistoryQuery,
    GetTeamMatchupHistoryQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useLazyQuery<
    GetTeamMatchupHistoryQuery,
    GetTeamMatchupHistoryQueryVariables
  >(GetTeamMatchupHistory, options);
}
export function useGetTeamMatchupHistorySuspenseQuery(
  baseOptions?:
    | Apollo.SkipToken
    | Apollo.SuspenseQueryHookOptions<
        GetTeamMatchupHistoryQuery,
        GetTeamMatchupHistoryQueryVariables
      >,
) {
  const options =
    baseOptions === Apollo.skipToken
      ? baseOptions
      : { ...defaultOptions, ...baseOptions };
  return Apollo.useSuspenseQuery<
    GetTeamMatchupHistoryQuery,
    GetTeamMatchupHistoryQueryVariables
  >(
    GetTeamMatchupHistory,
    options as
      | Apollo.SkipToken
      | Apollo.SuspenseQueryHookOptions<
          GetTeamMatchupHistoryQuery,
          GetTeamMatchupHistoryQueryVariables
        >,
  );
}
export type GetTeamMatchupHistoryQueryHookResult = ReturnType<
  typeof useGetTeamMatchupHistoryQuery
>;
export type GetTeamMatchupHistoryLazyQueryHookResult = ReturnType<
  typeof useGetTeamMatchupHistoryLazyQuery
>;
export type GetTeamMatchupHistorySuspenseQueryHookResult = ReturnType<
  typeof useGetTeamMatchupHistorySuspenseQuery
>;
export type GetTeamMatchupHistoryQueryResult = Apollo.QueryResult<
  GetTeamMatchupHistoryQuery,
  GetTeamMatchupHistoryQueryVariables
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
export const GetAllPlayerSeasonStats = gql`
  query GetAllPlayerSeasonStats($playerId: Int!) {
    playerSeasonBatting(playerId: $playerId) {
      season
      team
      games
      plateAppearances
      atBats
      runs
      hits
      doubles
      triples
      homeRuns
      rbi
      stolenBases
      caughtStealing
      baseOnBalls
      strikeouts
      battingAverage
      onBasePercentage
      sluggingPercentage
    }
    playerSeasonPitching(playerId: $playerId) {
      season
      team
      games
      wins
      losses
      gamesStarted
      completeGames
      shutouts
      saves
      inningsPitched
      hits
      runs
      earnedRuns
      homeRuns
      baseOnBalls
      strikeouts
      earnedRunAverage
      whip
    }
    playerSeasonFielding(playerId: $playerId) {
      season
      team
      position
      games
      gamesStarted
      inningsDefended
      putouts
      assists
      errors
      doublePlays
      fieldingPercentage
    }
  }
`;

/**
 * __useGetAllPlayerSeasonStatsQuery__
 *
 * To run a query within a React component, call `useGetAllPlayerSeasonStatsQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetAllPlayerSeasonStatsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetAllPlayerSeasonStatsQuery({
 *   variables: {
 *      playerId: // value for 'playerId'
 *   },
 * });
 */
export function useGetAllPlayerSeasonStatsQuery(
  baseOptions: Apollo.QueryHookOptions<
    GetAllPlayerSeasonStatsQuery,
    GetAllPlayerSeasonStatsQueryVariables
  > &
    (
      | { variables: GetAllPlayerSeasonStatsQueryVariables; skip?: boolean }
      | { skip: boolean }
    ),
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useQuery<
    GetAllPlayerSeasonStatsQuery,
    GetAllPlayerSeasonStatsQueryVariables
  >(GetAllPlayerSeasonStats, options);
}
export function useGetAllPlayerSeasonStatsLazyQuery(
  baseOptions?: Apollo.LazyQueryHookOptions<
    GetAllPlayerSeasonStatsQuery,
    GetAllPlayerSeasonStatsQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useLazyQuery<
    GetAllPlayerSeasonStatsQuery,
    GetAllPlayerSeasonStatsQueryVariables
  >(GetAllPlayerSeasonStats, options);
}
export function useGetAllPlayerSeasonStatsSuspenseQuery(
  baseOptions?:
    | Apollo.SkipToken
    | Apollo.SuspenseQueryHookOptions<
        GetAllPlayerSeasonStatsQuery,
        GetAllPlayerSeasonStatsQueryVariables
      >,
) {
  const options =
    baseOptions === Apollo.skipToken
      ? baseOptions
      : { ...defaultOptions, ...baseOptions };
  return Apollo.useSuspenseQuery<
    GetAllPlayerSeasonStatsQuery,
    GetAllPlayerSeasonStatsQueryVariables
  >(
    GetAllPlayerSeasonStats,
    options as
      | Apollo.SkipToken
      | Apollo.SuspenseQueryHookOptions<
          GetAllPlayerSeasonStatsQuery,
          GetAllPlayerSeasonStatsQueryVariables
        >,
  );
}
export type GetAllPlayerSeasonStatsQueryHookResult = ReturnType<
  typeof useGetAllPlayerSeasonStatsQuery
>;
export type GetAllPlayerSeasonStatsLazyQueryHookResult = ReturnType<
  typeof useGetAllPlayerSeasonStatsLazyQuery
>;
export type GetAllPlayerSeasonStatsSuspenseQueryHookResult = ReturnType<
  typeof useGetAllPlayerSeasonStatsSuspenseQuery
>;
export type GetAllPlayerSeasonStatsQueryResult = Apollo.QueryResult<
  GetAllPlayerSeasonStatsQuery,
  GetAllPlayerSeasonStatsQueryVariables
>;
export const GetPlayersWithStats = gql`
  query GetPlayersWithStats(
    $limit: Int
    $offset: Int
    $orderBy: String = "lastName"
    $orderDirection: String = "asc"
    $position: String
    $leagueId: Int
    $search: String
  ) {
    players(
      limit: $limit
      offset: $offset
      orderBy: $orderBy
      orderDirection: $orderDirection
      position: $position
      leagueId: $leagueId
      search: $search
    ) {
      id
      firstName
      lastName
      brefId
      eligiblePositions
      scoring {
        battingScore
        pitchingScore
        fieldingScore
        hitterScore
        hitterAvgPointsPerGame
        pitchingAvgPointsPerGame
        totalScore
        careerGames
        avgPointsPerGame
      }
      averageSeasonBatting {
        seasons
        games
        atBats
        runs
        hits
        homeRuns
        rbi
        stolenBases
        battingAverage
        onBasePercentage
        sluggingPercentage
      }
      careerBatting {
        games
        runs
        homeRuns
        rbi
        stolenBases
        hits
        atBats
        plateAppearances
        baseOnBalls
        hitByPitch
        sacrificeHits
        totalBases
      }
      careerPitching {
        wins
        losses
        era
        games
        gamesStarted
        saves
        strikeouts
        baseOnBalls
        hits
        earnedRuns
        outsRecorded
        winPercentage
      }
      careerAchievements {
        allStarSelections
        mvpAwards
        cyYoungAwards
        goldGloves
        silverSluggers
        worldSeriesRings
        hallOfFame
        rookieOfTheYear
      }
    }
  }
`;

/**
 * __useGetPlayersWithStatsQuery__
 *
 * To run a query within a React component, call `useGetPlayersWithStatsQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetPlayersWithStatsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetPlayersWithStatsQuery({
 *   variables: {
 *      limit: // value for 'limit'
 *      offset: // value for 'offset'
 *      orderBy: // value for 'orderBy'
 *      orderDirection: // value for 'orderDirection'
 *      position: // value for 'position'
 *      leagueId: // value for 'leagueId'
 *      search: // value for 'search'
 *   },
 * });
 */
export function useGetPlayersWithStatsQuery(
  baseOptions?: Apollo.QueryHookOptions<
    GetPlayersWithStatsQuery,
    GetPlayersWithStatsQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useQuery<
    GetPlayersWithStatsQuery,
    GetPlayersWithStatsQueryVariables
  >(GetPlayersWithStats, options);
}
export function useGetPlayersWithStatsLazyQuery(
  baseOptions?: Apollo.LazyQueryHookOptions<
    GetPlayersWithStatsQuery,
    GetPlayersWithStatsQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useLazyQuery<
    GetPlayersWithStatsQuery,
    GetPlayersWithStatsQueryVariables
  >(GetPlayersWithStats, options);
}
export function useGetPlayersWithStatsSuspenseQuery(
  baseOptions?:
    | Apollo.SkipToken
    | Apollo.SuspenseQueryHookOptions<
        GetPlayersWithStatsQuery,
        GetPlayersWithStatsQueryVariables
      >,
) {
  const options =
    baseOptions === Apollo.skipToken
      ? baseOptions
      : { ...defaultOptions, ...baseOptions };
  return Apollo.useSuspenseQuery<
    GetPlayersWithStatsQuery,
    GetPlayersWithStatsQueryVariables
  >(
    GetPlayersWithStats,
    options as
      | Apollo.SkipToken
      | Apollo.SuspenseQueryHookOptions<
          GetPlayersWithStatsQuery,
          GetPlayersWithStatsQueryVariables
        >,
  );
}
export type GetPlayersWithStatsQueryHookResult = ReturnType<
  typeof useGetPlayersWithStatsQuery
>;
export type GetPlayersWithStatsLazyQueryHookResult = ReturnType<
  typeof useGetPlayersWithStatsLazyQuery
>;
export type GetPlayersWithStatsSuspenseQueryHookResult = ReturnType<
  typeof useGetPlayersWithStatsSuspenseQuery
>;
export type GetPlayersWithStatsQueryResult = Apollo.QueryResult<
  GetPlayersWithStatsQuery,
  GetPlayersWithStatsQueryVariables
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
export const SwapTeamMemberPositions = gql`
  mutation SwapTeamMemberPositions(
    $teamMemberIdA: Int!
    $positionIdA: Int
    $teamMemberIdB: Int!
    $positionIdB: Int
  ) {
    swapTeamMemberPositions(
      teamMemberIdA: $teamMemberIdA
      positionIdA: $positionIdA
      teamMemberIdB: $teamMemberIdB
      positionIdB: $positionIdB
    ) {
      ...TeamMember
    }
  }
  ${TeamMemberFragmentDoc}
`;
export type SwapTeamMemberPositionsMutationFn = MutationFunction<
  SwapTeamMemberPositionsMutation,
  SwapTeamMemberPositionsMutationVariables
>;

/**
 * __useSwapTeamMemberPositionsMutation__
 *
 * To run a mutation, you first call `useSwapTeamMemberPositionsMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useSwapTeamMemberPositionsMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [swapTeamMemberPositionsMutation, { data, loading, error }] = useSwapTeamMemberPositionsMutation({
 *   variables: {
 *      teamMemberIdA: // value for 'teamMemberIdA'
 *      positionIdA: // value for 'positionIdA'
 *      teamMemberIdB: // value for 'teamMemberIdB'
 *      positionIdB: // value for 'positionIdB'
 *   },
 * });
 */
export function useSwapTeamMemberPositionsMutation(
  baseOptions?: Apollo.MutationHookOptions<
    SwapTeamMemberPositionsMutation,
    SwapTeamMemberPositionsMutationVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useMutation<
    SwapTeamMemberPositionsMutation,
    SwapTeamMemberPositionsMutationVariables
  >(SwapTeamMemberPositions, options);
}
export type SwapTeamMemberPositionsMutationHookResult = ReturnType<
  typeof useSwapTeamMemberPositionsMutation
>;
export type SwapTeamMemberPositionsMutationResult =
  Apollo.MutationResult<SwapTeamMemberPositionsMutation>;
export type SwapTeamMemberPositionsMutationOptions = BaseMutationOptions<
  SwapTeamMemberPositionsMutation,
  SwapTeamMemberPositionsMutationVariables
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
export const ProcessWaiverClaims = gql`
  mutation ProcessWaiverClaims($leagueId: Int) {
    processWaiverClaims(leagueId: $leagueId) {
      processed
      succeeded
      failed
    }
  }
`;
export type ProcessWaiverClaimsMutationFn = MutationFunction<
  ProcessWaiverClaimsMutation,
  ProcessWaiverClaimsMutationVariables
>;

/**
 * __useProcessWaiverClaimsMutation__
 *
 * To run a mutation, you first call `useProcessWaiverClaimsMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useProcessWaiverClaimsMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [processWaiverClaimsMutation, { data, loading, error }] = useProcessWaiverClaimsMutation({
 *   variables: {
 *      leagueId: // value for 'leagueId'
 *   },
 * });
 */
export function useProcessWaiverClaimsMutation(
  baseOptions?: Apollo.MutationHookOptions<
    ProcessWaiverClaimsMutation,
    ProcessWaiverClaimsMutationVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useMutation<
    ProcessWaiverClaimsMutation,
    ProcessWaiverClaimsMutationVariables
  >(ProcessWaiverClaims, options);
}
export type ProcessWaiverClaimsMutationHookResult = ReturnType<
  typeof useProcessWaiverClaimsMutation
>;
export type ProcessWaiverClaimsMutationResult =
  Apollo.MutationResult<ProcessWaiverClaimsMutation>;
export type ProcessWaiverClaimsMutationOptions = BaseMutationOptions<
  ProcessWaiverClaimsMutation,
  ProcessWaiverClaimsMutationVariables
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
export const GetTeamTradeOffers = gql`
  query GetTeamTradeOffers($teamId: Int!, $status: String) {
    teamTradeOffers(teamId: $teamId, status: $status) {
      ...TradeOffer
    }
  }
  ${TradeOfferFragmentDoc}
`;

/**
 * __useGetTeamTradeOffersQuery__
 *
 * To run a query within a React component, call `useGetTeamTradeOffersQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetTeamTradeOffersQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetTeamTradeOffersQuery({
 *   variables: {
 *      teamId: // value for 'teamId'
 *      status: // value for 'status'
 *   },
 * });
 */
export function useGetTeamTradeOffersQuery(
  baseOptions: Apollo.QueryHookOptions<
    GetTeamTradeOffersQuery,
    GetTeamTradeOffersQueryVariables
  > &
    (
      | { variables: GetTeamTradeOffersQueryVariables; skip?: boolean }
      | { skip: boolean }
    ),
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useQuery<
    GetTeamTradeOffersQuery,
    GetTeamTradeOffersQueryVariables
  >(GetTeamTradeOffers, options);
}
export function useGetTeamTradeOffersLazyQuery(
  baseOptions?: Apollo.LazyQueryHookOptions<
    GetTeamTradeOffersQuery,
    GetTeamTradeOffersQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useLazyQuery<
    GetTeamTradeOffersQuery,
    GetTeamTradeOffersQueryVariables
  >(GetTeamTradeOffers, options);
}
export function useGetTeamTradeOffersSuspenseQuery(
  baseOptions?:
    | Apollo.SkipToken
    | Apollo.SuspenseQueryHookOptions<
        GetTeamTradeOffersQuery,
        GetTeamTradeOffersQueryVariables
      >,
) {
  const options =
    baseOptions === Apollo.skipToken
      ? baseOptions
      : { ...defaultOptions, ...baseOptions };
  return Apollo.useSuspenseQuery<
    GetTeamTradeOffersQuery,
    GetTeamTradeOffersQueryVariables
  >(
    GetTeamTradeOffers,
    options as
      | Apollo.SkipToken
      | Apollo.SuspenseQueryHookOptions<
          GetTeamTradeOffersQuery,
          GetTeamTradeOffersQueryVariables
        >,
  );
}
export type GetTeamTradeOffersQueryHookResult = ReturnType<
  typeof useGetTeamTradeOffersQuery
>;
export type GetTeamTradeOffersLazyQueryHookResult = ReturnType<
  typeof useGetTeamTradeOffersLazyQuery
>;
export type GetTeamTradeOffersSuspenseQueryHookResult = ReturnType<
  typeof useGetTeamTradeOffersSuspenseQuery
>;
export type GetTeamTradeOffersQueryResult = Apollo.QueryResult<
  GetTeamTradeOffersQuery,
  GetTeamTradeOffersQueryVariables
>;
export const GetLeagueTradeOffers = gql`
  query GetLeagueTradeOffers($leagueId: Int!, $status: String) {
    leagueTradeOffers(leagueId: $leagueId, status: $status) {
      ...TradeOffer
    }
  }
  ${TradeOfferFragmentDoc}
`;

/**
 * __useGetLeagueTradeOffersQuery__
 *
 * To run a query within a React component, call `useGetLeagueTradeOffersQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetLeagueTradeOffersQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetLeagueTradeOffersQuery({
 *   variables: {
 *      leagueId: // value for 'leagueId'
 *      status: // value for 'status'
 *   },
 * });
 */
export function useGetLeagueTradeOffersQuery(
  baseOptions: Apollo.QueryHookOptions<
    GetLeagueTradeOffersQuery,
    GetLeagueTradeOffersQueryVariables
  > &
    (
      | { variables: GetLeagueTradeOffersQueryVariables; skip?: boolean }
      | { skip: boolean }
    ),
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useQuery<
    GetLeagueTradeOffersQuery,
    GetLeagueTradeOffersQueryVariables
  >(GetLeagueTradeOffers, options);
}
export function useGetLeagueTradeOffersLazyQuery(
  baseOptions?: Apollo.LazyQueryHookOptions<
    GetLeagueTradeOffersQuery,
    GetLeagueTradeOffersQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useLazyQuery<
    GetLeagueTradeOffersQuery,
    GetLeagueTradeOffersQueryVariables
  >(GetLeagueTradeOffers, options);
}
export function useGetLeagueTradeOffersSuspenseQuery(
  baseOptions?:
    | Apollo.SkipToken
    | Apollo.SuspenseQueryHookOptions<
        GetLeagueTradeOffersQuery,
        GetLeagueTradeOffersQueryVariables
      >,
) {
  const options =
    baseOptions === Apollo.skipToken
      ? baseOptions
      : { ...defaultOptions, ...baseOptions };
  return Apollo.useSuspenseQuery<
    GetLeagueTradeOffersQuery,
    GetLeagueTradeOffersQueryVariables
  >(
    GetLeagueTradeOffers,
    options as
      | Apollo.SkipToken
      | Apollo.SuspenseQueryHookOptions<
          GetLeagueTradeOffersQuery,
          GetLeagueTradeOffersQueryVariables
        >,
  );
}
export type GetLeagueTradeOffersQueryHookResult = ReturnType<
  typeof useGetLeagueTradeOffersQuery
>;
export type GetLeagueTradeOffersLazyQueryHookResult = ReturnType<
  typeof useGetLeagueTradeOffersLazyQuery
>;
export type GetLeagueTradeOffersSuspenseQueryHookResult = ReturnType<
  typeof useGetLeagueTradeOffersSuspenseQuery
>;
export type GetLeagueTradeOffersQueryResult = Apollo.QueryResult<
  GetLeagueTradeOffersQuery,
  GetLeagueTradeOffersQueryVariables
>;
export const ProposeTrade = gql`
  mutation ProposeTrade(
    $leagueId: Int!
    $receivingTeamId: Int!
    $offeringPlayerIds: [Int!]!
    $requestingPlayerIds: [Int!]!
    $message: String
    $expiresInDays: Int
  ) {
    proposeTrade(
      leagueId: $leagueId
      receivingTeamId: $receivingTeamId
      offeringPlayerIds: $offeringPlayerIds
      requestingPlayerIds: $requestingPlayerIds
      message: $message
      expiresInDays: $expiresInDays
    ) {
      ...TradeOffer
    }
  }
  ${TradeOfferFragmentDoc}
`;
export type ProposeTradeMutationFn = MutationFunction<
  ProposeTradeMutation,
  ProposeTradeMutationVariables
>;

/**
 * __useProposeTradeMutation__
 *
 * To run a mutation, you first call `useProposeTradeMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useProposeTradeMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [proposeTradeMutation, { data, loading, error }] = useProposeTradeMutation({
 *   variables: {
 *      leagueId: // value for 'leagueId'
 *      receivingTeamId: // value for 'receivingTeamId'
 *      offeringPlayerIds: // value for 'offeringPlayerIds'
 *      requestingPlayerIds: // value for 'requestingPlayerIds'
 *      message: // value for 'message'
 *      expiresInDays: // value for 'expiresInDays'
 *   },
 * });
 */
export function useProposeTradeMutation(
  baseOptions?: Apollo.MutationHookOptions<
    ProposeTradeMutation,
    ProposeTradeMutationVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useMutation<
    ProposeTradeMutation,
    ProposeTradeMutationVariables
  >(ProposeTrade, options);
}
export type ProposeTradeMutationHookResult = ReturnType<
  typeof useProposeTradeMutation
>;
export type ProposeTradeMutationResult =
  Apollo.MutationResult<ProposeTradeMutation>;
export type ProposeTradeMutationOptions = BaseMutationOptions<
  ProposeTradeMutation,
  ProposeTradeMutationVariables
>;
export const AcceptTrade = gql`
  mutation AcceptTrade($tradeId: Int!) {
    acceptTrade(tradeId: $tradeId) {
      ...TradeOffer
    }
  }
  ${TradeOfferFragmentDoc}
`;
export type AcceptTradeMutationFn = MutationFunction<
  AcceptTradeMutation,
  AcceptTradeMutationVariables
>;

/**
 * __useAcceptTradeMutation__
 *
 * To run a mutation, you first call `useAcceptTradeMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useAcceptTradeMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [acceptTradeMutation, { data, loading, error }] = useAcceptTradeMutation({
 *   variables: {
 *      tradeId: // value for 'tradeId'
 *   },
 * });
 */
export function useAcceptTradeMutation(
  baseOptions?: Apollo.MutationHookOptions<
    AcceptTradeMutation,
    AcceptTradeMutationVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useMutation<AcceptTradeMutation, AcceptTradeMutationVariables>(
    AcceptTrade,
    options,
  );
}
export type AcceptTradeMutationHookResult = ReturnType<
  typeof useAcceptTradeMutation
>;
export type AcceptTradeMutationResult =
  Apollo.MutationResult<AcceptTradeMutation>;
export type AcceptTradeMutationOptions = BaseMutationOptions<
  AcceptTradeMutation,
  AcceptTradeMutationVariables
>;
export const RejectTrade = gql`
  mutation RejectTrade($tradeId: Int!) {
    rejectTrade(tradeId: $tradeId) {
      ...TradeOffer
    }
  }
  ${TradeOfferFragmentDoc}
`;
export type RejectTradeMutationFn = MutationFunction<
  RejectTradeMutation,
  RejectTradeMutationVariables
>;

/**
 * __useRejectTradeMutation__
 *
 * To run a mutation, you first call `useRejectTradeMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useRejectTradeMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [rejectTradeMutation, { data, loading, error }] = useRejectTradeMutation({
 *   variables: {
 *      tradeId: // value for 'tradeId'
 *   },
 * });
 */
export function useRejectTradeMutation(
  baseOptions?: Apollo.MutationHookOptions<
    RejectTradeMutation,
    RejectTradeMutationVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useMutation<RejectTradeMutation, RejectTradeMutationVariables>(
    RejectTrade,
    options,
  );
}
export type RejectTradeMutationHookResult = ReturnType<
  typeof useRejectTradeMutation
>;
export type RejectTradeMutationResult =
  Apollo.MutationResult<RejectTradeMutation>;
export type RejectTradeMutationOptions = BaseMutationOptions<
  RejectTradeMutation,
  RejectTradeMutationVariables
>;
export const CancelTrade = gql`
  mutation CancelTrade($tradeId: Int!) {
    cancelTrade(tradeId: $tradeId) {
      ...TradeOffer
    }
  }
  ${TradeOfferFragmentDoc}
`;
export type CancelTradeMutationFn = MutationFunction<
  CancelTradeMutation,
  CancelTradeMutationVariables
>;

/**
 * __useCancelTradeMutation__
 *
 * To run a mutation, you first call `useCancelTradeMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useCancelTradeMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [cancelTradeMutation, { data, loading, error }] = useCancelTradeMutation({
 *   variables: {
 *      tradeId: // value for 'tradeId'
 *   },
 * });
 */
export function useCancelTradeMutation(
  baseOptions?: Apollo.MutationHookOptions<
    CancelTradeMutation,
    CancelTradeMutationVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useMutation<CancelTradeMutation, CancelTradeMutationVariables>(
    CancelTrade,
    options,
  );
}
export type CancelTradeMutationHookResult = ReturnType<
  typeof useCancelTradeMutation
>;
export type CancelTradeMutationResult =
  Apollo.MutationResult<CancelTradeMutation>;
export type CancelTradeMutationOptions = BaseMutationOptions<
  CancelTradeMutation,
  CancelTradeMutationVariables
>;
export const VetoTrade = gql`
  mutation VetoTrade($tradeId: Int!) {
    vetoTrade(tradeId: $tradeId) {
      ...TradeOffer
    }
  }
  ${TradeOfferFragmentDoc}
`;
export type VetoTradeMutationFn = MutationFunction<
  VetoTradeMutation,
  VetoTradeMutationVariables
>;

/**
 * __useVetoTradeMutation__
 *
 * To run a mutation, you first call `useVetoTradeMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useVetoTradeMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [vetoTradeMutation, { data, loading, error }] = useVetoTradeMutation({
 *   variables: {
 *      tradeId: // value for 'tradeId'
 *   },
 * });
 */
export function useVetoTradeMutation(
  baseOptions?: Apollo.MutationHookOptions<
    VetoTradeMutation,
    VetoTradeMutationVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useMutation<VetoTradeMutation, VetoTradeMutationVariables>(
    VetoTrade,
    options,
  );
}
export type VetoTradeMutationHookResult = ReturnType<
  typeof useVetoTradeMutation
>;
export type VetoTradeMutationResult = Apollo.MutationResult<VetoTradeMutation>;
export type VetoTradeMutationOptions = BaseMutationOptions<
  VetoTradeMutation,
  VetoTradeMutationVariables
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
export const GetAllUsers = gql`
  query GetAllUsers($limit: Int, $offset: Int) {
    users(
      limit: $limit
      offset: $offset
      orderBy: "email"
      orderDirection: "asc"
    ) {
      ...User
    }
  }
  ${UserFragmentDoc}
`;

/**
 * __useGetAllUsersQuery__
 *
 * To run a query within a React component, call `useGetAllUsersQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetAllUsersQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetAllUsersQuery({
 *   variables: {
 *      limit: // value for 'limit'
 *      offset: // value for 'offset'
 *   },
 * });
 */
export function useGetAllUsersQuery(
  baseOptions?: Apollo.QueryHookOptions<
    GetAllUsersQuery,
    GetAllUsersQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useQuery<GetAllUsersQuery, GetAllUsersQueryVariables>(
    GetAllUsers,
    options,
  );
}
export function useGetAllUsersLazyQuery(
  baseOptions?: Apollo.LazyQueryHookOptions<
    GetAllUsersQuery,
    GetAllUsersQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useLazyQuery<GetAllUsersQuery, GetAllUsersQueryVariables>(
    GetAllUsers,
    options,
  );
}
export function useGetAllUsersSuspenseQuery(
  baseOptions?:
    | Apollo.SkipToken
    | Apollo.SuspenseQueryHookOptions<
        GetAllUsersQuery,
        GetAllUsersQueryVariables
      >,
) {
  const options =
    baseOptions === Apollo.skipToken
      ? baseOptions
      : { ...defaultOptions, ...baseOptions };
  return Apollo.useSuspenseQuery<GetAllUsersQuery, GetAllUsersQueryVariables>(
    GetAllUsers,
    options as
      | Apollo.SkipToken
      | Apollo.SuspenseQueryHookOptions<
          GetAllUsersQuery,
          GetAllUsersQueryVariables
        >,
  );
}
export type GetAllUsersQueryHookResult = ReturnType<typeof useGetAllUsersQuery>;
export type GetAllUsersLazyQueryHookResult = ReturnType<
  typeof useGetAllUsersLazyQuery
>;
export type GetAllUsersSuspenseQueryHookResult = ReturnType<
  typeof useGetAllUsersSuspenseQuery
>;
export type GetAllUsersQueryResult = Apollo.QueryResult<
  GetAllUsersQuery,
  GetAllUsersQueryVariables
>;
export const UpdateUserRole = gql`
  mutation UpdateUserRole($userId: Int!, $accessLevel: String!) {
    updateUserRole(userId: $userId, accessLevel: $accessLevel) {
      ...User
    }
  }
  ${UserFragmentDoc}
`;
export type UpdateUserRoleMutationFn = MutationFunction<
  UpdateUserRoleMutation,
  UpdateUserRoleMutationVariables
>;

/**
 * __useUpdateUserRoleMutation__
 *
 * To run a mutation, you first call `useUpdateUserRoleMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUpdateUserRoleMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [updateUserRoleMutation, { data, loading, error }] = useUpdateUserRoleMutation({
 *   variables: {
 *      userId: // value for 'userId'
 *      accessLevel: // value for 'accessLevel'
 *   },
 * });
 */
export function useUpdateUserRoleMutation(
  baseOptions?: Apollo.MutationHookOptions<
    UpdateUserRoleMutation,
    UpdateUserRoleMutationVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useMutation<
    UpdateUserRoleMutation,
    UpdateUserRoleMutationVariables
  >(UpdateUserRole, options);
}
export type UpdateUserRoleMutationHookResult = ReturnType<
  typeof useUpdateUserRoleMutation
>;
export type UpdateUserRoleMutationResult =
  Apollo.MutationResult<UpdateUserRoleMutation>;
export type UpdateUserRoleMutationOptions = BaseMutationOptions<
  UpdateUserRoleMutation,
  UpdateUserRoleMutationVariables
>;
