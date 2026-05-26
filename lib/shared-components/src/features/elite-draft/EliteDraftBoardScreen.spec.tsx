import React from 'react';
import { AutomatedDraftScreen } from './DraftStateScreens';
import { EliteDraftBoardScreen } from './EliteDraftBoardScreen';
import {
  useDraftActions,
  useDraftEffects,
  useDraftQueries,
  useDraftTimer,
  useDraftUIState,
  useDraftWebSocket,
  usePlayerData,
} from './hooks';
import { useAuth } from '../../features/auth';
import { fireEvent, render } from '../../test-utils';

jest.mock('./hooks', () => ({
  useDraftActions: jest.fn(),
  useDraftEffects: jest.fn(),
  useDraftQueries: jest.fn(),
  useDraftTimer: jest.fn(),
  useDraftUIState: jest.fn(),
  useDraftWebSocket: jest.fn(),
  usePlayerData: jest.fn(),
}));

jest.mock('../../features/auth', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../../api/db/graphql.generated', () => ({
  useGetUserByIdQuery: jest.fn(() => ({ data: undefined })),
}));

jest.mock('./auction/AuctionDraftRoom', () => ({
  AuctionDraftRoom: () => <div data-testid="auction-draft-room" />,
}));
jest.mock('./PreDraftLobby', () => ({
  PreDraftLobby: ({ sport }: { sport: string }) => (
    <div data-testid="pre-draft-lobby" data-sport={sport} />
  ),
}));
jest.mock('./DraftCompleteView', () => ({
  DraftCompleteView: () => <div data-testid="draft-complete-view" />,
}));
jest.mock('./DraftPlayerBoard', () => ({
  DraftPlayerBoard: ({ sport }: { sport: string }) => (
    <div data-testid="draft-player-board" data-sport={sport} />
  ),
}));
jest.mock('./DraftTopBand', () => ({
  DraftTopBand: () => <div data-testid="draft-top-band" />,
}));
jest.mock('./DraftRail', () => ({
  DraftRail: () => <div data-testid="draft-rail" />,
}));
jest.mock('./DraftChatOverlay', () => ({
  DraftChatOverlay: () => null,
}));
jest.mock('./PickAnnouncement', () => ({
  PickAnnouncement: () => null,
}));
jest.mock('./styles', () => ({ CSS: '' }));

const mockUseAuth = jest.mocked(useAuth);
const mockUseDraftUIState = jest.mocked(useDraftUIState);
const mockUseDraftQueries = jest.mocked(useDraftQueries);
const mockUsePlayerData = jest.mocked(usePlayerData);
const mockUseDraftActions = jest.mocked(useDraftActions);

