/* eslint-disable */
import { gql } from '@apollo/client';
import * as Apollo from '@apollo/client';
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
  playerId?: Maybe<Scalars['Int']['output']>;
  rbi?: Maybe<Scalars['Int']['output']>;
  runs?: Maybe<Scalars['Int']['output']>;
  sacrificeHits?: Maybe<Scalars['Int']['output']>;
  sluggingPercentage?: Maybe<Scalars['Float']['output']>;
  stolenBases?: Maybe<Scalars['Int']['output']>;
  strikeouts?: Maybe<Scalars['Int']['output']>;
  totalBases?: Maybe<Scalars['Int']['output']>;
  triples?: Maybe<Scalars['Int']['output']>;
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

export type Player = {
  __typename?: 'Player';
  brefId?: Maybe<Scalars['String']['output']>;
  firstName?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  lastName?: Maybe<Scalars['String']['output']>;
};

export type Query = {
  __typename?: 'Query';
  careerBattingStats?: Maybe<Array<CareerBatting>>;
  careerFieldingStats?: Maybe<Array<CareerFielding>>;
  careerPitchingStats?: Maybe<Array<CareerPitching>>;
  hello?: Maybe<Scalars['String']['output']>;
  player?: Maybe<Player>;
  playerByBrefId?: Maybe<Player>;
  playerCareerBatting?: Maybe<CareerBatting>;
  playerCareerFielding?: Maybe<CareerFielding>;
  playerCareerPitching?: Maybe<CareerPitching>;
  players?: Maybe<Array<Player>>;
  searchPlayers?: Maybe<Array<Player>>;
  searchUsers?: Maybe<Array<User>>;
  user?: Maybe<User>;
  userByEmail?: Maybe<User>;
  users?: Maybe<Array<User>>;
};

export type QueryCareerBattingStatsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  minGames?: InputMaybe<Scalars['Int']['input']>;
  minHomeRuns?: InputMaybe<Scalars['Int']['input']>;
  minRBI?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Scalars['String']['input']>;
  orderDirection?: InputMaybe<Scalars['String']['input']>;
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

export type QueryUserArgs = {
  id: Scalars['Int']['input'];
};

export type QueryUserByEmailArgs = {
  email: Scalars['String']['input'];
};

export type QueryUsersArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Scalars['String']['input']>;
  orderDirection?: InputMaybe<Scalars['String']['input']>;
};

export type User = {
  __typename?: 'User';
  accessLevel?: Maybe<Scalars['String']['output']>;
  email?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  username?: Maybe<Scalars['String']['output']>;
};

