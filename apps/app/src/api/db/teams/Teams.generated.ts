/* eslint-disable */
import * as Types from '../graphql.generated';

import * as Operations from '../graphql.generated';
import * as Apollo from '@apollo/client';
const defaultOptions = {} as const;


/**
 * __useGetTeamByIdQuery__
 *
 * To run a query within a React component, call `useGetTeamByIdQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetTeamByIdQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetTeamByIdQuery({
 *   variables: {
 *      teamId: // value for 'teamId'
 *      withPositions: // value for 'withPositions'
 *   },
 * });
 */
export function useGetTeamByIdQuery(baseOptions: Apollo.QueryHookOptions<Types.GetTeamByIdQuery, Types.GetTeamByIdQueryVariables> & ({ variables: Types.GetTeamByIdQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<Types.GetTeamByIdQuery, Types.GetTeamByIdQueryVariables>(Operations.GetTeamById, options);
      }
export function useGetTeamByIdLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<Types.GetTeamByIdQuery, Types.GetTeamByIdQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<Types.GetTeamByIdQuery, Types.GetTeamByIdQueryVariables>(Operations.GetTeamById, options);
        }
export function useGetTeamByIdSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<Types.GetTeamByIdQuery, Types.GetTeamByIdQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<Types.GetTeamByIdQuery, Types.GetTeamByIdQueryVariables>(Operations.GetTeamById, options);
        }
export type GetTeamByIdQueryHookResult = ReturnType<typeof useGetTeamByIdQuery>;
export type GetTeamByIdLazyQueryHookResult = ReturnType<typeof useGetTeamByIdLazyQuery>;
export type GetTeamByIdSuspenseQueryHookResult = ReturnType<typeof useGetTeamByIdSuspenseQuery>;
export type GetTeamByIdQueryResult = Apollo.QueryResult<Types.GetTeamByIdQuery, Types.GetTeamByIdQueryVariables>;
export type UpdateTeamMemberPositionMutationFn = Apollo.MutationFunction<Types.UpdateTeamMemberPositionMutation, Types.UpdateTeamMemberPositionMutationVariables>;

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
export function useUpdateTeamMemberPositionMutation(baseOptions?: Apollo.MutationHookOptions<Types.UpdateTeamMemberPositionMutation, Types.UpdateTeamMemberPositionMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<Types.UpdateTeamMemberPositionMutation, Types.UpdateTeamMemberPositionMutationVariables>(Operations.UpdateTeamMemberPosition, options);
      }
export type UpdateTeamMemberPositionMutationHookResult = ReturnType<typeof useUpdateTeamMemberPositionMutation>;
export type UpdateTeamMemberPositionMutationResult = Apollo.MutationResult<Types.UpdateTeamMemberPositionMutation>;
export type UpdateTeamMemberPositionMutationOptions = Apollo.BaseMutationOptions<Types.UpdateTeamMemberPositionMutation, Types.UpdateTeamMemberPositionMutationVariables>;