function makeBaseUI(
  overrides: Partial<ReturnType<typeof useDraftUIState>> = {},
) {
  return {
    draftPaused: false,
    draftComplete: false,
    draftOrderMissing: false,
    announcement: null,
    announcementLeaving: false,
    toastMessage: null,
    urgentMessage: '',
    liveMessage: '',
    searchTerm: '',
    playerSearch: '',
    selectedPosition: 'ALL',
    viewMode: 'grid' as const,
    commPickMode: false,
    autoPickDisabled: false,
    initError: null,
    chatOpen: false,
    currentPickLoadError: null,
    pickDeadline: null,
    pickTimeLimitSeconds: 90,
    onlineUserIds: new Set<number>(),
    customDraftOrder: null,
    watchlist: [],
    notifiedPicksRef: { current: new Set<number>() },
    showToast: jest.fn(),
    showAnnouncement: jest.fn(),
    dismissAnnouncement: jest.fn(),
    setDraftPaused: jest.fn(),
    setDraftComplete: jest.fn(),
    setDraftOrderMissing: jest.fn(),
    setAnnouncement: jest.fn(),
    setAnnouncementLeaving: jest.fn(),
    setToastMessage: jest.fn(),
    setUrgentMessage: jest.fn(),
    setLiveMessage: jest.fn(),
    setSearchTerm: jest.fn(),
    setPlayerSearch: jest.fn(),
    setSelectedPosition: jest.fn(),
    setViewMode: jest.fn(),
    setCommPickMode: jest.fn(),
    setAutoPickDisabled: jest.fn(),
    setInitError: jest.fn(),
    setChatOpen: jest.fn(),
    setCurrentPickLoadError: jest.fn(),
    setPickDeadline: jest.fn(),
    setPickTimeLimitSeconds: jest.fn(),
    setOnlineUserIds: jest.fn(),
    setCustomDraftOrder: jest.fn(),
    setWatchlist: jest.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useDraftUIState>;
}

function makeBaseQueries(
  overrides: Partial<ReturnType<typeof useDraftQueries>> = {},
) {
  return {
    leagueLoading: false,
    availablePlayersLoading: false,
    availablePlayersData: undefined,
    leagueData: undefined,
    leagueError: undefined,
    draftError: undefined,
    availablePlayersError: undefined,
    currentPickErrorMessage: null,
    league: {
      id: 1,
      name: 'Test League',
      draftStatus: 'in-progress',
      isMockDraft: false,
      userMembership: { permissionLevel: 'member', teamId: 1 },
    },
    leagueTeams: [],
    leagueDraft: {
      selectionMethod: 'standard',
      draftCompletedAt: null,
      id: '42',
    },
    draftId: 42,
    myTeamId: 1,
    isOwner: false,
    isCommissioner: false,
    isAuctionDraft: false,
    currentPickInfo: null,
    currentPickTeamId: null,
    pickHistory: [],
    availablePlayers: [],
    hasMorePlayers: false,
    loadingMore: false,
    boardOrderedTeams: [],
    queuedPlayerIds: [],
    autoPickTeamIds: new Set(),
    playerStatsMap: new Map(),
    pitchingStatsMap: new Map(),
    teamNameById: jest.fn(() => 'Test Team'),
    refetchDraft: jest.fn(),
    refetchLeague: jest.fn(),
    refetchCurrentPick: jest.fn(),
    refetchPickHistory: jest.fn(),
    refetchAvailablePlayers: jest.fn(),
    refetchQueue: jest.fn(),
    refetchAutoPickStatuses: jest.fn(),
    handleLoadMorePlayers: jest.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useDraftQueries>;
}

function makeBaseActions(
  overrides: Partial<ReturnType<typeof useDraftActions>> = {},
) {
  return {
    handleResumeDraft: jest.fn(),
    handlePauseDraft: jest.fn(),
    handleMakePick: jest.fn(),
    handleCommissionerPick: jest.fn(),
    handleToggleQueue: jest.fn(),
    handleInitializeDraft: jest.fn(),
    handleToggleAutoPickDisabled: jest.fn(),
    handleToggleUserAutoPick: jest.fn(),
    nudgeExpiredDraftPick: jest.fn(),
    pauseLoading: false,
    resumeLoading: false,
    pickLoading: false,
    autoPickDisabledLoading: false,
    toggleAutoPickLoading: false,
    initDraftLoading: false,
    isMyTeamAutoPick: false,
    ...overrides,
  } as unknown as ReturnType<typeof useDraftActions>;
}

const defaultProps = {
  leagueId: 1,
  onNavigate: jest.fn(),
  websocketUrl: 'ws://test',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAuth.mockReturnValue({
    user: { id: 1, accessLevel: 'member' },
  } as unknown as ReturnType<typeof useAuth>);
  mockUseDraftUIState.mockReturnValue(makeBaseUI());
  mockUseDraftQueries.mockReturnValue(makeBaseQueries());
  mockUseDraftActions.mockReturnValue(makeBaseActions());
  mockUsePlayerData.mockReturnValue({
    enrichedPlayers: [],
    myTeam: null,
    myTeamPicks: [],
    statsLookup: new Map(),
  } as unknown as ReturnType<typeof usePlayerData>);
  jest
    .mocked(useDraftWebSocket)
    .mockReturnValue(
      undefined as unknown as ReturnType<typeof useDraftWebSocket>,
    );
  jest
    .mocked(useDraftTimer)
    .mockReturnValue({ timeRemaining: null } as unknown as ReturnType<
      typeof useDraftTimer
    >);
  jest
    .mocked(useDraftEffects)
    .mockReturnValue(
      undefined as unknown as ReturnType<typeof useDraftEffects>,
    );
});

describe('AutomatedDraftScreen', () => {
  it('renders the draft in progress heading', () => {
    const { getByText } = render(<AutomatedDraftScreen />);
    expect(getByText('Draft in Progress')).toBeTruthy();
  });

  it('renders the results message', () => {
    const { getByText } = render(<AutomatedDraftScreen />);
    expect(
      getByText('Results will appear when the automated draft is complete.'),
    ).toBeTruthy();
  });
});

// LS-4662 — sport prop drills through to DraftPlayerBoard, PreDraftLobby,
// and the root data-sport attribute. Baseball is the default.
describe('EliteDraftBoardScreen — sport prop (LS-4662)', () => {
  it('defaults to baseball and passes it to DraftPlayerBoard', () => {
    const { getByTestId } = render(<EliteDraftBoardScreen {...defaultProps} />);
    expect(getByTestId('draft-player-board').getAttribute('data-sport')).toBe(
      'baseball',
    );
  });

  it('passes football sport down to DraftPlayerBoard and sets data-sport on root', () => {
    const { getByTestId, container } = render(
      <EliteDraftBoardScreen {...defaultProps} sport="football" />,
    );
    expect(getByTestId('draft-player-board').getAttribute('data-sport')).toBe(
      'football',
    );
    expect(container.querySelector('.d-root')?.getAttribute('data-sport')).toBe(
      'football',
    );
  });

  it('passes sport down to PreDraftLobby when the league has no active draft', () => {
    mockUseDraftQueries.mockReturnValue(
      makeBaseQueries({
        league: {
          id: 1,
          name: 'Test League',
          draftStatus: 'pre_draft',
          isMockDraft: false,
          userMembership: { permissionLevel: 'member', teamId: 1 },
        },
        leagueDraft: null,
        draftId: null,
      }),
    );
    const { getByTestId } = render(
      <EliteDraftBoardScreen {...defaultProps} sport="football" />,
    );
    expect(getByTestId('pre-draft-lobby').getAttribute('data-sport')).toBe(
      'football',
    );
  });
});

describe('EliteDraftBoardScreen — selectionMethod branching', () => {
  it('shows AutomatedDraftScreen for random selectionMethod', () => {
    mockUseDraftQueries.mockReturnValue(
      makeBaseQueries({
        leagueDraft: {
          selectionMethod: 'random',
          draftCompletedAt: null,
          id: '42',
        },
        isAuctionDraft: false,
      }),
    );

    const { getByText } = render(<EliteDraftBoardScreen {...defaultProps} />);
    expect(getByText('Draft in Progress')).toBeTruthy();
    expect(
      getByText('Results will appear when the automated draft is complete.'),
    ).toBeTruthy();
  });

  it('does not show AutomatedDraftScreen for standard selectionMethod', () => {
    mockUseDraftQueries.mockReturnValue(
      makeBaseQueries({
        leagueDraft: {
          selectionMethod: 'standard',
          draftCompletedAt: null,
          id: '42',
        },
        isAuctionDraft: false,
      }),
    );

    const { queryByText } = render(<EliteDraftBoardScreen {...defaultProps} />);
    expect(queryByText('Draft in Progress')).toBeNull();
  });
});

// Regression gate: LS-4268 / LS-4260 / LS-4214 / LS-3823
// The "Draft Complete!" banner must appear via all three propagation paths:
// 1. WebSocket DraftCompleted event → ui.draftComplete=true
// 2. Apollo query / fresh page load → leagueDraft.draftCompletedAt set
// 3. 5-second GET_CURRENT_DRAFT_PICK poll → currentPickInfo.isComplete=true
// Each path guards against a different race: WS miss, reload, poll fallback.
// A fourth test verifies the LS-4263 race (draftStatus=completed but leagueDraft
// still loading) shows LoadingScreen instead of PreDraftLobby or DraftCompleteView.
describe('EliteDraftBoardScreen — draft completion paths (LS-4268 regression gate)', () => {
  it('renders DraftCompleteView via WebSocket path (ui.draftComplete=true)', () => {
    mockUseDraftUIState.mockReturnValue(makeBaseUI({ draftComplete: true }));

    const { getByTestId, queryByTestId } = render(
      <EliteDraftBoardScreen {...defaultProps} />,
    );

    expect(getByTestId('draft-complete-view')).toBeTruthy();
    expect(queryByTestId('draft-player-board')).toBeNull();
  });

  it('renders DraftCompleteView via Apollo path (leagueDraft.draftCompletedAt set, covers fresh page reload)', () => {
    mockUseDraftQueries.mockReturnValue(
      makeBaseQueries({
        leagueDraft: {
          selectionMethod: 'standard',
          draftCompletedAt: '2024-01-01T00:00:00.000Z',
          id: '42',
        },
      }),
    );

    const { getByTestId, queryByTestId } = render(
      <EliteDraftBoardScreen {...defaultProps} />,
    );

    expect(getByTestId('draft-complete-view')).toBeTruthy();
    expect(queryByTestId('draft-player-board')).toBeNull();
  });

  it('renders DraftCompleteView via poll path (currentPickInfo.isComplete=true)', () => {
    mockUseDraftQueries.mockReturnValue(
      makeBaseQueries({
        currentPickInfo: {
          isComplete: true,
          draftId: 42,
          teamId: 1,
          round: 10,
          pickNumber: 4,
          overallPick: 40,
        },
      }),
    );

    const { getByTestId, queryByTestId } = render(
      <EliteDraftBoardScreen {...defaultProps} />,
    );

    expect(getByTestId('draft-complete-view')).toBeTruthy();
    expect(queryByTestId('draft-player-board')).toBeNull();
  });

  it('shows LoadingScreen (not DraftCompleteView or PreDraftLobby) when draftStatus=completed but leagueDraft is still loading (LS-4263 race)', () => {
    mockUseDraftUIState.mockReturnValue(makeBaseUI({ draftComplete: false }));
    mockUseDraftQueries.mockReturnValue(
      makeBaseQueries({
        league: {
          id: 1,
          name: 'Test League',
          draftStatus: 'completed',
          isMockDraft: false,
          userMembership: { permissionLevel: 'member', teamId: 1 },
        },
        leagueDraft: null,
        draftId: null,
        currentPickInfo: null,
      }),
    );

    const { queryByTestId } = render(
      <EliteDraftBoardScreen {...defaultProps} />,
    );

    expect(queryByTestId('draft-complete-view')).toBeNull();
    expect(queryByTestId('pre-draft-lobby')).toBeNull();
    expect(queryByTestId('draft-board-loading')).toBeTruthy();
  });
});

describe('EliteDraftBoardScreen — paused overlay', () => {
  it('does not show paused overlay when draft is not paused', () => {
    mockUseDraftUIState.mockReturnValue(makeBaseUI({ draftPaused: false }));
    mockUseDraftQueries.mockReturnValue(makeBaseQueries({ isOwner: false }));
    mockUseDraftActions.mockReturnValue(makeBaseActions());

    const { queryByText } = render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(queryByText('DRAFT PAUSED')).toBeNull();
  });

  it('shows paused overlay for non-owner when draft is paused', () => {
    mockUseDraftUIState.mockReturnValue(makeBaseUI({ draftPaused: true }));
    mockUseDraftQueries.mockReturnValue(makeBaseQueries({ isOwner: false }));
    mockUseDraftActions.mockReturnValue(makeBaseActions());

    const { getByText } = render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(getByText('DRAFT PAUSED')).toBeTruthy();
    expect(getByText(/commissioner has paused/i)).toBeTruthy();
  });

  it('shows paused overlay for commissioner (owner) when draft is paused', () => {
    mockUseDraftUIState.mockReturnValue(makeBaseUI({ draftPaused: true }));
    mockUseDraftQueries.mockReturnValue(makeBaseQueries({ isOwner: true }));
    mockUseDraftActions.mockReturnValue(makeBaseActions());

    const { getByText } = render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(getByText('DRAFT PAUSED')).toBeTruthy();
  });

  it('shows Resume Draft button for commissioner instead of wait message', () => {
    mockUseDraftUIState.mockReturnValue(makeBaseUI({ draftPaused: true }));
    mockUseDraftQueries.mockReturnValue(makeBaseQueries({ isOwner: true }));
    mockUseDraftActions.mockReturnValue(makeBaseActions());

    const { getByText, queryByText } = render(
      <EliteDraftBoardScreen {...defaultProps} />,
    );

    expect(getByText('Resume Draft')).toBeTruthy();
    expect(queryByText(/commissioner has paused/i)).toBeNull();
  });

  it('calls handleResumeDraft when commissioner clicks Resume Draft', () => {
    const handleResumeDraft = jest.fn().mockResolvedValue(undefined);
    mockUseDraftUIState.mockReturnValue(makeBaseUI({ draftPaused: true }));
    mockUseDraftQueries.mockReturnValue(makeBaseQueries({ isOwner: true }));
    mockUseDraftActions.mockReturnValue(makeBaseActions({ handleResumeDraft }));

    const { getByText } = render(<EliteDraftBoardScreen {...defaultProps} />);

    fireEvent.click(getByText('Resume Draft'));
    expect(handleResumeDraft).toHaveBeenCalledTimes(1);
  });

  it('shows Resuming… and disables button when resumeLoading is true', () => {
    mockUseDraftUIState.mockReturnValue(makeBaseUI({ draftPaused: true }));
    mockUseDraftQueries.mockReturnValue(makeBaseQueries({ isOwner: true }));
    mockUseDraftActions.mockReturnValue(
      makeBaseActions({ resumeLoading: true }),
    );

    const { getByText } = render(<EliteDraftBoardScreen {...defaultProps} />);

    const btn = getByText('Resuming…').closest('button');
    expect(btn).toBeTruthy();
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });
});

// Regression gate: LS-4449 (someone-else's pick celebration covering Draft Now)
// and LS-4485 (own-pick celebration covering back-to-back snake turn).
// When isMyPick is true and an announcement for a *prior* pick is still
// on-screen, the position:fixed z-index:9999 overlay blocks both real-user
// clicks and Playwright force-clicks on the new Draft Now button. The screen
// dismisses any such stale announcement immediately.
describe('EliteDraftBoardScreen — stale pick announcement dismissal (LS-4449/LS-4485)', () => {
  function pickAt(overall: number, teamId = 1) {
    return {
      isComplete: false,
      draftId: 42,
      teamId,
      round: Math.ceil(overall / 4),
      pickNumber: ((overall - 1) % 4) + 1,
      overallPick: overall,
    };
  }

  function announcementFor(pickNumber: number, isMyPick: boolean) {
    return {
      player: { name: 'Test Player' },
      pickNumber,
      round: Math.ceil(pickNumber / 4),
      roundPickNumber: ((pickNumber - 1) % 4) + 1,
      isMyPick,
      isAuto: false,
    };
  }

  it("dismisses another manager's announcement when it becomes the user's turn (LS-4449)", () => {
    const dismissAnnouncement = jest.fn();
    mockUseDraftUIState.mockReturnValue(
      makeBaseUI({
        announcement: announcementFor(4, /* isMyPick */ false),
        dismissAnnouncement,
      }),
    );
    mockUseDraftQueries.mockReturnValue(
      makeBaseQueries({
        myTeamId: 1,
        currentPickTeamId: 1,
        currentPickInfo: pickAt(5, 1),
      }),
    );

    render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(dismissAnnouncement).toHaveBeenCalledTimes(1);
  });

  it("dismisses the user's own prior announcement on a back-to-back snake turn (LS-4485)", () => {
    // Snake draft, 4 teams, user at position 1: overall pick 8 = end of
    // round 2, overall pick 9 = start of round 3 — both belong to the user.
    // The announcement for pick 8 (isMyPick=true) would otherwise stay on
    // screen for 3.6s and cover the new Draft Now button for pick 9.
    const dismissAnnouncement = jest.fn();
    mockUseDraftUIState.mockReturnValue(
      makeBaseUI({
        announcement: announcementFor(8, /* isMyPick */ true),
        dismissAnnouncement,
      }),
    );
    mockUseDraftQueries.mockReturnValue(
      makeBaseQueries({
        myTeamId: 1,
        currentPickTeamId: 1,
        currentPickInfo: pickAt(9, 1),
      }),
    );

    render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(dismissAnnouncement).toHaveBeenCalledTimes(1);
  });

  it("does not dismiss the user's own announcement when their turn has just ended", () => {
    // Right after the user makes a non-back-to-back pick: the announcement
    // fires with isMyPick=true, but currentPickInfo has already advanced to
    // the next pick which belongs to a different team. The user should keep
    // seeing their celebration for the full 3.6s — no dismissal.
    const dismissAnnouncement = jest.fn();
    mockUseDraftUIState.mockReturnValue(
      makeBaseUI({
        announcement: announcementFor(2, /* isMyPick */ true),
        dismissAnnouncement,
      }),
    );
    mockUseDraftQueries.mockReturnValue(
      makeBaseQueries({
        myTeamId: 1,
        currentPickTeamId: 2, // next pick belongs to a different team
        currentPickInfo: pickAt(3, 2),
      }),
    );

    render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(dismissAnnouncement).not.toHaveBeenCalled();
  });

  it('does not dismiss when no announcement is on screen', () => {
    const dismissAnnouncement = jest.fn();
    mockUseDraftUIState.mockReturnValue(
      makeBaseUI({ announcement: null, dismissAnnouncement }),
    );
    mockUseDraftQueries.mockReturnValue(
      makeBaseQueries({
        myTeamId: 1,
        currentPickTeamId: 1,
        currentPickInfo: pickAt(5, 1),
      }),
    );

    render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(dismissAnnouncement).not.toHaveBeenCalled();
  });
});
