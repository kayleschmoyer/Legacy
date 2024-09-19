/* eslint-disable */
import * as Types from '../graphql.generated';

import * as Operations from '../graphql.generated';
import * as Apollo from '@apollo/client';
const defaultOptions = {} as const;


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
export function useGetLeagueByIdQuery(baseOptions: Apollo.QueryHookOptions<Types.GetLeagueByIdQuery, Types.GetLeagueByIdQueryVariables> & ({ variables: Types.GetLeagueByIdQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<Types.GetLeagueByIdQuery, Types.GetLeagueByIdQueryVariables>(Operations.GetLeagueById, options);
      }
export function useGetLeagueByIdLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<Types.GetLeagueByIdQuery, Types.GetLeagueByIdQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<Types.GetLeagueByIdQuery, Types.GetLeagueByIdQueryVariables>(Operations.GetLeagueById, options);
        }
export function useGetLeagueByIdSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<Types.GetLeagueByIdQuery, Types.GetLeagueByIdQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<Types.GetLeagueByIdQuery, Types.GetLeagueByIdQueryVariables>(Operations.GetLeagueById, options);
        }
export type GetLeagueByIdQueryHookResult = ReturnType<typeof useGetLeagueByIdQuery>;
export type GetLeagueByIdLazyQueryHookResult = ReturnType<typeof useGetLeagueByIdLazyQuery>;
export type GetLeagueByIdSuspenseQueryHookResult = ReturnType<typeof useGetLeagueByIdSuspenseQuery>;
export type GetLeagueByIdQueryResult = Apollo.QueryResult<Types.GetLeagueByIdQuery, Types.GetLeagueByIdQueryVariables>;
export type CreateLeagueMutationFn = Apollo.MutationFunction<Types.CreateLeagueMutation, Types.CreateLeagueMutationVariables>;

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
export function useCreateLeagueMutation(baseOptions?: Apollo.MutationHookOptions<Types.CreateLeagueMutation, Types.CreateLeagueMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<Types.CreateLeagueMutation, Types.CreateLeagueMutationVariables>(Operations.CreateLeague, options);
      }
export type CreateLeagueMutationHookResult = ReturnType<typeof useCreateLeagueMutation>;
export type CreateLeagueMutationResult = Apollo.MutationResult<Types.CreateLeagueMutation>;
export type CreateLeagueMutationOptions = Apollo.BaseMutationOptions<Types.CreateLeagueMutation, Types.CreateLeagueMutationVariables>;

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
export function useGetPositionsForLeagueQuery(baseOptions: Apollo.QueryHookOptions<Types.GetPositionsForLeagueQuery, Types.GetPositionsForLeagueQueryVariables> & ({ variables: Types.GetPositionsForLeagueQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<Types.GetPositionsForLeagueQuery, Types.GetPositionsForLeagueQueryVariables>(Operations.GetPositionsForLeague, options);
      }
export function useGetPositionsForLeagueLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<Types.GetPositionsForLeagueQuery, Types.GetPositionsForLeagueQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<Types.GetPositionsForLeagueQuery, Types.GetPositionsForLeagueQueryVariables>(Operations.GetPositionsForLeague, options);
        }
export function useGetPositionsForLeagueSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<Types.GetPositionsForLeagueQuery, Types.GetPositionsForLeagueQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<Types.GetPositionsForLeagueQuery, Types.GetPositionsForLeagueQueryVariables>(Operations.GetPositionsForLeague, options);
        }
export type GetPositionsForLeagueQueryHookResult = ReturnType<typeof useGetPositionsForLeagueQuery>;
export type GetPositionsForLeagueLazyQueryHookResult = ReturnType<typeof useGetPositionsForLeagueLazyQuery>;
export type GetPositionsForLeagueSuspenseQueryHookResult = ReturnType<typeof useGetPositionsForLeagueSuspenseQuery>;
export type GetPositionsForLeagueQueryResult = Apollo.QueryResult<Types.GetPositionsForLeagueQuery, Types.GetPositionsForLeagueQueryVariables>;