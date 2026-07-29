// The first four cases moved here verbatim from
// apps/web/src/pages/baseball/LeagueCreatePage.spec.tsx when the helper was
// extracted for mobile reuse (LS-8814) — their assertions are unchanged. The
// last two are new, covering an allowlisted code with an empty message and the
// INTERNAL_SERVER_ERROR exclusion that the mirroring in submitError.ts claims.

import { CombinedGraphQLErrors } from '@apollo/client';

import {
  getSubmitErrorMessage,
  LEAGUE_SUBMIT_ERROR_FALLBACK,
  SAFE_TO_DISPLAY_CODES,
} from './submitError';

describe('getSubmitErrorMessage (LS-6069)', () => {
  it('does not leak a raw internal-server GraphQL error message', () => {
    const error = new CombinedGraphQLErrors({
      errors: [
        {
          message: 'GraphQLError: Foo bar quux',
          extensions: { code: 'INTERNAL_SERVER_ERROR' },
        },
      ],
    });

    expect(getSubmitErrorMessage(error)).toBe(
      'Unable to save league. Your settings are still filled in — try again or come back later.',
    );
  });

  it('does not leak a raw message with no recognized error code', () => {
    const error = new CombinedGraphQLErrors({
      errors: [{ message: 'relation "leagues" does not exist' }],
    });

    expect(getSubmitErrorMessage(error)).toBe(
      'Unable to save league. Your settings are still filled in — try again or come back later.',
    );
  });

  it('shows the server message for a client-facing error code', () => {
    const error = new CombinedGraphQLErrors({
      errors: [
        {
          message: 'You already have a league with that name.',
          extensions: { code: 'BAD_USER_INPUT' },
        },
      ],
    });

    expect(getSubmitErrorMessage(error)).toBe(
      'You already have a league with that name.',
    );
  });

  it('falls back to the generic message for a plain non-GraphQL Error', () => {
    expect(
      getSubmitErrorMessage(new Error('TypeError: fetch is not a function')),
    ).toBe(
      'Unable to save league. Your settings are still filled in — try again or come back later.',
    );
  });

  it('falls back when an allowlisted code carries an empty message', () => {
    const error = new CombinedGraphQLErrors({
      errors: [{ message: '', extensions: { code: 'BAD_USER_INPUT' } }],
    });

    expect(getSubmitErrorMessage(error)).toBe(LEAGUE_SUBMIT_ERROR_FALLBACK);
  });

  it('does not allowlist the server’s INTERNAL_SERVER_ERROR fallback code', () => {
    expect(SAFE_TO_DISPLAY_CODES.has('INTERNAL_SERVER_ERROR')).toBe(false);
  });
});
