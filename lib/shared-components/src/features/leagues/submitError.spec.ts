// The first four cases moved here verbatim from
// apps/web/src/pages/baseball/LeagueCreatePage.spec.tsx when the helper was
// extracted for mobile reuse (LS-8814) — their assertions are unchanged. The
// last two are new, covering an allowlisted code with an empty message and the
// INTERNAL_SERVER_ERROR exclusion that the mirroring in submitError.ts claims.

import { CombinedGraphQLErrors } from '@apollo/client';

import {
  getSubmitErrorMessage,
  isLeagueCapError,
  isPremiumRequiredError,
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

describe('isPremiumRequiredError (CLF-013)', () => {
  it('is true for a PremiumRequiredError (extensions.code PREMIUM_REQUIRED)', () => {
    const error = new CombinedGraphQLErrors({
      errors: [
        {
          message: 'Upgrade to Premium to create more than 1 league.',
          extensions: { code: 'PREMIUM_REQUIRED' },
        },
      ],
    });

    expect(isPremiumRequiredError(error)).toBe(true);
  });

  it('is false for a different allowlisted code, e.g. a plain validation error', () => {
    const error = new CombinedGraphQLErrors({
      errors: [
        {
          message: 'Draft date must be in the future.',
          extensions: { code: 'BAD_USER_INPUT' },
        },
      ],
    });

    expect(isPremiumRequiredError(error)).toBe(false);
  });

  it('is false for a plain non-GraphQL Error', () => {
    expect(isPremiumRequiredError(new Error('network error'))).toBe(false);
  });
});

// CLF-012 — distinguishes the free-tier 3-league cap from other
// PREMIUM_REQUIRED upsells so callers can offer a "delete a league" escape
// hatch only where it actually applies.
describe('isLeagueCapError (CLF-012)', () => {
  it('recognizes the free-tier league cap error', () => {
    const error = new CombinedGraphQLErrors({
      errors: [
        {
          message:
            'You have reached the 3-league limit for your current plan. Upgrade to unlock unlimited leagues, or delete an existing league to make room.',
          extensions: { code: 'PREMIUM_REQUIRED' },
        },
      ],
    });

    expect(isLeagueCapError(error)).toBe(true);
  });

  it('rejects a different PREMIUM_REQUIRED upsell', () => {
    const error = new CombinedGraphQLErrors({
      errors: [
        {
          message: 'Salary cap league settings require a premium subscription.',
          extensions: { code: 'PREMIUM_REQUIRED' },
        },
      ],
    });

    expect(isLeagueCapError(error)).toBe(false);
  });

  it('rejects a non-GraphQL error', () => {
    expect(isLeagueCapError(new Error('network error'))).toBe(false);
  });
});
