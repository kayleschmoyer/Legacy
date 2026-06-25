import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { PlayerStatsRoute } from './PlayerStatsPage';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockNavigate = jest.fn();
const mockSetSearchParams = jest.fn();
let mockSearchParams = new URLSearchParams();
let mockFootballEnabled = true;
let mockIsAuthenticated = true;
let mockAuthLoading = false;
const mockUseGetUserLeaguesQuery = jest.fn(() => ({
  data: null,
  loading: false,
}));
// Configurable server-preference state for the stats-format hydration tests
// (LS-7138). Default to no server data so the existing tests are unaffected.
let mockUserPrefsData: {
  getUserPreferences: { statsFormat: string } | null;
} | null = null;

// Captures the `onPlayerDetails` callback the host passes to the shared shell so
// a player click can be simulated directly (the shell renders null in tests).
const mockOnPlayerDetailsRef: {
  current?: (player: { id: string | number }) => void;
} = {};

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useSearchParams: () => [mockSearchParams, mockSetSearchParams],
}));

jest.mock('../../context/GrowthBookProvider', () => ({
  useFeatureValue: () => mockFootballEnabled,
}));

// Capture the props the route passes to the shared PlayerStatsPage so tests can
// drive callbacks (e.g. onExport) directly. Prefixed with `mock` so the hoisted
// jest.mock factory is allowed to reference it.
let mockStatsPageProps: Record<string, unknown> = {};
jest.mock('@legacy-sports/shared-components/players', () => ({
  // Capture the props the host passes (so onExport can be driven directly) and
  // expose a Share affordance so the host's onShare handler (and its
  // clipboard/manual-copy fallback) can be exercised. The shared component
  // passes a relative URL; the host prepends origin + sport. Also capture the
  // onPlayerDetails callback so a player click can be simulated directly.
  //
  // `canExport` is surfaced (data-testid="can-export") so the host's
  // premium-gating wiring (PST-010 / LS-7108) can be asserted, and an Export
  // trigger is always rendered (it ignores `canExport`) so the host's own
  // handleExport premium guard can be exercised directly — proving export never
  // runs for a free viewer even if the handler is reached.
  // `canCustomizeColumns` is surfaced (data-testid="can-customize-columns") so
  // the host's premium-gating wiring (PST-003 / LS-7107) can be asserted.
  // `statsFormat` is surfaced (data-testid="stats-format") so the host's
  // server-hydration behavior can be asserted (LS-7138).
  PlayerStatsPage: (props: {
    onShare?: (relativeUrl: string) => void;
    onPlayerDetails?: (player: { id: string | number }) => void;
    onExport?: (filters: unknown, viewMode: string, format?: string) => void;
    canExport?: boolean;
    canCustomizeColumns?: boolean;
    exportFormats?: readonly string[];
    statsFormat?: string;
    [key: string]: unknown;
  }) => {
    mockStatsPageProps = props;
    mockOnPlayerDetailsRef.current = props.onPlayerDetails;
    return (
      <>
        <button
          type="button"
          data-testid="share-button"
          onClick={() => props.onShare?.('/players/stats?view=combined')}
        >
          Share
        </button>
        <div data-testid="can-export">{String(props.canExport)}</div>
        <div data-testid="can-customize-columns">
          {String(props.canCustomizeColumns)}
        </div>
        <div data-testid="export-formats">
          {(props.exportFormats ?? []).join(',')}
        </div>
        <button
          type="button"
          data-testid="export-button"
          onClick={() => props.onExport?.({}, 'combined')}
        >
          Export JSON
        </button>
        <button
          type="button"
          data-testid="export-csv-button"
          onClick={() => props.onExport?.({}, 'combined', 'csv')}
        >
          Export CSV
        </button>
        <button
          type="button"
          data-testid="export-xlsx-button"
          onClick={() => props.onExport?.({}, 'combined', 'xlsx')}
        >
          Export XLSX
        </button>
        <div data-testid="stats-format">{props.statsFormat ?? 'none'}</div>
      </>
    );
  },
  // Mirror the shared shell's canonical mapping so the host's URL-rewrite
  // behavior can be asserted (legacy aliases batting→hitters, pitching→pitchers;
  // everything else → combined).
  normalizeViewMode: (mode: string) => {
    if (mode === 'pitching' || mode === 'pitchers') return 'pitchers';
    if (mode === 'hitters' || mode === 'batting') return 'hitters';
    return 'combined';
  },
  // Column-visibility helpers consumed by the host's URL parse/serialize +
  // localStorage paths (LS-7105 / PST-001). Lightweight stand-ins are enough for
  // the route-level assertions here.
  STATS_TOGGLEABLE_COLUMN_KEYS: ['homeRuns', 'era', 'strikeouts'],
  parseVisibleColumns: (raw: string | null) =>
    raw == null || raw === '' ? null : raw === 'none' ? [] : raw.split(','),
  serializeVisibleColumns: (cols: readonly string[] | null) =>
    cols === null ? null : cols.length === 0 ? 'none' : cols.join(','),
}));

