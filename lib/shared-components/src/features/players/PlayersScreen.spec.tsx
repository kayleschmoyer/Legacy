import { fullName, initialsOf } from './PlayersScreen';
import type { PlayerFragment } from './PlayersApi';

// Unit tests for the pure helpers powering the Players Page editorial header
// + Featured spotlight (LS-4646). Helpers are exported so we can verify the
// fallback behaviour without mounting the full Tamagui shell — the same
// extract-and-test pattern used in PlayerStatsPage.spec.tsx (LS-4613).

function makePlayer(overrides: Partial<PlayerFragment> = {}): PlayerFragment {
  return {
    __typename: 'Player',
    id: 1,
    firstName: 'Babe',
    lastName: 'Ruth',
    brefId: 'ruthba01',
    statsLastFetchedAt: null,
    ...overrides,
  };
}

describe('initialsOf (LS-4646)', () => {
  it('returns uppercase first + last initials', () => {
    expect(initialsOf(makePlayer())).toBe('BR');
  });

  it('falls back to em-dash when both names are missing', () => {
    expect(initialsOf(makePlayer({ firstName: null, lastName: null }))).toBe(
      '—',
    );
  });

  it('handles a single-name player without crashing', () => {
    expect(
      initialsOf(makePlayer({ firstName: 'Ichiro', lastName: null })),
    ).toBe('I');
  });

  it('trims leading whitespace before taking the first character', () => {
    expect(
      initialsOf(makePlayer({ firstName: '  Hank', lastName: '  Aaron' })),
    ).toBe('HA');
  });
});

describe('fullName (LS-4646)', () => {
  it('joins first and last with a single space', () => {
    expect(fullName(makePlayer())).toBe('Babe Ruth');
  });

  it('returns an empty string when neither name is set', () => {
    expect(fullName(makePlayer({ firstName: null, lastName: null }))).toBe('');
  });

  it('omits missing parts without leaving stray whitespace', () => {
    expect(fullName(makePlayer({ firstName: 'Ichiro', lastName: null }))).toBe(
      'Ichiro',
    );
    expect(fullName(makePlayer({ firstName: null, lastName: 'Suzuki' }))).toBe(
      'Suzuki',
    );
  });
});
