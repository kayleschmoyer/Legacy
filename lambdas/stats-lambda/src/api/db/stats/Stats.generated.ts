/* eslint-disable */
import * as Types from '../graphql.generated';

import * as Operations from '../graphql.generated';
import * as Apollo from '@apollo/client';
const defaultOptions = {} as const;

export type UpsertSeasonBattingMutationFn = Apollo.MutationFunction<Types.UpsertSeasonBattingMutation, Types.UpsertSeasonBattingMutationVariables>;

/**
 * __useUpsertSeasonBattingMutation__
 *
 * To run a mutation, you first call `useUpsertSeasonBattingMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUpsertSeasonBattingMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [upsertSeasonBattingMutation, { data, loading, error }] = useUpsertSeasonBattingMutation({
 *   variables: {
 *      input: // value for 'input'
 *      where: // value for 'where'
 *   },
 * });
 */
export function useUpsertSeasonBattingMutation(baseOptions?: Apollo.MutationHookOptions<Types.UpsertSeasonBattingMutation, Types.UpsertSeasonBattingMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<Types.UpsertSeasonBattingMutation, Types.UpsertSeasonBattingMutationVariables>(Operations.UpsertSeasonBatting, options);
      }
export type UpsertSeasonBattingMutationHookResult = ReturnType<typeof useUpsertSeasonBattingMutation>;
export type UpsertSeasonBattingMutationResult = Apollo.MutationResult<Types.UpsertSeasonBattingMutation>;
export type UpsertSeasonBattingMutationOptions = Apollo.BaseMutationOptions<Types.UpsertSeasonBattingMutation, Types.UpsertSeasonBattingMutationVariables>;
export type UpsertSeasonFieldingMutationFn = Apollo.MutationFunction<Types.UpsertSeasonFieldingMutation, Types.UpsertSeasonFieldingMutationVariables>;

/**
 * __useUpsertSeasonFieldingMutation__
 *
 * To run a mutation, you first call `useUpsertSeasonFieldingMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUpsertSeasonFieldingMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [upsertSeasonFieldingMutation, { data, loading, error }] = useUpsertSeasonFieldingMutation({
 *   variables: {
 *      input: // value for 'input'
 *      where: // value for 'where'
 *   },
 * });
 */
export function useUpsertSeasonFieldingMutation(baseOptions?: Apollo.MutationHookOptions<Types.UpsertSeasonFieldingMutation, Types.UpsertSeasonFieldingMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<Types.UpsertSeasonFieldingMutation, Types.UpsertSeasonFieldingMutationVariables>(Operations.UpsertSeasonFielding, options);
      }
export type UpsertSeasonFieldingMutationHookResult = ReturnType<typeof useUpsertSeasonFieldingMutation>;
export type UpsertSeasonFieldingMutationResult = Apollo.MutationResult<Types.UpsertSeasonFieldingMutation>;
export type UpsertSeasonFieldingMutationOptions = Apollo.BaseMutationOptions<Types.UpsertSeasonFieldingMutation, Types.UpsertSeasonFieldingMutationVariables>;
export type UpsertSeasonPitchingMutationFn = Apollo.MutationFunction<Types.UpsertSeasonPitchingMutation, Types.UpsertSeasonPitchingMutationVariables>;

/**
 * __useUpsertSeasonPitchingMutation__
 *
 * To run a mutation, you first call `useUpsertSeasonPitchingMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUpsertSeasonPitchingMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [upsertSeasonPitchingMutation, { data, loading, error }] = useUpsertSeasonPitchingMutation({
 *   variables: {
 *      input: // value for 'input'
 *      where: // value for 'where'
 *   },
 * });
 */
export function useUpsertSeasonPitchingMutation(baseOptions?: Apollo.MutationHookOptions<Types.UpsertSeasonPitchingMutation, Types.UpsertSeasonPitchingMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<Types.UpsertSeasonPitchingMutation, Types.UpsertSeasonPitchingMutationVariables>(Operations.UpsertSeasonPitching, options);
      }
export type UpsertSeasonPitchingMutationHookResult = ReturnType<typeof useUpsertSeasonPitchingMutation>;
export type UpsertSeasonPitchingMutationResult = Apollo.MutationResult<Types.UpsertSeasonPitchingMutation>;
export type UpsertSeasonPitchingMutationOptions = Apollo.BaseMutationOptions<Types.UpsertSeasonPitchingMutation, Types.UpsertSeasonPitchingMutationVariables>;