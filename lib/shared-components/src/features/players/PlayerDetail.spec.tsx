/**
 * Regression coverage for PlayerDetailById (LS-8824).
 *
 * Before this ticket the component resolved players from a hardcoded two-entry
 * array (Babe Ruth = 1, Ty Cobb = 2), so every real players.id opened
 * "Player not found" on mobile. These tests pin the API-backed contract: a real
 * id renders real data, "Player not found" appears only when the API genuinely
 * returns no player, and the loading / error states come from the query.
 */
import React from 'react';
import { PlayerDetailById, toPlayerDetailData } from './PlayerDetail';
import { render, screen } from '../../test-utils';

// ── Mocks ────────────────────────────────────────────────────────────────────

interface MockQueryResult {
  data?: unknown;
  loading: boolean;
  error?: { message: string };
}

let mockQueryResult: MockQueryResult = { loading: false };
let mockQueryOptions: { variables?: { playerId: number }; skip?: boolean } = {};

jest.mock('@legacy-sports/graphql', () => ({
  useGetPlayerDetailByIdQuery: (options: {
    variables?: { playerId: number };
    skip?: boolean;
  }) => {
    mockQueryOptions = options;
    return mockQueryResult;
  },
}));

interface MockBoxProps {
  children?: React.ReactNode;
  testID?: string;
}

jest.mock('tamagui', () => {
  const Box = ({ children, testID }: MockBoxProps) => (
    <div data-testid={testID}>{children}</div>
  );
  const Txt = ({ children, testID }: MockBoxProps) => (
    <span data-testid={testID}>{children}</span>
  );
  return {
    ScrollView: Box,
    YStack: Box,
    XStack: Box,
    Text: Txt,
    Spinner: () => <div data-testid="spinner" />,
  };
});

// ── Fixtures ─────────────────────────────────────────────────────────────────

/** A real players.id — deliberately outside the old mock array's 1..2 range. */
const RUTH_ID = 8_824;

const batterResponse = {
  player: {
    id: RUTH_ID,
    firstName: 'Babe',
    lastName: 'Ruth',
    eligiblePositions: ['OF'],
    mlbTeam: null,
    careerBatting: {
      primaryPosition: 'RF',
      battingAverage: 0.342,
      homeRuns: 714,
      rbi: 2214,
      runs: 2174,
      hits: 2873,
      onBasePercentage: 0.474,
      sluggingPercentage: 0.69,
    },
    careerPitching: null,
  },
  playerSeasonBatting: [
    { season: 1919, team: 'BOS' },
    { season: 1932, team: 'NYY' },
    { season: 1927, team: 'NYY' },
  ],
  playerSeasonPitching: [],
};

const pitcherResponse = {
  player: {
    id: 4_242,
    firstName: 'Sandy',
    lastName: 'Koufax',
    eligiblePositions: ['SP'],
    mlbTeam: null,
    careerBatting: null,
    // `CareerPitching.era` is a String in the schema — PlayerDetail formats it
    // with toFixed(2), so the mapper has to parse it.
    careerPitching: {
      primaryPosition: 'P',
      era: '2.76',
      wins: 165,
      losses: 87,
      saves: 9,
    },
  },
  playerSeasonBatting: [],
  playerSeasonPitching: [{ season: 1966, team: 'LAD' }],
};

