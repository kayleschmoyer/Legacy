import { joinErrorMessageFor } from './SeasonDraftJoin';

describe('joinErrorMessageFor', () => {
  function apolloErrorWithCode(code: string) {
    return {
      message: 'unrelated message',
      graphQLErrors: [{ extensions: { code } }],
    };
  }

  it('returns the started message when extensions.code === SEASON_DRAFT_GAME_ALREADY_STARTED', () => {
    expect(
      joinErrorMessageFor(
        apolloErrorWithCode('SEASON_DRAFT_GAME_ALREADY_STARTED'),
      ),
    ).toBe('This game has already started and is no longer accepting players.');
  });

  it('returns the full message when extensions.code === SEASON_DRAFT_GAME_FULL', () => {
    expect(
      joinErrorMessageFor(apolloErrorWithCode('SEASON_DRAFT_GAME_FULL')),
    ).toBe('This game is already full.');
  });

  it('returns the generic message when extensions.code is unknown', () => {
    expect(joinErrorMessageFor(apolloErrorWithCode('SOMETHING_ELSE'))).toBe(
      'Failed to join game. Please try again.',
    );
  });

  it('returns the generic message when graphQLErrors is missing (network error)', () => {
    expect(joinErrorMessageFor(new Error('network failed'))).toBe(
      'Failed to join game. Please try again.',
    );
  });

  it('does NOT inspect the error message string — even strings containing "already started" or "full" fall through to the generic message without a code', () => {
    expect(
      joinErrorMessageFor(new Error('This game has already started')),
    ).toBe('Failed to join game. Please try again.');
    expect(joinErrorMessageFor(new Error('This game is full'))).toBe(
      'Failed to join game. Please try again.',
    );
  });

  it('returns the generic message for non-object errors', () => {
    expect(joinErrorMessageFor(null)).toBe(
      'Failed to join game. Please try again.',
    );
    expect(joinErrorMessageFor(undefined)).toBe(
      'Failed to join game. Please try again.',
    );
    expect(joinErrorMessageFor('string error')).toBe(
      'Failed to join game. Please try again.',
    );
  });
});
