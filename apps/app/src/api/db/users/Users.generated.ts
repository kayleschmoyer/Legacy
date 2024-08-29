import * as Types from '../graphql.generated';

import * as Operations from '../graphql.generated';
import * as Apollo from '@apollo/client';
const defaultOptions = {} as const;

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
export function useGetUserByEmailQuery(
  baseOptions: Apollo.QueryHookOptions<
    Types.GetUserByEmailQuery,
    Types.GetUserByEmailQueryVariables
  > &
    (
      | { variables: Types.GetUserByEmailQueryVariables; skip?: boolean }
      | { skip: boolean }
    ),
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useQuery<
    Types.GetUserByEmailQuery,
    Types.GetUserByEmailQueryVariables
  >(Operations.GetUserByEmail, options);
}
export function useGetUserByEmailLazyQuery(
  baseOptions?: Apollo.LazyQueryHookOptions<
    Types.GetUserByEmailQuery,
    Types.GetUserByEmailQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useLazyQuery<
    Types.GetUserByEmailQuery,
    Types.GetUserByEmailQueryVariables
  >(Operations.GetUserByEmail, options);
}
export function useGetUserByEmailSuspenseQuery(
  baseOptions?: Apollo.SuspenseQueryHookOptions<
    Types.GetUserByEmailQuery,
    Types.GetUserByEmailQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useSuspenseQuery<
    Types.GetUserByEmailQuery,
    Types.GetUserByEmailQueryVariables
  >(Operations.GetUserByEmail, options);
}
export type GetUserByEmailQueryHookResult = ReturnType<
  typeof useGetUserByEmailQuery
>;
export type GetUserByEmailLazyQueryHookResult = ReturnType<
  typeof useGetUserByEmailLazyQuery
>;
export type GetUserByEmailSuspenseQueryHookResult = ReturnType<
  typeof useGetUserByEmailSuspenseQuery
>;
export type GetUserByEmailQueryResult = Apollo.QueryResult<
  Types.GetUserByEmailQuery,
  Types.GetUserByEmailQueryVariables
>;

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
export function useGetUserByIdQuery(
  baseOptions: Apollo.QueryHookOptions<
    Types.GetUserByIdQuery,
    Types.GetUserByIdQueryVariables
  > &
    (
      | { variables: Types.GetUserByIdQueryVariables; skip?: boolean }
      | { skip: boolean }
    ),
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useQuery<
    Types.GetUserByIdQuery,
    Types.GetUserByIdQueryVariables
  >(Operations.GetUserById, options);
}
export function useGetUserByIdLazyQuery(
  baseOptions?: Apollo.LazyQueryHookOptions<
    Types.GetUserByIdQuery,
    Types.GetUserByIdQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useLazyQuery<
    Types.GetUserByIdQuery,
    Types.GetUserByIdQueryVariables
  >(Operations.GetUserById, options);
}
export function useGetUserByIdSuspenseQuery(
  baseOptions?: Apollo.SuspenseQueryHookOptions<
    Types.GetUserByIdQuery,
    Types.GetUserByIdQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useSuspenseQuery<
    Types.GetUserByIdQuery,
    Types.GetUserByIdQueryVariables
  >(Operations.GetUserById, options);
}
export type GetUserByIdQueryHookResult = ReturnType<typeof useGetUserByIdQuery>;
export type GetUserByIdLazyQueryHookResult = ReturnType<
  typeof useGetUserByIdLazyQuery
>;
export type GetUserByIdSuspenseQueryHookResult = ReturnType<
  typeof useGetUserByIdSuspenseQuery
>;
export type GetUserByIdQueryResult = Apollo.QueryResult<
  Types.GetUserByIdQuery,
  Types.GetUserByIdQueryVariables
>;
export type CreateUserMutationFn = Apollo.MutationFunction<
  Types.CreateUserMutation,
  Types.CreateUserMutationVariables
>;

/**
 * __useCreateUserMutation__
 *
 * To run a mutation, you first call `useCreateUserMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useCreateUserMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [createUserMutation, { data, loading, error }] = useCreateUserMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
export function useCreateUserMutation(
  baseOptions?: Apollo.MutationHookOptions<
    Types.CreateUserMutation,
    Types.CreateUserMutationVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useMutation<
    Types.CreateUserMutation,
    Types.CreateUserMutationVariables
  >(Operations.CreateUser, options);
}
export type CreateUserMutationHookResult = ReturnType<
  typeof useCreateUserMutation
>;
export type CreateUserMutationResult =
  Apollo.MutationResult<Types.CreateUserMutation>;
export type CreateUserMutationOptions = Apollo.BaseMutationOptions<
  Types.CreateUserMutation,
  Types.CreateUserMutationVariables
>;
