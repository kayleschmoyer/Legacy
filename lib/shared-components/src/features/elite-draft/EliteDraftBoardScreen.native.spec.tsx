import React from 'react';
import { EliteDraftBoardScreen } from './EliteDraftBoardScreen.native';
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
import { render } from '../../test-utils';

// The shared mobile jest setup mocks most of react-native but omits Pressable
// and StyleSheet, which EliteDraftBoardScreen.native imports directly. Provide
// a minimal mock that covers the three primitives the screen uses.
jest.mock('react-native', () => {
  /* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires -- jest.mock factory needs runtime require */
  const ReactLocal = require('react') as typeof import('react');
  /* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires */
  return {
    StyleSheet: { create: (s: unknown) => s, flatten: (s: unknown) => s },
    Pressable: ({
      children,
      onPress,
      ...props
    }: {
      children?: React.ReactNode;
      onPress?: () => void;
    } & Record<string, unknown>) =>
      ReactLocal.createElement(
        'button',
        { onClick: onPress, ...props },
        children,
      ),
    FlatList: ({
      data,
      renderItem,
      keyExtractor,
      ListEmptyComponent,
      ListFooterComponent,
    }: {
      data?: ReadonlyArray<unknown>;
      renderItem?: (info: {
        item: unknown;
        index: number;
        separators: Record<string, unknown>;
      }) => React.ReactElement | null;
      keyExtractor?: (item: unknown, index: number) => string;
      ListEmptyComponent?: React.ReactNode;
      ListFooterComponent?: React.ReactNode;
    }) => {
      const items =
        data && data.length > 0
          ? data.map((item, index) => {
              const key = keyExtractor
                ? keyExtractor(item, index)
                : String(index);
              const element = renderItem
                ? renderItem({ item, index, separators: {} })
                : null;
              return element && ReactLocal.isValidElement(element)
                ? ReactLocal.cloneElement(element, { key })
                : null;
            })
          : ListEmptyComponent
            ? [ListEmptyComponent]
            : null;
      return ReactLocal.createElement(
        'div',
        { 'data-testid': 'flatlist' },
        items,
        ListFooterComponent,
      );
    },
  };
});

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

const mockUseAuth = jest.mocked(useAuth);
const mockUseDraftUIState = jest.mocked(useDraftUIState);
const mockUseDraftQueries = jest.mocked(useDraftQueries);
const mockUsePlayerData = jest.mocked(usePlayerData);
const mockUseDraftActions = jest.mocked(useDraftActions);

function makeBaseUI() {
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
  } as unknown as ReturnType<typeof useDraftUIState>;
}

function makeBaseQueries() {
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
  } as unknown as ReturnType<typeof useDraftQueries>;
}

function makeBaseActions() {
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
    commPickLoading: false,
    autoPickDisabledLoading: false,
    toggleAutoPickLoading: false,
    initDraftLoading: false,
    isMyTeamAutoPick: false,
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
    myTeam: [],
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
    .mockReturnValue({ timeRemaining: 90 } as unknown as ReturnType<
      typeof useDraftTimer
    >);
  jest
    .mocked(useDraftEffects)
    .mockReturnValue(
      undefined as unknown as ReturnType<typeof useDraftEffects>,
    );
});

// LS-8108 mirrors the LS-8067 web fix on the native draft board. The native
// consumer (apps/app DraftBoardPage) never supplies a `websocketToken` prop,
// so without sourcing the JWT from useAuth the draft socket defers forever
// and other open clients never receive live pick pushes.
describe('EliteDraftBoardScreen (native) — draft socket auth token (LS-8108)', () => {
  it('passes the useAuth token to useDraftWebSocket when no websocketToken prop is given', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 1, accessLevel: 'member' },
      token: 'jwt-from-auth',
    } as unknown as ReturnType<typeof useAuth>);

    render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(useDraftWebSocket).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'jwt-from-auth' }),
    );
  });

  it('prefers an explicit websocketToken prop over the useAuth token', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 1, accessLevel: 'member' },
      token: 'jwt-from-auth',
    } as unknown as ReturnType<typeof useAuth>);

    render(
      <EliteDraftBoardScreen
        {...defaultProps}
        websocketToken="explicit-token"
      />,
    );

    expect(useDraftWebSocket).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'explicit-token' }),
    );
  });

  it('passes undefined when neither a websocketToken prop nor an auth token exists', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 1, accessLevel: 'member' },
      token: null,
    } as unknown as ReturnType<typeof useAuth>);

    render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(useDraftWebSocket).toHaveBeenCalledWith(
      expect.objectContaining({ token: undefined }),
    );
  });
});