// The football stats browser is rendered inline for the NFL view (LS-8104) and
// lazy-loaded; mock it with a lightweight marker so the route can be asserted
// without pulling the real (graphql/Tamagui-heavy) page into the unit test.
jest.mock('../football/FootballPlayersPage', () => ({
  FootballPlayersPage: () => <div data-testid="football-players-page" />,
}));

jest.mock('../../components/PageMeta', () => ({ PageMeta: () => null }));

jest.mock('../../components/PremiumGate', () => ({
  PremiumGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

let mockHasEntitlement = true;
jest.mock('../../hooks/useIsPremium', () => ({
  useIsPremium: () => mockHasEntitlement,
  useHasEntitlement: () => mockHasEntitlement,
}));

jest.mock('../../components/PlayerDetailModal', () => ({
  PlayerDetailModal: ({
    playerId,
    onOpenChange,
    onViewFullPage,
  }: {
    playerId: number | null;
    onOpenChange: (open: boolean) => void;
    onViewFullPage?: () => void;
  }) => (
    <div data-testid="player-detail-modal" data-player-id={String(playerId)}>
      <button data-testid="close-modal" onClick={() => onOpenChange(false)}>
        close
      </button>
      <button data-testid="view-full-page" onClick={() => onViewFullPage?.()}>
        full page
      </button>
    </div>
  ),
}));

jest.mock('@legacy-sports/graphql', () => ({
  useGetPlayerIdByBrefIdQuery: () => ({ data: null, loading: false }),
  useGetUserLeaguesQuery: (options?: unknown) =>
    mockUseGetUserLeaguesQuery(options as never),
  useGetUserPreferencesQuery: () => ({
    data: mockUserPrefsData,
    loading: false,
  }),
  Sport: { Baseball: 'Baseball', Football: 'Football' },
}));

jest.mock('@legacy-sports/shared-components/auth', () => ({
  useAuth: () => ({
    isAuthenticated: mockIsAuthenticated,
    isLoading: mockAuthLoading,
  }),
}));

jest.mock('../../hooks/useLeagueRosteredPlayerIds', () => ({
  useLeagueRosteredPlayerIds: () => ({ playerIds: new Set(), loading: false }),
}));

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

// ── Tests ────────────────────────────────────────────────────────────────────

// Default every test to a premium viewer; suites that need a free viewer opt in
// by setting mockHasEntitlement = false in their own (inner) beforeEach/test.
beforeEach(() => {
  mockHasEntitlement = true;
});

describe('PlayerStatsRoute inline NFL view', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockSetSearchParams.mockClear();
    mockSearchParams = new URLSearchParams();
    mockFootballEnabled = true;
  });

  it('renders the football stats browser inline (no redirect) when sport=nfl', async () => {
    mockSearchParams = new URLSearchParams('sport=nfl');
    render(<PlayerStatsRoute />);
    expect(
      await screen.findByTestId('football-players-page'),
    ).toBeInTheDocument();
    // Inline render replaces the old redirect to /football/players.
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  // LS-8132: the inline NFL view wraps the football browser in the same
  // editorial hero pattern used by the MLB stats page so the two sports share
  // UI conventions instead of diverging.
  it('renders an editorial "NFL Player Statistics" header for the inline NFL view', async () => {
    mockSearchParams = new URLSearchParams('sport=nfl');
    render(<PlayerStatsRoute />);
    await screen.findByTestId('football-players-page');
    expect(
      screen.getByRole('heading', { name: /nfl player statistics/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: /share nfl player statistics link/i,
      }),
    ).toBeInTheDocument();
  });

  it('renders the baseball stats page (not football) when sport=mlb', () => {
    mockSearchParams = new URLSearchParams('sport=mlb');
    render(<PlayerStatsRoute />);
    expect(
      screen.queryByTestId('football-players-page'),
    ).not.toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('falls back to baseball when sport=nfl but football is disabled', () => {
    mockSearchParams = new URLSearchParams('sport=nfl');
    mockFootballEnabled = false;
    render(<PlayerStatsRoute />);
    expect(
      screen.queryByTestId('football-players-page'),
    ).not.toBeInTheDocument();
  });
});

describe('PlayerStatsRoute sport switcher', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockSetSearchParams.mockClear();
    mockSearchParams = new URLSearchParams('sport=mlb');
    mockFootballEnabled = true;
  });

  it('renders MLB and NFL sport controls when football is enabled', () => {
    render(<PlayerStatsRoute />);
    expect(
      screen.getByRole('button', { name: /view mlb statistics/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /view nfl statistics/i }),
    ).toBeInTheDocument();
  });

  it('updates the sport param to nfl when the NFL control is clicked', () => {
    render(<PlayerStatsRoute />);
    fireEvent.click(
      screen.getByRole('button', { name: /view nfl statistics/i }),
    );
    const params = mockSetSearchParams.mock.calls[0][0] as URLSearchParams;
    expect(params.get('sport')).toBe('nfl');
  });

  it('updates the sport param to mlb when the MLB control is clicked', async () => {
    mockSearchParams = new URLSearchParams('sport=nfl');
    render(<PlayerStatsRoute />);
    // NFL view renders the (lazy) football browser; wait for it before asserting
    // the switcher, which is rendered alongside it.
    await screen.findByTestId('football-players-page');
    fireEvent.click(
      screen.getByRole('button', { name: /view mlb statistics/i }),
    );
    const params = mockSetSearchParams.mock.calls[0][0] as URLSearchParams;
    expect(params.get('sport')).toBe('mlb');
  });

  it('hides the sport switcher when football is disabled', () => {
    mockFootballEnabled = false;
    render(<PlayerStatsRoute />);
    expect(
      screen.queryByRole('button', { name: /view nfl statistics/i }),
    ).not.toBeInTheDocument();
  });
});

// LS-7146 / PST-111: the URL parser used to blindly cast `view` to a
// PlayerStatsViewMode without normalizing, so /players/stats?view=batting
// rendered the Hitters tab while the address bar kept the `batting` alias
// forever. The host now rewrites a legacy/aliased `view` param to its canonical
// form on mount; canonical or absent params are left untouched.
describe('PlayerStatsRoute view-mode URL normalization', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockSetSearchParams.mockClear();
    mockSearchParams = new URLSearchParams('sport=mlb');
    mockFootballEnabled = true;
  });

  it('rewrites the legacy alias view=batting to canonical view=hitters', () => {
    mockSearchParams = new URLSearchParams('sport=mlb&view=batting');
    render(<PlayerStatsRoute />);
    expect(mockSetSearchParams).toHaveBeenCalledTimes(1);
    const [params, opts] = mockSetSearchParams.mock.calls[0] as [
      URLSearchParams,
      { replace?: boolean },
    ];
    expect(params.get('view')).toBe('hitters');
    // Other params are preserved through the rewrite.
    expect(params.get('sport')).toBe('mlb');
    // History is replaced, not pushed, so Back doesn't return to the alias URL.
    expect(opts).toEqual({ replace: true });
  });

  it('rewrites the legacy alias view=pitching to canonical view=pitchers', () => {
    mockSearchParams = new URLSearchParams('view=pitching');
    render(<PlayerStatsRoute />);
    const [params] = mockSetSearchParams.mock.calls[0] as [URLSearchParams];
    expect(params.get('view')).toBe('pitchers');
  });

  it('rewrites a non-canonical value (view=fielding) to view=combined', () => {
    mockSearchParams = new URLSearchParams('view=fielding');
    render(<PlayerStatsRoute />);
    const [params] = mockSetSearchParams.mock.calls[0] as [URLSearchParams];
    expect(params.get('view')).toBe('combined');
  });

  it.each(['combined', 'hitters', 'pitchers'])(
    'does not rewrite an already-canonical view=%s',
    (view) => {
      mockSearchParams = new URLSearchParams(`view=${view}`);
      render(<PlayerStatsRoute />);
      expect(mockSetSearchParams).not.toHaveBeenCalled();
    },
  );

  it('does not add a view param when none is present', () => {
    mockSearchParams = new URLSearchParams('sport=mlb');
    render(<PlayerStatsRoute />);
    expect(mockSetSearchParams).not.toHaveBeenCalled();
  });
});

