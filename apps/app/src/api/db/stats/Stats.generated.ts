/* eslint-disable */
import * as Types from '../graphql.generated';

import * as Operations from '../graphql.generated';
import * as Apollo from '@apollo/client';
const defaultOptions = {} as const;


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
 *      orderBy: // value for 'orderBy'
 *      first: // value for 'first'
 *   },
 * });
 */
export function useGetCareerBattingStatsQuery(baseOptions?: Apollo.QueryHookOptions<Types.GetCareerBattingStatsQuery, Types.GetCareerBattingStatsQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<Types.GetCareerBattingStatsQuery, Types.GetCareerBattingStatsQueryVariables>(Operations.GetCareerBattingStats, options);
      }
export function useGetCareerBattingStatsLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<Types.GetCareerBattingStatsQuery, Types.GetCareerBattingStatsQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<Types.GetCareerBattingStatsQuery, Types.GetCareerBattingStatsQueryVariables>(Operations.GetCareerBattingStats, options);
        }
export function useGetCareerBattingStatsSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<Types.GetCareerBattingStatsQuery, Types.GetCareerBattingStatsQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<Types.GetCareerBattingStatsQuery, Types.GetCareerBattingStatsQueryVariables>(Operations.GetCareerBattingStats, options);
        }
export type GetCareerBattingStatsQueryHookResult = ReturnType<typeof useGetCareerBattingStatsQuery>;
export type GetCareerBattingStatsLazyQueryHookResult = ReturnType<typeof useGetCareerBattingStatsLazyQuery>;
export type GetCareerBattingStatsSuspenseQueryHookResult = ReturnType<typeof useGetCareerBattingStatsSuspenseQuery>;
export type GetCareerBattingStatsQueryResult = Apollo.QueryResult<Types.GetCareerBattingStatsQuery, Types.GetCareerBattingStatsQueryVariables>;

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
 *      orderBy: // value for 'orderBy'
 *      first: // value for 'first'
 *   },
 * });
 */
export function useGetCareerFieldingStatsQuery(baseOptions?: Apollo.QueryHookOptions<Types.GetCareerFieldingStatsQuery, Types.GetCareerFieldingStatsQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<Types.GetCareerFieldingStatsQuery, Types.GetCareerFieldingStatsQueryVariables>(Operations.GetCareerFieldingStats, options);
      }
export function useGetCareerFieldingStatsLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<Types.GetCareerFieldingStatsQuery, Types.GetCareerFieldingStatsQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<Types.GetCareerFieldingStatsQuery, Types.GetCareerFieldingStatsQueryVariables>(Operations.GetCareerFieldingStats, options);
        }
export function useGetCareerFieldingStatsSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<Types.GetCareerFieldingStatsQuery, Types.GetCareerFieldingStatsQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<Types.GetCareerFieldingStatsQuery, Types.GetCareerFieldingStatsQueryVariables>(Operations.GetCareerFieldingStats, options);
        }
export type GetCareerFieldingStatsQueryHookResult = ReturnType<typeof useGetCareerFieldingStatsQuery>;
export type GetCareerFieldingStatsLazyQueryHookResult = ReturnType<typeof useGetCareerFieldingStatsLazyQuery>;
export type GetCareerFieldingStatsSuspenseQueryHookResult = ReturnType<typeof useGetCareerFieldingStatsSuspenseQuery>;
export type GetCareerFieldingStatsQueryResult = Apollo.QueryResult<Types.GetCareerFieldingStatsQuery, Types.GetCareerFieldingStatsQueryVariables>;

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
 *      orderBy: // value for 'orderBy'
 *      first: // value for 'first'
 *   },
 * });
 */
export function useGetCareerPitchingStatsQuery(baseOptions?: Apollo.QueryHookOptions<Types.GetCareerPitchingStatsQuery, Types.GetCareerPitchingStatsQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<Types.GetCareerPitchingStatsQuery, Types.GetCareerPitchingStatsQueryVariables>(Operations.GetCareerPitchingStats, options);
      }
export function useGetCareerPitchingStatsLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<Types.GetCareerPitchingStatsQuery, Types.GetCareerPitchingStatsQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<Types.GetCareerPitchingStatsQuery, Types.GetCareerPitchingStatsQueryVariables>(Operations.GetCareerPitchingStats, options);
        }
export function useGetCareerPitchingStatsSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<Types.GetCareerPitchingStatsQuery, Types.GetCareerPitchingStatsQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<Types.GetCareerPitchingStatsQuery, Types.GetCareerPitchingStatsQueryVariables>(Operations.GetCareerPitchingStats, options);
        }
export type GetCareerPitchingStatsQueryHookResult = ReturnType<typeof useGetCareerPitchingStatsQuery>;
export type GetCareerPitchingStatsLazyQueryHookResult = ReturnType<typeof useGetCareerPitchingStatsLazyQuery>;
export type GetCareerPitchingStatsSuspenseQueryHookResult = ReturnType<typeof useGetCareerPitchingStatsSuspenseQuery>;
export type GetCareerPitchingStatsQueryResult = Apollo.QueryResult<Types.GetCareerPitchingStatsQuery, Types.GetCareerPitchingStatsQueryVariables>;