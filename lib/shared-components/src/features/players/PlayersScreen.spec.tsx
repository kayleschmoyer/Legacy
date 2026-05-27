import {
  activeFilterChips,
  buildViewSearch,
  deriveShellState,
  fullName,
  initialsOf,
  parseViewParam,
} from './PlayersScreen';
import { rankLabel } from './PlayerListRow';
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

describe('deriveShellState (LS-4656)', () => {
  it('returns loading while the peek query is in flight with no data', () => {
    expect(
      deriveShellState({
        loading: true,
        error: false,
        playerCount: 0,
        hasActiveFilters: false,
      }),
    ).toBe('loading');
  });

  it('returns error when the peek query failed with no usable data', () => {
    expect(
      deriveShellState({
        loading: false,
        error: true,
        playerCount: 0,
        hasActiveFilters: false,
      }),
    ).toBe('error');
  });

  it('returns empty when the archive came back clean but filters narrowed it to zero', () => {
    expect(
      deriveShellState({
        loading: false,
        error: false,
        playerCount: 0,
        hasActiveFilters: true,
      }),
    ).toBe('empty');
  });

  it('does NOT return empty when no filters are active — defers to the populated layout', () => {
    expect(
      deriveShellState({
        loading: false,
        error: false,
        playerCount: 0,
        hasActiveFilters: false,
      }),
    ).toBeUndefined();
  });

  it('returns undefined (populated) when data has arrived', () => {
    expect(
      deriveShellState({
        loading: false,
        error: false,
        playerCount: 50,
        hasActiveFilters: false,
      }),
    ).toBeUndefined();
  });

  it('prefers populated state over loading when partial data is already available', () => {
    // Avoids flashing a skeleton during background refetches when the user
    // already has a populated grid in front of them.
    expect(
      deriveShellState({
        loading: true,
        error: false,
        playerCount: 12,
        hasActiveFilters: false,
      }),
    ).toBeUndefined();
  });

  it('prefers populated state over error when partial data is usable', () => {
    expect(
      deriveShellState({
        loading: false,
        error: true,
        playerCount: 12,
        hasActiveFilters: false,
      }),
    ).toBeUndefined();
  });
});

describe('activeFilterChips (LS-4649)', () => {
  it('returns an empty list when nothing is filtered', () => {
    expect(
      activeFilterChips({
        searchTerm: '',
        era: 'all',
        pos: 'all',
        avail: 'all',
      }),
    ).toEqual([]);
  });

  it('treats a whitespace-only search term as empty', () => {
    expect(
      activeFilterChips({
        searchTerm: '   ',
        era: 'all',
        pos: 'all',
        avail: 'all',
      }),
    ).toEqual([]);
  });

  it('emits a quoted chip for an active search term, trimmed', () => {
    const chips = activeFilterChips({
      searchTerm: '  Ruth  ',
      era: 'all',
      pos: 'all',
      avail: 'all',
    });
    expect(chips).toEqual([{ key: 'q', label: '"Ruth"' }]);
  });

  it('maps each filter to its human-readable label', () => {
    const chips = activeFilterChips({
      searchTerm: 'Ichiro',
      era: 'live',
      pos: 'outfield',
      avail: 'free',
    });
    expect(chips).toEqual([
      { key: 'q', label: '"Ichiro"' },
      { key: 'era', label: 'Live Ball' },
      { key: 'pos', label: 'OF' },
      { key: 'avail', label: 'Free Agents' },
    ]);
  });
});

describe('parseViewParam (LS-4650)', () => {
  it('defaults to "cards" when the search string is empty', () => {
    expect(parseViewParam('')).toBe('cards');
    expect(parseViewParam(null)).toBe('cards');
    expect(parseViewParam(undefined)).toBe('cards');
  });

  it('extracts a recognised view from a leading-? search string', () => {
    expect(parseViewParam('?view=list')).toBe('list');
    expect(parseViewParam('?view=cards')).toBe('cards');
    expect(parseViewParam('?view=stats')).toBe('stats');
  });

  it('extracts a recognised view from a paramless search string', () => {
    expect(parseViewParam('view=list')).toBe('list');
    expect(parseViewParam('foo=bar&view=list')).toBe('list');
  });

  it('falls back to "cards" for unknown views', () => {
    expect(parseViewParam('?view=grid')).toBe('cards');
    expect(parseViewParam('?view=')).toBe('cards');
    expect(parseViewParam('?view=LIST')).toBe('cards');
  });

  it('honors the explicit fallback override when no view is set', () => {
    expect(parseViewParam('', 'list')).toBe('list');
    expect(parseViewParam('?other=1', 'stats')).toBe('stats');
  });
});

describe('buildViewSearch (LS-4650)', () => {
  it('drops the view param when the default "cards" is selected', () => {
    expect(buildViewSearch('?view=list', 'cards')).toBe('');
    expect(buildViewSearch('', 'cards')).toBe('');
  });

  it('writes the param when a non-default view is selected', () => {
    expect(buildViewSearch('', 'list')).toBe('?view=list');
    expect(buildViewSearch('?view=cards', 'stats')).toBe('?view=stats');
  });

  it('preserves unrelated params alongside the view update', () => {
    expect(buildViewSearch('?sort=name&view=cards', 'list')).toBe(
      '?sort=name&view=list',
    );
    expect(buildViewSearch('?sort=name', 'list')).toBe('?sort=name&view=list');
    expect(buildViewSearch('?sort=name&view=list', 'cards')).toBe('?sort=name');
  });
});

describe('rankLabel (LS-4650)', () => {
  it('zero-pads the human-readable rank derived from the 0-based index', () => {
    expect(rankLabel(0)).toBe('01');
    expect(rankLabel(8)).toBe('09');
    expect(rankLabel(9)).toBe('10');
    expect(rankLabel(99)).toBe('100');
  });
});