export type CareerBattingFragment = {
  __typename?: 'CareerBatting';
  playerId?: number | null;
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
  totalBases?: number | null;
  groundedIntoDoublePlays?: number | null;
  hitByPitch?: number | null;
  sacrificeHits?: number | null;
  intentionalBaseOnBalls?: number | null;
  battingAverage?: number | null;
  onBasePercentage?: number | null;
  sluggingPercentage?: number | null;
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

export type GetCareerBattingStatsQueryVariables = Exact<{
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Scalars['String']['input']>;
  orderDirection?: InputMaybe<Scalars['String']['input']>;
  minGames?: InputMaybe<Scalars['Int']['input']>;
  minHomeRuns?: InputMaybe<Scalars['Int']['input']>;
  minRBI?: InputMaybe<Scalars['Int']['input']>;
}>;

export type GetCareerBattingStatsQuery = {
  __typename?: 'Query';
  careerBattingStats?: Array<{
    __typename?: 'CareerBatting';
    playerId?: number | null;
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
    totalBases?: number | null;
    groundedIntoDoublePlays?: number | null;
    hitByPitch?: number | null;
    sacrificeHits?: number | null;
    intentionalBaseOnBalls?: number | null;
    battingAverage?: number | null;
    onBasePercentage?: number | null;
    sluggingPercentage?: number | null;
  }> | null;
};

export type PlayerFragment = {
  __typename?: 'Player';
  id?: number | null;
  firstName?: string | null;
  lastName?: string | null;
  brefId?: string | null;
};

export type PlayerBasicFragment = {
  __typename?: 'Player';
  id?: number | null;
  firstName?: string | null;
  lastName?: string | null;
  brefId?: string | null;
};

export type GetPlayersWithStatsTableQueryVariables = Exact<{
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Scalars['String']['input']>;
  orderDirection?: InputMaybe<Scalars['String']['input']>;
}>;

export type GetPlayersWithStatsTableQuery = {
  __typename?: 'Query';
  players?: Array<{
    __typename?: 'Player';
    id?: number | null;
    firstName?: string | null;
    lastName?: string | null;
    brefId?: string | null;
  }> | null;
};

export const CareerBattingFragmentDoc = gql`
  fragment CareerBatting on CareerBatting {
    playerId
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
    totalBases
    groundedIntoDoublePlays
    hitByPitch
    sacrificeHits
    intentionalBaseOnBalls
    battingAverage
    onBasePercentage
    sluggingPercentage
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
export const PlayerBasicFragmentDoc = gql`
  fragment PlayerBasic on Player {
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
  >(GetAllPlayers, options);
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
export const GetCareerBattingStats = gql`
  query GetCareerBattingStats(
    $limit: Int
    $offset: Int
    $orderBy: String
    $orderDirection: String
    $minGames: Int
    $minHomeRuns: Int
    $minRBI: Int
  ) {
    careerBattingStats(
      limit: $limit
      offset: $offset
      orderBy: $orderBy
      orderDirection: $orderDirection
      minGames: $minGames
      minHomeRuns: $minHomeRuns
      minRBI: $minRBI
    ) {
      ...CareerBatting
    }
  }
  ${CareerBattingFragmentDoc}
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
 *      limit: // value for 'limit'
 *      offset: // value for 'offset'
 *      orderBy: // value for 'orderBy'
 *      orderDirection: // value for 'orderDirection'
 *      minGames: // value for 'minGames'
 *      minHomeRuns: // value for 'minHomeRuns'
 *      minRBI: // value for 'minRBI'
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
  >(GetCareerBattingStats, options);
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
export const GetPlayersWithStatsTable = gql`
  query GetPlayersWithStatsTable(
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
      ...PlayerBasic
    }
  }
  ${PlayerBasicFragmentDoc}
`;

/**
 * __useGetPlayersWithStatsTableQuery__
 *
 * To run a query within a React component, call `useGetPlayersWithStatsTableQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetPlayersWithStatsTableQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetPlayersWithStatsTableQuery({
 *   variables: {
 *      limit: // value for 'limit'
 *      offset: // value for 'offset'
 *      orderBy: // value for 'orderBy'
 *      orderDirection: // value for 'orderDirection'
 *   },
 * });
 */
export function useGetPlayersWithStatsTableQuery(
  baseOptions?: Apollo.QueryHookOptions<
    GetPlayersWithStatsTableQuery,
    GetPlayersWithStatsTableQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useQuery<
    GetPlayersWithStatsTableQuery,
    GetPlayersWithStatsTableQueryVariables
  >(GetPlayersWithStatsTable, options);
}
export function useGetPlayersWithStatsTableLazyQuery(
  baseOptions?: Apollo.LazyQueryHookOptions<
    GetPlayersWithStatsTableQuery,
    GetPlayersWithStatsTableQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useLazyQuery<
    GetPlayersWithStatsTableQuery,
    GetPlayersWithStatsTableQueryVariables
  >(GetPlayersWithStatsTable, options);
}
export function useGetPlayersWithStatsTableSuspenseQuery(
  baseOptions?:
    | Apollo.SkipToken
    | Apollo.SuspenseQueryHookOptions<
        GetPlayersWithStatsTableQuery,
        GetPlayersWithStatsTableQueryVariables
      >,
) {
  const options =
    baseOptions === Apollo.skipToken
      ? baseOptions
      : { ...defaultOptions, ...baseOptions };
  return Apollo.useSuspenseQuery<
    GetPlayersWithStatsTableQuery,
    GetPlayersWithStatsTableQueryVariables
  >(GetPlayersWithStatsTable, options);
}
export type GetPlayersWithStatsTableQueryHookResult = ReturnType<
  typeof useGetPlayersWithStatsTableQuery
>;
export type GetPlayersWithStatsTableLazyQueryHookResult = ReturnType<
  typeof useGetPlayersWithStatsTableLazyQuery
>;
export type GetPlayersWithStatsTableSuspenseQueryHookResult = ReturnType<
  typeof useGetPlayersWithStatsTableSuspenseQuery
>;
export type GetPlayersWithStatsTableQueryResult = Apollo.QueryResult<
  GetPlayersWithStatsTableQuery,
  GetPlayersWithStatsTableQueryVariables
>;
