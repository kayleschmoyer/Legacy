import * as Types from '../graphql.generated';

import * as Operations from '../graphql.generated';
import * as Apollo from '@apollo/client';
const defaultOptions = {} as const;

export type BulkUpdateStatsMutationFn = Apollo.MutationFunction<Types.BulkUpdateStatsMutation, Types.BulkUpdateStatsMutationVariables>;

/**
 * __useBulkUpdateStatsMutation__
 *
 * To run a mutation, you first call `useBulkUpdateStatsMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useBulkUpdateStatsMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [bulkUpdateStatsMutation, { data, loading, error }] = useBulkUpdateStatsMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
export function useBulkUpdateStatsMutation(baseOptions?: Apollo.MutationHookOptions<Types.BulkUpdateStatsMutation, Types.BulkUpdateStatsMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<Types.BulkUpdateStatsMutation, Types.BulkUpdateStatsMutationVariables>(Operations.BulkUpdateStats, options);
      }
export type BulkUpdateStatsMutationHookResult = ReturnType<typeof useBulkUpdateStatsMutation>;
export type BulkUpdateStatsMutationResult = Apollo.MutationResult<Types.BulkUpdateStatsMutation>;
export type BulkUpdateStatsMutationOptions = Apollo.BaseMutationOptions<Types.BulkUpdateStatsMutation, Types.BulkUpdateStatsMutationVariables>;