// LS-7132 / PST-072: when native share throws a non-AbortError AND the
// clipboard write also fails (or clipboard is unavailable), the toast used to
// show prose only ("Could not share link. Please copy the URL manually.") with
// no URL — leaving the user no way to recover. The host now renders the URL
// inline, pre-selected, so it can be copied manually.
describe('PlayerStatsRoute share fallback', () => {
  const originalShare = Object.getOwnPropertyDescriptor(navigator, 'share');
  const originalClipboard = Object.getOwnPropertyDescriptor(
    navigator,
    'clipboard',
  );

  const setShare = (value: unknown) =>
    Object.defineProperty(navigator, 'share', {
      value,
      configurable: true,
      writable: true,
    });
  const setClipboard = (value: unknown) =>
    Object.defineProperty(navigator, 'clipboard', {
      value,
      configurable: true,
      writable: true,
    });

  // The host builds the absolute URL from origin + relative path + sport. jsdom
  // origin is http://localhost; the mocked share button passes
  // /players/stats?view=combined and sport=mlb is appended.
  const EXPECTED_URL = 'http://localhost/players/stats?view=combined&sport=mlb';

  beforeEach(() => {
    mockNavigate.mockClear();
    mockSetSearchParams.mockClear();
    mockSearchParams = new URLSearchParams('sport=mlb');
    mockFootballEnabled = true;
  });

  afterEach(() => {
    // jsdom leaves `share` undefined and `clipboard` non-configurable by
    // default, so restore the captured descriptor when present and otherwise
    // reset to `undefined` (no `delete` needed — both reads check truthiness).
    Object.defineProperty(
      navigator,
      'share',
      originalShare ?? { value: undefined, configurable: true, writable: true },
    );
    Object.defineProperty(
      navigator,
      'clipboard',
      originalClipboard ?? {
        value: undefined,
        configurable: true,
        writable: true,
      },
    );
  });

  it('renders the URL inline (pre-selected) when share and clipboard both fail', async () => {
    setShare(jest.fn().mockRejectedValue(new Error('share unavailable')));
    setClipboard({
      writeText: jest.fn().mockRejectedValue(new Error('clipboard blocked')),
    });

    render(<PlayerStatsRoute />);
    fireEvent.click(screen.getByTestId('share-button'));

    const input = await screen.findByLabelText(/shareable link to copy/i);
    expect(input).toHaveValue(EXPECTED_URL);
    expect(input).toHaveAttribute('readonly');
    // The message renders in both the sr-only live region and the visible toast.
    expect(
      screen.getAllByText(
        /could not share link\. copy the url below manually/i,
      ),
    ).not.toHaveLength(0);
  });

  it('renders the URL inline when native share fails and clipboard is unavailable', async () => {
    setShare(jest.fn().mockRejectedValue(new Error('share unavailable')));
    setClipboard(undefined);

    render(<PlayerStatsRoute />);
    fireEvent.click(screen.getByTestId('share-button'));

    const input = await screen.findByLabelText(/shareable link to copy/i);
    expect(input).toHaveValue(EXPECTED_URL);
  });

  it('swallows AbortError (user dismissed the share sheet) — no toast, no URL', async () => {
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    setShare(jest.fn().mockRejectedValue(abort));
    setClipboard({ writeText: jest.fn() });

    render(<PlayerStatsRoute />);
    fireEvent.click(screen.getByTestId('share-button'));

    // Give the rejected promise a tick to settle, then assert nothing surfaced.
    await Promise.resolve();
    expect(
      screen.queryByLabelText(/shareable link to copy/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/could not share link/i)).not.toBeInTheDocument();
  });

  it('shows the copied confirmation (no URL fallback) when clipboard succeeds after share fails', async () => {
    setShare(jest.fn().mockRejectedValue(new Error('share unavailable')));
    const writeText = jest.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });

    render(<PlayerStatsRoute />);
    fireEvent.click(screen.getByTestId('share-button'));

    // The confirmation renders in both the sr-only live region and the toast.
    expect(
      await screen.findAllByText(/link copied to clipboard/i),
    ).not.toHaveLength(0);
    expect(writeText).toHaveBeenCalledWith(EXPECTED_URL);
    expect(
      screen.queryByLabelText(/shareable link to copy/i),
    ).not.toBeInTheDocument();
  });
});

