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
import { render } from '../../test-utils';
import { useAuth } from '../../features/auth';

jest.mock('./hooks', () => ({
  useDraftUIState: jest.fn(),
  useDraftQueries: jest.fn(),
  usePlayerData: jest.fn(),
  useDraftActions: jest.fn(),
  useDraftWebSocket: jest.fn(),
  useDraftTimer: jest.fn(),
  useDraftEffects: jest.fn(),
}));

jest.mock('../../features/auth', () => ({
  useAuth: jest.fn(),
}));

// Heavy sub-screens are not under test here — stub them out
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

const mockUseAuth = useAuth as jest.Mock;
const mockUseDraftUIState = useDraftUIState as jest.Mock;
const mockUseDraftQueries = useDraftQueries as jest.Mock;
const mockUsePlayerData = usePlayerData as jest.Mock;
const mockUseDraftActions = useDraftActions as jest.Mock;
const mockUseDraftWebSocket = useDraftWebSocket as jest.Mock;
const mockUseDraftTimer = useDraftTimer as jest.Mock;
const mockUseDraftEffects = useDraftEffects as jest.Mock;

function makeUiState() {
  return {
    selectedPosition: 'ALL',
    searchTerm: '',
    viewMode: 'grid' as const,
    watchlist: [],
    chatOpen: false,
    draftComplete: false,
    initError: null,
    draftPaused: false,
    pickDeadline: null,
    pickTimeLimitSeconds: 90,
    commPickMode: false,
    autoPickDisabled: false,
    toastMessage: null,
    onlineUserIds: new Set<number>(),
    draftOrderMissing: false,
    currentPickLoadError: null,
    customDraftOrder: null,
    announcement: null,
    announcementLeaving: false,
    liveMessage: '',
    urgentMessage: '',
    playerSearch: '',
    notifiedPicksRef: { current: new Set<number>() },
    showAnnouncement: jest.fn(),
    showToast: jest.fn(),
    dismissAnnouncement: jest.fn(),
    setSelectedPosition: jest.fn(),
    setSearchTerm: jest.fn(),
    setViewMode: jest.fn(),
    setWatchlist: jest.fn(),
    setChatOpen: jest.fn(),
    setDraftComplete: jest.fn(),
    setInitError: jest.fn(),
    setDraftPaused: jest.fn(),
    setPickDeadline: jest.fn(),
    setPickTimeLimitSeconds: jest.fn(),
    setCommPickMode: jest.fn(),
    setAutoPickDisabled: jest.fn(),
    setToastMessage: jest.fn(),
    setOnlineUserIds: jest.fn(),
    setDraftOrderMissing: jest.fn(),
    setCurrentPickLoadError: jest.fn(),
    setCustomDraftOrder: jest.fn(),
    setLiveMessage: jest.fn(),
    setUrgentMessage: jest.fn(),
    setPlayerSearch: jest.fn(),
  };
}

function makeQueries(overrides: Record<string, unknown> = {}) {
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
      name: 'Test League',
      draftStatus: 'in-progress',
      isMockDraft: false,
      userMembership: { permissionLevel: 'owner', teamId: 1 },
    },
    leagueTeams: [],
    leagueDraft: {
      selectionMethod: 'standard',
      draftCompletedAt: null,
      id: '42',
    },
    draftId: 42,
    myTeamId: 1,
    isOwner: true,
    isCommissioner: true,
    isAuctionDraft: false,
    currentPickInfo: null,
    currentPickTeamId: null,
    pickHistory: [],
    availablePlayers: [],
    hasMorePlayers: false,
    loadingMore: false,
    boardOrderedTeams: [],
    queuedPlayerIds: [],
    autoPickTeamIds: [],
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
  };
}

function makeActions() {
  return {
    initDraftLoading: false,
    pauseLoading: false,
    resumeLoading: false,
    pickLoading: false,
    autoPickDisabledLoading: false,
    toggleAutoPickLoading: false,
    isMyTeamAutoPick: false,
    commPickMode: false,
    handleInitializeDraft: jest.fn(),
    handleMakePick: jest.fn(),
    handleCommissionerPick: jest.fn(),
    handleToggleQueue: jest.fn(),
    handlePauseDraft: jest.fn(),
    handleResumeDraft: jest.fn(),
    handleToggleCommPickMode: jest.fn(),
    handleToggleAutoPickDisabled: jest.fn(),
    handleToggleUserAutoPick: jest.fn(),
    nudgeExpiredDraftPick: jest.fn(),
  };
}

function makePlayerData() {
  return {
    enrichedPlayers: [],
    statsLookup: new Map(),
    myTeam: [],
    myTeamPicks: [],
  };
}

const defaultProps = {
  leagueId: 1,
  onNavigate: jest.fn(),
  websocketUrl: 'wss://test.example.com',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAuth.mockReturnValue({ user: { id: 1, accessLevel: 'member' } });
  mockUseDraftUIState.mockReturnValue(makeUiState());
  mockUseDraftQueries.mockReturnValue(makeQueries());
  mockUsePlayerData.mockReturnValue(makePlayerData());
  mockUseDraftActions.mockReturnValue(makeActions());
  mockUseDraftWebSocket.mockReturnValue(undefined);
  mockUseDraftTimer.mockReturnValue({ timeRemaining: 0 });
  mockUseDraftEffects.mockReturnValue(undefined);
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
      makeQueries({
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
      makeQueries({
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
