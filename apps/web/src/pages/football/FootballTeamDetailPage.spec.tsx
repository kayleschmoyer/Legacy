/**
 * Unit tests for FootballTeamDetailPage (LS-6438).
 *
 * Modelled on apps/web/src/pages/baseball/TeamDetailPage.spec.tsx — same
 * mocking conventions (tamagui shim, module-level GraphQL hook mocks, a
 * RosterBoard stand-in that surfaces the props under test as data attributes).
 *
 * Covers: the GM edit gate and visitor read-only fallback (AC3), the
 * sport="football" board wiring and its assign/bench/swap handlers (AC2),
 * canonical slot ordering driven by defensiveFormat (AC4), and the
 * invalid-team / wrong-sport / error states.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- test mocks use any */
/* eslint-disable @typescript-eslint/no-unsafe-return -- mock factory spreads */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FootballTeamDetailPage } from './FootballTeamDetailPage';

// ── Router ──────────────────────────────────────────────────────────────────

const mockNavigate = jest.fn();
const mockUseParams = jest.fn(() => ({ teamId: '1' }));
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
  useParams: () => mockUseParams(),
}));

// ── Analytics ───────────────────────────────────────────────────────────────

const mockTrackTeamViewed = jest.fn();
jest.mock('../../utils/analytics', () => ({
  trackTeamViewed: (...args: unknown[]) => mockTrackTeamViewed(...args),
}));

// ── Sub-components ──────────────────────────────────────────────────────────

jest.mock('../../components/PageMeta', () => ({
  PageMeta: ({ title }: { title: string }) => (
    <div data-testid="page-meta" data-title={title} />
  ),
}));

// TeamBrandingSettings' own upload/validation/color/clear-confirmation
// behavior is covered by TeamBrandingSettings.spec.tsx (LS-9670) — stub it
// here so this file only exercises the page's gating around it.
jest.mock('../../features/teams/TeamBrandingSettings', () => ({
  TeamBrandingSettings: () => <div data-testid="team-branding-settings" />,
}));

/**
 * Surfaces the props the ACs care about as data attributes: `sport` (AC2),
 * `readOnly` (AC3), and the resolved slot order (AC4). The handler buttons let
 * the assign/bench/swap wiring be exercised without a drag-and-drop harness.
 */
jest.mock('@legacy-sports/shared-components/roster', () => ({
  RosterBoard: ({
    sport,
    readOnly,
    error,
    positions,
    teamPlayers,
    onPlayerAssign,
    onPlayerRemove,
    onPlayerSwap,
    onPlayerPress,
  }: any) => (
    <div
      data-testid="roster-board"
      data-sport={sport}
      data-read-only={String(!!readOnly)}
      data-error={error ? error.message : ''}
      data-slot-order={(positions ?? [])
        .map((p: any) => p.positionType)
        .join(',')}
      data-player-count={String((teamPlayers ?? []).length)}
    >
      <button
        type="button"
        onClick={() => onPlayerAssign?.(teamPlayers?.[0], positions?.[0])}
      >
        assign
      </button>
      <button type="button" onClick={() => onPlayerRemove?.(positions?.[0])}>
        remove
      </button>
      <button
        type="button"
        onClick={() =>
          onPlayerSwap?.(teamPlayers?.[0], positions?.[0], teamPlayers?.[1])
        }
      >
        swap
      </button>
      <button type="button" onClick={() => onPlayerPress?.(teamPlayers?.[0])}>
        open-player
      </button>
    </div>
  ),
}));

// ── GraphQL ─────────────────────────────────────────────────────────────────

const mockRefetchMembers = jest.fn();
const mockUpdateTeamMemberPosition = jest.fn();
const mockSwapTeamMemberPositions = jest.fn();

/** Alphabetical, exactly as the leaguePositions resolver returns them. */
const SERVER_POSITIONS = [
  { id: 90, positionType: 'DST' },
  { id: 91, positionType: 'FLEX' },
  { id: 92, positionType: 'K' },
  { id: 93, positionType: 'QB' },
  { id: 94, positionType: 'RB' },
  { id: 95, positionType: 'TE' },
  { id: 96, positionType: 'WR' },
];

const TEAM_MEMBERS = [
  {
    id: 10,
    leagueId: 100,
    positionId: null,
    playerId: 500,
    player: { id: 500, firstName: 'Test', lastName: 'Player' },
  },
  {
    id: 11,
    leagueId: 100,
    positionId: 93,
    playerId: 501,
    player: { id: 501, firstName: 'Other', lastName: 'Player' },
  },
];