// PST-070 / LS-7130: `/players/stats` is a public, shareable route, but the
// `userLeagues` query is auth-gated and throws AuthenticationError for
// signed-out visitors — surfacing an opaque global auth-error toast when a
// shared link is opened by an anonymous recipient. The route now skips the
// auth-gated query unless the visitor is authenticated.
describe('PlayerStatsRoute public-link auth gating (PST-070)', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockSetSearchParams.mockClear();
    mockUseGetUserLeaguesQuery.mockClear();
    mockSearchParams = new URLSearchParams('sport=mlb');
    mockFootballEnabled = true;
    mockIsAuthenticated = true;
    mockAuthLoading = false;
  });

  it('skips the auth-gated userLeagues query for signed-out visitors', () => {
    mockIsAuthenticated = false;
    mockAuthLoading = false;
    render(<PlayerStatsRoute />);
    const options = mockUseGetUserLeaguesQuery.mock.calls[0]?.[0] as
      | { skip?: boolean }
      | undefined;
    expect(options?.skip).toBe(true);
  });

  it('skips the auth-gated userLeagues query while auth is still resolving', () => {
    mockIsAuthenticated = false;
    mockAuthLoading = true;
    render(<PlayerStatsRoute />);
    const options = mockUseGetUserLeaguesQuery.mock.calls[0]?.[0] as
      | { skip?: boolean }
      | undefined;
    expect(options?.skip).toBe(true);
  });

  it('runs the userLeagues query for authenticated visitors', () => {
    mockIsAuthenticated = true;
    mockAuthLoading = false;
    render(<PlayerStatsRoute />);
    const options = mockUseGetUserLeaguesQuery.mock.calls[0]?.[0] as
      | { skip?: boolean }
      | undefined;
    expect(options?.skip).toBe(false);
  });
});

