/**
 * SpectatorScreen (web, LS-8942) — read-only big-screen draft watch view.
 *
 * Jest renders the Tamagui base tier (desktop-first); layout assertions here
 * are structural, not visual. The hooks are mocked (same pattern as
 * EliteDraftBoardScreen.spec.tsx); SplashQueue + PickAnnouncement stay real
 * so the no-history-replay and WS-driven-splash behavior is exercised
 * end-to-end through the screen's wiring.
 */
import React from 'react';
import { act } from '@testing-library/react';
import { CombinedGraphQLErrors } from '@apollo/client';
import { SpectatorScreen } from './SpectatorScreen';
import {
  useDraftTimer,
  useDraftWebSocket,
  useSpectatorDraftData,
} from './hooks';
import type { DraftPickRecord, DraftPlayer, LeagueTeam } from './types';
import { useAuth } from '../../features/auth';
import { render } from '../../test-utils';

jest.mock('./hooks', () => ({
  useDraftTimer: jest.fn(),
  useDraftWebSocket: jest.fn(),
  useSpectatorDraftData: jest.fn(),
}));

jest.mock('../../features/auth', () => ({
  useAuth: jest.fn(),
}));

jest.mock('./DraftGrid', () => ({
  DraftGrid: ({ myTeamId }: { myTeamId: number | null }) => (
    <div data-testid="draft-grid" data-my-team-id={String(myTeamId)} />
  ),
}));
jest.mock('./DraftCompleteView', () => ({
  DraftCompleteView: () => <div data-testid="draft-complete-view" />,
}));
jest.mock('./SpectatorDepthChart', () => ({
  SpectatorDepthChart: ({ teamName }: { teamName: string }) => (
    <div data-testid="spectator-depth-chart" data-team-name={teamName} />
  ),
}));
jest.mock('./styles', () => ({ CSS: '' }));

const mockUseAuth = jest.mocked(useAuth);
const mockUseSpectatorDraftData = jest.mocked(useSpectatorDraftData);
const mockUseDraftTimer = jest.mocked(useDraftTimer);
const mockUseDraftWebSocket = jest.mocked(useDraftWebSocket);

const teams: LeagueTeam[] = [
  { id: '10', name: 'Bombers', leagueId: 1 },
  { id: '11', name: 'Sluggers', leagueId: 1 },
];

const pickHistory: DraftPickRecord[] = [
  {
    id: '1',
    draftId: 42,
    round: 1,
    pickNumber: 1,
    overallPick: 1,
    pickedAt: '2026-08-01T00:00:00Z',
    teamId: 10,
    playerId: 500,
    player: {
      id: 500,
      firstName: 'Babe',
      lastName: 'Ruth',
      eligiblePositions: ['OF'],
      mlbPlayerId: 121578,
    },
  },
];

function makeData(
  overrides: Partial<ReturnType<typeof useSpectatorDraftData>> = {},
) {
  return {
    league: {
      id: 1,
      name: 'History League',
      draftStatus: 'in-progress',
      isPublic: true,
      isMockDraft: false,
      maxRosterSize: 20,
    },
    leagueData: {},
    leagueLoading: false,
    leagueError: undefined,
    leagueTeams: teams,
    leaguePositions: [{ id: 1, positionType: 'OF' }],
    teamNameById: (teamId: number | null | undefined) =>
      teams.find((t) => String(t.id) === String(teamId))?.name ??
      `Team #${teamId}`,
    refetchLeague: jest.fn(),
    leagueDraft: {
      id: '42',
      selectionMethod: 'standard',
      draftCompletedAt: null,
      scheduledAt: null,
    },
    draftId: 42,
    draftError: undefined,
    isAuctionDraft: false,
    refetchDraft: jest.fn(),
    currentPickInfo: {
      draftId: 42,
      teamId: 11,
      round: 1,
      pickNumber: 2,
      overallPick: 2,
      isComplete: false,
    },
    currentPickTeamId: 11,
    refetchCurrentPick: jest.fn(),
    pickHistory,
    refetchPickHistory: jest.fn(),
    mlbPlayerIdFor: jest.fn(() => null),
    statsLookup: new Map<number, DraftPlayer>(),
    boardOrderedTeams: teams,
    onClockTeamPlayers: [],
    ...overrides,
  } as unknown as ReturnType<typeof useSpectatorDraftData>;
}

const defaultProps = {
  leagueId: 1,
  onNavigate: jest.fn(),
  websocketUrl: 'ws://test',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAuth.mockReturnValue({
    user: { id: 99 },
    token: 'jwt',
  } as unknown as ReturnType<typeof useAuth>);
  mockUseSpectatorDraftData.mockReturnValue(makeData());
  mockUseDraftTimer.mockReturnValue({ timeRemaining: 45 });
  mockUseDraftWebSocket.mockReturnValue({
    wsConnected: true,
  });
});

