/* eslint-disable */
import { gql } from '@apollo/client';
import * as Apollo from '@apollo/client';
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
const defaultOptions = {} as const;
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
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

export type CreateLeagueAndTeamsInput = {
  draftType: Scalars['String']['input'];
  isPublic?: InputMaybe<Scalars['Boolean']['input']>;
  leagueName: Scalars['String']['input'];
  maxBatters?: InputMaybe<Scalars['Int']['input']>;
  maxPitchers?: InputMaybe<Scalars['Int']['input']>;
  maxRosterSize?: InputMaybe<Scalars['Int']['input']>;
  numberOfTeams: Scalars['Int']['input'];
  startDate?: InputMaybe<Scalars['String']['input']>;
  tradingEnabled?: InputMaybe<Scalars['Boolean']['input']>;
  waiverEnabled?: InputMaybe<Scalars['Boolean']['input']>;
};

export type CreateLeagueAndTeamsPayload = {
  __typename?: 'CreateLeagueAndTeamsPayload';
  league?: Maybe<League>;
  leagueMembers?: Maybe<Array<LeagueMember>>;
  teams?: Maybe<Array<Team>>;
};

/** A fantasy sports league */
export type League = {
  __typename?: 'League';
  currentMatchup?: Maybe<Scalars['Int']['output']>;
  draftStatus?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  inviteCode?: Maybe<Scalars['String']['output']>;
  maxRosterSize?: Maybe<Scalars['Int']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  owner?: Maybe<Scalars['Int']['output']>;
  userMembership?: Maybe<LeagueMember>;
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

/** A matchup between teams in a league */
export type Matchup = {
  __typename?: 'Matchup';
  id?: Maybe<Scalars['ID']['output']>;
  leagueId?: Maybe<Scalars['Int']['output']>;
  numberOfGames?: Maybe<Scalars['Int']['output']>;
  weekNumber?: Maybe<Scalars['Int']['output']>;
};

export type Mutation = {
  __typename?: 'Mutation';
  _placeholder?: Maybe<Scalars['Boolean']['output']>;
  addDefaultPositionsToLeague?: Maybe<Array<LeaguePosition>>;
  createLeagueAndTeams?: Maybe<CreateLeagueAndTeamsPayload>;
  deleteAllLeagues?: Maybe<Scalars['String']['output']>;
  joinLeagueByCode?: Maybe<Team>;
  startDraft?: Maybe<League>;
  updateTeamMemberPosition?: Maybe<TeamMember>;
};


export type MutationAddDefaultPositionsToLeagueArgs = {
  leagueId: Scalars['Int']['input'];
};


export type MutationCreateLeagueAndTeamsArgs = {
  input: CreateLeagueAndTeamsInput;
};


export type MutationJoinLeagueByCodeArgs = {
  inviteCode: Scalars['String']['input'];
  teamName: Scalars['String']['input'];
};


export type MutationStartDraftArgs = {
  draftType?: InputMaybe<Scalars['String']['input']>;
  leagueId: Scalars['Int']['input'];
};


export type MutationUpdateTeamMemberPositionArgs = {
  positionId?: InputMaybe<Scalars['Int']['input']>;
  teamMemberId: Scalars['Int']['input'];
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
  brefId?: Maybe<Scalars['String']['output']>;
  firstName?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  lastName?: Maybe<Scalars['String']['output']>;
  statsLastFetchedAt?: Maybe<Scalars['String']['output']>;
};

export type Query = {
  __typename?: 'Query';
  careerBattingStats?: Maybe<CareerBattingConnection>;
  careerFieldingStats?: Maybe<Array<CareerFielding>>;
  careerPitchingStats?: Maybe<Array<CareerPitching>>;
  hello?: Maybe<Scalars['String']['output']>;
  league?: Maybe<League>;
  leaguePositions?: Maybe<Array<LeaguePosition>>;
  player?: Maybe<Player>;
  playerByBrefId?: Maybe<Player>;
  playerCareerBatting?: Maybe<CareerBatting>;
  playerCareerFielding?: Maybe<CareerFielding>;
  playerCareerPitching?: Maybe<CareerPitching>;
  playerSeasonBatting?: Maybe<Array<SeasonBatting>>;
  playerSeasonFielding?: Maybe<Array<SeasonFielding>>;
  playerSeasonPitching?: Maybe<Array<SeasonPitching>>;
  players?: Maybe<Array<Player>>;
  searchPlayers?: Maybe<Array<Player>>;
  searchUsers?: Maybe<Array<User>>;
  seasonBattingStats?: Maybe<Array<SeasonBatting>>;
  seasonFieldingStats?: Maybe<Array<SeasonFielding>>;
  seasonPitchingStats?: Maybe<Array<SeasonPitching>>;
  teamMembers?: Maybe<Array<TeamMember>>;
  user?: Maybe<User>;
  userByEmail?: Maybe<User>;
  userLeagues: Array<League>;
  userTeamId?: Maybe<Scalars['Int']['output']>;
  users?: Maybe<Array<User>>;
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


export type QueryLeagueArgs = {
  id: Scalars['Int']['input'];
};


export type QueryLeaguePositionsArgs = {
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
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Scalars['String']['input']>;
  orderDirection?: InputMaybe<Scalars['String']['input']>;
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

/** A team in a league */
export type Team = {
  __typename?: 'Team';
  id?: Maybe<Scalars['Int']['output']>;
  leagueId?: Maybe<Scalars['Int']['output']>;
  name?: Maybe<Scalars['String']['output']>;
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

export type User = {
  __typename?: 'User';
  accessLevel?: Maybe<Scalars['String']['output']>;
  email?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  username?: Maybe<Scalars['String']['output']>;
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

export type LeagueFragment = { __typename?: 'League', id?: number | null, name?: string | null, owner?: number | null, currentMatchup?: number | null, draftStatus?: string | null, userMembership?: { __typename?: 'LeagueMember', leagueId?: number | null, permissionLevel?: string | null, teamId?: number | null, userId?: number | null } | null };

export type LeagueMemberFragment = { __typename?: 'LeagueMember', leagueId?: number | null, permissionLevel?: string | null, teamId?: number | null, userId?: number | null };

export type LeaguePositionFragment = { __typename?: 'LeaguePosition', id?: number | null, leagueId?: number | null, positionType?: string | null };

export type GetLeagueByIdQueryVariables = Exact<{
  id: Scalars['Int']['input'];
  withMembers?: InputMaybe<Scalars['Boolean']['input']>;
  withTeams?: InputMaybe<Scalars['Boolean']['input']>;
  withMatchup?: InputMaybe<Scalars['Boolean']['input']>;
}>;


export type GetLeagueByIdQuery = { __typename?: 'Query', league?: { __typename?: 'League', id?: number | null, name?: string | null, owner?: number | null, currentMatchup?: number | null, draftStatus?: string | null, userMembership?: { __typename?: 'LeagueMember', leagueId?: number | null, permissionLevel?: string | null, teamId?: number | null, userId?: number | null } | null } | null };

export type CreateLeagueMutationVariables = Exact<{
  input: CreateLeagueAndTeamsInput;
  withMembers?: InputMaybe<Scalars['Boolean']['input']>;
  withTeams?: InputMaybe<Scalars['Boolean']['input']>;
  withMatchup?: InputMaybe<Scalars['Boolean']['input']>;
}>;


export type CreateLeagueMutation = { __typename?: 'Mutation', createLeagueAndTeams?: { __typename?: 'CreateLeagueAndTeamsPayload', league?: { __typename?: 'League', id?: number | null, name?: string | null, owner?: number | null, currentMatchup?: number | null, draftStatus?: string | null, userMembership?: { __typename?: 'LeagueMember', leagueId?: number | null, permissionLevel?: string | null, teamId?: number | null, userId?: number | null } | null } | null } | null };

export type GetPositionsForLeagueQueryVariables = Exact<{
  leagueId: Scalars['Int']['input'];
}>;


export type GetPositionsForLeagueQuery = { __typename?: 'Query', leaguePositions?: Array<{ __typename?: 'LeaguePosition', id?: number | null, leagueId?: number | null, positionType?: string | null }> | null };

export type GetUserLeaguesQueryVariables = Exact<{ [key: string]: never; }>;


export type GetUserLeaguesQuery = { __typename?: 'Query', userLeagues: Array<{ __typename?: 'League', id?: number | null, name?: string | null, owner?: number | null, currentMatchup?: number | null, draftStatus?: string | null, userMembership?: { __typename?: 'LeagueMember', leagueId?: number | null, permissionLevel?: string | null, teamId?: number | null, userId?: number | null } | null }> };

export type DeleteAllLeaguesMutationVariables = Exact<{ [key: string]: never; }>;


export type DeleteAllLeaguesMutation = { __typename?: 'Mutation', deleteAllLeagues?: string | null };

export type StartDraftMutationVariables = Exact<{
  leagueId: Scalars['Int']['input'];
  draftType?: InputMaybe<Scalars['String']['input']>;
}>;


export type StartDraftMutation = { __typename?: 'Mutation', startDraft?: { __typename?: 'League', id?: number | null, name?: string | null, owner?: number | null, currentMatchup?: number | null, draftStatus?: string | null, userMembership?: { __typename?: 'LeagueMember', leagueId?: number | null, permissionLevel?: string | null, teamId?: number | null, userId?: number | null } | null } | null };

export type GetUserTeamIdQueryVariables = Exact<{
  leagueId: Scalars['Int']['input'];
}>;


export type GetUserTeamIdQuery = { __typename?: 'Query', userTeamId?: number | null };

export type MatchupFragment = { __typename?: 'Matchup', id?: string | null, weekNumber?: number | null, leagueId?: number | null, numberOfGames?: number | null };

export type PlayerFragment = { __typename?: 'Player', id?: number | null, firstName?: string | null, lastName?: string | null, brefId?: string | null };

export type CareerBattingStatsFragment = { __typename?: 'CareerBatting', atBats?: number | null, baseOnBalls?: number | null, caughtStealing?: number | null, doubles?: number | null, games?: number | null, groundedIntoDoublePlays?: number | null, hits?: number | null, hitByPitch?: number | null, homeRuns?: number | null, intentionalBaseOnBalls?: number | null, plateAppearances?: number | null, runs?: number | null, rbi?: number | null, stolenBases?: number | null, sacrificeHits?: number | null, strikeouts?: number | null, totalBases?: number | null, triples?: number | null, battingAverage?: number | null, onBasePercentage?: number | null, sluggingPercentage?: number | null, playerId?: number | null };

export type CareerFieldingStatsFragment = { __typename?: 'CareerFielding', assists?: number | null, completeGames?: number | null, chances?: number | null, caughtStealing?: number | null, doublePlays?: number | null, errors?: number | null, fieldingPercentage?: number | null, games?: number | null, gamesStarted?: number | null, inningsDefended?: number | null, pickoffs?: number | null, putouts?: number | null, positions?: string | null, stolenBases?: number | null, wildPitches?: number | null, playerId?: number | null };

export type CareerPitchingStatsFragment = { __typename?: 'CareerPitching', battersFaced?: number | null, baseOnBalls?: number | null, balks?: number | null, completeGames?: number | null, earnedRuns?: number | null, era?: string | null, games?: number | null, gamesFinished?: number | null, gamesStarted?: number | null, hits?: number | null, hitByPitch?: number | null, homeRuns?: number | null, intentionalBaseOnBalls?: number | null, losses?: number | null, outRate?: number | null, outsRecorded?: number | null, runs?: number | null, shutouts?: number | null, strikeouts?: number | null, saves?: number | null, wins?: number | null, wildPitches?: number | null, winPercentage?: number | null, playerId?: number | null };

export type GetCareerBattingStatsQueryVariables = Exact<{ [key: string]: never; }>;


export type GetCareerBattingStatsQuery = { __typename?: 'Query', careerBattingStats?: { __typename?: 'CareerBattingConnection', edges?: Array<{ __typename?: 'CareerBattingEdge', node?: { __typename?: 'CareerBatting', atBats?: number | null, baseOnBalls?: number | null, caughtStealing?: number | null, doubles?: number | null, games?: number | null, groundedIntoDoublePlays?: number | null, hits?: number | null, hitByPitch?: number | null, homeRuns?: number | null, intentionalBaseOnBalls?: number | null, plateAppearances?: number | null, runs?: number | null, rbi?: number | null, stolenBases?: number | null, sacrificeHits?: number | null, strikeouts?: number | null, totalBases?: number | null, triples?: number | null, battingAverage?: number | null, onBasePercentage?: number | null, sluggingPercentage?: number | null, playerId?: number | null } | null } | null> | null } | null };

export type GetCareerFieldingStatsQueryVariables = Exact<{ [key: string]: never; }>;


export type GetCareerFieldingStatsQuery = { __typename?: 'Query', careerFieldingStats?: Array<{ __typename?: 'CareerFielding', assists?: number | null, completeGames?: number | null, chances?: number | null, caughtStealing?: number | null, doublePlays?: number | null, errors?: number | null, fieldingPercentage?: number | null, games?: number | null, gamesStarted?: number | null, inningsDefended?: number | null, pickoffs?: number | null, putouts?: number | null, positions?: string | null, stolenBases?: number | null, wildPitches?: number | null, playerId?: number | null }> | null };

export type GetCareerPitchingStatsQueryVariables = Exact<{ [key: string]: never; }>;


export type GetCareerPitchingStatsQuery = { __typename?: 'Query', careerPitchingStats?: Array<{ __typename?: 'CareerPitching', battersFaced?: number | null, baseOnBalls?: number | null, balks?: number | null, completeGames?: number | null, earnedRuns?: number | null, era?: string | null, games?: number | null, gamesFinished?: number | null, gamesStarted?: number | null, hits?: number | null, hitByPitch?: number | null, homeRuns?: number | null, intentionalBaseOnBalls?: number | null, losses?: number | null, outRate?: number | null, outsRecorded?: number | null, runs?: number | null, shutouts?: number | null, strikeouts?: number | null, saves?: number | null, wins?: number | null, wildPitches?: number | null, winPercentage?: number | null, playerId?: number | null }> | null };

export type TeamFragment = { __typename?: 'Team', id?: number | null, leagueId?: number | null, name?: string | null };

export type TeamMemberFragment = { __typename?: 'TeamMember', id?: number | null, playerId?: number | null, positionId?: number | null, teamId?: number | null, leagueId?: number | null, player?: { __typename?: 'Player', id?: number | null, firstName?: string | null, lastName?: string | null, brefId?: string | null } | null };

export type GetTeamMembersQueryVariables = Exact<{
  teamId: Scalars['Int']['input'];
}>;


export type GetTeamMembersQuery = { __typename?: 'Query', teamMembers?: Array<{ __typename?: 'TeamMember', id?: number | null, playerId?: number | null, positionId?: number | null, teamId?: number | null, leagueId?: number | null, player?: { __typename?: 'Player', id?: number | null, firstName?: string | null, lastName?: string | null, brefId?: string | null } | null }> | null };

export type UpdateTeamMemberPositionMutationVariables = Exact<{
  teamMemberId: Scalars['Int']['input'];
  positionId?: InputMaybe<Scalars['Int']['input']>;
}>;


export type UpdateTeamMemberPositionMutation = { __typename?: 'Mutation', updateTeamMemberPosition?: { __typename?: 'TeamMember', id?: number | null, playerId?: number | null, positionId?: number | null, teamId?: number | null, leagueId?: number | null, player?: { __typename?: 'Player', id?: number | null, firstName?: string | null, lastName?: string | null, brefId?: string | null } | null } | null };

export type UserFragment = { __typename?: 'User', id?: number | null, email?: string | null, username?: string | null };

export type GetUserByEmailQueryVariables = Exact<{
  email: Scalars['String']['input'];
}>;


export type GetUserByEmailQuery = { __typename?: 'Query', userByEmail?: { __typename?: 'User', id?: number | null, email?: string | null, username?: string | null } | null };

export type GetLeaguesForUserQueryVariables = Exact<{
  id: Scalars['Int']['input'];
  withMembers?: InputMaybe<Scalars['Boolean']['input']>;
  withMatchup?: InputMaybe<Scalars['Boolean']['input']>;
  withTeams?: InputMaybe<Scalars['Boolean']['input']>;
}>;


export type GetLeaguesForUserQuery = { __typename?: 'Query', user?: { __typename?: 'User', id?: number | null, email?: string | null, username?: string | null } | null };

export type GetUserByIdQueryVariables = Exact<{
  id: Scalars['Int']['input'];
}>;


export type GetUserByIdQuery = { __typename?: 'Query', user?: { __typename?: 'User', id?: number | null, email?: string | null, username?: string | null } | null };

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
  currentMatchup
  draftStatus
  userMembership {
    ...LeagueMember
  }
}
    ${LeagueMemberFragmentDoc}`;
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
  numberOfGames
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
    query GetLeagueById($id: Int!, $withMembers: Boolean = false, $withTeams: Boolean = false, $withMatchup: Boolean = false) {
  league(id: $id) {
    ...League
  }
}
    ${LeagueFragmentDoc}`;

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
export function useGetLeagueByIdQuery(baseOptions: Apollo.QueryHookOptions<GetLeagueByIdQuery, GetLeagueByIdQueryVariables> & ({ variables: GetLeagueByIdQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetLeagueByIdQuery, GetLeagueByIdQueryVariables>(GetLeagueById, options);
      }
export function useGetLeagueByIdLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetLeagueByIdQuery, GetLeagueByIdQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetLeagueByIdQuery, GetLeagueByIdQueryVariables>(GetLeagueById, options);
        }
export function useGetLeagueByIdSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetLeagueByIdQuery, GetLeagueByIdQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetLeagueByIdQuery, GetLeagueByIdQueryVariables>(GetLeagueById, options);
        }
export type GetLeagueByIdQueryHookResult = ReturnType<typeof useGetLeagueByIdQuery>;
export type GetLeagueByIdLazyQueryHookResult = ReturnType<typeof useGetLeagueByIdLazyQuery>;
export type GetLeagueByIdSuspenseQueryHookResult = ReturnType<typeof useGetLeagueByIdSuspenseQuery>;
export type GetLeagueByIdQueryResult = Apollo.QueryResult<GetLeagueByIdQuery, GetLeagueByIdQueryVariables>;
export const CreateLeague = gql`
    mutation CreateLeague($input: CreateLeagueAndTeamsInput!, $withMembers: Boolean = false, $withTeams: Boolean = false, $withMatchup: Boolean = false) {
  createLeagueAndTeams(input: $input) {
    league {
      ...League
    }
  }
}
    ${LeagueFragmentDoc}`;
export type CreateLeagueMutationFn = Apollo.MutationFunction<CreateLeagueMutation, CreateLeagueMutationVariables>;

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
export function useCreateLeagueMutation(baseOptions?: Apollo.MutationHookOptions<CreateLeagueMutation, CreateLeagueMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<CreateLeagueMutation, CreateLeagueMutationVariables>(CreateLeague, options);
      }
export type CreateLeagueMutationHookResult = ReturnType<typeof useCreateLeagueMutation>;
export type CreateLeagueMutationResult = Apollo.MutationResult<CreateLeagueMutation>;
export type CreateLeagueMutationOptions = Apollo.BaseMutationOptions<CreateLeagueMutation, CreateLeagueMutationVariables>;
export const GetPositionsForLeague = gql`
    query GetPositionsForLeague($leagueId: Int!) {
  leaguePositions(leagueId: $leagueId) {
    ...LeaguePosition
  }
}
    ${LeaguePositionFragmentDoc}`;

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
export function useGetPositionsForLeagueQuery(baseOptions: Apollo.QueryHookOptions<GetPositionsForLeagueQuery, GetPositionsForLeagueQueryVariables> & ({ variables: GetPositionsForLeagueQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetPositionsForLeagueQuery, GetPositionsForLeagueQueryVariables>(GetPositionsForLeague, options);
      }
export function useGetPositionsForLeagueLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetPositionsForLeagueQuery, GetPositionsForLeagueQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetPositionsForLeagueQuery, GetPositionsForLeagueQueryVariables>(GetPositionsForLeague, options);
        }
export function useGetPositionsForLeagueSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetPositionsForLeagueQuery, GetPositionsForLeagueQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetPositionsForLeagueQuery, GetPositionsForLeagueQueryVariables>(GetPositionsForLeague, options);
        }
export type GetPositionsForLeagueQueryHookResult = ReturnType<typeof useGetPositionsForLeagueQuery>;
export type GetPositionsForLeagueLazyQueryHookResult = ReturnType<typeof useGetPositionsForLeagueLazyQuery>;
export type GetPositionsForLeagueSuspenseQueryHookResult = ReturnType<typeof useGetPositionsForLeagueSuspenseQuery>;
export type GetPositionsForLeagueQueryResult = Apollo.QueryResult<GetPositionsForLeagueQuery, GetPositionsForLeagueQueryVariables>;
export const GetUserLeagues = gql`
    query GetUserLeagues {
  userLeagues {
    ...League
  }
}
    ${LeagueFragmentDoc}`;

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
export function useGetUserLeaguesQuery(baseOptions?: Apollo.QueryHookOptions<GetUserLeaguesQuery, GetUserLeaguesQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetUserLeaguesQuery, GetUserLeaguesQueryVariables>(GetUserLeagues, options);
      }
export function useGetUserLeaguesLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetUserLeaguesQuery, GetUserLeaguesQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetUserLeaguesQuery, GetUserLeaguesQueryVariables>(GetUserLeagues, options);
        }
export function useGetUserLeaguesSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetUserLeaguesQuery, GetUserLeaguesQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetUserLeaguesQuery, GetUserLeaguesQueryVariables>(GetUserLeagues, options);
        }
export type GetUserLeaguesQueryHookResult = ReturnType<typeof useGetUserLeaguesQuery>;
export type GetUserLeaguesLazyQueryHookResult = ReturnType<typeof useGetUserLeaguesLazyQuery>;
export type GetUserLeaguesSuspenseQueryHookResult = ReturnType<typeof useGetUserLeaguesSuspenseQuery>;
export type GetUserLeaguesQueryResult = Apollo.QueryResult<GetUserLeaguesQuery, GetUserLeaguesQueryVariables>;
export const DeleteAllLeagues = gql`
    mutation DeleteAllLeagues {
  deleteAllLeagues
}
    `;
export type DeleteAllLeaguesMutationFn = Apollo.MutationFunction<DeleteAllLeaguesMutation, DeleteAllLeaguesMutationVariables>;

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
export function useDeleteAllLeaguesMutation(baseOptions?: Apollo.MutationHookOptions<DeleteAllLeaguesMutation, DeleteAllLeaguesMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<DeleteAllLeaguesMutation, DeleteAllLeaguesMutationVariables>(DeleteAllLeagues, options);
      }
export type DeleteAllLeaguesMutationHookResult = ReturnType<typeof useDeleteAllLeaguesMutation>;
export type DeleteAllLeaguesMutationResult = Apollo.MutationResult<DeleteAllLeaguesMutation>;
export type DeleteAllLeaguesMutationOptions = Apollo.BaseMutationOptions<DeleteAllLeaguesMutation, DeleteAllLeaguesMutationVariables>;
export const StartDraft = gql`
    mutation StartDraft($leagueId: Int!, $draftType: String) {
  startDraft(leagueId: $leagueId, draftType: $draftType) {
    ...League
  }
}
    ${LeagueFragmentDoc}`;
export type StartDraftMutationFn = Apollo.MutationFunction<StartDraftMutation, StartDraftMutationVariables>;

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
 *      draftType: // value for 'draftType'
 *   },
 * });
 */
