/**
 * FootballPlayersComparePage — LS-6460 (FPL-035) side-by-side comparison.
 *
 * Covers the page's client-side logic:
 *   1. Search-param parsing — `a`/`b` drive the two parallel useFootballPlayerQuery
 *      calls (valid ids fire with skip=false; missing/invalid ids skip the query).
 *   2. Render states — loading spinner, error banner, "player not found", and the
 *      empty "select two players" prompt.
 *   3. Stat-row filtering — only categories where at least one player has a value
 *      are rendered; rows both players lack are hidden.
 *   4. Back navigation — in-app history vs cold-start deep-link fallback.
 *   5. Premium gate — LS-6462 (FPL-037): PremiumGate wraps the table; free users
 *      see the gate overlay, premium users see the full table.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useFootballPlayerQuery } from '@legacy-sports/graphql';
import { FootballPlayersComparePage } from './FootballPlayersComparePage';
import { useHasEntitlement } from '../../hooks/useIsPremium';

// ── Mocks ──────────────────────────────────────────────────────────────────

jest.mock('react-router-dom', () => ({
  useNavigate: jest.fn(),
  useSearchParams: jest.fn(),
}));
jest.mock('../../components/PageMeta', () => ({ PageMeta: () => null }));
jest.mock('@tamagui/lucide-icons', () => ({
  ArrowLeft: () => null,
  Lock: () => null,
}));
jest.mock('@legacy-sports/graphql', () => ({
  useFootballPlayerQuery: jest.fn(),
}));
jest.mock('../../hooks/useIsPremium', () => ({
  useHasEntitlement: jest.fn(() => true),
}));
jest.mock('../../components/PremiumGate', () => ({
  PremiumGate: ({
    isPremium,
    children,
  }: {
    isPremium: boolean;
    children: React.ReactNode;
  }) => (
    <div>
      {!isPremium && <div data-testid="premium-feature-gate" />}
      {children}
    </div>
  ),
}));
jest.mock('tamagui', () => {
  // Stand-in for every layout/text primitive the page renders. JSX uses the
  // automatic runtime, so this factory references no out-of-scope variables.
  const Box = ({
    children,
    onPress,
  }: {
    children?: React.ReactNode;
    onPress?: () => void;
  }) => <div onClick={onPress}>{children}</div>;
  return {
    Text: Box,
    XStack: Box,
    YStack: Box,
    Button: Box,
    Spinner: () => <span data-testid="spinner" />,
  };
});

const mockUseNavigate = useNavigate as jest.MockedFunction<typeof useNavigate>;
const mockUseSearchParams = useSearchParams as jest.MockedFunction<
  typeof useSearchParams
>;
const mockUseFootballPlayerQuery =
  useFootballPlayerQuery as jest.MockedFunction<typeof useFootballPlayerQuery>;
const mockUseHasEntitlement = useHasEntitlement as jest.MockedFunction<
  typeof useHasEntitlement
>;
const mockNavigate = jest.fn();

// ── Helpers ────────────────────────────────────────────────────────────────

function setSearchParams(query: string): void {
  mockUseSearchParams.mockReturnValue([
    new URLSearchParams(query),
    jest.fn(),
  ] as ReturnType<typeof useSearchParams>);
}

type QueryResult = ReturnType<typeof useFootballPlayerQuery>;

function idleResult(): QueryResult {
  return { data: undefined, loading: false, error: undefined } as QueryResult;
}

const PLAYER_A = {
  id: 42,
  firstName: 'Patrick',
  lastName: 'Mahomes',
  position: 'QB',
  nflTeam: 'KC',
  isDst: false,
  careerStats: {
    passing: { yds: 5000, td: 40, int: 10, rating: 105.2 },
    rushing: { yds: 300, td: 3 },
  },
};

const PLAYER_B = {
  id: 7,
  firstName: 'Josh',
  lastName: 'Allen',
  position: 'QB',
  nflTeam: 'BUF',
  isDst: false,
  careerStats: {
    passing: { yds: 4000, td: 30, int: 15, rating: 95.1 },
  },
};

/** Routes each useFootballPlayerQuery call to a result keyed by the id arg, so
 *  the two parallel hooks return their respective players. */
function mockQueryByPlayer(
  byId: Record<number, QueryResult>,
  fallback: QueryResult = idleResult(),
): void {
  mockUseFootballPlayerQuery.mockImplementation(
    (opts) => byId[opts?.variables?.id ?? -1] ?? fallback,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseNavigate.mockReturnValue(mockNavigate);
  mockUseFootballPlayerQuery.mockReturnValue(idleResult());
  setSearchParams('a=42&b=7');
});

// ── Search-param parsing ─────────────────────────────────────────────────────

describe('FootballPlayersComparePage — search-param parsing', () => {
  it('fires both queries with the parsed ids when a and b are valid', () => {
    setSearchParams('a=42&b=7');
    render(<FootballPlayersComparePage />);

    const calls = mockUseFootballPlayerQuery.mock.calls.map((c) => c[0]);
    expect(calls).toContainEqual(
      expect.objectContaining({ variables: { id: 42 }, skip: false }),
    );
    expect(calls).toContainEqual(
      expect.objectContaining({ variables: { id: 7 }, skip: false }),
    );
  });

  it('skips both queries and prompts to select when ids are missing', () => {
    setSearchParams('');
    render(<FootballPlayersComparePage />);

    const calls = mockUseFootballPlayerQuery.mock.calls.map((c) => c[0]);
    expect(calls.every((c) => c?.skip === true)).toBe(true);
    expect(screen.getByText('Select two players to compare')).toBeTruthy();
  });

  it('skips the query for a non-numeric or zero id', () => {
    setSearchParams('a=abc&b=0');
    render(<FootballPlayersComparePage />);

    const calls = mockUseFootballPlayerQuery.mock.calls.map((c) => c[0]);
    expect(calls.every((c) => c?.skip === true)).toBe(true);
    expect(screen.getByText('Select two players to compare')).toBeTruthy();
  });
});