// PST-050 / LS-7123: a player click used to coerce the id with
// `parseInt(player.id, 10)`, so a brefId-style string id (e.g. 'troutmi01')
// silently became NaN and opened the detail view for player NaN. A non-numeric
// id still navigates to the raw id (the `/players/:id` route validates it via a
// strict /^\d+$/ check + brefId fallback) — never coerced to NaN. A NUMERIC id
// now opens the in-place modal instead of navigating (PST-051 reconciliation,
// below); these tests lock in that the click never produces a NaN id and that a
// brefId still routes externally.
describe('PlayerStatsRoute player click id handling (PST-050)', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockSetSearchParams.mockClear();
    mockSearchParams = new URLSearchParams('sport=mlb');
    mockFootballEnabled = true;
    mockOnPlayerDetailsRef.current = undefined;
  });

  it('navigates to the raw brefId-style string id without coercing it to NaN', () => {
    render(<PlayerStatsRoute />);
    act(() => {
      mockOnPlayerDetailsRef.current?.({ id: 'troutmi01' });
    });
    expect(mockNavigate).toHaveBeenCalledWith('/players/troutmi01');
    // The old parseInt path would have routed to /players/NaN.
    expect(mockNavigate).not.toHaveBeenCalledWith('/players/NaN');
  });

  it('opens the in-place modal for a numeric id (no external navigation)', () => {
    render(<PlayerStatsRoute />);
    act(() => {
      mockOnPlayerDetailsRef.current?.({ id: 12345 });
    });
    // Numeric click now writes ?playerId and opens the modal in place; it no
    // longer navigates away (PST-051 / LS-7124).
    expect(mockNavigate).not.toHaveBeenCalled();
    const params = mockSetSearchParams.mock.calls[0]?.[0] as URLSearchParams;
    expect(params.get('playerId')).toBe('12345');
  });
});