let mockTeamMembersResult: any;
let mockTeamByIdResult: any;
let mockViewerMembershipResult: any;
let mockPositionsResult: any;
let mockLeagueResult: any;

jest.mock('@legacy-sports/graphql', () => ({
  Sport: { Football: 'football', Baseball: 'baseball' },
  useGetTeamMembersQuery: jest.fn(() => mockTeamMembersResult),
  useGetTeamByIdQuery: jest.fn(() => mockTeamByIdResult),
  useGetViewerMembershipQuery: jest.fn(() => mockViewerMembershipResult),
  useGetPositionsForLeagueQuery: jest.fn(() => mockPositionsResult),
  useGetLeagueByIdQuery: jest.fn(() => mockLeagueResult),
  useUpdateTeamMemberPositionMutation: jest.fn(() => [
    mockUpdateTeamMemberPosition,
    { loading: false },
  ]),
  useSwapTeamMemberPositionsMutation: jest.fn(() => [
    mockSwapTeamMemberPositions,
    { loading: false },
  ]),
}));

jest.mock('@apollo/client', () => ({
  CombinedGraphQLErrors: {
    is: (e: any) => Array.isArray(e?.errors),
  },
}));

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

// ── Tamagui ─────────────────────────────────────────────────────────────────

jest.mock('tamagui', () => ({
  Button: ({ children, onPress, ...rest }: any) => (
    <button
      onClick={onPress}
      {...(rest['data-testid'] ? { 'data-testid': rest['data-testid'] } : {})}
    >
      {children}
    </button>
  ),
  H3: ({ children }: any) => <h3>{children}</h3>,
  Separator: () => <hr />,
  Spinner: () => <span data-testid="spinner" />,
  Text: ({ children }: any) => <span>{children}</span>,
  XStack: ({ children }: any) => <div>{children}</div>,
  YStack: ({ children }: any) => <div>{children}</div>,
}));

// ── Constants ───────────────────────────────────────────────────────────────

jest.mock('../../constants/colors', () => ({
  BRAND_NAVY: '#0A0F1A',
  BRAND_NAVY_LIGHT: '#1B3A5C',
  withAlpha: (c: string) => c,
}));

// ── Helpers ─────────────────────────────────────────────────────────────────

const board = () => screen.getByTestId('roster-board');

beforeEach(() => {
  jest.clearAllMocks();
  mockUseParams.mockReturnValue({ teamId: '1' });
  mockTeamMembersResult = {
    data: { teamMembers: TEAM_MEMBERS },
    loading: false,
    error: undefined,
    refetch: mockRefetchMembers,
  };
  mockTeamByIdResult = {
    data: { team: { id: 1, leagueId: 100, name: 'Gridiron FC' } },
    loading: false,
    error: undefined,
  };
  mockViewerMembershipResult = {
    data: {
      viewerMembership: { teamId: 1, permissionLevel: 'general_manager' },
    },
    loading: false,
    error: undefined,
  };
  mockPositionsResult = {
    data: { leaguePositions: SERVER_POSITIONS },
    loading: false,
    error: undefined,
  };
  mockLeagueResult = {
    data: {
      league: {
        id: 100,
        name: 'Sunday Money',
        sport: 'football',
        defensiveFormat: 'dst',
      },
    },
    loading: false,
  };
});

// ── AC2: board wiring ───────────────────────────────────────────────────────

describe('roster board wiring (AC2)', () => {
  it('renders the shared RosterBoard in football mode', () => {
    render(<FootballTeamDetailPage />);

    expect(board()).toHaveAttribute('data-sport', 'football');
    expect(board()).toHaveAttribute('data-player-count', '2');
  });

  it('assigns a player to a slot via updateTeamMemberPosition', async () => {
    render(<FootballTeamDetailPage />);
    fireEvent.click(screen.getByText('assign'));

    await waitFor(() => {
      expect(mockUpdateTeamMemberPosition).toHaveBeenCalledWith({
        // positions[0] is QB after canonical ordering, not DST.
        variables: { teamMemberId: 10, positionId: 93 },
      });
    });
    await waitFor(() => expect(mockRefetchMembers).toHaveBeenCalled());
  });

  it('benches the slot occupant with a null positionId', async () => {
    render(<FootballTeamDetailPage />);
    fireEvent.click(screen.getByText('remove'));

    await waitFor(() => {
      // Member 11 occupies QB (positionId 93).
      expect(mockUpdateTeamMemberPosition).toHaveBeenCalledWith({
        variables: { teamMemberId: 11, positionId: null },
      });
    });
  });

  it('swaps two players via swapTeamMemberPositions', async () => {
    render(<FootballTeamDetailPage />);
    fireEvent.click(screen.getByText('swap'));

    await waitFor(() => {
      expect(mockSwapTeamMemberPositions).toHaveBeenCalledWith({
        variables: {
          teamMemberIdA: 10,
          positionIdA: 93,
          teamMemberIdB: 11,
          positionIdB: undefined,
        },
      });
    });
  });

  it('navigates to the football player detail page on player press', () => {
    render(<FootballTeamDetailPage />);
    fireEvent.click(screen.getByText('open-player'));

    expect(mockNavigate).toHaveBeenCalledWith('/football/players/500');
  });

  it('surfaces a positions query error to the board', () => {
    mockPositionsResult = {
      data: undefined,
      loading: false,
      error: new Error('positions boom'),
    };
    render(<FootballTeamDetailPage />);

    expect(board()).toHaveAttribute('data-error', 'positions boom');
  });
});