// ── Render states ────────────────────────────────────────────────────────────

describe('FootballPlayersComparePage — render states', () => {
  it('shows a spinner while either query is loading', () => {
    mockQueryByPlayer({
      42: { data: undefined, loading: true, error: undefined } as QueryResult,
      7: { data: { footballPlayer: PLAYER_B }, loading: false } as QueryResult,
    });
    render(<FootballPlayersComparePage />);

    expect(screen.getByTestId('spinner')).toBeTruthy();
  });

  it('shows the error banner when a query errors', () => {
    mockQueryByPlayer({
      42: {
        data: undefined,
        loading: false,
        error: new Error('boom'),
      } as unknown as QueryResult,
      7: { data: { footballPlayer: PLAYER_B }, loading: false } as QueryResult,
    });
    render(<FootballPlayersComparePage />);

    expect(
      screen.getByText('Failed to load players. Please try again.'),
    ).toBeTruthy();
  });

  it('shows "Player not found" when a player resolves to null', () => {
    mockQueryByPlayer({
      42: { data: { footballPlayer: null }, loading: false } as QueryResult,
      7: { data: { footballPlayer: PLAYER_B }, loading: false } as QueryResult,
    });
    render(<FootballPlayersComparePage />);

    expect(screen.getByText('Player not found')).toBeTruthy();
  });
});

// ── Stat-row filtering ───────────────────────────────────────────────────────

describe('FootballPlayersComparePage — stat-row filtering', () => {
  beforeEach(() => {
    mockQueryByPlayer({
      42: { data: { footballPlayer: PLAYER_A }, loading: false } as QueryResult,
      7: { data: { footballPlayer: PLAYER_B }, loading: false } as QueryResult,
    });
  });

  it('renders both player names and their shared stat rows', () => {
    render(<FootballPlayersComparePage />);

    expect(screen.getByText('Patrick Mahomes')).toBeTruthy();
    expect(screen.getByText('Josh Allen')).toBeTruthy();
    // Both have passing — the row and both values render.
    expect(screen.getByText('Pass YDS')).toBeTruthy();
    expect(screen.getByText('5,000')).toBeTruthy();
    expect(screen.getByText('4,000')).toBeTruthy();
  });

  it('keeps a row where only one player has the stat', () => {
    render(<FootballPlayersComparePage />);
    // Only Mahomes has rushing — row stays, with an em-dash for Allen.
    expect(screen.getByText('Rush YDS')).toBeTruthy();
    expect(screen.getByText('300')).toBeTruthy();
  });

  it('hides rows where neither player has the stat', () => {
    render(<FootballPlayersComparePage />);
    // Neither QB has kicking/defense stats.
    expect(screen.queryByText('FG Made')).toBeNull();
    expect(screen.queryByText('Sacks')).toBeNull();
  });
});

// ── Back navigation ──────────────────────────────────────────────────────────

describe('FootballPlayersComparePage — back navigation', () => {
  const realHistoryLength = window.history.length;

  function setHistoryLength(length: number): void {
    Object.defineProperty(window.history, 'length', {
      configurable: true,
      value: length,
    });
  }

  afterEach(() => setHistoryLength(realHistoryLength));

  it('navigates back in-app when history exists', () => {
    setHistoryLength(3);
    render(<FootballPlayersComparePage />);

    fireEvent.click(screen.getByText('Back to players'));

    expect(mockNavigate).toHaveBeenCalledWith(-1);
  });

  it('falls back to the players list on a cold-start deep link', () => {
    setHistoryLength(1);
    render(<FootballPlayersComparePage />);

    fireEvent.click(screen.getByText('Back to players'));

    expect(mockNavigate).toHaveBeenCalledWith('/football/players');
  });
});

// ── Premium gate (LS-6462 / FPL-037) ────────────────────────────────────────

describe('FootballPlayersComparePage — premium gate', () => {
  function setupBothPlayers() {
    mockQueryByPlayer({
      42: { data: { footballPlayer: PLAYER_A }, loading: false } as QueryResult,
      7: { data: { footballPlayer: PLAYER_B }, loading: false } as QueryResult,
    });
  }

  it('shows the gate overlay for free users when both players are loaded', () => {
    mockUseHasEntitlement.mockReturnValue(false);
    setupBothPlayers();
    render(<FootballPlayersComparePage />);

    expect(screen.getByTestId('premium-feature-gate')).toBeTruthy();
  });

  it('does not show the gate overlay for premium users', () => {
    mockUseHasEntitlement.mockReturnValue(true);
    setupBothPlayers();
    render(<FootballPlayersComparePage />);

    expect(screen.queryByTestId('premium-feature-gate')).toBeNull();
  });

  it('calls useHasEntitlement with the player_comparison entitlement key', () => {
    setupBothPlayers();
    render(<FootballPlayersComparePage />);

    expect(mockUseHasEntitlement).toHaveBeenCalledWith('player_comparison');
  });
});