// PST-051 / LS-7124: the row-click detail modal was not a routable URL, so a
// shared link lost the selected-player context. The host now mirrors the
// selected player to a `playerId` search param: a numeric click opens the modal
// in place (preserving filters), closing strips it, a reload of ?playerId=X
// auto-opens it, and the modal offers an "open full page" affordance to navigate
// externally to /players/:id (the "both" reconciliation with PST-050).
describe('PlayerStatsRoute player deep link (PST-051)', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockSetSearchParams.mockClear();
    mockSearchParams = new URLSearchParams('sport=mlb');
    mockFootballEnabled = true;
    mockHasEntitlement = true;
    mockStatsPageProps = {};
    mockOnPlayerDetailsRef.current = undefined;
    // The close / filter-commit handlers read the LIVE URL (window.location)
    // rather than the React-state snapshot, so reset jsdom's history per test.
    window.history.replaceState(null, '', '/players/stats');
  });

  it('auto-opens the detail modal for the player in ?playerId on mount (AC3)', () => {
    mockSearchParams = new URLSearchParams('sport=mlb&playerId=42');
    render(<PlayerStatsRoute />);
    const modal = screen.getByTestId('player-detail-modal');
    expect(modal).toBeInTheDocument();
    expect(modal).toHaveAttribute('data-player-id', '42');
  });

  it('does not render the modal when no playerId param is present', () => {
    render(<PlayerStatsRoute />);
    expect(screen.queryByTestId('player-detail-modal')).not.toBeInTheDocument();
  });

  it('does not render the modal for an invalid playerId param', () => {
    mockSearchParams = new URLSearchParams('sport=mlb&playerId=not-a-number');
    render(<PlayerStatsRoute />);
    expect(screen.queryByTestId('player-detail-modal')).not.toBeInTheDocument();
  });

  it('writes ?playerId on a numeric row click while preserving filters (AC1, AC4)', () => {
    mockSearchParams = new URLSearchParams('sport=mlb&position=OF');
    render(<PlayerStatsRoute />);
    act(() => {
      mockOnPlayerDetailsRef.current?.({ id: 42 });
    });
    const [params, opts] = mockSetSearchParams.mock.calls[0] as [
      URLSearchParams,
      unknown,
    ];
    expect(params.get('playerId')).toBe('42');
    // Existing filter context is carried through unchanged.
    expect(params.get('position')).toBe('OF');
    // Opening pushes (no replace) so Back closes the modal.
    expect(opts).toBeUndefined();
  });

  it('strips ?playerId when the modal closes, keeping filters (AC2, AC4)', () => {
    mockSearchParams = new URLSearchParams('sport=mlb&playerId=42&position=OF');
    // Close strips playerId from the live URL, so mirror the snapshot into
    // jsdom history (LS-8260).
    window.history.replaceState(
      null,
      '',
      `/players/stats?${mockSearchParams.toString()}`,
    );
    render(<PlayerStatsRoute />);
    fireEvent.click(screen.getByTestId('close-modal'));
    const [params, opts] = mockSetSearchParams.mock.calls[0] as [
      URLSearchParams,
      { replace?: boolean },
    ];
    expect(params.has('playerId')).toBe(false);
    expect(params.get('position')).toBe('OF');
    expect(opts).toEqual({ replace: true });
  });

  it('preserves an open playerId across a filter commit (AC3 guard)', () => {
    // The shared list fires onFiltersChange from a mount effect; if the rebuild
    // dropped playerId it would close the deep-linked modal on reload.
    mockSearchParams = new URLSearchParams('sport=mlb&playerId=42');
    // The commit handler reads playerId from the live URL (LS-8260).
    window.history.replaceState(
      null,
      '',
      `/players/stats?${mockSearchParams.toString()}`,
    );
    render(<PlayerStatsRoute />);
    act(() => {
      (mockStatsPageProps.onFiltersChange as (state: unknown) => void)?.({
        viewMode: 'combined',
        pageSize: 25,
        filters: {},
      });
    });
    const params = mockSetSearchParams.mock.calls.at(
      -1,
    )?.[0] as URLSearchParams;
    expect(params.get('playerId')).toBe('42');
  });

  it('navigates externally to /players/:id from the modal "open full page" affordance', () => {
    mockSearchParams = new URLSearchParams('sport=mlb&playerId=42');
    render(<PlayerStatsRoute />);
    fireEvent.click(screen.getByTestId('view-full-page'));
    expect(mockNavigate).toHaveBeenCalledWith('/players/42');
  });
});

