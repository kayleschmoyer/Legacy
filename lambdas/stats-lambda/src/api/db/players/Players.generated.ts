/* eslint-disable */
import * as Types from '../graphql.generated';

import * as Operations from '../graphql.generated';
import * as Apollo from '@apollo/client';
const defaultOptions = {} as const;


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
export function useGetPlayerByBrefIdQuery(baseOptions: Apollo.QueryHookOptions<Types.GetPlayerByBrefIdQuery, Types.GetPlayerByBrefIdQueryVariables> & ({ variables: Types.GetPlayerByBrefIdQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<Types.GetPlayerByBrefIdQuery, Types.GetPlayerByBrefIdQueryVariables>(Operations.GetPlayerByBrefId, options);
      }
export function useGetPlayerByBrefIdLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<Types.GetPlayerByBrefIdQuery, Types.GetPlayerByBrefIdQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<Types.GetPlayerByBrefIdQuery, Types.GetPlayerByBrefIdQueryVariables>(Operations.GetPlayerByBrefId, options);
        }
export function useGetPlayerByBrefIdSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<Types.GetPlayerByBrefIdQuery, Types.GetPlayerByBrefIdQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<Types.GetPlayerByBrefIdQuery, Types.GetPlayerByBrefIdQueryVariables>(Operations.GetPlayerByBrefId, options);
        }
export type GetPlayerByBrefIdQueryHookResult = ReturnType<typeof useGetPlayerByBrefIdQuery>;
export type GetPlayerByBrefIdLazyQueryHookResult = ReturnType<typeof useGetPlayerByBrefIdLazyQuery>;
export type GetPlayerByBrefIdSuspenseQueryHookResult = ReturnType<typeof useGetPlayerByBrefIdSuspenseQuery>;
export type GetPlayerByBrefIdQueryResult = Apollo.QueryResult<Types.GetPlayerByBrefIdQuery, Types.GetPlayerByBrefIdQueryVariables>;