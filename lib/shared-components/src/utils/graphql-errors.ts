import { CombinedGraphQLErrors } from '@apollo/client';

/** True when `error` is a GraphQL error carrying the given `extensions.code`. */
export function hasErrorCode(error: unknown, code: string): boolean {
  return (
    CombinedGraphQLErrors.is(error) &&
    error.errors.some((e) => e.extensions?.['code'] === code)
  );
}
