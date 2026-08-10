import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { isCrawlerUserAgent, PlayerStatsRoute } from './PlayerStatsPage';

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

// Viewport detection (LS-9075). Defaults to desktop (`sm: false`) so every
// pre-existing test in this file keeps exercising the table/FootballStatsPage
// branch unchanged; the narrow-viewport describe block below opts into
// `sm: true` per test.
let mockMediaSm = false;
jest.mock('tamagui', () => ({
  useMedia: () => ({ sm: mockMediaSm }),
}));

jest.mock('../../context/GrowthBookProvider', () => ({
  useFeatureValue: () => mockFootballEnabled,
}));

// Capture the props the route passes to the shared PlayerStatsPage so tests can
// drive callbacks (e.g. onExport) directly. Prefixed with `mock` so the hoisted
// jest.mock factory is allowed to reference it.
let mockStatsPageProps: Record<string, unknown> = {};
let mockFootballStatsPageProps: Record<string, unknown> = {};
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
          onClick={() => props.onShare?.('/players?view=combined')}
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
  // Batting sort-field guard used by the MLB URL parser — only reached when a
  // `sortBy` param is present (the LS-8566 tests set one).
  isValidBattingSortField: (value: string) =>
    ['homeRuns', 'battingAvg', 'hits', 'rbi', 'name'].includes(value),
  // Football stats-grid helpers (LS-8566) — lightweight mirrors of the shared
  // implementations, enough for the route's parse/guard paths.
  normalizeFootballView: (raw: string | null | undefined) =>
    raw != null &&
    [
      'overview',
      'passing',
      'rushing',
      'receiving',
      'kicking',
      'idp',
      'defense',
    ].includes(raw)
      ? raw
      : 'overview',
  isFootballSortField: (value: string) =>
    ['name', 'position', 'team'].includes(value) ||
    /^(passing|rushing|receiving|kicking|idp|defense)\.[A-Za-z]+$/.test(value),
  parseFootballPositions: (raw: string | null) =>
    (raw ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) =>
        ['QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'DST', 'DL', 'LB', 'DB'].includes(
          s,
        ),
      ),
  // Column-visibility helpers consumed by the host's URL parse/serialize +
  // localStorage paths (LS-7105 / PST-001). Lightweight stand-ins are enough for
  // the route-level assertions here.
  STATS_TOGGLEABLE_COLUMN_KEYS: ['homeRuns', 'era', 'strikeouts'],
  parseVisibleColumns: (raw: string | null) =>
    raw == null || raw === '' ? null : raw === 'none' ? [] : raw.split(','),
  serializeVisibleColumns: (cols: readonly string[] | null) =>
    cols === null ? null : cols.length === 0 ? 'none' : cols.join(','),
  // The NFL view renders inline through the shared FootballStatsPage shell
  // binding (LS-8442). A lightweight marker stands in for the graphql/Tamagui
  // -heavy real component; capture props so the host wiring can be asserted and
  // a player click can be simulated.
  FootballStatsPage: (props: {
    title?: string;
    isPremium?: boolean;
    onPlayerDetails?: (playerId: number) => void;
    [key: string]: unknown;
  }) => {
    mockFootballStatsPageProps = props;
    return (
      <div
        data-testid="football-stats-page"
        data-title={String(props.title)}
        data-premium={String(props.isPremium)}
      />
    );
  },
}));

// Narrow-viewport card feed (LS-9075). Mocked wholesale (rather than mocking
// every cardFeed export it pulls from shared-components) with lightweight
// markers that capture the props the route passes, so player-press/premium/
// compare wiring can be asserted without pulling in the real GraphQL-backed
// card components.
let mockBaseballCardFeedProps: Record<string, unknown> = {};
let mockFootballCardFeedProps: Record<string, unknown> = {};
jest.mock('./PlayerStatsCardFeed', () => ({
  WebBaseballCardFeed: (props: Record<string, unknown>) => {
    mockBaseballCardFeedProps = props;
    return (
      <div data-testid="mlb-card-feed" data-premium={String(props.isPremium)} />
    );
  },
  WebFootballCardFeed: (props: Record<string, unknown>) => {
    mockFootballCardFeedProps = props;
    return (
      <div data-testid="nfl-card-feed" data-premium={String(props.isPremium)} />
    );
  },
}));