export function useStartDraftMutation(baseOptions?: Apollo.MutationHookOptions<StartDraftMutation, StartDraftMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<StartDraftMutation, StartDraftMutationVariables>(StartDraft, options);
      }
export type StartDraftMutationHookResult = ReturnType<typeof useStartDraftMutation>;
export type StartDraftMutationResult = Apollo.MutationResult<StartDraftMutation>;
export type StartDraftMutationOptions = Apollo.BaseMutationOptions<StartDraftMutation, StartDraftMutationVariables>;
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
export function useGetUserTeamIdQuery(baseOptions: Apollo.QueryHookOptions<GetUserTeamIdQuery, GetUserTeamIdQueryVariables> & ({ variables: GetUserTeamIdQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetUserTeamIdQuery, GetUserTeamIdQueryVariables>(GetUserTeamId, options);
      }
export function useGetUserTeamIdLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetUserTeamIdQuery, GetUserTeamIdQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetUserTeamIdQuery, GetUserTeamIdQueryVariables>(GetUserTeamId, options);
        }
export function useGetUserTeamIdSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetUserTeamIdQuery, GetUserTeamIdQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetUserTeamIdQuery, GetUserTeamIdQueryVariables>(GetUserTeamId, options);
        }
export type GetUserTeamIdQueryHookResult = ReturnType<typeof useGetUserTeamIdQuery>;
export type GetUserTeamIdLazyQueryHookResult = ReturnType<typeof useGetUserTeamIdLazyQuery>;
export type GetUserTeamIdSuspenseQueryHookResult = ReturnType<typeof useGetUserTeamIdSuspenseQuery>;
export type GetUserTeamIdQueryResult = Apollo.QueryResult<GetUserTeamIdQuery, GetUserTeamIdQueryVariables>;
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
    ${CareerBattingStatsFragmentDoc}`;

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
export function useGetCareerBattingStatsQuery(baseOptions?: Apollo.QueryHookOptions<GetCareerBattingStatsQuery, GetCareerBattingStatsQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetCareerBattingStatsQuery, GetCareerBattingStatsQueryVariables>(GetCareerBattingStats, options);
      }
export function useGetCareerBattingStatsLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetCareerBattingStatsQuery, GetCareerBattingStatsQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetCareerBattingStatsQuery, GetCareerBattingStatsQueryVariables>(GetCareerBattingStats, options);
        }
export function useGetCareerBattingStatsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetCareerBattingStatsQuery, GetCareerBattingStatsQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetCareerBattingStatsQuery, GetCareerBattingStatsQueryVariables>(GetCareerBattingStats, options);
        }
export type GetCareerBattingStatsQueryHookResult = ReturnType<typeof useGetCareerBattingStatsQuery>;
export type GetCareerBattingStatsLazyQueryHookResult = ReturnType<typeof useGetCareerBattingStatsLazyQuery>;
export type GetCareerBattingStatsSuspenseQueryHookResult = ReturnType<typeof useGetCareerBattingStatsSuspenseQuery>;
export type GetCareerBattingStatsQueryResult = Apollo.QueryResult<GetCareerBattingStatsQuery, GetCareerBattingStatsQueryVariables>;
export const GetCareerFieldingStats = gql`
    query GetCareerFieldingStats {
  careerFieldingStats {
    ...CareerFieldingStats
  }
}
    ${CareerFieldingStatsFragmentDoc}`;

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
export function useGetCareerFieldingStatsQuery(baseOptions?: Apollo.QueryHookOptions<GetCareerFieldingStatsQuery, GetCareerFieldingStatsQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetCareerFieldingStatsQuery, GetCareerFieldingStatsQueryVariables>(GetCareerFieldingStats, options);
      }
export function useGetCareerFieldingStatsLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetCareerFieldingStatsQuery, GetCareerFieldingStatsQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetCareerFieldingStatsQuery, GetCareerFieldingStatsQueryVariables>(GetCareerFieldingStats, options);
        }
export function useGetCareerFieldingStatsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetCareerFieldingStatsQuery, GetCareerFieldingStatsQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetCareerFieldingStatsQuery, GetCareerFieldingStatsQueryVariables>(GetCareerFieldingStats, options);
        }
export type GetCareerFieldingStatsQueryHookResult = ReturnType<typeof useGetCareerFieldingStatsQuery>;
export type GetCareerFieldingStatsLazyQueryHookResult = ReturnType<typeof useGetCareerFieldingStatsLazyQuery>;
export type GetCareerFieldingStatsSuspenseQueryHookResult = ReturnType<typeof useGetCareerFieldingStatsSuspenseQuery>;
export type GetCareerFieldingStatsQueryResult = Apollo.QueryResult<GetCareerFieldingStatsQuery, GetCareerFieldingStatsQueryVariables>;
export const GetCareerPitchingStats = gql`
    query GetCareerPitchingStats {
  careerPitchingStats {
    ...CareerPitchingStats
  }
}
    ${CareerPitchingStatsFragmentDoc}`;

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
export function useGetCareerPitchingStatsQuery(baseOptions?: Apollo.QueryHookOptions<GetCareerPitchingStatsQuery, GetCareerPitchingStatsQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetCareerPitchingStatsQuery, GetCareerPitchingStatsQueryVariables>(GetCareerPitchingStats, options);
      }
export function useGetCareerPitchingStatsLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetCareerPitchingStatsQuery, GetCareerPitchingStatsQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetCareerPitchingStatsQuery, GetCareerPitchingStatsQueryVariables>(GetCareerPitchingStats, options);
        }
export function useGetCareerPitchingStatsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetCareerPitchingStatsQuery, GetCareerPitchingStatsQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetCareerPitchingStatsQuery, GetCareerPitchingStatsQueryVariables>(GetCareerPitchingStats, options);
        }
export type GetCareerPitchingStatsQueryHookResult = ReturnType<typeof useGetCareerPitchingStatsQuery>;
export type GetCareerPitchingStatsLazyQueryHookResult = ReturnType<typeof useGetCareerPitchingStatsLazyQuery>;
export type GetCareerPitchingStatsSuspenseQueryHookResult = ReturnType<typeof useGetCareerPitchingStatsSuspenseQuery>;
export type GetCareerPitchingStatsQueryResult = Apollo.QueryResult<GetCareerPitchingStatsQuery, GetCareerPitchingStatsQueryVariables>;
export const GetTeamMembers = gql`
    query GetTeamMembers($teamId: Int!) {
  teamMembers(teamId: $teamId) {
    ...TeamMember
  }
}
    ${TeamMemberFragmentDoc}`;

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
export function useGetTeamMembersQuery(baseOptions: Apollo.QueryHookOptions<GetTeamMembersQuery, GetTeamMembersQueryVariables> & ({ variables: GetTeamMembersQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetTeamMembersQuery, GetTeamMembersQueryVariables>(GetTeamMembers, options);
      }
export function useGetTeamMembersLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetTeamMembersQuery, GetTeamMembersQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetTeamMembersQuery, GetTeamMembersQueryVariables>(GetTeamMembers, options);
        }
export function useGetTeamMembersSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetTeamMembersQuery, GetTeamMembersQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetTeamMembersQuery, GetTeamMembersQueryVariables>(GetTeamMembers, options);
        }
export type GetTeamMembersQueryHookResult = ReturnType<typeof useGetTeamMembersQuery>;
export type GetTeamMembersLazyQueryHookResult = ReturnType<typeof useGetTeamMembersLazyQuery>;
export type GetTeamMembersSuspenseQueryHookResult = ReturnType<typeof useGetTeamMembersSuspenseQuery>;
export type GetTeamMembersQueryResult = Apollo.QueryResult<GetTeamMembersQuery, GetTeamMembersQueryVariables>;
export const UpdateTeamMemberPosition = gql`
    mutation UpdateTeamMemberPosition($teamMemberId: Int!, $positionId: Int) {
  updateTeamMemberPosition(teamMemberId: $teamMemberId, positionId: $positionId) {
    ...TeamMember
  }
}
    ${TeamMemberFragmentDoc}`;
export type UpdateTeamMemberPositionMutationFn = Apollo.MutationFunction<UpdateTeamMemberPositionMutation, UpdateTeamMemberPositionMutationVariables>;

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
export function useUpdateTeamMemberPositionMutation(baseOptions?: Apollo.MutationHookOptions<UpdateTeamMemberPositionMutation, UpdateTeamMemberPositionMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<UpdateTeamMemberPositionMutation, UpdateTeamMemberPositionMutationVariables>(UpdateTeamMemberPosition, options);
      }
export type UpdateTeamMemberPositionMutationHookResult = ReturnType<typeof useUpdateTeamMemberPositionMutation>;
export type UpdateTeamMemberPositionMutationResult = Apollo.MutationResult<UpdateTeamMemberPositionMutation>;
export type UpdateTeamMemberPositionMutationOptions = Apollo.BaseMutationOptions<UpdateTeamMemberPositionMutation, UpdateTeamMemberPositionMutationVariables>;
export const GetUserByEmail = gql`
    query GetUserByEmail($email: String!) {
  userByEmail(email: $email) {
    ...User
  }
}
    ${UserFragmentDoc}`;

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
export function useGetUserByEmailQuery(baseOptions: Apollo.QueryHookOptions<GetUserByEmailQuery, GetUserByEmailQueryVariables> & ({ variables: GetUserByEmailQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetUserByEmailQuery, GetUserByEmailQueryVariables>(GetUserByEmail, options);
      }
export function useGetUserByEmailLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetUserByEmailQuery, GetUserByEmailQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetUserByEmailQuery, GetUserByEmailQueryVariables>(GetUserByEmail, options);
        }
export function useGetUserByEmailSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetUserByEmailQuery, GetUserByEmailQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetUserByEmailQuery, GetUserByEmailQueryVariables>(GetUserByEmail, options);
        }
export type GetUserByEmailQueryHookResult = ReturnType<typeof useGetUserByEmailQuery>;
export type GetUserByEmailLazyQueryHookResult = ReturnType<typeof useGetUserByEmailLazyQuery>;
export type GetUserByEmailSuspenseQueryHookResult = ReturnType<typeof useGetUserByEmailSuspenseQuery>;
export type GetUserByEmailQueryResult = Apollo.QueryResult<GetUserByEmailQuery, GetUserByEmailQueryVariables>;
export const GetLeaguesForUser = gql`
    query GetLeaguesForUser($id: Int!, $withMembers: Boolean = false, $withMatchup: Boolean = false, $withTeams: Boolean = false) {
  user(id: $id) {
    ...User
  }
}
    ${UserFragmentDoc}`;

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
export function useGetLeaguesForUserQuery(baseOptions: Apollo.QueryHookOptions<GetLeaguesForUserQuery, GetLeaguesForUserQueryVariables> & ({ variables: GetLeaguesForUserQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetLeaguesForUserQuery, GetLeaguesForUserQueryVariables>(GetLeaguesForUser, options);
      }
export function useGetLeaguesForUserLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetLeaguesForUserQuery, GetLeaguesForUserQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetLeaguesForUserQuery, GetLeaguesForUserQueryVariables>(GetLeaguesForUser, options);
        }
export function useGetLeaguesForUserSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetLeaguesForUserQuery, GetLeaguesForUserQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetLeaguesForUserQuery, GetLeaguesForUserQueryVariables>(GetLeaguesForUser, options);
        }
export type GetLeaguesForUserQueryHookResult = ReturnType<typeof useGetLeaguesForUserQuery>;
export type GetLeaguesForUserLazyQueryHookResult = ReturnType<typeof useGetLeaguesForUserLazyQuery>;
export type GetLeaguesForUserSuspenseQueryHookResult = ReturnType<typeof useGetLeaguesForUserSuspenseQuery>;
export type GetLeaguesForUserQueryResult = Apollo.QueryResult<GetLeaguesForUserQuery, GetLeaguesForUserQueryVariables>;
export const GetUserById = gql`
    query GetUserById($id: Int!) {
  user(id: $id) {
    ...User
  }
}
    ${UserFragmentDoc}`;

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
export function useGetUserByIdQuery(baseOptions: Apollo.QueryHookOptions<GetUserByIdQuery, GetUserByIdQueryVariables> & ({ variables: GetUserByIdQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetUserByIdQuery, GetUserByIdQueryVariables>(GetUserById, options);
      }
export function useGetUserByIdLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetUserByIdQuery, GetUserByIdQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetUserByIdQuery, GetUserByIdQueryVariables>(GetUserById, options);
        }
export function useGetUserByIdSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetUserByIdQuery, GetUserByIdQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetUserByIdQuery, GetUserByIdQueryVariables>(GetUserById, options);
        }
export type GetUserByIdQueryHookResult = ReturnType<typeof useGetUserByIdQuery>;
export type GetUserByIdLazyQueryHookResult = ReturnType<typeof useGetUserByIdLazyQuery>;
export type GetUserByIdSuspenseQueryHookResult = ReturnType<typeof useGetUserByIdSuspenseQuery>;
export type GetUserByIdQueryResult = Apollo.QueryResult<GetUserByIdQuery, GetUserByIdQueryVariables>;