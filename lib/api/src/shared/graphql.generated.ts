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

export type Player = {
  __typename?: 'Player';
  brefId?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  name?: Maybe<Scalars['String']['output']>;
};

export type Query = {
  __typename?: 'Query';
  hello?: Maybe<Scalars['String']['output']>;
  player?: Maybe<Player>;
  playerByBrefId?: Maybe<Player>;
  players?: Maybe<Array<Player>>;
  searchPlayers?: Maybe<Array<Player>>;
  searchUsers?: Maybe<Array<User>>;
  user?: Maybe<User>;
  userByEmail?: Maybe<User>;
  users?: Maybe<Array<User>>;
};


export type QueryPlayerArgs = {
  id: Scalars['Int']['input'];
};


export type QueryPlayerByBrefIdArgs = {
  brefId: Scalars['String']['input'];
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

export type GetAllPlayersQueryVariables = Exact<{
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Scalars['String']['input']>;
  orderDirection?: InputMaybe<Scalars['String']['input']>;
}>;


export type GetAllPlayersQuery = { __typename?: 'Query', players?: Array<{ __typename?: 'Player', id?: number | null, name?: string | null, brefId?: string | null }> | null };

export type GetPlayerQueryVariables = Exact<{
  id: Scalars['Int']['input'];
}>;


export type GetPlayerQuery = { __typename?: 'Query', player?: { __typename?: 'Player', id?: number | null, name?: string | null, brefId?: string | null } | null };

export type GetPlayerByBrefIdQueryVariables = Exact<{
  brefId: Scalars['String']['input'];
}>;


export type GetPlayerByBrefIdQuery = { __typename?: 'Query', playerByBrefId?: { __typename?: 'Player', id?: number | null, name?: string | null, brefId?: string | null } | null };

export type PlayerFragment = { __typename?: 'Player', id?: number | null, name?: string | null, brefId?: string | null };

export type GetHelloQueryVariables = Exact<{ [key: string]: never; }>;


export type GetHelloQuery = { __typename?: 'Query', hello?: string | null };

export const PlayerFragmentDoc = gql`
    fragment Player on Player {
  id
  name
  brefId
}
    `;
export const GetAllPlayers = gql`
    query GetAllPlayers($limit: Int, $offset: Int, $orderBy: String, $orderDirection: String) {
  players(
    limit: $limit
    offset: $offset
    orderBy: $orderBy
    orderDirection: $orderDirection
  ) {
    id
    name
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
export function useGetAllPlayersQuery(baseOptions?: Apollo.QueryHookOptions<GetAllPlayersQuery, GetAllPlayersQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetAllPlayersQuery, GetAllPlayersQueryVariables>(GetAllPlayers, options);
      }
export function useGetAllPlayersLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetAllPlayersQuery, GetAllPlayersQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetAllPlayersQuery, GetAllPlayersQueryVariables>(GetAllPlayers, options);
        }
export function useGetAllPlayersSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetAllPlayersQuery, GetAllPlayersQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetAllPlayersQuery, GetAllPlayersQueryVariables>(GetAllPlayers, options);
        }
export type GetAllPlayersQueryHookResult = ReturnType<typeof useGetAllPlayersQuery>;
export type GetAllPlayersLazyQueryHookResult = ReturnType<typeof useGetAllPlayersLazyQuery>;
export type GetAllPlayersSuspenseQueryHookResult = ReturnType<typeof useGetAllPlayersSuspenseQuery>;
export type GetAllPlayersQueryResult = Apollo.QueryResult<GetAllPlayersQuery, GetAllPlayersQueryVariables>;
export const GetPlayer = gql`
    query GetPlayer($id: Int!) {
  player(id: $id) {
    id
    name
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
export function useGetPlayerQuery(baseOptions: Apollo.QueryHookOptions<GetPlayerQuery, GetPlayerQueryVariables> & ({ variables: GetPlayerQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetPlayerQuery, GetPlayerQueryVariables>(GetPlayer, options);
      }
export function useGetPlayerLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetPlayerQuery, GetPlayerQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetPlayerQuery, GetPlayerQueryVariables>(GetPlayer, options);
        }
export function useGetPlayerSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetPlayerQuery, GetPlayerQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetPlayerQuery, GetPlayerQueryVariables>(GetPlayer, options);
        }
export type GetPlayerQueryHookResult = ReturnType<typeof useGetPlayerQuery>;
export type GetPlayerLazyQueryHookResult = ReturnType<typeof useGetPlayerLazyQuery>;
export type GetPlayerSuspenseQueryHookResult = ReturnType<typeof useGetPlayerSuspenseQuery>;
export type GetPlayerQueryResult = Apollo.QueryResult<GetPlayerQuery, GetPlayerQueryVariables>;
export const GetPlayerByBrefId = gql`
    query GetPlayerByBrefId($brefId: String!) {
  playerByBrefId(brefId: $brefId) {
    id
    name
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
export function useGetPlayerByBrefIdQuery(baseOptions: Apollo.QueryHookOptions<GetPlayerByBrefIdQuery, GetPlayerByBrefIdQueryVariables> & ({ variables: GetPlayerByBrefIdQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetPlayerByBrefIdQuery, GetPlayerByBrefIdQueryVariables>(GetPlayerByBrefId, options);
      }
export function useGetPlayerByBrefIdLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetPlayerByBrefIdQuery, GetPlayerByBrefIdQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetPlayerByBrefIdQuery, GetPlayerByBrefIdQueryVariables>(GetPlayerByBrefId, options);
        }
export function useGetPlayerByBrefIdSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetPlayerByBrefIdQuery, GetPlayerByBrefIdQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetPlayerByBrefIdQuery, GetPlayerByBrefIdQueryVariables>(GetPlayerByBrefId, options);
        }
export type GetPlayerByBrefIdQueryHookResult = ReturnType<typeof useGetPlayerByBrefIdQuery>;
export type GetPlayerByBrefIdLazyQueryHookResult = ReturnType<typeof useGetPlayerByBrefIdLazyQuery>;
export type GetPlayerByBrefIdSuspenseQueryHookResult = ReturnType<typeof useGetPlayerByBrefIdSuspenseQuery>;
export type GetPlayerByBrefIdQueryResult = Apollo.QueryResult<GetPlayerByBrefIdQuery, GetPlayerByBrefIdQueryVariables>;
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
export function useGetHelloQuery(baseOptions?: Apollo.QueryHookOptions<GetHelloQuery, GetHelloQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetHelloQuery, GetHelloQueryVariables>(GetHello, options);
      }
export function useGetHelloLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetHelloQuery, GetHelloQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetHelloQuery, GetHelloQueryVariables>(GetHello, options);
        }
export function useGetHelloSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetHelloQuery, GetHelloQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetHelloQuery, GetHelloQueryVariables>(GetHello, options);
        }
export type GetHelloQueryHookResult = ReturnType<typeof useGetHelloQuery>;
export type GetHelloLazyQueryHookResult = ReturnType<typeof useGetHelloLazyQuery>;
export type GetHelloSuspenseQueryHookResult = ReturnType<typeof useGetHelloSuspenseQuery>;
export type GetHelloQueryResult = Apollo.QueryResult<GetHelloQuery, GetHelloQueryVariables>;