// ── AC3: permission gate ────────────────────────────────────────────────────

describe('edit permission gate (AC3)', () => {
  it.each([['general_manager'], ['assistant_manager']])(
    'allows editing for %s of this team',
    (permissionLevel) => {
      mockViewerMembershipResult = {
        data: { viewerMembership: { teamId: 1, permissionLevel } },
        loading: false,
        error: undefined,
      };
      render(<FootballTeamDetailPage />);

      expect(board()).toHaveAttribute('data-read-only', 'false');
    },
  );

  it('renders read-only for a GM of a different team', () => {
    mockViewerMembershipResult = {
      data: {
        viewerMembership: { teamId: 2, permissionLevel: 'general_manager' },
      },
      loading: false,
      error: undefined,
    };
    render(<FootballTeamDetailPage />);

    expect(board()).toHaveAttribute('data-read-only', 'true');
    expect(
      screen.getByText(/viewing this team as a visitor/i),
    ).toBeInTheDocument();
  });

  it('renders read-only for a commissioner who does not own this team', () => {
    mockViewerMembershipResult = {
      data: {
        viewerMembership: { teamId: 2, permissionLevel: 'commissioner' },
      },
      loading: false,
      error: undefined,
    };
    render(<FootballTeamDetailPage />);

    expect(board()).toHaveAttribute('data-read-only', 'true');
    // A commissioner is not a visitor — the notice stays hidden.
    expect(
      screen.queryByText(/viewing this team as a visitor/i),
    ).not.toBeInTheDocument();
  });

  it('hides the visitor notice while permission data is still loading', () => {
    mockViewerMembershipResult = {
      data: undefined,
      loading: true,
      error: undefined,
    };
    render(<FootballTeamDetailPage />);

    expect(
      screen.queryByText(/viewing this team as a visitor/i),
    ).not.toBeInTheDocument();
  });
});

// ── Team Branding section gating (LS-9670) ──────────────────────────────────

describe('Team Settings / branding gating (LS-9670)', () => {
  it('renders the Team Branding section for the team GM', () => {
    render(<FootballTeamDetailPage />);

    expect(screen.getByText('Team Settings')).toBeInTheDocument();
    expect(screen.getByTestId('team-branding-settings')).toBeInTheDocument();
  });

  it('renders the Team Branding section for a commissioner who does not own this team', () => {
    mockViewerMembershipResult = {
      data: {
        viewerMembership: { teamId: 2, permissionLevel: 'commissioner' },
      },
      loading: false,
      error: undefined,
    };
    render(<FootballTeamDetailPage />);

    expect(screen.getByTestId('team-branding-settings')).toBeInTheDocument();
  });

  it('renders nothing for a visitor (not GM, not commissioner)', () => {
    mockViewerMembershipResult = {
      data: {
        viewerMembership: { teamId: 2, permissionLevel: 'general_manager' },
      },
      loading: false,
      error: undefined,
    };
    render(<FootballTeamDetailPage />);

    expect(screen.queryByText('Team Settings')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('team-branding-settings'),
    ).not.toBeInTheDocument();
  });

  it('renders nothing while permission data is still loading', () => {
    mockViewerMembershipResult = {
      data: undefined,
      loading: true,
      error: undefined,
    };
    render(<FootballTeamDetailPage />);

    expect(
      screen.queryByTestId('team-branding-settings'),
    ).not.toBeInTheDocument();
  });
});

// ── AC4: slot ordering ──────────────────────────────────────────────────────

