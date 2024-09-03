/* eslint-disable */
import * as Types from '../graphql.generated';

import * as Operations from '../graphql.generated';
import * as Apollo from '@apollo/client';
const defaultOptions = {} as const;


/**
 * __useGetMessagesForLeagueQuery__
 *
 * To run a query within a React component, call `useGetMessagesForLeagueQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetMessagesForLeagueQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetMessagesForLeagueQuery({
 *   variables: {
 *      orderBy: // value for 'orderBy'
 *      condition: // value for 'condition'
 *   },
 * });
 */
export function useGetMessagesForLeagueQuery(baseOptions: Apollo.QueryHookOptions<Types.GetMessagesForLeagueQuery, Types.GetMessagesForLeagueQueryVariables> & ({ variables: Types.GetMessagesForLeagueQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<Types.GetMessagesForLeagueQuery, Types.GetMessagesForLeagueQueryVariables>(Operations.GetMessagesForLeague, options);
      }
export function useGetMessagesForLeagueLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<Types.GetMessagesForLeagueQuery, Types.GetMessagesForLeagueQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<Types.GetMessagesForLeagueQuery, Types.GetMessagesForLeagueQueryVariables>(Operations.GetMessagesForLeague, options);
        }
export function useGetMessagesForLeagueSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<Types.GetMessagesForLeagueQuery, Types.GetMessagesForLeagueQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<Types.GetMessagesForLeagueQuery, Types.GetMessagesForLeagueQueryVariables>(Operations.GetMessagesForLeague, options);
        }
export type GetMessagesForLeagueQueryHookResult = ReturnType<typeof useGetMessagesForLeagueQuery>;
export type GetMessagesForLeagueLazyQueryHookResult = ReturnType<typeof useGetMessagesForLeagueLazyQuery>;
export type GetMessagesForLeagueSuspenseQueryHookResult = ReturnType<typeof useGetMessagesForLeagueSuspenseQuery>;
export type GetMessagesForLeagueQueryResult = Apollo.QueryResult<Types.GetMessagesForLeagueQuery, Types.GetMessagesForLeagueQueryVariables>;
export type SendLeagueMessageMutationFn = Apollo.MutationFunction<Types.SendLeagueMessageMutation, Types.SendLeagueMessageMutationVariables>;

/**
 * __useSendLeagueMessageMutation__
 *
 * To run a mutation, you first call `useSendLeagueMessageMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useSendLeagueMessageMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [sendLeagueMessageMutation, { data, loading, error }] = useSendLeagueMessageMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
export function useSendLeagueMessageMutation(baseOptions?: Apollo.MutationHookOptions<Types.SendLeagueMessageMutation, Types.SendLeagueMessageMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<Types.SendLeagueMessageMutation, Types.SendLeagueMessageMutationVariables>(Operations.SendLeagueMessage, options);
      }
export type SendLeagueMessageMutationHookResult = ReturnType<typeof useSendLeagueMessageMutation>;
export type SendLeagueMessageMutationResult = Apollo.MutationResult<Types.SendLeagueMessageMutation>;
export type SendLeagueMessageMutationOptions = Apollo.BaseMutationOptions<Types.SendLeagueMessageMutation, Types.SendLeagueMessageMutationVariables>;