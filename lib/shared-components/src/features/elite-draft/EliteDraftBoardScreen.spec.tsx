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

jest.mock('./auction/AuctionDraftRoom', () => ({
  AuctionDraftRoom: () => <div data-testid="auction-draft-room" />,
}));
jest.mock('./PreDraftLobby', () => ({
  PreDraftLobby: () => <div data-testid="pre-draft-lobby" />,
}));
jest.mock('./DraftCompleteView', () => ({
  DraftCompleteView: () => <div data-testid="draft-complete-view" />,
}));
jest.mock('./DraftPlayerBoard', () => ({
  DraftPlayerBoard: () => <div data-testid="draft-player-board" />,
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
