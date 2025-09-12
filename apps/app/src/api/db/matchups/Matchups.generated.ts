/* eslint-disable */
import * as Types from '../graphql.generated';

import * as Operations from '../graphql.generated';
import * as Apollo from '@apollo/client';
const defaultOptions = {} as const;


/**
 * __useGetMatchupStatsQuery__
 *
 * To run a query within a React component, call `useGetMatchupStatsQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetMatchupStatsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetMatchupStatsQuery({
 *   variables: {
 *      matchupId: // value for 'matchupId'
 *      withMatchupStats: // value for 'withMatchupStats'
 *      withProjections: // value for 'withProjections'
 *   },
 * });
 */
export function useGetMatchupStatsQuery(baseOptions: Apollo.QueryHookOptions<Types.GetMatchupStatsQuery, Types.GetMatchupStatsQueryVariables> & ({ variables: Types.GetMatchupStatsQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<Types.GetMatchupStatsQuery, Types.GetMatchupStatsQueryVariables>(Operations.GetMatchupStats, options);
      }
export function useGetMatchupStatsLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<Types.GetMatchupStatsQuery, Types.GetMatchupStatsQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<Types.GetMatchupStatsQuery, Types.GetMatchupStatsQueryVariables>(Operations.GetMatchupStats, options);
        }
export function useGetMatchupStatsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<Types.GetMatchupStatsQuery, Types.GetMatchupStatsQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<Types.GetMatchupStatsQuery, Types.GetMatchupStatsQueryVariables>(Operations.GetMatchupStats, options);
        }
export type GetMatchupStatsQueryHookResult = ReturnType<typeof useGetMatchupStatsQuery>;
export type GetMatchupStatsLazyQueryHookResult = ReturnType<typeof useGetMatchupStatsLazyQuery>;
export type GetMatchupStatsSuspenseQueryHookResult = ReturnType<typeof useGetMatchupStatsSuspenseQuery>;
export type GetMatchupStatsQueryResult = Apollo.QueryResult<Types.GetMatchupStatsQuery, Types.GetMatchupStatsQueryVariables>;
