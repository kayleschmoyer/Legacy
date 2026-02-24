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

export type AdvanceLeagueWeekResponse = {
  __typename?: 'AdvanceLeagueWeekResponse';
  currentMatchupId?: Maybe<Scalars['Int']['output']>;
  matchups?: Maybe<Array<Matchup>>;
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
  numberOfTeams: Scalars['Int']['input'];
  playerPool: Scalars['String']['input'];
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
  date?: Maybe<Scalars['String']['output']>;
  draftCompletedAt?: Maybe<Scalars['String']['output']>;
  draftMode?: Maybe<Scalars['String']['output']>;
  draftOrder?: Maybe<Scalars['String']['output']>;
  draftStartedAt?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  leagueId?: Maybe<Scalars['Int']['output']>;
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
  name?: Maybe<Scalars['String']['output']>;
  owner?: Maybe<Scalars['Int']['output']>;
  playerPool?: Maybe<Scalars['String']['output']>;
  scoringProfile?: Maybe<ScoringConfig>;
  spStartsPerMatchup?: Maybe<Scalars['Int']['output']>;
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
  addDefaultPositionsToLeague?: Maybe<Array<LeaguePosition>>;
  advanceLeagueWeek?: Maybe<AdvanceLeagueWeekResponse>;
  cancelWaiverClaim?: Maybe<WaiverClaim>;
  claimFreeAgent?: Maybe<WaiverClaim>;
  commissionerPick?: Maybe<DraftPick>;
  createLeague?: Maybe<League>;
  createLeagueAndTeams?: Maybe<CreateLeagueAndTeamsPayload>;
  createMatchup?: Maybe<Matchup>;
  createTiebreakerRules?: Maybe<TiebreakerRule>;
  deleteAllLeagues?: Maybe<Scalars['String']['output']>;
  deleteLeague?: Maybe<Scalars['String']['output']>;
  disableDeviceToken?: Maybe<Scalars['Boolean']['output']>;
  initializeLiveDraft?: Maybe<Draft>;
  joinLeague?: Maybe<JoinLeaguePayload>;
  joinLeagueByCode?: Maybe<Team>;
  makeDraftPick?: Maybe<DraftPick>;
  markAllNotificationsAsRead?: Maybe<Scalars['Boolean']['output']>;
  markNotificationAsRead?: Maybe<Scalars['Boolean']['output']>;
  pauseDraft?: Maybe<Draft>;
  processWaiverClaims?: Maybe<ProcessWaiverClaimsResult>;
  /** Record user consent for a specific data processing type */
  recordConsent?: Maybe<UserConsent>;
  registerDeviceToken?: Maybe<DeviceToken>;
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
  swapTeamMemberPositions?: Maybe<Array<TeamMember>>;
  triggerGameSelection?: Maybe<Scalars['Boolean']['output']>;
  updateDraftSettings?: Maybe<UpdateDraftSettingsPayload>;
  updateLeagueScoringProfile?: Maybe<ScoringConfig>;
  updateLeagueSettings?: Maybe<League>;
  updateMatchupScore?: Maybe<Matchup>;
  updateMatchupStatus?: Maybe<Matchup>;
  updateNotificationPreferences?: Maybe<NotificationPreference>;
  updateTeamMemberPosition?: Maybe<TeamMember>;
};

export type MutationAddDefaultPositionsToLeagueArgs = {
  leagueId: Scalars['Int']['input'];
};

export type MutationAdvanceLeagueWeekArgs = {
  leagueId: Scalars['Int']['input'];
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

export type MutationDeleteLeagueArgs = {
  leagueId: Scalars['Int']['input'];
};

export type MutationDisableDeviceTokenArgs = {
  deviceToken: Scalars['String']['input'];
};

export type MutationInitializeLiveDraftArgs = {
  draftOrder?: InputMaybe<Scalars['String']['input']>;
  leagueId: Scalars['Int']['input'];
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

export type MutationRecordConsentArgs = {
  input: RecordConsentInput;
};

export type MutationRegisterDeviceTokenArgs = {
  input: DeviceTokenInput;
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

export type MutationSwapTeamMemberPositionsArgs = {
  positionIdA?: InputMaybe<Scalars['Int']['input']>;
  positionIdB?: InputMaybe<Scalars['Int']['input']>;
  teamMemberIdA: Scalars['Int']['input'];
  teamMemberIdB: Scalars['Int']['input'];
};

export type MutationTriggerGameSelectionArgs = {
  gameNumber: Scalars['Int']['input'];
  matchupId: Scalars['Int']['input'];
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
  /** Career batting statistics for the player */
  careerBatting?: Maybe<CareerBatting>;
  /** List of positions this player is eligible to play (e.g. SP, RP, 1B, SS) */
  eligiblePositions?: Maybe<Array<Scalars['String']['output']>>;
  firstName?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  lastName?: Maybe<Scalars['String']['output']>;
  /** Fantasy scoring data (only populated when using scoring-based sort) */
  scoring?: Maybe<PlayerScoring>;
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
  getMatchupStatusCounts?: Maybe<MatchupStatusCounts>;
  getMatchupsByWeek?: Maybe<Array<Matchup>>;
  getMatchupsForLeague?: Maybe<Array<Matchup>>;
  getNotificationHistory?: Maybe<Array<NotificationHistoryItem>>;
  getPlayerGameScores?: Maybe<Array<PlayerGameScore>>;
  getPlayoffRace?: Maybe<Array<PlayoffQualification>>;
  getPowerRankings?: Maybe<Array<TeamStanding>>;
  getSeasonResults?: Maybe<SeasonResults>;
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

export type UpdateDraftSettingsInput = {
  draftMode?: InputMaybe<Scalars['String']['input']>;
  draftOrder?: InputMaybe<Scalars['String']['input']>;
  leagueId: Scalars['Int']['input'];
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
  spStartsPerMatchup?: InputMaybe<Scalars['Int']['input']>;
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

export type PlayerFragment = {
  __typename?: 'Player';
  brefId?: string | null;
  id?: number | null;
  firstName?: string | null;
  lastName?: string | null;
};

export type GetPlayerByBrefIdQueryVariables = Exact<{
  brefId: Scalars['String']['input'];
}>;

export type GetPlayerByBrefIdQuery = {
  __typename?: 'Query';
  playerByBrefId?: {
    __typename?: 'Player';
    brefId?: string | null;
    id?: number | null;
    firstName?: string | null;
    lastName?: string | null;
  } | null;
};

export type GetAllPlayersQueryVariables = Exact<{ [key: string]: never }>;

export type GetAllPlayersQuery = {
  __typename?: 'Query';
  players?: Array<{
    __typename?: 'Player';
    brefId?: string | null;
    id?: number | null;
    firstName?: string | null;
    lastName?: string | null;
  }> | null;
};

export const PlayerFragmentDoc = gql`
  fragment Player on Player {
    brefId
    id
    firstName
    lastName
  }
`;
export const GetPlayerByBrefId = gql`
  query GetPlayerByBrefId($brefId: String!) {
    playerByBrefId(brefId: $brefId) {
      ...Player
    }
  }
  ${PlayerFragmentDoc}
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
export const GetAllPlayers = gql`
  query GetAllPlayers {
    players {
      ...Player
    }
  }
  ${PlayerFragmentDoc}
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
