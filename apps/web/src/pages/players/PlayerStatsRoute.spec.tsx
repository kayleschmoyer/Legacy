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

jest.mock('@legacy-sports/shared-components/players', () => ({
  // Expose a Share affordance so the host's onShare handler (and its
  // clipboard/manual-copy fallback) can be exercised. The shared component
  // passes a relative URL; the host prepends origin + sport. Also capture the
  // onPlayerDetails callback so a player click can be simulated directly.
  PlayerStatsPage: ({
    onShare,
    onPlayerDetails,
  }: {
    onShare?: (relativeUrl: string) => void;
    onPlayerDetails?: (player: { id: string | number }) => void;
  }) => {
    mockOnPlayerDetailsRef.current = onPlayerDetails;
    return (
      <button
        type="button"
        data-testid="share-button"
        onClick={() => onShare?.('/players/stats?view=combined')}
      >
        Share
      </button>
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

jest.mock('../../hooks/useIsPremium', () => ({
  useIsPremium: () => true,
  useHasEntitlement: () => true,
}));

jest.mock('../../components/PlayerDetailModal', () => ({
  PlayerDetailModal: () => null,
}));

jest.mock('@legacy-sports/graphql', () => ({
  useGetPlayerIdByBrefIdQuery: () => ({ data: null, loading: false }),
  useGetUserLeaguesQuery: (options?: unknown) =>
    mockUseGetUserLeaguesQuery(options as never),
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
// silently became NaN and opened the detail view for player NaN. The host now
// navigates to the raw id and the `/players/:id` route validates it
// (strict /^\d+$/ check, brefId fallback). These regression tests lock in that
// the click handler never produces a NaN id again.
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

  it('navigates to a numeric id unchanged', () => {
    render(<PlayerStatsRoute />);
    act(() => {
      mockOnPlayerDetailsRef.current?.({ id: 12345 });
    });
    expect(mockNavigate).toHaveBeenCalledWith('/players/12345');
  });
});
