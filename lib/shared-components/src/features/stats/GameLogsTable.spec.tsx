import React from 'react';
import { act, fireEvent, render } from '@testing-library/react';
import { InteractionManager } from 'react-native';
import {
  ADVANCED_STAT_KEYS,
  buildGameLogsRequestBody,
  compareCells,
  GameLogsTable,
  NFL_ADVANCED_STAT_KEYS,
  renderCell,
  reshapeGameLogs,
  validateDateRange,
} from './GameLogsTable';
import { MLB_TEAMS, NFL_FRANCHISES } from '../../constants/teams';
import { Platform } from '../../platform-components';

// Sortable headers, premium-column gating, and the localStorage-backed column
// customizer are web-DOM behaviors (the native path renders a FlatList header
// and skips localStorage). Mirror the opponent-select tests, which are also
// effectively web-only, by gating these describes to the web jest config.
const webDescribe = Platform.OS === 'web' ? describe : describe.skip;

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
).cancelIdleCallback = (h: number) => clearTimeout(h);

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

  // VGL-010 — virtual scroller must have minWidth:0 so overflow:auto actually
  // constrains the flex item to available space on small screens instead of
  // expanding the page.
  webDescribe('VGL-010 horizontal scroll wrapper (LS-7459)', () => {
    it('virtual scroller has minWidth 0 to prevent viewport overflow in flex context', async () => {
      mockFetchOnce(makePaginated(1, 5, 5));
      const { getByPlaceholderText, getByText, findByTestId } = render(
        <GameLogsTable />,
      );
      fireEvent.change(getByPlaceholderText('Enter player ID'), {
        target: { value: 'mlb-1234' },
      });
      act(() => {
        fireEvent.click(
          getByText('Get Player Data').closest('button') ??
            getByText('Get Player Data'),
        );
      });
      const scroller = await findByTestId('game-logs-virtual-scroller');
      expect(scroller).toHaveStyle({ minWidth: 0 });
    });
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

// ---------------------------------------------------------------------------
// LS-5701 — sortable headers (LS-7457), premium advanced columns (LS-7463),
// column customizer (LS-7464).
// ---------------------------------------------------------------------------

/** Paginated payload with arbitrary stat columns. Each cell is a deterministic
 *  numeric so sort/gating assertions are stable. */
function makePaginatedWithStats(
  stats: string[],
  count: number,
  total: number,
): {
  stats: string[];
  rows: Array<Record<string, string | number>>;
  total: number;
} {
  const rows: Array<Record<string, string | number>> = [];
  for (let i = 0; i < count; i++) {
    const row: Record<string, string | number> = { gameId: `g-${i + 1}` };
    for (const s of stats) row[s] = i % 5;
    rows.push(row);
  }
  return { stats, rows, total };
}

function clickSubmit(getByText: (t: string) => HTMLElement): void {
  const submit =
    getByText('Get Player Data').closest('button') ??
    getByText('Get Player Data');
  act(() => {
    fireEvent.click(submit);
  });
}

describe('compareCells (LS-7457)', () => {
  it('orders numbers ascending and descending', () => {
    expect(compareCells(1, 2, 'asc')).toBeLessThan(0);
    expect(compareCells(1, 2, 'desc')).toBeGreaterThan(0);
  });

  it('preserves a real 0 as a sortable value (not treated as missing)', () => {
    // 0 < 1 ascending — a real zero must not be coerced to "missing".
    expect(compareCells(0, 1, 'asc')).toBeLessThan(0);
  });

  it('sorts missing values (null/undefined/""/em-dash) last in both directions', () => {
    for (const missing of [null, undefined, '', '—']) {
      expect(compareCells(missing, 5, 'asc')).toBeGreaterThan(0);
      expect(compareCells(missing, 5, 'desc')).toBeGreaterThan(0);
      expect(compareCells(5, missing, 'asc')).toBeLessThan(0);
      expect(compareCells(5, missing, 'desc')).toBeLessThan(0);
    }
  });

  it('falls back to a numeric-aware locale compare for non-numeric strings', () => {
    expect(compareCells('2026-04-01', '2026-05-01', 'asc')).toBeLessThan(0);
    expect(compareCells('2026-04-01', '2026-05-01', 'desc')).toBeGreaterThan(0);
  });
});

describe('renderCell (LS-7461)', () => {
  it('returns em-dash for null', () => {
    expect(renderCell(null)).toBe('—');
  });

  it('returns em-dash for undefined', () => {
    expect(renderCell(undefined)).toBe('—');
  });

  it('returns em-dash for empty string', () => {
    expect(renderCell('')).toBe('—');
  });

  it('returns em-dash for whitespace-only string', () => {
    expect(renderCell('   ')).toBe('—');
  });

  it('passes through a real 0 without coercing to em-dash', () => {
    expect(renderCell(0)).toBe(0);
  });

  it('passes through a non-empty string unchanged', () => {
    expect(renderCell('42')).toBe('42');
  });

  it('passes through a positive number unchanged', () => {
    expect(renderCell(3.14)).toBe(3.14);
  });
});

webDescribe('GameLogsTable sortable headers (LS-7457)', () => {
  it('cycles a header aria-sort unsorted → ascending → descending → none', async () => {
    mockFetchOnce(makePaginatedWithStats(['AB', 'H'], 50, 162));

    const { getByPlaceholderText, getByText, findByTestId, getByTestId } =
      render(<GameLogsTable />);
    fireEvent.change(getByPlaceholderText('Enter player ID'), {
      target: { value: 'mlb-1234' },
    });
    clickSubmit(getByText);

    const header = await findByTestId('game-logs-header-AB');
    const headerCell = getByTestId('game-logs-header-cell-AB');
    expect(headerCell.getAttribute('aria-sort')).toBe('none');

    fireEvent.click(header);
    expect(
      getByTestId('game-logs-header-cell-AB').getAttribute('aria-sort'),
    ).toBe('ascending');

    fireEvent.click(getByTestId('game-logs-header-AB'));
    expect(
      getByTestId('game-logs-header-cell-AB').getAttribute('aria-sort'),
    ).toBe('descending');

    fireEvent.click(getByTestId('game-logs-header-AB'));
    expect(
      getByTestId('game-logs-header-cell-AB').getAttribute('aria-sort'),
    ).toBe('none');
  });
});

webDescribe('GameLogsTable premium advanced columns (LS-7463)', () => {
  it('strips advanced columns for free users', async () => {
    const advanced = ADVANCED_STAT_KEYS[0];
    mockFetchOnce(makePaginatedWithStats(['AB', 'H', advanced], 50, 162));

    const { getByPlaceholderText, getByText, findByTestId, queryByTestId } =
      render(<GameLogsTable />);
    fireEvent.change(getByPlaceholderText('Enter player ID'), {
      target: { value: 'mlb-1234' },
    });
    clickSubmit(getByText);

    await findByTestId('game-logs-header-AB');
    expect(queryByTestId(`game-logs-header-${advanced}`)).toBeNull();
  });

  it('shows advanced columns for premium users', async () => {
    const advanced = ADVANCED_STAT_KEYS[0];
    mockFetchOnce(makePaginatedWithStats(['AB', 'H', advanced], 50, 162));

    const { getByPlaceholderText, getByText, findByTestId } = render(
      <GameLogsTable isPremium />,
    );
    fireEvent.change(getByPlaceholderText('Enter player ID'), {
      target: { value: 'mlb-1234' },
    });
    clickSubmit(getByText);

    expect(await findByTestId(`game-logs-header-${advanced}`)).toBeTruthy();
  });
});

webDescribe('GameLogsTable NFL premium advanced columns (LS-6459)', () => {
  it('NFL_ADVANCED_STAT_KEYS contains snapPct, tgt, and routeShare', () => {
    expect(NFL_ADVANCED_STAT_KEYS).toContain('snapPct');
    expect(NFL_ADVANCED_STAT_KEYS).toContain('tgt');
    expect(NFL_ADVANCED_STAT_KEYS).toContain('routeShare');
  });

  it('strips NFL advanced columns for free users on sport=nfl', async () => {
    const advanced = NFL_ADVANCED_STAT_KEYS[0];
    mockFetchOnce(makePaginatedWithStats(['rec', 'yds', advanced], 50, 162));

    const { getByPlaceholderText, getByText, findByTestId, queryByTestId } =
      render(<GameLogsTable sport="nfl" />);
    fireEvent.change(getByPlaceholderText('Enter player ID'), {
      target: { value: 'nfl-1234' },
    });
    clickSubmit(getByText);

    await findByTestId('game-logs-header-rec');
    expect(queryByTestId(`game-logs-header-${advanced}`)).toBeNull();
  });

  it('shows NFL advanced columns for premium users on sport=nfl', async () => {
    const advanced = NFL_ADVANCED_STAT_KEYS[0];
    mockFetchOnce(makePaginatedWithStats(['rec', 'yds', advanced], 50, 162));

    const { getByPlaceholderText, getByText, findByTestId } = render(
      <GameLogsTable sport="nfl" isPremium />,
    );
    fireEvent.change(getByPlaceholderText('Enter player ID'), {
      target: { value: 'nfl-1234' },
    });
    clickSubmit(getByText);

    expect(await findByTestId(`game-logs-header-${advanced}`)).toBeTruthy();
  });

  it('does not strip NFL advanced keys from MLB table (sport=mlb)', async () => {
    const nflKey = NFL_ADVANCED_STAT_KEYS[0];
    mockFetchOnce(makePaginatedWithStats(['AB', 'H', nflKey], 50, 162));

    const { getByPlaceholderText, getByText, findByTestId } = render(
      <GameLogsTable sport="mlb" />,
    );
    fireEvent.change(getByPlaceholderText('Enter player ID'), {
      target: { value: 'mlb-1234' },
    });
    clickSubmit(getByText);

    // snapPct/tgt/routeShare are not in the MLB premium key set, so free MLB
    // users should still see them if the API returns them.
    expect(await findByTestId(`game-logs-header-${nflKey}`)).toBeTruthy();
  });

  it('does not strip MLB advanced keys from NFL table (sport=nfl)', async () => {
    const mlbKey = ADVANCED_STAT_KEYS[0];
    mockFetchOnce(makePaginatedWithStats(['rec', 'yds', mlbKey], 50, 162));

    const { getByPlaceholderText, getByText, findByTestId } = render(
      <GameLogsTable sport="nfl" />,
    );
    fireEvent.change(getByPlaceholderText('Enter player ID'), {
      target: { value: 'nfl-1234' },
    });
    clickSubmit(getByText);

    // wOBA/xBA/etc. are MLB premium keys and should not be stripped on the
    // NFL table for free users.
    expect(await findByTestId(`game-logs-header-${mlbKey}`)).toBeTruthy();
  });
});

webDescribe('GameLogsTable column customizer (LS-7464)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('hides the customize entry for free users', async () => {
    mockFetchOnce(makePaginatedWithStats(['AB', 'H'], 50, 162));

    const { getByPlaceholderText, getByText, findByTestId, queryByTestId } =
      render(<GameLogsTable />);
    fireEvent.change(getByPlaceholderText('Enter player ID'), {
      target: { value: 'mlb-1234' },
    });
    clickSubmit(getByText);

    await findByTestId('game-logs-header-AB');
    expect(queryByTestId('game-logs-customize-columns')).toBeNull();
  });

  it('hides a column via the customizer and persists it to localStorage', async () => {
    mockFetchOnce(makePaginatedWithStats(['AB', 'H'], 50, 162));

    const {
      getByPlaceholderText,
      getByText,
      findByTestId,
      getByTestId,
      queryByTestId,
    } = render(<GameLogsTable isPremium />);
    fireEvent.change(getByPlaceholderText('Enter player ID'), {
      target: { value: 'mlb-1234' },
    });
    clickSubmit(getByText);

    await findByTestId('game-logs-header-AB');

    fireEvent.click(getByTestId('game-logs-customize-columns'));
    fireEvent.click(getByTestId('column-customizer-visible-AB'));

    expect(queryByTestId('game-logs-header-AB')).toBeNull();
    expect(getByTestId('game-logs-header-H')).toBeTruthy();

    const raw = window.localStorage.getItem('gameLogs.mlb.columns');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw as string) as { hidden: string[] };
    expect(parsed.hidden).toContain('AB');
  });

  it('restores persisted column preferences on mount', async () => {
    window.localStorage.setItem(
      'gameLogs.mlb.columns',
      JSON.stringify({ order: [], hidden: ['AB'], pinned: [] }),
    );
    mockFetchOnce(makePaginatedWithStats(['AB', 'H'], 50, 162));

    const { getByPlaceholderText, getByText, findByTestId, queryByTestId } =
      render(<GameLogsTable isPremium />);
    fireEvent.change(getByPlaceholderText('Enter player ID'), {
      target: { value: 'mlb-1234' },
    });
    clickSubmit(getByText);

    await findByTestId('game-logs-header-H');
    expect(queryByTestId('game-logs-header-AB')).toBeNull();
  });
});
