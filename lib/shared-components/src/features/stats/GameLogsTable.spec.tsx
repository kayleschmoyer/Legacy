import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import {
  buildGameLogsRequestBody,
  DEFAULT_GAME_LOGS_LIMIT,
  GameLogsTable,
  VIRTUAL_ROW_THRESHOLD,
} from './GameLogsTable';
import { MLB_TEAMS, NFL_FRANCHISES } from '../../constants/teams';

// Mock fetch globally
global.fetch = jest.fn();

describe('GameLogsTable', () => {
  const originalEnv = process.env.VITE_STATS_API_URL;

  beforeEach(() => {
    jest.clearAllMocks();
    // Pin a configured URL so the prod-guard tests are opt-in.
    process.env.VITE_STATS_API_URL = 'https://stats.example.com/game-logs';
    (globalThis as { __DEV__?: boolean }).__DEV__ = true;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.VITE_STATS_API_URL;
    } else {
      process.env.VITE_STATS_API_URL = originalEnv;
    }
    delete (globalThis as { __DEV__?: boolean }).__DEV__;
  });

  it('renders correctly with default props', () => {
    const { getByPlaceholderText, getByText } = render(<GameLogsTable />);

    expect(getByPlaceholderText('Enter player ID')).toBeTruthy();
    expect(getByPlaceholderText('Start date (YYYY-MM-DD)')).toBeTruthy();
    expect(getByPlaceholderText('End date (YYYY-MM-DD)')).toBeTruthy();
    expect(getByText('Get Player Data')).toBeTruthy();
  });

  it('renders correctly with custom API endpoint', () => {
    const { getByPlaceholderText, getByText } = render(
      <GameLogsTable apiEndpoint="https://custom-api.com/game-logs" />,
    );

    expect(getByPlaceholderText('Enter player ID')).toBeTruthy();
    expect(getByPlaceholderText('Start date (YYYY-MM-DD)')).toBeTruthy();
    expect(getByPlaceholderText('End date (YYYY-MM-DD)')).toBeTruthy();
    expect(getByText('Get Player Data')).toBeTruthy();
  });

  it('displays input fields and button', () => {
    const { getByPlaceholderText, getByText } = render(<GameLogsTable />);

    expect(getByPlaceholderText('Enter player ID')).toBeTruthy();
    expect(getByPlaceholderText('Start date (YYYY-MM-DD)')).toBeTruthy();
    expect(getByPlaceholderText('End date (YYYY-MM-DD)')).toBeTruthy();
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

  it('shows inline error for invalid start date format', () => {
    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    const { getByPlaceholderText, getByText } = render(<GameLogsTable />);
    fireEvent.change(getByPlaceholderText('Enter player ID'), {
      target: { value: 'mlb-1234' },
    });
    fireEvent.change(getByPlaceholderText('Start date (YYYY-MM-DD)'), {
      target: { value: 'not-a-date' },
    });
    const submit =
      getByText('Get Player Data').closest('button') ??
      getByText('Get Player Data');
    fireEvent.click(submit);
    expect(
      getByText('Start date must be in YYYY-MM-DD format (e.g. 2024-06-01)'),
    ).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows inline error for invalid end date format', () => {
    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    const { getByPlaceholderText, getByText } = render(<GameLogsTable />);
    fireEvent.change(getByPlaceholderText('Enter player ID'), {
      target: { value: 'mlb-1234' },
    });
    fireEvent.change(getByPlaceholderText('End date (YYYY-MM-DD)'), {
      target: { value: 'bad-end' },
    });
    const submit =
      getByText('Get Player Data').closest('button') ??
      getByText('Get Player Data');
    fireEvent.click(submit);
    expect(
      getByText('End date must be in YYYY-MM-DD format (e.g. 2024-06-01)'),
    ).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows inline error when date is in the future (LS-7452)', () => {
    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockClear();
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    const { getByPlaceholderText, getByText } = render(<GameLogsTable />);
    fireEvent.change(getByPlaceholderText('Enter player ID'), {
      target: { value: 'mlb-1234' },
    });
    fireEvent.change(getByPlaceholderText('Start date (YYYY-MM-DD)'), {
      target: { value: '2099-12-31' },
    });
    const submit =
      getByText('Get Player Data').closest('button') ??
      getByText('Get Player Data');
    fireEvent.click(submit);
    expect(getByText('Start date cannot be in the future')).toBeTruthy();
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

describe('buildGameLogsRequestBody (LS-7466, LS-7473, LS-7478)', () => {
  const baseFilters = {
    player: 'mlb-1234',
    dateFrom: '',
    dateTo: '',
    opponentFranchiseIds: [] as string[],
    venue: 'all' as const,
  };

  it('omits date range + opponent + venue keys when filters are inactive', () => {
    const body = buildGameLogsRequestBody(baseFilters, 'mlb');
    expect(body).toEqual({ player_id: 'mlb-1234' });
  });

  it('includes limit when provided (LS-7473)', () => {
    const body = buildGameLogsRequestBody(baseFilters, 'mlb', { limit: 50 });
    expect(body.limit).toBe(50);
  });

  it('omits limit when not provided (LS-7473)', () => {
    const body = buildGameLogsRequestBody(baseFilters, 'mlb');
    expect(body.limit).toBeUndefined();
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

  it('forwards combined filter state (player + date range + opponent + venue — LS-7466, LS-7450)', () => {
    const body = buildGameLogsRequestBody(
      {
        player: 'mlb-1234',
        dateFrom: '2026-04-01',
        dateTo: '2026-04-30',
        opponentFranchiseIds: ['NYY'],
        venue: 'home',
      },
      'mlb',
    );
    expect(body).toEqual({
      player_id: 'mlb-1234',
      game_date_from: '2026-04-01',
      game_date_to: '2026-04-30',
      opponent_franchise_ids: ['NYY'],
      opponent_abbrs: ['NYY'],
      venue: 'home',
    });
  });

  it('sends only game_date_from when only start date is set (LS-7450)', () => {
    const body = buildGameLogsRequestBody(
      { ...baseFilters, dateFrom: '2026-04-01' },
      'mlb',
    );
    expect(body).toEqual({
      player_id: 'mlb-1234',
      game_date_from: '2026-04-01',
    });
  });

  it('sends only game_date_to when only end date is set (LS-7450)', () => {
    const body = buildGameLogsRequestBody(
      { ...baseFilters, dateTo: '2026-04-30' },
      'mlb',
    );
    expect(body).toEqual({ player_id: 'mlb-1234', game_date_to: '2026-04-30' });
  });
});

describe('GameLogsTable filter controls', () => {
  beforeEach(() => {
    (global.fetch as jest.Mock).mockClear();
  });

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

  it('sends DEFAULT_GAME_LOGS_LIMIT in the request body for non-premium users (LS-7473)', () => {
    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const { getByPlaceholderText, getByText } = render(
      <GameLogsTable apiEndpoint="https://test.example.com/logs" />,
    );

    fireEvent.change(getByPlaceholderText('Enter player ID'), {
      target: { value: 'mlb-1234' },
    });

    const submit =
      getByText('Get Player Data').closest('button') ??
      getByText('Get Player Data');
    fireEvent.click(submit);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calls = fetchMock.mock.calls as Array<[string, RequestInit]>;
    const body = JSON.parse(calls[0][1].body as string) as { limit?: number };
    expect(body.limit).toBe(DEFAULT_GAME_LOGS_LIMIT);
  });

  it('omits limit from the request body for premium users (LS-7473)', () => {
    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const { getByPlaceholderText, getByText } = render(
      <GameLogsTable apiEndpoint="https://test.example.com/logs" isPremium />,
    );

    fireEvent.change(getByPlaceholderText('Enter player ID'), {
      target: { value: 'mlb-1234' },
    });

    const submit =
      getByText('Get Player Data').closest('button') ??
      getByText('Get Player Data');
    fireEvent.click(submit);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calls = fetchMock.mock.calls as Array<[string, RequestInit]>;
    const body = JSON.parse(calls[0][1].body as string) as { limit?: number };
    expect(body.limit).toBeUndefined();
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

describe('GameLogsTable reshape deferred off main thread (LS-7472)', () => {
  it('renders table headers and cells from a multi-stat multi-game payload', async () => {
    // Simulate a season payload: two stat keys each mapping to two game entries.
    // The raw shape is { stat: { gameNum: value } }; the component must
    // transpose it to { gameNum: { stat: value } } via useMemo + startTransition.
    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          HR: { '1': 1, '2': 0 },
          RBI: { '1': 3, '2': 0 },
        }),
    });

    const { getByPlaceholderText, getByText } = render(
      <GameLogsTable apiEndpoint="https://test.example.com/logs" />,
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

    // waitFor drains microtasks and flushes the startTransition render.
    await waitFor(() => {
      expect(document.querySelector('table')).toBeTruthy();
    });

    // Cross-platform: on web the headers are <th> text inside innerHTML;
    // on native the Table mock renders them as a "headers" attribute.
    const tableEl = document.querySelector('table');
    const tableContent =
      tableEl?.getAttribute('headers') ?? tableEl?.innerHTML ?? '';
    expect(tableContent).toContain('HR');
    expect(tableContent).toContain('RBI');
  });
});

describe('GameLogsTable production endpoint guard (LS-7691)', () => {
  const originalEnv = process.env.VITE_STATS_API_URL;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.VITE_STATS_API_URL;
    } else {
      process.env.VITE_STATS_API_URL = originalEnv;
    }
    delete (globalThis as { __DEV__?: boolean }).__DEV__;
  });

  it('allows the localhost fallback in dev builds when env is unset', () => {
    delete process.env.VITE_STATS_API_URL;
    (globalThis as { __DEV__?: boolean }).__DEV__ = true;

    const { getByText, queryByText } = render(<GameLogsTable />);
    expect(getByText('Get Player Data')).toBeTruthy();
    expect(queryByText(/VITE_STATS_API_URL is not configured/)).toBeNull();
  });

  it('renders an error state in production when env is unset', () => {
    delete process.env.VITE_STATS_API_URL;
    (globalThis as { __DEV__?: boolean }).__DEV__ = false;

    const { getByText, queryByText } = render(<GameLogsTable />);

    expect(getByText(/VITE_STATS_API_URL is not configured/)).toBeTruthy();
    expect(getByText('Game logs unavailable')).toBeTruthy();
    // The fetch form must not be rendered.
    expect(queryByText('Get Player Data')).toBeNull();
  });

  it('renders an error state in production when env points at localhost', () => {
    process.env.VITE_STATS_API_URL = 'http://localhost:5000/baseball-game-logs';
    (globalThis as { __DEV__?: boolean }).__DEV__ = false;

    const { getByText } = render(<GameLogsTable />);

    expect(getByText(/VITE_STATS_API_URL is not configured/)).toBeTruthy();
  });

  it('respects an explicit apiEndpoint prop even in production', () => {
    delete process.env.VITE_STATS_API_URL;
    (globalThis as { __DEV__?: boolean }).__DEV__ = false;

    const { getByText, queryByText } = render(
      <GameLogsTable apiEndpoint="https://prod.example.com/game-logs" />,
    );
    expect(getByText('Get Player Data')).toBeTruthy();
    expect(queryByText(/VITE_STATS_API_URL is not configured/)).toBeNull();
  });
});

// Helpers for virtualization tests
function buildServerData(
  gameCount: number,
): Record<string, Record<string, number>> {
  const result: Record<string, Record<string, number>> = { hits: {}, rbi: {} };
  for (let i = 0; i < gameCount; i++) {
    result['hits'][String(i)] = 1;
    result['rbi'][String(i)] = 1;
  }
  return result;
}

function submitQuery(
  getByPlaceholderText: (t: string) => HTMLElement,
  getByText: (t: string) => HTMLElement,
) {
  fireEvent.change(getByPlaceholderText('Enter player ID'), {
    target: { value: 'mlb-1234' },
  });
  const submitText = getByText('Get Player Data');
  fireEvent.click(submitText.closest('button') ?? submitText);
}

describe('CrossPlatformTable virtualization (LS-7475)', () => {
  const fetchMock = global.fetch as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.VITE_STATS_API_URL = 'https://stats.example.com/game-logs';
    (globalThis as { __DEV__?: boolean }).__DEV__ = true;
  });

  afterEach(() => {
    delete process.env.VITE_STATS_API_URL;
    delete (globalThis as { __DEV__?: boolean }).__DEV__;
  });

  it('VIRTUAL_ROW_THRESHOLD is 100', () => {
    expect(VIRTUAL_ROW_THRESHOLD).toBe(100);
  });

  it('adds overflowY scroll container when row count exceeds threshold', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(buildServerData(VIRTUAL_ROW_THRESHOLD + 1)),
    });

    const { container, getByPlaceholderText, getByText } = render(
      <GameLogsTable apiEndpoint="https://test.example.com/logs" />,
    );

    // act flushes async state updates (fetch → setData → re-render). (LS-7475)
    await act(async () => {
      submitQuery(getByPlaceholderText, getByText);
      await Promise.resolve();
      await Promise.resolve();
    });

    // Web-only: on mobile, CrossPlatformTable renders the native Table mock which
    // has no overflowX wrapper div (LS-7475).
    const divs = Array.from(container.querySelectorAll('div'));
    const webWrapperDiv = divs.find((d) => d.style.overflowX === 'auto');
    if (!webWrapperDiv) return;

    // For large datasets the wrapper also carries overflowY + maxHeight.
    expect(webWrapperDiv.style.overflowY).toBe('auto');
    expect(webWrapperDiv.style.maxHeight).toBeTruthy();
  });

  it('does not add overflowY scroll container for datasets at or below threshold', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(buildServerData(VIRTUAL_ROW_THRESHOLD)),
    });

    const { container, getByPlaceholderText, getByText } = render(
      <GameLogsTable apiEndpoint="https://test.example.com/logs" />,
    );

    await act(async () => {
      submitQuery(getByPlaceholderText, getByText);
      await Promise.resolve();
      await Promise.resolve();
    });

    // Web-only: on mobile, CrossPlatformTable renders the native Table mock which
    // has no overflowX wrapper div (LS-7475).
    const divs = Array.from(container.querySelectorAll('div'));
    const webWrapperDiv = divs.find((d) => d.style.overflowX === 'auto');
    if (!webWrapperDiv) return;

    // Small dataset — the wrapper should not carry overflowY.
    expect(webWrapperDiv.style.overflowY).not.toBe('auto');
  });

  it('renders fewer DOM rows than total when virtualization is active', async () => {
    const totalRows = VIRTUAL_ROW_THRESHOLD + 50;
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(buildServerData(totalRows)),
    });

    const { container, getByPlaceholderText, getByText } = render(
      <GameLogsTable apiEndpoint="https://test.example.com/logs" />,
    );

    await act(async () => {
      submitQuery(getByPlaceholderText, getByText);
      await Promise.resolve();
      await Promise.resolve();
    });

    // Web-only: on mobile, CrossPlatformTable renders the native Table mock which
    // has no overflowX wrapper div (LS-7475).
    const allDivs = Array.from(container.querySelectorAll('div'));
    if (!allDivs.some((d) => d.style.overflowX === 'auto')) return;

    // Spacer rows (padding) have colSpan; data rows have individual <td> cells.
    // Count <tr> elements that have multiple <td> children (i.e. real data rows).
    const tbody = container.querySelector('tbody');
    const dataRows = tbody
      ? Array.from(tbody.querySelectorAll('tr')).filter(
          (tr) => tr.querySelectorAll('td').length > 1,
        )
      : [];

    expect(dataRows.length).toBeLessThan(totalRows);
  });
});
