import React from 'react';
import { act, fireEvent, render } from '@testing-library/react';
import { InteractionManager } from 'react-native';
import {
  buildGameLogsRequestBody,
  GameLogsTable,
  reshapeGameLogs,
  validateDateRange,
} from './GameLogsTable';
import { MLB_TEAMS, NFL_FRANCHISES } from '../../constants/teams';

// Mock fetch globally
global.fetch = jest.fn();

// Make requestIdleCallback synchronous so the deferred reshape completes in the same tick.
(
  global as unknown as { requestIdleCallback: (cb: () => void) => number }
).requestIdleCallback = (cb) => {
  cb();
  return 0;
};
(
  global as unknown as { cancelIdleCallback: (h: number) => void }
).cancelIdleCallback = (h: number) =>
  clearTimeout(h as unknown as ReturnType<typeof setTimeout>);

function mockInteractionManagerSync(): void {
  if (typeof InteractionManager?.runAfterInteractions !== 'function') return;
  jest
    .spyOn(InteractionManager, 'runAfterInteractions')
    .mockImplementation((task) => {
      if (typeof task === 'function') task();
      return { cancel: () => undefined };
    });
}

// Before each test: reset all mock state (calls + implementations) then re-apply the
// InteractionManager shim so the native-path deferred reshape runs synchronously.
beforeEach(() => {
  jest.resetAllMocks();
  global.fetch = jest.fn();
  mockInteractionManagerSync();
});

const FIXED_TODAY = '2026-06-02';

function mockFetchOnce(body: unknown): jest.Mock {
  const m = global.fetch as jest.Mock;
  m.mockImplementationOnce(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve(body),
    } as unknown as Response),
  );
  return m;
}

function makePaginated(
  startGameId: number,
  count: number,
  total: number,
): {
  stats: string[];
  rows: Array<{ gameId: string; AB: number; H: number }>;
  total: number;
} {
  const stats = ['AB', 'H'];
  const rows: Array<{ gameId: string; AB: number; H: number }> = [];
  for (let i = 0; i < count; i++) {
    rows.push({
      gameId: `g-${startGameId + i}`,
      AB: 4,
      H: 1,
    });
  }
  return { stats, rows, total };
}

describe('GameLogsTable', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly with default props', () => {
    const { getByPlaceholderText, getByText } = render(<GameLogsTable />);

    expect(getByPlaceholderText('Enter player ID')).toBeTruthy();
    expect(getByText('Get Player Data')).toBeTruthy();
  });

  it('renders correctly with custom API endpoint', () => {
    const { getByPlaceholderText, getByText } = render(
      <GameLogsTable apiEndpoint="https://custom-api.com/game-logs" />,
    );

    expect(getByPlaceholderText('Enter player ID')).toBeTruthy();
    expect(getByText('Get Player Data')).toBeTruthy();
  });
});

describe('GameLogsTable input validation', () => {
  it('shows inline error when player ID is empty', () => {
    const { getByText } = render(<GameLogsTable />);
    const submit =
      getByText('Get Player Data').closest('button') ??
      getByText('Get Player Data');
    fireEvent.click(submit);
    expect(getByText('Please enter a player ID')).toBeTruthy();
  });

  it('shows inline error for invalid player ID characters', () => {
    const { getByPlaceholderText, getByText } = render(<GameLogsTable />);
    fireEvent.change(getByPlaceholderText('Enter player ID'), {
      target: { value: 'bad player; DROP TABLE--' },
    });
    const submit =
      getByText('Get Player Data').closest('button') ??
      getByText('Get Player Data');
    fireEvent.click(submit);
    expect(
      getByText(
        'Player ID may only contain letters, numbers, hyphens, and underscores',
      ),
    ).toBeTruthy();
  });
});

describe('validateDateRange', () => {
  it('accepts an empty range (date filter is optional)', () => {
    expect(validateDateRange('', '', FIXED_TODAY)).toEqual({
      error: null,
      ready: true,
    });
  });

  it('rejects a half-open range', () => {
    expect(validateDateRange('2026-04-01', '', FIXED_TODAY).ready).toBe(false);
    expect(validateDateRange('', '2026-04-01', FIXED_TODAY).ready).toBe(false);
  });

  it('rejects malformed date strings', () => {
    expect(
      validateDateRange('not-a-date', '2026-04-01', FIXED_TODAY).ready,
    ).toBe(false);
  });

  it('rejects impossible calendar dates (e.g. Feb 31)', () => {
    expect(
      validateDateRange('2026-02-31', '2026-03-01', FIXED_TODAY).ready,
    ).toBe(false);
  });

  it('rejects inverted ranges where end < start', () => {
    const result = validateDateRange('2026-05-01', '2026-04-01', FIXED_TODAY);
    expect(result.ready).toBe(false);
    expect(result.error).toMatch(/start date must be on or before end date/i);
  });

  it('rejects end date in the future', () => {
    const result = validateDateRange('2026-04-01', '2030-04-01', FIXED_TODAY);
    expect(result.ready).toBe(false);
    expect(result.error).toMatch(/future/i);
  });

  it('rejects a future start date even when end date is empty (LS-7452)', () => {
    const result = validateDateRange('2099-12-31', '', FIXED_TODAY);
    expect(result.ready).toBe(false);
    expect(result.error).toMatch(/Start date cannot be in the future/i);
  });
});