// Export resource-cleanup lifecycle (LS-7660 / GAP-002). The export path creates
// a Blob object URL, clicks a programmatic <a>, and must ALWAYS revoke the URL —
// including the error path — so repeated/concurrent exports never leak URLs.
describe('PlayerStatsRoute export object-URL cleanup', () => {
  const createObjectURL = jest.fn<string, [Blob]>();
  const revokeObjectURL = jest.fn<void, [string]>();
  let urlSeq = 0;

  beforeEach(() => {
    mockNavigate.mockClear();
    mockSetSearchParams.mockClear();
    mockSearchParams = new URLSearchParams('sport=mlb');
    mockFootballEnabled = true;
    mockStatsPageProps = {};

    urlSeq = 0;
    createObjectURL.mockReset();
    revokeObjectURL.mockReset();
    createObjectURL.mockImplementation(() => `blob:mock-${++urlSeq}`);
    // jsdom does not implement the object-URL APIs — install spies for the test.
    (
      URL as unknown as { createObjectURL: typeof createObjectURL }
    ).createObjectURL = createObjectURL;
    (
      URL as unknown as { revokeObjectURL: typeof revokeObjectURL }
    ).revokeObjectURL = revokeObjectURL;
  });

  function getOnExport(): (filters: unknown, viewMode: string) => void {
    render(<PlayerStatsRoute />);
    const onExport = mockStatsPageProps.onExport as (
      filters: unknown,
      viewMode: string,
    ) => void;
    expect(typeof onExport).toBe('function');
    return onExport;
  }

  it('revokes the object URL on a successful export', () => {
    // Premium viewer (default) so the export actually runs.
    mockHasEntitlement = true;
    const onExport = getOnExport();
    act(() => {
      onExport({}, 'combined');
    });

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-1');
  });

  it('revokes the object URL even when the link click throws', () => {
    mockHasEntitlement = true;
    const onExport = getOnExport();
    const clickSpy = jest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {
        throw new Error('blocked');
      });

    try {
      expect(() => onExport({}, 'combined')).toThrow('blocked');
      // Cleanup still runs on the error path — no leaked object URL.
      expect(revokeObjectURL).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-1');
      // The transient <a> is removed even when click throws.
      expect(document.querySelector('a[download]')).toBeNull();
    } finally {
      clickSpy.mockRestore();
    }
  });

  it('revokes a distinct URL for every export across repeated exports', () => {
    mockHasEntitlement = true;
    const onExport = getOnExport();

    for (let i = 0; i < 50; i++) {
      act(() => {
        onExport({}, 'combined');
      });
    }

    expect(createObjectURL).toHaveBeenCalledTimes(50);
    expect(revokeObjectURL).toHaveBeenCalledTimes(50);
    // Every created URL was revoked exactly once (no leaks, no double-revoke).
    const created = createObjectURL.mock.results.map((r) => String(r.value));
    const revoked = revokeObjectURL.mock.calls.map((c) => c[0]);
    expect(new Set(revoked)).toEqual(new Set(created));
    expect(revoked).toHaveLength(new Set(revoked).size);
  });
});

