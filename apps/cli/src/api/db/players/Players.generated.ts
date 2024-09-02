import * as Types from '../graphql.generated';

import * as Operations from '../graphql.generated';
import * as Apollo from '@apollo/client';
const defaultOptions = {} as const;

export type BulkCreatePlayersMutationFn = Apollo.MutationFunction<Types.BulkCreatePlayersMutation, Types.BulkCreatePlayersMutationVariables>;

/**
 * __useBulkCreatePlayersMutation__
 *
 * To run a mutation, you first call `useBulkCreatePlayersMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useBulkCreatePlayersMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [bulkCreatePlayersMutation, { data, loading, error }] = useBulkCreatePlayersMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
export function useBulkCreatePlayersMutation(baseOptions?: Apollo.MutationHookOptions<Types.BulkCreatePlayersMutation, Types.BulkCreatePlayersMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<Types.BulkCreatePlayersMutation, Types.BulkCreatePlayersMutationVariables>(Operations.BulkCreatePlayers, options);
      }
export type BulkCreatePlayersMutationHookResult = ReturnType<typeof useBulkCreatePlayersMutation>;
export type BulkCreatePlayersMutationResult = Apollo.MutationResult<Types.BulkCreatePlayersMutation>;
export type BulkCreatePlayersMutationOptions = Apollo.BaseMutationOptions<Types.BulkCreatePlayersMutation, Types.BulkCreatePlayersMutationVariables>;

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
 *      after: // value for 'after'
 *   },
 * });
 */
export function useGetAllPlayersQuery(baseOptions?: Apollo.QueryHookOptions<Types.GetAllPlayersQuery, Types.GetAllPlayersQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<Types.GetAllPlayersQuery, Types.GetAllPlayersQueryVariables>(Operations.GetAllPlayers, options);
      }
export function useGetAllPlayersLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<Types.GetAllPlayersQuery, Types.GetAllPlayersQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<Types.GetAllPlayersQuery, Types.GetAllPlayersQueryVariables>(Operations.GetAllPlayers, options);
        }
export function useGetAllPlayersSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<Types.GetAllPlayersQuery, Types.GetAllPlayersQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<Types.GetAllPlayersQuery, Types.GetAllPlayersQueryVariables>(Operations.GetAllPlayers, options);
        }
export type GetAllPlayersQueryHookResult = ReturnType<typeof useGetAllPlayersQuery>;
export type GetAllPlayersLazyQueryHookResult = ReturnType<typeof useGetAllPlayersLazyQuery>;
export type GetAllPlayersSuspenseQueryHookResult = ReturnType<typeof useGetAllPlayersSuspenseQuery>;
export type GetAllPlayersQueryResult = Apollo.QueryResult<Types.GetAllPlayersQuery, Types.GetAllPlayersQueryVariables>;