describe('reshapeGameLogs (LS-7472)', () => {
  it('handles the paginated `{stats, rows, total}` shape', () => {
    const out = reshapeGameLogs({
      stats: ['AB', 'H'],
      rows: [
        { gameId: 'g-1', AB: 4, H: 2 },
        { gameId: 'g-2', AB: 3, H: 0 },
      ],
      total: 162,
    });
    expect(out.stats).toEqual(['AB', 'H']);
    expect(out.rows).toHaveLength(2);
    expect(out.rows[0]).toEqual({ gameId: 'g-1', cells: [4, 2] });
    expect(out.total).toBe(162);
  });

  it('preserves a real 0 (not coerced to em-dash) from paginated input', () => {
    const out = reshapeGameLogs({
      stats: ['AB', 'H'],
      rows: [{ gameId: 'g-1', AB: 0, H: 0 }],
    });
    expect(out.rows[0].cells).toEqual([0, 0]);
  });

  it('reshapes the legacy stat-major payload into game-major rows', () => {
    const legacy = {
      AB: { 'g-1': 4, 'g-2': 3 },
      H: { 'g-1': 2, 'g-2': 0 },
    };
    const out = reshapeGameLogs(legacy);
    expect(out.stats).toEqual(['AB', 'H']);
    expect(out.rows).toHaveLength(2);
    // Legacy → treat full payload size as the total (LS-7473 graceful fallback).
    expect(out.total).toBe(2);
  });

  it('fills missing stats with null in paginated rows', () => {
    const out = reshapeGameLogs({
      stats: ['AB', 'H', 'HR'],
      rows: [{ gameId: 'g-1', AB: 4, H: 2 }],
    });
    expect(out.rows[0].cells).toEqual([4, 2, null]);
  });
});