describe('slot ordering (AC4)', () => {
  it('reorders alphabetical server slots into canonical DST order', () => {
    render(<FootballTeamDetailPage />);

    expect(board()).toHaveAttribute(
      'data-slot-order',
      'QB,RB,WR,TE,FLEX,K,DST',
    );
  });

  it('orders IDP slots by the league defensiveFormat', () => {
    mockPositionsResult = {
      data: {
        leaguePositions: [
          { id: 80, positionType: 'DB' },
          { id: 81, positionType: 'DL' },
          { id: 82, positionType: 'LB' },
          { id: 83, positionType: 'QB' },
        ],
      },
      loading: false,
      error: undefined,
    };
    mockLeagueResult = {
      data: {
        league: {
          id: 100,
          name: 'Sunday Money',
          sport: 'football',
          defensiveFormat: 'idp',
        },
      },
      loading: false,
    };
    render(<FootballTeamDetailPage />);

    expect(board()).toHaveAttribute('data-slot-order', 'QB,DL,LB,DB');
  });
});

// ── Identity + guard states ─────────────────────────────────────────────────

describe('page states', () => {
  it('renders the team name and league link', () => {
    render(<FootballTeamDetailPage />);

    expect(screen.getByText('Gridiron FC')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Part of Sunday Money'));
    expect(mockNavigate).toHaveBeenCalledWith('/football/league/100');
  });

  it('tracks the team view once the league resolves', () => {
    render(<FootballTeamDetailPage />);

    expect(mockTrackTeamViewed).toHaveBeenCalledWith(1, 100);
  });

  it('rejects a non-numeric teamId without querying', () => {
    mockUseParams.mockReturnValue({ teamId: 'not-a-number' });
    render(<FootballTeamDetailPage />);

    expect(screen.getByText('Team not found')).toBeInTheDocument();
    expect(screen.queryByTestId('roster-board')).not.toBeInTheDocument();
  });

  it('shows a spinner while identity data loads', () => {
    mockTeamMembersResult = { ...mockTeamMembersResult, loading: true };
    render(<FootballTeamDetailPage />);

    expect(screen.getByTestId('spinner')).toBeInTheDocument();
  });

  it('renders a not-found state for a NOT_FOUND members error', () => {
    mockTeamMembersResult = {
      data: undefined,
      loading: false,
      error: { errors: [{ extensions: { code: 'NOT_FOUND' } }] },
      refetch: mockRefetchMembers,
    };
    render(<FootballTeamDetailPage />);

    expect(screen.getByText('Team not found')).toBeInTheDocument();
  });

  it('renders a generic error state for other members errors', () => {
    mockTeamMembersResult = {
      data: undefined,
      loading: false,
      error: new Error('network down'),
      refetch: mockRefetchMembers,
    };
    render(<FootballTeamDetailPage />);

    expect(screen.getByText('Error loading team')).toBeInTheDocument();
  });

  it('renders an error state when viewer membership fails to load', () => {
    mockViewerMembershipResult = {
      data: undefined,
      loading: false,
      error: new Error('membership boom'),
    };
    render(<FootballTeamDetailPage />);

    expect(screen.getByText('Error loading team')).toBeInTheDocument();
  });

  it('offers the baseball page when the team belongs to a baseball league', () => {
    mockLeagueResult = {
      data: {
        league: {
          id: 100,
          name: 'Sunday Money',
          sport: 'baseball',
          defensiveFormat: null,
        },
      },
      loading: false,
    };
    render(<FootballTeamDetailPage />);

    expect(screen.getByText('Not a football team')).toBeInTheDocument();
    fireEvent.click(screen.getByText('View the baseball team page'));
    expect(mockNavigate).toHaveBeenCalledWith('/baseball/teams/1');
  });

  it('waits for the league rather than rendering the board in the wrong slot order', () => {
    // defensiveFormat drives slot ordering, so the board must not render
    // before the league resolves — an IDP league would otherwise show DST
    // ordering for a frame and then re-sort.
    mockLeagueResult = { data: undefined, loading: true };
    render(<FootballTeamDetailPage />);

    expect(screen.getByTestId('spinner')).toBeInTheDocument();
    expect(screen.queryByTestId('roster-board')).not.toBeInTheDocument();
    expect(screen.queryByText('Not a football team')).not.toBeInTheDocument();
  });

  it('renders the board when the league query was skipped or errored', () => {
    // An unresolved league is not grounds for bouncing the viewer to the
    // baseball page — the board still renders, in the default DST order.
    mockLeagueResult = { data: undefined, loading: false };
    render(<FootballTeamDetailPage />);

    expect(screen.queryByText('Not a football team')).not.toBeInTheDocument();
    expect(board()).toHaveAttribute(
      'data-slot-order',
      'QB,RB,WR,TE,FLEX,K,DST',
    );
  });
});