describe('SpectatorScreen — live layout', () => {
  it('renders top band, board grid, and on-the-clock rail', () => {
    const { getByTestId, getByText } = render(
      <SpectatorScreen {...defaultProps} />,
    );
    expect(getByTestId('spectator-screen')).toBeTruthy();
    expect(getByText('History League')).toBeTruthy();
    expect(getByText('LIVE')).toBeTruthy();
    expect(getByText('Pick #2 · Round 1')).toBeTruthy();
    // On-the-clock team headline + depth chart rail for the same team.
    expect(getByText('Sluggers')).toBeTruthy();
    expect(
      getByTestId('spectator-depth-chart').getAttribute('data-team-name'),
    ).toBe('Sluggers');
    expect(getByTestId('spectator-recent-picks')).toBeTruthy();
    // The grid renders with no "my team" — spectators have none.
    expect(getByTestId('draft-grid').getAttribute('data-my-team-id')).toBe(
      'null',
    );
  });

  it('exposes no draft controls of any kind', () => {
    const { container, queryByText } = render(
      <SpectatorScreen {...defaultProps} />,
    );
    expect(container.querySelector('input')).toBeNull();
    expect(queryByText(/draft now/i)).toBeNull();
    expect(queryByText(/pause/i)).toBeNull();
    expect(queryByText(/resume/i)).toBeNull();
  });

  it('mounts the timer in readOnly mode with no nudge mutation', () => {
    render(<SpectatorScreen {...defaultProps} />);
    const timerParams = mockUseDraftTimer.mock.calls[0][0];
    expect(timerParams.readOnly).toBe(true);
    expect(timerParams.nudgeExpiredDraftPick).toBeUndefined();
  });

  it('connects the draft socket with no team identity', () => {
    render(<SpectatorScreen {...defaultProps} />);
    const wsParams = mockUseDraftWebSocket.mock.calls[0][0];
    expect(wsParams.myTeamId).toBeNull();
    expect(wsParams.enrichedPlayers).toEqual([]);
  });
});

describe('SpectatorScreen — pick splash queue', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not replay historical picks on a mid-draft mount', () => {
    const { queryByTestId } = render(<SpectatorScreen {...defaultProps} />);
    act(() => {
      jest.advanceTimersByTime(20_000);
    });
    // Pick history is populated, but nothing was pushed over the socket —
    // no splash may appear.
    expect(queryByTestId('draft-announce-overlay')).toBeNull();
  });

  it('splashes a live pick pushed over the socket', () => {
    const { getByTestId, getByText } = render(
      <SpectatorScreen {...defaultProps} />,
    );
    const wsParams = mockUseDraftWebSocket.mock.calls[0][0];
    const player: DraftPlayer = {
      id: 501,
      name: 'Hank Aaron',
      position: 'OF',
      avg: 0.305,
      hr: 755,
      rbi: 2297,
      runs: 2174,
      sb: 240,
      games: 3298,
      hits: 3771,
      obp: 0.374,
      slg: 0.555,
    };
    act(() => {
      wsParams.showAnnouncement(player, 2, 1, 2, false, false, 'Sluggers');
    });
    expect(getByTestId('draft-announce-overlay')).toBeTruthy();
    expect(getByText('Hank Aaron')).toBeTruthy();
  });
});

describe('SpectatorScreen — full-page states', () => {
  it('shows the private-draft screen on FORBIDDEN', () => {
    const forbidden = new CombinedGraphQLErrors({
      errors: [
        {
          message: 'League is private',
          extensions: { code: 'FORBIDDEN' },
        },
      ],
    });
    mockUseSpectatorDraftData.mockReturnValue(
      makeData({
        league: undefined,
        leagueError: forbidden,
      }),
    );
    const { getByText } = render(<SpectatorScreen {...defaultProps} />);
    expect(getByText('This draft is private')).toBeTruthy();
  });

  it('shows the pre-draft lobby before the draft starts', () => {
    mockUseSpectatorDraftData.mockReturnValue(
      makeData({
        league: {
          id: 1,
          name: 'History League',
          draftStatus: 'not-started',
        },
      }),
    );
    const { getByTestId } = render(<SpectatorScreen {...defaultProps} />);
    expect(getByTestId('spectator-lobby')).toBeTruthy();
  });

  it('shows the complete view when the draft is done', () => {
    mockUseSpectatorDraftData.mockReturnValue(
      makeData({
        currentPickInfo: {
          draftId: 42,
          teamId: 11,
          round: 20,
          pickNumber: 2,
          overallPick: 40,
          isComplete: true,
        },
      }),
    );
    const { getByTestId } = render(<SpectatorScreen {...defaultProps} />);
    expect(getByTestId('draft-complete-view')).toBeTruthy();
  });

  it('shows the paused overlay without a resume affordance', () => {
    const { getByText, queryByText } = render(
      <SpectatorScreen {...defaultProps} />,
    );
    const wsParams = mockUseDraftWebSocket.mock.calls[0][0];
    act(() => {
      wsParams.setDraftPaused(true);
    });
    expect(getByText('DRAFT PAUSED')).toBeTruthy();
    expect(queryByText(/resume/i)).toBeNull();
  });
});
