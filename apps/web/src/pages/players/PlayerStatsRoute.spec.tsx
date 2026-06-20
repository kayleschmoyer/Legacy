import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { PlayerStatsRoute } from './PlayerStatsPage';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockNavigate = jest.fn();
const mockSetSearchParams = jest.fn();
let mockSearchParams = new URLSearchParams();
let mockFootballEnabled = true;

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useSearchParams: () => [mockSearchParams, mockSetSearchParams],
}));

jest.mock('../../context/GrowthBookProvider', () => ({
  useFeatureValue: () => mockFootballEnabled,
}));

jest.mock('@legacy-sports/shared-components/players', () => ({
  PlayerStatsPage: () => null,
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
  useGetUserLeaguesQuery: () => ({ data: null, loading: false }),
  Sport: { Baseball: 'Baseball', Football: 'Football' },
}));

jest.mock('../../hooks/useLeagueRosteredPlayerIds', () => ({
  useLeagueRosteredPlayerIds: () => ({ playerIds: new Set(), loading: false }),
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