// LS-5591: Export JSON is available to all viewers (entitlement `all`). The
// host passes canExport={true} unconditionally so every signed-in or anonymous
// user can download the filtered stats.
describe('PlayerStatsRoute export entitlement (LS-5591)', () => {
  let createObjectURL: jest.Mock;

  beforeEach(() => {
    mockNavigate.mockClear();
    mockSetSearchParams.mockClear();
    mockSearchParams = new URLSearchParams('sport=mlb');
    mockFootballEnabled = true;
    mockIsAuthenticated = true;
    mockAuthLoading = false;
    // jsdom does not implement object-URL APIs; stub them so handleExport's
    // download path can run and be observed.
    createObjectURL = jest.fn(() => 'blob:mock');
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = jest.fn();
  });

  it('grants the export capability (canExport=true) to all viewers', () => {
    mockHasEntitlement = true;
    render(<PlayerStatsRoute />);
    expect(screen.getByTestId('can-export')).toHaveTextContent('true');
  });

  it('grants the export capability (canExport=true) to non-premium viewers', () => {
    mockHasEntitlement = false;
    render(<PlayerStatsRoute />);
    expect(screen.getByTestId('can-export')).toHaveTextContent('true');
  });

  it('grants the column-customization capability (canCustomizeColumns=true) to premium viewers (PST-003 / LS-7107)', () => {
    mockHasEntitlement = true;
    render(<PlayerStatsRoute />);
    expect(screen.getByTestId('can-customize-columns')).toHaveTextContent(
      'true',
    );
  });

  it('withholds the column-customization capability (canCustomizeColumns=false) from non-premium viewers (PST-003 / LS-7107)', () => {
    mockHasEntitlement = false;
    render(<PlayerStatsRoute />);
    expect(screen.getByTestId('can-customize-columns')).toHaveTextContent(
      'false',
    );
  });

  it('runs the client-side export for premium viewers', () => {
    mockHasEntitlement = true;
    render(<PlayerStatsRoute />);
    fireEvent.click(screen.getByTestId('export-button'));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('runs the client-side export for non-premium viewers', () => {
    mockHasEntitlement = false;
    render(<PlayerStatsRoute />);
    fireEvent.click(screen.getByTestId('export-button'));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });
});

// PST-014 / LS-7112: Premium viewers get CSV and XLSX export format options.
describe('PlayerStatsRoute export formats (PST-014 / LS-7112)', () => {
  let createObjectURL: jest.Mock;

  beforeEach(() => {
    mockNavigate.mockClear();
    mockSetSearchParams.mockClear();
    mockSearchParams = new URLSearchParams('sport=mlb');
    mockFootballEnabled = true;
    mockIsAuthenticated = true;
    mockAuthLoading = false;
    mockStatsPageProps = {};
    createObjectURL = jest.fn(() => 'blob:mock');
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = jest.fn();
  });

  it('passes exportFormats ["json","csv","xlsx"] to premium viewers', () => {
    mockHasEntitlement = true;
    render(<PlayerStatsRoute />);
    expect(screen.getByTestId('export-formats')).toHaveTextContent(
      'json,csv,xlsx',
    );
  });

  it('passes exportFormats ["json"] to non-premium viewers', () => {
    mockHasEntitlement = false;
    render(<PlayerStatsRoute />);
    expect(screen.getByTestId('export-formats')).toHaveTextContent('json');
  });

  it('triggers a CSV download when format is csv', () => {
    mockHasEntitlement = true;
    render(<PlayerStatsRoute />);
    fireEvent.click(screen.getByTestId('export-csv-button'));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe('text/csv');
  });

  it('triggers an XLSX download when format is xlsx', () => {
    mockHasEntitlement = true;
    render(<PlayerStatsRoute />);
    fireEvent.click(screen.getByTestId('export-xlsx-button'));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
  });

  it('does not run CSV export for non-premium viewers', () => {
    mockHasEntitlement = false;
    render(<PlayerStatsRoute />);
    fireEvent.click(screen.getByTestId('export-csv-button'));
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('does not run XLSX export for non-premium viewers', () => {
    mockHasEntitlement = false;
    render(<PlayerStatsRoute />);
    fireEvent.click(screen.getByTestId('export-xlsx-button'));
    expect(createObjectURL).not.toHaveBeenCalled();
  });
});

// LS-7138 / PST-090: the stats-format preference is persisted server-side and
// hydrated into the page via Apollo, with localStorage kept only as a cold-load
// fallback. These tests exercise the hydration effect with real server data.
describe('PlayerStatsRoute server-side stats-format hydration', () => {
  const PREFS_KEY = 'ls_user_preferences';

  beforeEach(() => {
    mockNavigate.mockClear();
    mockSetSearchParams.mockClear();
    mockSearchParams = new URLSearchParams('sport=mlb');
    mockFootballEnabled = true;
    mockUserPrefsData = null;
    mockIsAuthenticated = false;
    localStorage.clear();
  });

  it('hydrates statsFormat from the server and mirrors it to localStorage', async () => {
    // localStorage seeds 'standard'; the server says 'expanded' and must win.
    localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({ statsFormat: 'standard' }),
    );
    mockIsAuthenticated = true;
    mockUserPrefsData = { getUserPreferences: { statsFormat: 'expanded' } };

    render(<PlayerStatsRoute />);

    expect(await screen.findByTestId('stats-format')).toHaveTextContent(
      'expanded',
    );
    // The resolved server value is mirrored back into the localStorage blob so
    // the next cold load reflects it.
    const stored = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as {
      statsFormat?: string;
    };
    expect(stored.statsFormat).toBe('expanded');
  });

  it('preserves other localStorage keys when mirroring the server value', async () => {
    localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({ statsFormat: 'standard', theme: 'dark' }),
    );
    mockIsAuthenticated = true;
    mockUserPrefsData = { getUserPreferences: { statsFormat: 'expanded' } };

    render(<PlayerStatsRoute />);
    await screen.findByTestId('stats-format');

    const stored = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as {
      statsFormat?: string;
      theme?: string;
    };
    expect(stored).toEqual({ statsFormat: 'expanded', theme: 'dark' });
  });

  it('falls back to the localStorage value when the server returns no preferences', () => {
    localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({ statsFormat: 'expanded' }),
    );
    mockIsAuthenticated = true;
    mockUserPrefsData = { getUserPreferences: null };

    render(<PlayerStatsRoute />);

    expect(screen.getByTestId('stats-format')).toHaveTextContent('expanded');
  });

  it('ignores an unexpected server statsFormat value', () => {
    localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({ statsFormat: 'standard' }),
    );
    mockIsAuthenticated = true;
    mockUserPrefsData = {
      getUserPreferences: { statsFormat: 'bogus' },
    };

    render(<PlayerStatsRoute />);

    // Unknown values are not applied; the localStorage cold-load value stands.
    expect(screen.getByTestId('stats-format')).toHaveTextContent('standard');
  });
});
