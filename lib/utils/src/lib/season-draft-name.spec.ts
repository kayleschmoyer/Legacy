import {
  getSeasonDraftNameError,
  SEASON_DRAFT_NAME_MAX_LENGTH,
} from './season-draft-name';

describe('getSeasonDraftNameError (LS-10675)', () => {
  it('accepts a normal name', () => {
    expect(getSeasonDraftNameError('HR Challenge 2025')).toBeNull();
  });

  it('accepts a name exactly at the max length', () => {
    expect(
      getSeasonDraftNameError('A'.repeat(SEASON_DRAFT_NAME_MAX_LENGTH)),
    ).toBeNull();
  });

  it('measures the trimmed value, ignoring surrounding whitespace', () => {
    expect(
      getSeasonDraftNameError(
        `  ${'A'.repeat(SEASON_DRAFT_NAME_MAX_LENGTH)}  `,
      ),
    ).toBeNull();
  });

  it.each(['', '   '])('rejects a blank name (%j)', (name) => {
    expect(getSeasonDraftNameError(name)).toBe('Please enter a game name.');
  });

  it('rejects a name one character over the max', () => {
    expect(
      getSeasonDraftNameError('A'.repeat(SEASON_DRAFT_NAME_MAX_LENGTH + 1)),
    ).toBe(
      `Game name must be ${SEASON_DRAFT_NAME_MAX_LENGTH} characters or fewer.`,
    );
  });

  it('stays under the season_draft_games.name varchar(255) column', () => {
    expect(SEASON_DRAFT_NAME_MAX_LENGTH).toBeLessThanOrEqual(255);
  });
});