// The football detail modal (LS-8442) is graphql/Tamagui-heavy; mock it with a
// lightweight marker so the NFL deep-link path can be asserted without pulling
// the real component into the unit test.
jest.mock('../../components/FootballPlayerDetailModal', () => ({
  FootballPlayerDetailModal: ({
    playerId,
    onOpenChange,
    onViewFullPage,
  }: {
    playerId: number | null;
    onOpenChange: (open: boolean) => void;
    onViewFullPage?: () => void;
  }) => (
    <div
      data-testid="football-player-detail-modal"
      data-player-id={String(playerId)}
    >
      <button
        data-testid="close-football-modal"
        onClick={() => onOpenChange(false)}
      >
        close
      </button>
      <button
        data-testid="football-view-full-page"
        onClick={() => onViewFullPage?.()}
      >
        full page
      </button>
    </div>
  ),
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

// Default every test to a premium viewer and a desktop viewport; suites that
// need a free viewer or narrow viewport opt in within their own (inner)
// beforeEach/test. Resetting `mockMediaSm` globally (not only in the LS-9075
// describe block) matters — without it, a narrow-viewport test earlier in the
// file would leak into every later test, silently switching them from the
// table/FootballStatsPage branch onto the (here, unmocked-per-suite) card
// feed branch.
beforeEach(() => {
  mockHasEntitlement = true;
  mockMediaSm = false;
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
      await screen.findByTestId('football-stats-page'),
    ).toBeInTheDocument();
    // Inline render replaces the old redirect to /football/players.
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  // LS-8442: the inline NFL view now renders through the shared PlayerStatsShell
  // (via FootballStatsPage), which owns the branded "NFL Player Statistics"
  // header + share action internally. The route passes the title and premium
  // wiring down; the header is no longer rendered by the route itself.
  it('renders the NFL stats page through the shared shell with the NFL title', async () => {
    mockSearchParams = new URLSearchParams('sport=nfl');
    render(<PlayerStatsRoute />);
    const page = await screen.findByTestId('football-stats-page');
    expect(page).toHaveAttribute('data-title', 'NFL Player Statistics');
    expect(mockFootballStatsPageProps.title).toBe('NFL Player Statistics');
  });

  it('renders the baseball stats page (not football) when sport=mlb', () => {
    mockSearchParams = new URLSearchParams('sport=mlb');
    render(<PlayerStatsRoute />);
    expect(screen.queryByTestId('football-stats-page')).not.toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('falls back to baseball when sport=nfl but football is disabled', () => {
    mockSearchParams = new URLSearchParams('sport=nfl');
    mockFootballEnabled = false;
    render(<PlayerStatsRoute />);
    expect(screen.queryByTestId('football-stats-page')).not.toBeInTheDocument();
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
    await screen.findByTestId('football-stats-page');
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

  // LS-8566: handleSelectSport builds a FRESH param set. NFL params
  // (position=QB, view=passing, stat sortBy) leaking into the MLB parser
  // corrupted its position filter; and vice versa.
  it('switches sports with a fresh sport-only param set (no cross-sport leakage)', async () => {
    mockSearchParams = new URLSearchParams(
      'sport=nfl&position=QB&view=passing&sortBy=passing.yds&pageSize=50',
    );
    render(<PlayerStatsRoute />);
    await screen.findByTestId('football-stats-page');
    fireEvent.click(
      screen.getByRole('button', { name: /view mlb statistics/i }),
    );
    const params = mockSetSearchParams.mock.calls[0][0] as URLSearchParams;
    expect(params.get('sport')).toBe('mlb');
    expect([...params.keys()]).toEqual(['sport']);
    // Push (no replace option) so Back restores the previous sport view.
    expect(mockSetSearchParams.mock.calls[0][1]).toBeUndefined();
  });
});

// LS-8566: the NFL handlers used to be defined inline inside the showFootball
// branch, giving `onFiltersChange` a fresh identity every render. The football
// controller's URL-mirror effect depends on that identity, so each render
// re-fired the effect → setSearchParams(replace) → re-render → infinite loop
// that also stomped sport switches back to sport=nfl.
describe('PlayerStatsRoute NFL filter mirroring (LS-8566)', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockSetSearchParams.mockClear();
    mockSearchParams = new URLSearchParams('sport=nfl');
    mockFootballEnabled = true;
  });

  it('passes a stable onFiltersChange identity across re-renders (loop regression)', async () => {
    const { rerender } = render(<PlayerStatsRoute />);
    await screen.findByTestId('football-stats-page');
    const first = mockFootballStatsPageProps.onFiltersChange;
    expect(typeof first).toBe('function');
    rerender(<PlayerStatsRoute />);
    expect(mockFootballStatsPageProps.onFiltersChange).toBe(first);
  });

  it('seeds the football controller with view and namespaced sort from the URL', async () => {
    mockSearchParams = new URLSearchParams(
      'sport=nfl&view=passing&sortBy=passing.yds&sortDir=desc',
    );
    render(<PlayerStatsRoute />);
    await screen.findByTestId('football-stats-page');
    expect(mockFootballStatsPageProps.initialFilters).toMatchObject({
      view: 'passing',
      sortField: 'passing.yds',
      sortDir: 'desc',
    });
  });

  it('normalizes an unknown view param to overview and drops an unknown sortBy', async () => {
    mockSearchParams = new URLSearchParams(
      'sport=nfl&view=batting&sortBy=fpts',
    );
    render(<PlayerStatsRoute />);
    await screen.findByTestId('football-stats-page');
    const initialFilters = mockFootballStatsPageProps.initialFilters as Record<
      string,
      unknown
    >;
    expect(initialFilters.view).toBe('overview');
    expect(initialFilters.sortField).toBeUndefined();
  });

  it('mirrors committed filters to the URL with sport and view pinned (replace)', async () => {
    render(<PlayerStatsRoute />);
    await screen.findByTestId('football-stats-page');
    const onFiltersChange = mockFootballStatsPageProps.onFiltersChange as (
      state: unknown,
    ) => void;
    act(() =>
      onFiltersChange({
        view: 'rushing',
        pageSize: 50,
        filters: { positions: ['RB'] },
      }),
    );
    const call = mockSetSearchParams.mock.calls.at(-1) as [
      URLSearchParams,
      { replace?: boolean } | undefined,
    ];
    expect(call[0].get('sport')).toBe('nfl');
    expect(call[0].get('view')).toBe('rushing');
    expect(call[0].get('pageSize')).toBe('50');
    expect(call[0].get('position')).toBe('RB');
    expect(call[1]).toEqual({ replace: true });
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
  // /players?view=combined and sport=mlb is appended.
  const EXPECTED_URL = 'http://localhost/players?view=combined&sport=mlb';

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

// LS-9141 hid the availability filter whenever the viewer's league count for
// the active sport wasn't exactly one, since `useLeagueRosteredPlayerIds`
// aggregated across every league of the sport with no way to scope to one.
// LS-9158 replaces "hide when ambiguous" with a league picker: the filter now
// shows whenever the viewer has at least one league, and a `leagues` list is
// passed down (only when there's a real choice to make, i.e. 2+) so the
// multi-league case can be scoped instead of staying ambiguous.
describe('PlayerStatsRoute availability filter league gating (LS-9141 / LS-9158)', () => {
  function setUserLeagues(
    leagues: ReadonlyArray<{
      id: number;
      name: string;
      sport: 'Baseball' | 'Football';
    }>,
  ) {
    mockUseGetUserLeaguesQuery.mockReturnValue({
      data: { userLeagues: leagues },
      loading: false,
    } as never);
  }

  beforeEach(() => {
    mockIsAuthenticated = true;
    mockAuthLoading = false;
  });

  afterEach(() => {
    mockUseGetUserLeaguesQuery.mockReturnValue({ data: null, loading: false });
  });

  it('hides the baseball availability filter with zero baseball leagues', () => {
    mockSearchParams = new URLSearchParams('sport=mlb');
    setUserLeagues([]);
    render(<PlayerStatsRoute />);
    expect(mockStatsPageProps.showAvailabilityFilter).toBe(false);
    expect(mockStatsPageProps.leagues).toBeUndefined();
  });

  it('shows the baseball availability filter with exactly one baseball league and no picker', () => {
    mockSearchParams = new URLSearchParams('sport=mlb');
    setUserLeagues([{ id: 1, name: 'Dynasty A', sport: 'Baseball' }]);
    render(<PlayerStatsRoute />);
    expect(mockStatsPageProps.showAvailabilityFilter).toBe(true);
    expect(mockStatsPageProps.leagueId).toBe(1);
    expect(mockStatsPageProps.leagues).toBeUndefined();
  });

  it('shows the baseball availability filter with a league picker for two-plus baseball leagues', () => {
    mockSearchParams = new URLSearchParams('sport=mlb');
    setUserLeagues([
      { id: 1, name: 'Dynasty A', sport: 'Baseball' },
      { id: 2, name: 'Dynasty B', sport: 'Baseball' },
    ]);
    render(<PlayerStatsRoute />);
    expect(mockStatsPageProps.showAvailabilityFilter).toBe(true);
    expect(mockStatsPageProps.leagues).toEqual([
      { id: 1, name: 'Dynasty A' },
      { id: 2, name: 'Dynasty B' },
    ]);
    // Defaults to the first league until the viewer picks one.
    expect(mockStatsPageProps.leagueId).toBe(1);
  });

  it('hides the football availability filter with zero football leagues', () => {
    mockSearchParams = new URLSearchParams('sport=nfl');
    setUserLeagues([]);
    render(<PlayerStatsRoute />);
    expect(mockFootballStatsPageProps.showAvailabilityFilter).toBe(false);
    expect(mockFootballStatsPageProps.leagues).toBeUndefined();
  });

  it('shows the football availability filter with exactly one football league and no picker', () => {
    mockSearchParams = new URLSearchParams('sport=nfl');
    setUserLeagues([{ id: 3, name: 'Gridiron A', sport: 'Football' }]);
    render(<PlayerStatsRoute />);
    expect(mockFootballStatsPageProps.showAvailabilityFilter).toBe(true);
    expect(mockFootballStatsPageProps.leagueId).toBe(3);
    expect(mockFootballStatsPageProps.leagues).toBeUndefined();
  });

  it('shows the football availability filter with a league picker for two-plus football leagues', () => {
    mockSearchParams = new URLSearchParams('sport=nfl');
    setUserLeagues([
      { id: 3, name: 'Gridiron A', sport: 'Football' },
      { id: 4, name: 'Gridiron B', sport: 'Football' },
    ]);
    render(<PlayerStatsRoute />);
    expect(mockFootballStatsPageProps.showAvailabilityFilter).toBe(true);
    expect(mockFootballStatsPageProps.leagues).toEqual([
      { id: 3, name: 'Gridiron A' },
      { id: 4, name: 'Gridiron B' },
    ]);
    expect(mockFootballStatsPageProps.leagueId).toBe(3);
  });
});

describe('isCrawlerUserAgent (LS-9075)', () => {
  it.each([
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
    'facebookexternalhit/1.1',
    'Twitterbot/1.0',
    'Slackbot-LinkExpanding 1.0',
  ])('flags known crawler UA: %s', (ua) => {
    expect(isCrawlerUserAgent(ua)).toBe(true);
  });

  it.each([
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0',
  ])('does not flag an ordinary browser UA: %s', (ua) => {
    expect(isCrawlerUserAgent(ua)).toBe(false);
  });

  it('does not flag a null/undefined user agent', () => {
    expect(isCrawlerUserAgent(undefined)).toBe(false);
    expect(isCrawlerUserAgent(null)).toBe(false);
    expect(isCrawlerUserAgent('')).toBe(false);
  });
});

// LS-9075: /players/stats renders the card feed at phone width and the
// existing table/FootballStatsPage at desktop width, for both sports. The
// entitlement gate must be unaffected by which presentation renders.
describe('PlayerStatsRoute narrow-viewport card feed (LS-9075)', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockSetSearchParams.mockClear();
    mockFootballEnabled = true;
    mockHasEntitlement = true;
    mockBaseballCardFeedProps = {};
    mockFootballCardFeedProps = {};
    mockMediaSm = false;
  });

  it('renders the MLB table (not the card feed) at desktop width', () => {
    mockSearchParams = new URLSearchParams('sport=mlb');
    mockMediaSm = false;
    render(<PlayerStatsRoute />);
    expect(screen.queryByTestId('mlb-card-feed')).not.toBeInTheDocument();
  });

  it('renders the MLB card feed (not the table) at phone width', () => {
    mockSearchParams = new URLSearchParams('sport=mlb');
    mockMediaSm = true;
    render(<PlayerStatsRoute />);
    expect(screen.getByTestId('mlb-card-feed')).toBeInTheDocument();
  });

  it('renders the NFL FootballStatsPage (not the card feed) at desktop width', async () => {
    mockSearchParams = new URLSearchParams('sport=nfl');
    mockMediaSm = false;
    render(<PlayerStatsRoute />);
    await screen.findByTestId('football-stats-page');
    expect(screen.queryByTestId('nfl-card-feed')).not.toBeInTheDocument();
  });

  it('renders the NFL card feed (not FootballStatsPage) at phone width', () => {
    mockSearchParams = new URLSearchParams('sport=nfl');
    mockMediaSm = true;
    render(<PlayerStatsRoute />);
    expect(screen.getByTestId('nfl-card-feed')).toBeInTheDocument();
    expect(screen.queryByTestId('football-stats-page')).not.toBeInTheDocument();
  });

  it('threads the real entitlement into the MLB card feed (gate unaffected by presentation)', () => {
    mockSearchParams = new URLSearchParams('sport=mlb');
    mockMediaSm = true;
    mockHasEntitlement = false;
    render(<PlayerStatsRoute />);
    expect(screen.getByTestId('mlb-card-feed')).toHaveAttribute(
      'data-premium',
      'false',
    );
  });

  it('threads the real entitlement into the NFL card feed', () => {
    mockSearchParams = new URLSearchParams('sport=nfl');
    mockMediaSm = true;
    mockHasEntitlement = true;
    render(<PlayerStatsRoute />);
    expect(screen.getByTestId('nfl-card-feed')).toHaveAttribute(
      'data-premium',
      'true',
    );
  });

  it('opens the in-place modal when the MLB card feed presses a numeric player id', () => {
    mockSearchParams = new URLSearchParams('sport=mlb');
    mockMediaSm = true;
    render(<PlayerStatsRoute />);
    const onPlayerPress = mockBaseballCardFeedProps.onPlayerPress as (
      id: string,
    ) => void;
    act(() => onPlayerPress('4242'));
    const params = mockSetSearchParams.mock.calls[0][0] as URLSearchParams;
    expect(params.get('playerId')).toBe('4242');
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('navigates to the raw NFL card-feed player id via the football handler', () => {
    mockSearchParams = new URLSearchParams('sport=nfl');
    mockMediaSm = true;
    render(<PlayerStatsRoute />);
    const onPlayerPress = mockFootballCardFeedProps.onPlayerPress as (
      id: string,
    ) => void;
    act(() => onPlayerPress('99'));
    const params = mockSetSearchParams.mock.calls[0][0] as URLSearchParams;
    expect(params.get('playerId')).toBe('99');
  });

  it('navigates to /players/compare from the MLB card feed overflow action', () => {
    mockSearchParams = new URLSearchParams('sport=mlb');
    mockMediaSm = true;
    render(<PlayerStatsRoute />);
    (mockBaseballCardFeedProps.onCompare as () => void)?.();
    expect(mockNavigate).toHaveBeenCalledWith('/players/compare');
  });

  it('preserves other filters in the URL when the card feed opens a player deep link', () => {
    mockSearchParams = new URLSearchParams('sport=mlb&position=OF');
    mockMediaSm = true;
    render(<PlayerStatsRoute />);
    const onPlayerPress = mockBaseballCardFeedProps.onPlayerPress as (
      id: string,
    ) => void;
    act(() => onPlayerPress('7'));
    const params = mockSetSearchParams.mock.calls[0][0] as URLSearchParams;
    expect(params.get('position')).toBe('OF');
    expect(params.get('sport')).toBe('mlb');
  });

  // LS-9075 risk note: /players/stats has no server-side prerender — every
  // crawler must execute the client React app itself, and Google's indexing
  // crawler renders at a narrow mobile viewport by default. Forcing the
  // desktop table for a known crawler UA keeps the indexed content the same
  // full, filterable table regardless of the crawler's actual viewport.
  describe('crawler UA forces the desktop table even at phone width', () => {
    const originalUserAgent = window.navigator.userAgent;

    afterEach(() => {
      Object.defineProperty(window.navigator, 'userAgent', {
        value: originalUserAgent,
        configurable: true,
      });
    });

    it('renders the MLB table (not the card feed) for Googlebot at phone width', () => {
      Object.defineProperty(window.navigator, 'userAgent', {
        value:
          'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        configurable: true,
      });
      mockSearchParams = new URLSearchParams('sport=mlb');
      mockMediaSm = true;
      render(<PlayerStatsRoute />);
      expect(screen.queryByTestId('mlb-card-feed')).not.toBeInTheDocument();
    });

    it('renders the NFL FootballStatsPage (not the card feed) for Googlebot at phone width', async () => {
      Object.defineProperty(window.navigator, 'userAgent', {
        value:
          'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        configurable: true,
      });
      mockSearchParams = new URLSearchParams('sport=nfl');
      mockMediaSm = true;
      render(<PlayerStatsRoute />);
      await screen.findByTestId('football-stats-page');
      expect(screen.queryByTestId('nfl-card-feed')).not.toBeInTheDocument();
    });
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
    window.history.replaceState(null, '', '/players');
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
      `/players?${mockSearchParams.toString()}`,
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
      `/players?${mockSearchParams.toString()}`,
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

// LS-9140: Export (all formats, including JSON) is a premium-only feature.
// The host passes canExport={isPremium} so free/anonymous viewers never get
// the export capability.
describe('PlayerStatsRoute export entitlement (LS-9140)', () => {
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

  it('grants the export capability (canExport=true) to premium viewers', () => {
    mockHasEntitlement = true;
    render(<PlayerStatsRoute />);
    expect(screen.getByTestId('can-export')).toHaveTextContent('true');
  });

  it('withholds the export capability (canExport=false) from non-premium viewers (LS-9140)', () => {
    mockHasEntitlement = false;
    render(<PlayerStatsRoute />);
    expect(screen.getByTestId('can-export')).toHaveTextContent('false');
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

  it('does not run the client-side export for non-premium viewers (LS-9140)', () => {
    mockHasEntitlement = false;
    render(<PlayerStatsRoute />);
    fireEvent.click(screen.getByTestId('export-button'));
    expect(createObjectURL).not.toHaveBeenCalled();
  });
});

// PST-014 / LS-7112 (superseded by LS-9140): Premium viewers get CSV and XLSX
// export format options in addition to JSON; non-premium viewers get none.
describe('PlayerStatsRoute export formats (PST-014 / LS-7112, LS-9140)', () => {
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

  it('passes exportFormats [] to non-premium viewers (LS-9140)', () => {
    mockHasEntitlement = false;
    render(<PlayerStatsRoute />);
    expect(screen.getByTestId('export-formats')).toHaveTextContent('');
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

  it('does not run JSON export for non-premium viewers (LS-9140)', () => {
    mockHasEntitlement = false;
    render(<PlayerStatsRoute />);
    fireEvent.click(screen.getByTestId('export-button'));
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