beforeEach(() => {
  mockQueryResult = { loading: false };
  mockQueryOptions = {};
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('PlayerDetailById — API-backed lookup', () => {
  it('queries the API with the requested players.id', () => {
    mockQueryResult = { data: batterResponse, loading: false };
    render(<PlayerDetailById playerId={RUTH_ID} />);

    expect(mockQueryOptions.variables).toEqual({ playerId: RUTH_ID });
    expect(mockQueryOptions.skip).toBe(false);
  });

  it('renders real player data for an id outside the removed mock array', () => {
    mockQueryResult = { data: batterResponse, loading: false };
    render(<PlayerDetailById playerId={RUTH_ID} />);

    expect(screen.getByText('Babe Ruth')).toBeTruthy();
    expect(screen.getByText('RF')).toBeTruthy();
    // Most recent season wins, regardless of payload ordering.
    expect(screen.getByText('NYY')).toBeTruthy();
    expect(screen.getByText('0.342')).toBeTruthy();
    expect(screen.getByText('714')).toBeTruthy();
    expect(screen.getByText('2873')).toBeTruthy();
    expect(screen.queryByText('Player not found')).toBeNull();
  });

  it('parses the string career ERA and hides the empty batting section for a pitcher', () => {
    mockQueryResult = { data: pitcherResponse, loading: false };
    render(<PlayerDetailById playerId={4_242} />);

    expect(screen.getByText('Sandy Koufax')).toBeTruthy();
    expect(screen.getByText('LAD')).toBeTruthy();
    expect(screen.getByText('2.76')).toBeTruthy();
    expect(screen.getByText('165')).toBeTruthy();
    expect(screen.getByText('Pitching Statistics')).toBeTruthy();
    expect(screen.queryByText('Batting Statistics')).toBeNull();
  });
});

describe('PlayerDetailById — not-found, loading and error states', () => {
  it('renders "Player not found" when the API genuinely returns no player', () => {
    mockQueryResult = {
      data: {
        player: null,
        playerSeasonBatting: [],
        playerSeasonPitching: [],
      },
      loading: false,
    };
    render(<PlayerDetailById playerId={999_999} />);

    expect(screen.getByText('Player not found')).toBeTruthy();
  });

  it('renders the loading state while the query is in flight', () => {
    mockQueryResult = { loading: true };
    render(<PlayerDetailById playerId={RUTH_ID} initialName="Babe Ruth" />);

    expect(screen.getByText('Loading player details…')).toBeTruthy();
    // The name handed over by the caller bridges the fetch.
    expect(screen.getByText('Babe Ruth')).toBeTruthy();
    expect(screen.queryByText('Player not found')).toBeNull();
  });

  it('renders the error state when the query fails', () => {
    mockQueryResult = { loading: false, error: { message: 'Network error' } };
    render(<PlayerDetailById playerId={RUTH_ID} />);

    expect(screen.getByText('Error: Network error')).toBeTruthy();
    expect(screen.queryByText('Player not found')).toBeNull();
  });

  it('skips the request for a non-positive id and shows not found', () => {
    mockQueryResult = { loading: false };
    render(<PlayerDetailById playerId={0} />);

    expect(mockQueryOptions.skip).toBe(true);
    expect(screen.getByText('Player not found')).toBeTruthy();
  });
});

describe('toPlayerDetailData', () => {
  it('returns undefined when the payload has no player', () => {
    expect(toPlayerDetailData(undefined)).toBeUndefined();
    expect(
      toPlayerDetailData({
        player: null,
        playerSeasonBatting: [],
        playerSeasonPitching: [],
      }),
    ).toBeUndefined();
  });

  it('falls back to mlbTeam when the player has no season lines', () => {
    const mapped = toPlayerDetailData({
      ...batterResponse,
      player: { ...batterResponse.player, mlbTeam: 'NYY' },
      playerSeasonBatting: [],
      playerSeasonPitching: [],
    });

    expect(mapped?.team).toBe('NYY');
  });

  it('falls back to an eligible position when no career line has one', () => {
    const mapped = toPlayerDetailData({
      ...batterResponse,
      player: {
        ...batterResponse.player,
        careerBatting: null,
        careerPitching: null,
      },
    });

    expect(mapped?.position).toBe('OF');
  });

  it('maps null career stats to undefined so the render guards hold', () => {
    const mapped = toPlayerDetailData({
      ...batterResponse,
      player: {
        ...batterResponse.player,
        careerBatting: {
          ...batterResponse.player.careerBatting,
          battingAverage: null,
          homeRuns: 0,
        },
      },
    });

    expect(mapped?.battingAvg).toBeUndefined();
    // A real zero is data, not a missing value.
    expect(mapped?.homeRuns).toBe(0);
  });
});
