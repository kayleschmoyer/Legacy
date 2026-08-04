/**
 * SpectatorScreen (native, LS-8942) — read-only draft watch view.
 *
 * Jest renders the Tamagui base tier (desktop-first). Native sub-components
 * that need RN runtime pieces (clock ring SVG, mini board, announcement
 * animation) are stubbed; the screen's state routing and read-only wiring
 * are what's under test.
 */
import React from 'react';
import { act, fireEvent } from '@testing-library/react';
import { CombinedGraphQLErrors } from '@apollo/client';
import { SpectatorScreen } from './SpectatorScreen.native';
import {
  useDraftTimer,
  useDraftWebSocket,
  useSpectatorDraftData,
} from './hooks';
import type { DraftPickRecord, DraftPlayer, LeagueTeam } from './types';
import type { AnnouncementData } from './hooks/useDraftUIState';
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

jest.mock('./DraftClockRing.native', () => ({
  DraftClockRing: ({ paused }: { paused: boolean }) => (
    <div data-testid="draft-clock-ring" data-paused={String(paused)} />
  ),
}));
jest.mock('./DraftMiniBoard.native', () => ({
  DraftMiniBoard: ({ myTeamId }: { myTeamId: number | null }) => (
    <div data-testid="draft-mini-board" data-my-team-id={String(myTeamId)} />
  ),
}));
jest.mock('./DraftPickAnnouncement.native', () => ({
  DraftPickAnnouncement: ({
    announcement,
  }: {
    announcement: AnnouncementData | null;
  }) =>
    announcement ? (
      <div data-testid="native-pick-announcement">
        {'name' in announcement.player ? announcement.player.name : 'pick'}
      </div>
    ) : null,
}));

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

describe('SpectatorScreen (native) — live layout', () => {
  it('renders the slim top band, mini board, and rail panels', () => {
    const { getByTestId, getByText } = render(
      <SpectatorScreen {...defaultProps} />,
    );
    expect(getByText('History League · Live')).toBeTruthy();
    expect(getByText('Round 1 · Pick #2')).toBeTruthy();
    expect(getByTestId('draft-clock-ring')).toBeTruthy();
    expect(
      getByTestId('draft-mini-board').getAttribute('data-my-team-id'),
    ).toBe('null');
    expect(getByText('Recent picks')).toBeTruthy();
    expect(getByText('Babe Ruth')).toBeTruthy();
  });

  it('mounts the timer read-only and the socket with no team identity', () => {
    render(<SpectatorScreen {...defaultProps} />);
    const timerParams = mockUseDraftTimer.mock.calls[0][0];
    expect(timerParams.readOnly).toBe(true);
    expect(timerParams.nudgeExpiredDraftPick).toBeUndefined();
    const wsParams = mockUseDraftWebSocket.mock.calls[0][0];
    expect(wsParams.myTeamId).toBeNull();
  });
});

describe('SpectatorScreen (native) — pick splash queue', () => {
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
    expect(queryByTestId('native-pick-announcement')).toBeNull();
  });

  it('splashes a live pick pushed over the socket', () => {
    const { getByTestId } = render(<SpectatorScreen {...defaultProps} />);
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
    expect(getByTestId('native-pick-announcement').textContent).toBe(
      'Hank Aaron',
    );
  });
});

describe('SpectatorScreen (native) — full-page states', () => {
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
    expect(getByText('THIS DRAFT IS PRIVATE')).toBeTruthy();
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
    const { getByText } = render(<SpectatorScreen {...defaultProps} />);
    expect(getByText('DRAFT DAY IS COMING')).toBeTruthy();
  });

  it('offers Back to League navigation from the complete state', () => {
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
    const onNavigate = jest.fn();
    const { getByText, container } = render(
      <SpectatorScreen {...defaultProps} onNavigate={onNavigate} />,
    );
    expect(getByText('DRAFT COMPLETE')).toBeTruthy();
    // The mobile jest env renders accessibilityLabel as a data attribute,
    // not aria-label — query it directly.
    const backButton = container.querySelector(
      '[data-accessibility-label="Back to League"]',
    );
    expect(backButton).toBeTruthy();
    fireEvent.click(backButton as Element);
    expect(onNavigate).toHaveBeenCalledWith('/baseball/league/1');
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