describe('GameLogsTable pagination (LS-7473)', () => {
  it('sends limit + offset in the request body', () => {
    const fetchMock = mockFetchOnce(makePaginated(1, 50, 162));

    const { getByPlaceholderText, getByText } = render(<GameLogsTable />);
    fireEvent.change(getByPlaceholderText('Enter player ID'), {
      target: { value: 'mlb-1234' },
    });

    const submit =
      getByText('Get Player Data').closest('button') ??
      getByText('Get Player Data');
    act(() => {
      fireEvent.click(submit);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, firstCallInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(firstCallInit.body as string) as {
      player_id: string;
      limit: number;
      offset: number;
    };
    expect(body.player_id).toBe('mlb-1234');
    expect(body.limit).toBe(50);
    expect(body.offset).toBe(0);
  });

  it('uses a custom pageSize when provided', () => {
    const fetchMock = mockFetchOnce(makePaginated(1, 25, 162));

    const { getByPlaceholderText, getByText } = render(
      <GameLogsTable pageSize={25} />,
    );
    fireEvent.change(getByPlaceholderText('Enter player ID'), {
      target: { value: 'mlb-1234' },
    });

    const submit =
      getByText('Get Player Data').closest('button') ??
      getByText('Get Player Data');
    act(() => {
      fireEvent.click(submit);
    });

    const [, customCallInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(customCallInit.body as string) as {
      limit: number;
    };
    expect(body.limit).toBe(25);
  });
});

describe('GameLogsTable submit gating', () => {
  it('does not fetch when player id is blank', () => {
    const fetchMock = global.fetch as jest.Mock;
    const { getByText } = render(<GameLogsTable />);
    const submit =
      getByText('Get Player Data').closest('button') ??
      getByText('Get Player Data');
    fireEvent.click(submit);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('Team reference data (LS-7477)', () => {
  it('MLB list contains all 30 franchises with unique ids', () => {
    expect(MLB_TEAMS).toHaveLength(30);
    const ids = new Set(MLB_TEAMS.map((t) => t.franchiseId));
    expect(ids.size).toBe(30);
  });

  it('NFL list contains all 32 franchises with unique ids', () => {
    expect(NFL_FRANCHISES).toHaveLength(32);
    const ids = new Set(NFL_FRANCHISES.map((t) => t.franchiseId));
    expect(ids.size).toBe(32);
  });

  it('every MLB franchise has a well-formed current abbreviation', () => {
    for (const t of MLB_TEAMS) {
      expect(t.currentAbbr).toMatch(/^[A-Z]{2,4}$/);
      expect(t.currentName.length).toBeGreaterThan(0);
    }
  });
});

describe('buildGameLogsRequestBody (LS-7466, LS-7478)', () => {
  const baseFilters = {
    player: 'mlb-1234',
    date: '',
    opponentFranchiseIds: [] as string[],
    venue: 'all' as const,
  };

  it('omits opponent + venue keys when filters are inactive', () => {
    const body = buildGameLogsRequestBody(baseFilters, 'mlb');
    expect(body).toEqual({ player_id: 'mlb-1234', game_date: '' });
  });

  it('serializes the venue toggle as "home" or "away"', () => {
    expect(
      buildGameLogsRequestBody({ ...baseFilters, venue: 'home' }, 'mlb').venue,
    ).toBe('home');
    expect(
      buildGameLogsRequestBody({ ...baseFilters, venue: 'away' }, 'mlb').venue,
    ).toBe('away');
    expect(
      buildGameLogsRequestBody({ ...baseFilters, venue: 'all' }, 'mlb').venue,
    ).toBeUndefined();
  });

  it('expands the Athletics franchise to OAK + LV (LS-7478)', () => {
    const body = buildGameLogsRequestBody(
      { ...baseFilters, opponentFranchiseIds: ['ATH'] },
      'mlb',
    );
    expect(body.opponent_franchise_ids).toEqual(['ATH']);
    expect(body.opponent_abbrs).toEqual(
      expect.arrayContaining(['ATH', 'OAK', 'LV']),
    );
  });

  it('expands the Nationals franchise to WSH + WAS + MTL (LS-7478)', () => {
    const body = buildGameLogsRequestBody(
      { ...baseFilters, opponentFranchiseIds: ['WSH'] },
      'mlb',
    );
    expect(body.opponent_abbrs).toEqual(
      expect.arrayContaining(['WSH', 'WAS', 'MTL']),
    );
  });

  it('expands NFL relocations (LV ← OAK, LAC ← SD)', () => {
    expect(
      buildGameLogsRequestBody(
        { ...baseFilters, opponentFranchiseIds: ['LV'] },
        'nfl',
      ).opponent_abbrs,
    ).toEqual(expect.arrayContaining(['LV', 'OAK']));

    expect(
      buildGameLogsRequestBody(
        { ...baseFilters, opponentFranchiseIds: ['LAC'] },
        'nfl',
      ).opponent_abbrs,
    ).toEqual(expect.arrayContaining(['LAC', 'SD']));
  });

  it('forwards combined filter state (player + date + opponent + venue — LS-7466)', () => {
    const body = buildGameLogsRequestBody(
      {
        player: 'mlb-1234',
        date: '2026-04-15',
        opponentFranchiseIds: ['NYY'],
        venue: 'home',
      },
      'mlb',
    );
    expect(body).toEqual({
      player_id: 'mlb-1234',
      game_date: '2026-04-15',
      opponent_franchise_ids: ['NYY'],
      opponent_abbrs: ['NYY'],
      venue: 'home',
    });
  });
});

describe('GameLogsTable filter controls', () => {
  it('renders opponent dropdown with all 30 MLB teams (LS-7479)', () => {
    const { queryByTestId } = render(<GameLogsTable sport="mlb" />);
    const select = queryByTestId('opponent-filter') as HTMLSelectElement | null;
    if (!select) return; // opponent filter is web-only — skip on native
    // 30 teams + the "All opponents" placeholder = 31 options for free users.
    expect(select.options).toHaveLength(31);
  });

  it('renders opponent dropdown with all 32 NFL teams', () => {
    const { queryByTestId } = render(<GameLogsTable sport="nfl" />);
    const select = queryByTestId('opponent-filter') as HTMLSelectElement | null;
    if (!select) return; // opponent filter is web-only — skip on native
    expect(select.options).toHaveLength(33);
  });

  it('switches to multi-select for premium users (LS-7480)', () => {
    const { queryByTestId } = render(<GameLogsTable isPremium />);
    const select = queryByTestId('opponent-filter') as HTMLSelectElement | null;
    if (!select) return; // opponent filter is web-only — skip on native
    expect(select.multiple).toBe(true);
  });

  it('venue toggle changes the outgoing payload (LS-7467)', () => {
    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const { getByPlaceholderText, getByTestId, getByText } = render(
      <GameLogsTable apiEndpoint="https://test.example.com/logs" />,
    );

    fireEvent.change(getByPlaceholderText('Enter player ID'), {
      target: { value: 'mlb-1234' },
    });
    fireEvent.click(getByTestId('venue-home'));

    const submitText = getByText('Get Player Data');
    const submit = submitText.closest('button') ?? submitText;
    fireEvent.click(submit);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calls = fetchMock.mock.calls as Array<[string, RequestInit]>;
    const body = JSON.parse(calls[0][1].body as string) as {
      venue: string;
      player_id: string;
    };
    expect(body.venue).toBe('home');
    expect(body.player_id).toBe('mlb-1234');
  });
});

describe('GameLogsTable render cap (LS-7475)', () => {
  it('shows the totals label once a page arrives', async () => {
    mockFetchOnce(makePaginated(1, 50, 162));

    const { getByPlaceholderText, getByText, findByTestId } = render(
      <GameLogsTable />,
    );
    fireEvent.change(getByPlaceholderText('Enter player ID'), {
      target: { value: 'mlb-1234' },
    });
    const submit =
      getByText('Get Player Data').closest('button') ??
      getByText('Get Player Data');
    act(() => {
      fireEvent.click(submit);
    });

    const label = await findByTestId('game-logs-total-label');
    expect(label.textContent).toMatch(/Showing\s+50\s+of\s+162/);
  });
});
