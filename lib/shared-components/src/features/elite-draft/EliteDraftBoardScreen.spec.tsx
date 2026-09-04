import React from 'react';
import { CombinedGraphQLErrors } from '@apollo/client';
import { useGetUserByIdQuery } from '@legacy-sports/graphql';
import { AutomatedDraftScreen } from './DraftStateScreens';
import { EliteDraftBoardScreen } from './EliteDraftBoardScreen';
import {
  useDraftActions,
  useDraftEffects,
  useDraftQueries,
  useDraftTimer,
  useDraftUIState,
  useDraftWebSocket,
  useIsCompactDraftViewport,
  usePlayerData,
} from './hooks';
import type { DraftPickRecord, DraftPlayer, LeagueTeam } from './types';
import { useAuth } from '../../features/auth';
import { fireEvent, render, screen } from '../../test-utils';

// The compact/narrow-viewport branch's local chrome (PlayerRow, GoldButton,
// GhostButton, Eyebrow) uses these react-native primitives directly — the
// shared mobile jest setup mocks most of react-native but omits Pressable
// and StyleSheet (LS-9207, ported from the former .native.spec.tsx).
jest.mock('react-native', () => {
  /* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires -- jest.mock factory needs runtime require */
  const ReactLocal = require('react') as typeof import('react');
  /* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires */
  return {
    StyleSheet: { create: (s: unknown) => s, flatten: (s: unknown) => s },
    // `accessibilityLabel` is remapped to `aria-label` so RTL's a11y queries
    // reach the same labels a screen reader would announce on device.
    Pressable: ({
      children,
      onPress,
      accessibilityLabel,
      ...props
    }: {
      children?: React.ReactNode;
      onPress?: () => void;
      accessibilityLabel?: string;
    } & Record<string, unknown>) =>
      ReactLocal.createElement(
        'button',
        { onClick: onPress, 'aria-label': accessibilityLabel, ...props },
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
  useIsCompactDraftViewport: jest.fn(),
  usePlayerData: jest.fn(),
}));

jest.mock('../../features/auth', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@legacy-sports/graphql', () => ({
  useGetUserByIdQuery: jest.fn(() => ({ data: undefined })),
  // The screen compares league.sport against the generated Sport enum, so the
  // mocked module has to carry it (its members are the schema's string values).
  Sport: { Baseball: 'baseball', Football: 'football' },
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
  DraftTopBand: ({
    isMockDraft,
    onExitDraft,
    connectionStale,
  }: {
    isMockDraft?: boolean;
    onExitDraft?: () => void;
    connectionStale?: boolean;
  }) => (
    <div
      data-testid="draft-top-band"
      data-is-mock-draft={String(!!isMockDraft)}
      data-connection-stale={String(!!connectionStale)}
    >
      {isMockDraft && onExitDraft && (
        <button onClick={onExitDraft}>Exit Draft</button>
      )}
    </div>
  ),
}));
jest.mock('./DraftRail', () => ({
  DraftRail: ({ isPremium }: { isPremium: boolean }) => (
    <div data-testid="draft-rail" data-is-premium={String(isPremium)} />
  ),
}));
jest.mock('./DraftChatOverlay', () => ({
  DraftChatOverlay: () => null,
}));
jest.mock('./PickAnnouncement', () => ({
  PickAnnouncement: () => null,
}));
// Compact-branch widgets (LS-9206) — each already has its own component-level
// spec (DraftMiniBoard.spec.tsx etc.), so these are shallow wiring mocks
// rather than a re-verification of their internals.
// Draft Room v2 shell (LS-9397) — same shallow-wiring-mock convention: each
// has its own component-level spec (DraftHeaderBand.spec.tsx etc.).
jest.mock('./DraftHeaderBand', () => ({
  DraftHeaderBand: ({
    isMyPick,
    draftPaused,
    round,
    roundPickNumber,
    timeRemaining,
    pickTimeLimitSeconds,
    onClockTeamName,
    topQueuedPlayerName,
    connectionStale,
  }: {
    isMyPick: boolean;
    draftPaused: boolean;
    round: number;
    roundPickNumber: number;
    timeRemaining: number;
    pickTimeLimitSeconds: number;
    onClockTeamName: string | null;
    topQueuedPlayerName: string | null;
    connectionStale?: boolean;
  }) => (
    <div
      data-testid="draft-header-band"
      data-connection-stale={String(!!connectionStale)}
      data-is-my-pick={String(!!isMyPick)}
      data-draft-paused={String(!!draftPaused)}
      data-round={round}
      data-round-pick-number={roundPickNumber}
      data-time-remaining={timeRemaining}
      data-pick-time-limit-seconds={pickTimeLimitSeconds}
      data-team={onClockTeamName ?? ''}
      data-top-queued-player={topQueuedPlayerName ?? ''}
    />
  ),
}));
jest.mock('./DraftLastPickTicker', () => ({
  DraftLastPickTicker: ({
    lastPick,
    teamName,
  }: {
    lastPick: { overallPick: number } | null;
    teamName: string;
  }) =>
    lastPick ? (
      <div
        data-testid="draft-last-pick-ticker"
        data-overall-pick={lastPick.overallPick}
        data-team={teamName}
      />
    ) : null,
}));
jest.mock('./DraftBottomNav', () => ({
  DraftBottomNav: ({
    activeTab,
    onChangeTab,
    unreadChat,
    bottomInset,
  }: {
    activeTab: string;
    onChangeTab: (tab: string) => void;
    unreadChat?: boolean;
    bottomInset?: number;
  }) => (
    <button
      data-testid="draft-bottom-nav"
      data-active-tab={activeTab}
      data-unread-chat={String(!!unreadChat)}
      data-bottom-inset={String(bottomInset)}
      onClick={() => onChangeTab('players')}
    />
  ),
}));
jest.mock('./DraftBoardGrid', () => ({
  DraftBoardGrid: ({
    rounds,
    sport,
    onMakePick,
  }: {
    rounds: number;
    sport: string;
    onMakePick: () => void;
  }) => (
    <button
      data-testid="draft-board-grid"
      data-rounds={rounds}
      data-sport={sport}
      onClick={onMakePick}
    />
  ),
}));
jest.mock('./DraftPickToast', () => ({
  DraftPickToast: ({
    queue,
  }: {
    queue: ReadonlyArray<{ pickNumber: number }>;
  }) =>
    queue[0] ? (
      <div data-testid="draft-pick-toast" data-pick={queue[0].pickNumber} />
    ) : null,
}));
jest.mock('./DraftMyPickSplash', () => ({
  DraftMyPickSplash: ({
    queue,
  }: {
    queue: ReadonlyArray<{ pickNumber: number }>;
  }) =>
    queue[0] ? (
      <div data-testid="draft-my-pick-splash" data-pick={queue[0].pickNumber} />
    ) : null,
}));
jest.mock('./DraftRoomRecap', () => ({
  DraftRoomRecap: () => <div data-testid="draft-room-recap" />,
}));
jest.mock('./DraftPlayersTab', () => ({
  DraftPlayersTab: ({
    players,
    myTeam,
    selectedPosition,
    searchTerm,
    canDraft,
    myTeamId,
    onSetSelectedPosition,
    onSetSearchTerm,
    onToggleQueue,
    onDraftPlayer,
  }: {
    players: unknown[];
    myTeam: unknown[];
    selectedPosition: string;
    searchTerm: string;
    canDraft: boolean;
    myTeamId: number | null;
    onSetSelectedPosition: (pos: string) => void;
    onSetSearchTerm: (term: string) => void;
    onToggleQueue: (id: number) => void;
    onDraftPlayer: (id: number) => void;
  }) => (
    <div
      data-testid="draft-players-tab"
      data-players-count={players.length}
      data-my-team-count={myTeam.length}
      data-selected-position={selectedPosition}
      data-search-term={searchTerm}
      data-can-draft={String(canDraft)}
      data-my-team-id={myTeamId ?? ''}
    >
      <button onClick={() => onSetSelectedPosition('QB')}>set-position</button>
      <button onClick={() => onSetSearchTerm('mahomes')}>set-search</button>
      <button onClick={() => onToggleQueue(7)}>toggle-queue</button>
      <button onClick={() => onDraftPlayer(7)}>draft-player</button>
    </div>
  ),
}));
jest.mock('./DraftQueueTab', () => ({
  DraftQueueTab: () => <div data-testid="draft-queue-tab" />,
}));
jest.mock('./DraftTeamTab', () => ({
  DraftTeamTab: () => <div data-testid="draft-team-tab" />,
}));
jest.mock('./styles', () => ({ CSS: '' }));

const mockUseAuth = jest.mocked(useAuth);
const mockUseGetUserByIdQuery = jest.mocked(useGetUserByIdQuery);
const mockUseDraftUIState = jest.mocked(useDraftUIState);
const mockUseDraftQueries = jest.mocked(useDraftQueries);
const mockUsePlayerData = jest.mocked(usePlayerData);
const mockUseDraftActions = jest.mocked(useDraftActions);
const mockUseIsCompactDraftViewport = jest.mocked(useIsCompactDraftViewport);

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
    // Draft Room v2 shell (LS-9397)
    activeTab: 'board' as const,
    selectedTeamId: null,
    unreadChat: false,
    pickToastQueue: [],
    pickSplashQueue: [],
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
    setActiveTab: jest.fn(),
    setSelectedTeamId: jest.fn(),
    setUnreadChat: jest.fn(),
    enqueuePickToast: jest.fn(),
    dequeuePickToast: jest.fn(),
    enqueuePickSplash: jest.fn(),
    dequeuePickSplash: jest.fn(),
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
    queueEntries: [],
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
    commPickLoading: false,
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
  mockUseIsCompactDraftViewport.mockReturnValue(false);
  mockUseDraftUIState.mockReturnValue(makeBaseUI());
  mockUseDraftQueries.mockReturnValue(makeBaseQueries());
  mockUseDraftActions.mockReturnValue(makeBaseActions());
  mockUsePlayerData.mockReturnValue({
    enrichedPlayers: [],
    myTeam: null,
    myTeamPicks: [],
    statsLookup: new Map(),
  } as unknown as ReturnType<typeof usePlayerData>);
  // LS-9856: the screen now destructures the connection state off this hook,
  // so the mock has to return the real shape rather than undefined.
  jest.mocked(useDraftWebSocket).mockReturnValue({
    wsConnected: true,
    connectionStatus: 'online',
    retryConnection: jest.fn(),
  } as unknown as ReturnType<typeof useDraftWebSocket>);
  jest
    .mocked(useDraftTimer)
    .mockReturnValue({ timeRemaining: null } as unknown as ReturnType<
      typeof useDraftTimer
    >);
  jest.mocked(useDraftEffects).mockReturnValue(undefined);
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

  // LS-9470 — neither the web route nor the native route passes `sport`, so
  // the board has to read it off the league it already queries; otherwise a
  // football league renders a baseball board.
  it('falls back to league.sport when no sport prop is supplied', () => {
    mockUseDraftQueries.mockReturnValue(
      makeBaseQueries({
        league: {
          id: 1,
          name: 'Mock Draft Practice',
          sport: 'football',
          draftStatus: 'in-progress',
          isMockDraft: true,
          userMembership: { permissionLevel: 'commissioner', teamId: 1 },
        },
      }),
    );
    const { getByTestId, container } = render(
      <EliteDraftBoardScreen {...defaultProps} />,
    );
    expect(getByTestId('draft-player-board').getAttribute('data-sport')).toBe(
      'football',
    );
    expect(container.querySelector('.d-root')?.getAttribute('data-sport')).toBe(
      'football',
    );
  });

  it('prefers an explicit sport prop over league.sport', () => {
    mockUseDraftQueries.mockReturnValue(
      makeBaseQueries({
        league: {
          id: 1,
          name: 'Test League',
          sport: 'football',
          draftStatus: 'in-progress',
          isMockDraft: false,
          userMembership: { permissionLevel: 'member', teamId: 1 },
        },
      }),
    );
    const { getByTestId } = render(
      <EliteDraftBoardScreen {...defaultProps} sport="baseball" />,
    );
    expect(getByTestId('draft-player-board').getAttribute('data-sport')).toBe(
      'baseball',
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

// AC4 (LS-9402): the compact branch swaps in the Draft Room v2 recap in
// place of the pre-v2 DraftCompleteView; the wide branch is untouched.
describe('EliteDraftBoardScreen — draft-complete recap viewport swap (LS-9402)', () => {
  it('renders DraftRoomRecap (not DraftCompleteView) on the compact viewport', () => {
    mockUseIsCompactDraftViewport.mockReturnValue(true);
    mockUseDraftUIState.mockReturnValue(makeBaseUI({ draftComplete: true }));

    const { getByTestId, queryByTestId } = render(
      <EliteDraftBoardScreen {...defaultProps} />,
    );

    expect(getByTestId('draft-room-recap')).toBeTruthy();
    expect(queryByTestId('draft-complete-view')).toBeNull();
  });

  it('keeps rendering DraftCompleteView (not DraftRoomRecap) on the wide viewport', () => {
    mockUseIsCompactDraftViewport.mockReturnValue(false);
    mockUseDraftUIState.mockReturnValue(makeBaseUI({ draftComplete: true }));

    const { getByTestId, queryByTestId } = render(
      <EliteDraftBoardScreen {...defaultProps} />,
    );

    expect(getByTestId('draft-complete-view')).toBeTruthy();
    expect(queryByTestId('draft-room-recap')).toBeNull();
  });
});

// Regression gate: LS-4085 — draftId exists (scheduled draft) but draftStatus is not
// 'in-progress'. Before the fix the guard checked !draftId, so a queued draft with an
// assigned draftId would fall through to the live board and render an empty/broken UI.
describe('EliteDraftBoardScreen — pre-draft lobby guard (LS-4085)', () => {
  it('shows PreDraftLobby when draftId is assigned but draftStatus is queued (scheduled draft)', () => {
    mockUseDraftQueries.mockReturnValue(
      makeBaseQueries({
        league: {
          id: 1,
          name: 'Test League',
          draftStatus: 'queued',
          isMockDraft: false,
          userMembership: { permissionLevel: 'member', teamId: 1 },
        },
        leagueDraft: null,
        draftId: 42,
      }),
    );

    const { getByTestId, queryByTestId } = render(
      <EliteDraftBoardScreen {...defaultProps} />,
    );

    expect(getByTestId('pre-draft-lobby')).toBeTruthy();
    expect(queryByTestId('draft-player-board')).toBeNull();
  });

  it('shows live draft board when draftStatus is paused (paused draft has a draftId)', () => {
    mockUseDraftQueries.mockReturnValue(
      makeBaseQueries({
        league: {
          id: 1,
          name: 'Test League',
          draftStatus: 'paused',
          isMockDraft: false,
          userMembership: { permissionLevel: 'member', teamId: 1 },
        },
        draftId: 42,
      }),
    );

    const { getByTestId, queryByTestId } = render(
      <EliteDraftBoardScreen {...defaultProps} />,
    );

    expect(getByTestId('draft-player-board')).toBeTruthy();
    expect(queryByTestId('pre-draft-lobby')).toBeNull();
  });
});

describe('EliteDraftBoardScreen — paused overlay', () => {
  it('does not show paused overlay when draft is not paused', () => {
    mockUseDraftUIState.mockReturnValue(makeBaseUI({ draftPaused: false }));
    mockUseDraftQueries.mockReturnValue(
      makeBaseQueries({ isCommissioner: false }),
    );
    mockUseDraftActions.mockReturnValue(makeBaseActions());

    const { queryByText } = render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(queryByText('DRAFT PAUSED')).toBeNull();
  });

  it('shows paused overlay for non-commissioner when draft is paused', () => {
    mockUseDraftUIState.mockReturnValue(makeBaseUI({ draftPaused: true }));
    mockUseDraftQueries.mockReturnValue(
      makeBaseQueries({ isCommissioner: false }),
    );
    mockUseDraftActions.mockReturnValue(makeBaseActions());

    const { getByText } = render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(getByText('DRAFT PAUSED')).toBeTruthy();
    expect(getByText(/commissioner has paused/i)).toBeTruthy();
  });

  it('shows paused overlay for commissioner when draft is paused', () => {
    mockUseDraftUIState.mockReturnValue(makeBaseUI({ draftPaused: true }));
    mockUseDraftQueries.mockReturnValue(
      makeBaseQueries({ isCommissioner: true }),
    );
    mockUseDraftActions.mockReturnValue(makeBaseActions());

    const { getByText } = render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(getByText('DRAFT PAUSED')).toBeTruthy();
  });

  it('shows Resume Draft button for commissioner instead of wait message', () => {
    mockUseDraftUIState.mockReturnValue(makeBaseUI({ draftPaused: true }));
    mockUseDraftQueries.mockReturnValue(
      makeBaseQueries({ isCommissioner: true }),
    );
    mockUseDraftActions.mockReturnValue(makeBaseActions());

    const { getByText, queryByText } = render(
      <EliteDraftBoardScreen {...defaultProps} />,
    );

    expect(getByText('Resume Draft')).toBeTruthy();
    expect(queryByText(/commissioner has paused/i)).toBeNull();
  });

  it('does not show Resume Draft button for a general_manager when draft is paused (LS-8841)', () => {
    mockUseDraftUIState.mockReturnValue(makeBaseUI({ draftPaused: true }));
    mockUseDraftQueries.mockReturnValue(
      makeBaseQueries({ isOwner: true, isCommissioner: false }),
    );
    mockUseDraftActions.mockReturnValue(makeBaseActions());

    const { queryByText, getByText } = render(
      <EliteDraftBoardScreen {...defaultProps} />,
    );

    expect(queryByText('Resume Draft')).toBeNull();
    expect(getByText(/commissioner has paused/i)).toBeTruthy();
  });

  it('calls handleResumeDraft when commissioner clicks Resume Draft', () => {
    const handleResumeDraft = jest.fn().mockResolvedValue(undefined);
    mockUseDraftUIState.mockReturnValue(makeBaseUI({ draftPaused: true }));
    mockUseDraftQueries.mockReturnValue(
      makeBaseQueries({ isCommissioner: true }),
    );
    mockUseDraftActions.mockReturnValue(makeBaseActions({ handleResumeDraft }));

    const { getByText } = render(<EliteDraftBoardScreen {...defaultProps} />);

    fireEvent.click(getByText('Resume Draft'));
    expect(handleResumeDraft).toHaveBeenCalledTimes(1);
  });

  it('shows Resuming… and disables button when resumeLoading is true', () => {
    mockUseDraftUIState.mockReturnValue(makeBaseUI({ draftPaused: true }));
    mockUseDraftQueries.mockReturnValue(
      makeBaseQueries({ isCommissioner: true }),
    );
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
      teamName: 'Test Team',
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

// LS-8067: the draft WebSocket must receive an auth token so it actually
// connects. Web/native consumers never pass a `token` prop, so the screen
// sources it from useAuth — without this the socket defers forever and other
// open clients (e.g. a laptop) never receive live pick pushes until a refresh.
describe('EliteDraftBoardScreen — draft socket auth token (LS-8067)', () => {
  it('passes the useAuth token to useDraftWebSocket when no token prop is given', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 1, accessLevel: 'member' },
      token: 'jwt-from-auth',
    } as unknown as ReturnType<typeof useAuth>);

    render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(useDraftWebSocket).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'jwt-from-auth' }),
    );
  });

  it('prefers an explicit token prop over the useAuth token', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 1, accessLevel: 'member' },
      token: 'jwt-from-auth',
    } as unknown as ReturnType<typeof useAuth>);

    render(<EliteDraftBoardScreen {...defaultProps} token="explicit-token" />);

    expect(useDraftWebSocket).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'explicit-token' }),
    );
  });

  it('passes undefined when neither a token prop nor an auth token exists', () => {
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

// LS-4986: onActiveDraftChange fires true when draft is running, false otherwise.
describe('EliteDraftBoardScreen — onActiveDraftChange (LS-4986)', () => {
  it('calls onActiveDraftChange(true) when draft is in-progress', () => {
    const onActiveDraftChange = jest.fn();
    mockUseDraftQueries.mockReturnValue(
      makeBaseQueries({
        league: {
          id: 1,
          name: 'Test League',
          draftStatus: 'in-progress',
          isMockDraft: false,
          userMembership: { permissionLevel: 'member', teamId: 1 },
        },
        leagueDraft: {
          selectionMethod: 'standard',
          draftCompletedAt: null,
          id: '42',
        },
      }),
    );

    render(
      <EliteDraftBoardScreen
        {...defaultProps}
        onActiveDraftChange={onActiveDraftChange}
      />,
    );

    expect(onActiveDraftChange).toHaveBeenCalledWith(true);
  });

  it('calls onActiveDraftChange(true) when draft is paused', () => {
    const onActiveDraftChange = jest.fn();
    mockUseDraftQueries.mockReturnValue(
      makeBaseQueries({
        league: {
          id: 1,
          name: 'Test League',
          draftStatus: 'paused',
          isMockDraft: false,
          userMembership: { permissionLevel: 'member', teamId: 1 },
        },
        leagueDraft: {
          selectionMethod: 'standard',
          draftCompletedAt: null,
          id: '42',
        },
      }),
    );

    render(
      <EliteDraftBoardScreen
        {...defaultProps}
        onActiveDraftChange={onActiveDraftChange}
      />,
    );

    expect(onActiveDraftChange).toHaveBeenCalledWith(true);
  });

  it('calls onActiveDraftChange(false) when draft is in pre-draft lobby', () => {
    const onActiveDraftChange = jest.fn();
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

    render(
      <EliteDraftBoardScreen
        {...defaultProps}
        onActiveDraftChange={onActiveDraftChange}
      />,
    );

    expect(onActiveDraftChange).toHaveBeenCalledWith(false);
  });

  it('calls onActiveDraftChange(false) when draft is complete (WebSocket path)', () => {
    const onActiveDraftChange = jest.fn();
    mockUseDraftUIState.mockReturnValue(makeBaseUI({ draftComplete: true }));
    mockUseDraftQueries.mockReturnValue(
      makeBaseQueries({
        league: {
          id: 1,
          name: 'Test League',
          draftStatus: 'in-progress',
          isMockDraft: false,
          userMembership: { permissionLevel: 'member', teamId: 1 },
        },
      }),
    );

    render(
      <EliteDraftBoardScreen
        {...defaultProps}
        onActiveDraftChange={onActiveDraftChange}
      />,
    );

    expect(onActiveDraftChange).toHaveBeenCalledWith(false);
  });
});

// LS-8105: admin users must be treated as premium on the draft board by
// default, mirroring the web useIsPremium hook's admin short-circuit. The
// admin flag is sourced from the trusted server GetUserById response
// (accessLevel), not the client auth state.
describe('EliteDraftBoardScreen — premium entitlement (LS-8105)', () => {
  function withUser(user: { accessLevel?: string; subscriptionTier?: string }) {
    mockUseGetUserByIdQuery.mockReturnValue({
      data: { user: { id: 1, ...user } },
    } as unknown as ReturnType<typeof useGetUserByIdQuery>);
  }

  it('grants premium to admin users whose subscriptionTier is free (default)', () => {
    withUser({ accessLevel: 'admin', subscriptionTier: 'free' });

    const { getByTestId } = render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(getByTestId('draft-rail').getAttribute('data-is-premium')).toBe(
      'true',
    );
  });

  it('grants premium to non-admin users on the premium tier', () => {
    withUser({ accessLevel: 'member', subscriptionTier: 'premium' });

    const { getByTestId } = render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(getByTestId('draft-rail').getAttribute('data-is-premium')).toBe(
      'true',
    );
  });

  it('does not grant premium to non-admin users on the free tier', () => {
    withUser({ accessLevel: 'member', subscriptionTier: 'free' });

    const { getByTestId } = render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(getByTestId('draft-rail').getAttribute('data-is-premium')).toBe(
      'false',
    );
  });
});

// LS-8863: a user removed from a league between navigating to /draft and the
// draft-scoped query resolving previously fell through every early-return
// check (the league itself still loads — it's public data) and rendered a
// broken, dataless board while silently spamming Rollbar via LOGGER.error.
describe('EliteDraftBoardScreen — lost league access (LS-8863)', () => {
  function forbiddenError() {
    return new CombinedGraphQLErrors({
      errors: [
        {
          message: 'User is not a member of this league',
          extensions: { code: 'FORBIDDEN' },
        },
      ],
    });
  }

  it('shows Access Denied when the draft query returns FORBIDDEN', () => {
    mockUseDraftQueries.mockReturnValue(
      makeBaseQueries({ draftError: forbiddenError() }),
    );

    const { getByText, queryByTestId } = render(
      <EliteDraftBoardScreen {...defaultProps} />,
    );

    expect(getByText('Access Denied')).toBeInTheDocument();
    expect(
      getByText("You don't have access to this draft room."),
    ).toBeInTheDocument();
    expect(queryByTestId('draft-player-board')).not.toBeInTheDocument();
  });

  it('shows Access Denied when the league query returns FORBIDDEN', () => {
    mockUseDraftQueries.mockReturnValue(
      makeBaseQueries({
        league: undefined,
        leagueError: forbiddenError(),
      }),
    );

    const { getByText } = render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(getByText('Access Denied')).toBeInTheDocument();
  });

  it('renders the board normally when there is no draft error', () => {
    const { getByTestId } = render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(getByTestId('draft-player-board')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Compact/narrow-viewport branch (LS-9207) — folded in from the former
// EliteDraftBoardScreen.native.tsx fork. Early-return states (loading,
// errors, pre-draft lobby, draft complete) are shared across viewports and
// already covered above; these tests exercise the compact live-board JSX
// that only renders when useIsCompactDraftViewport() is true.
// ---------------------------------------------------------------------------
const TEAMS: LeagueTeam[] = [
  { id: '1', name: 'Dinger Dynasty', leagueId: 1 },
  { id: '2', name: 'Bronx Bombers', leagueId: 1 },
];

function makeDraftPlayer(overrides: Partial<DraftPlayer> = {}): DraftPlayer {
  return {
    id: 1,
    name: 'Bobby Witt Jr.',
    position: 'SS',
    avg: 0.332,
    hr: 32,
    rbi: 96,
    runs: 100,
    sb: 30,
    games: 160,
    hits: 200,
    obp: 0.389,
    slg: 0.588,
    ppg: 11.4,
    adp: 1,
    ...overrides,
  };
}

function makePickRecord(
  overrides: Partial<DraftPickRecord> = {},
): DraftPickRecord {
  return {
    id: 'pick-1',
    draftId: 42,
    round: 1,
    pickNumber: 1,
    overallPick: 1,
    pickedAt: '2026-07-28T00:00:00Z',
    teamId: 1,
    playerId: 1,
    ...overrides,
  };
}

function setupCompactLiveDraft({
  isMyPick = false,
  players = [] as DraftPlayer[],
  picks = [] as DraftPickRecord[],
  ui,
  queries,
}: {
  isMyPick?: boolean;
  players?: DraftPlayer[];
  picks?: DraftPickRecord[];
  ui?: Partial<ReturnType<typeof useDraftUIState>>;
  queries?: Record<string, unknown>;
} = {}) {
  mockUseIsCompactDraftViewport.mockReturnValue(true);
  mockUseDraftUIState.mockReturnValue({ ...makeBaseUI(), ...ui });
  mockUseDraftQueries.mockReturnValue({
    ...makeBaseQueries(),
    leagueTeams: TEAMS,
    boardOrderedTeams: TEAMS,
    myTeamId: 1,
    currentPickTeamId: isMyPick ? 1 : 2,
    currentPickInfo: {
      draftId: 42,
      teamId: isMyPick ? 1 : 2,
      round: 1,
      pickNumber: isMyPick ? 1 : 2,
      overallPick: isMyPick ? 1 : 2,
      isComplete: false,
    },
    pickHistory: picks,
    teamNameById: jest.fn((teamId: number | null) =>
      String(teamId) === '1' ? 'Dinger Dynasty' : 'Bronx Bombers',
    ),
    ...queries,
  } as unknown as ReturnType<typeof useDraftQueries>);
  mockUsePlayerData.mockReturnValue({
    enrichedPlayers: players,
    myTeam: [],
    myTeamPicks: [],
    statsLookup: new Map(players.map((p) => [p.id, p])),
  } as unknown as ReturnType<typeof usePlayerData>);
}

describe('EliteDraftBoardScreen — compact viewport branch selection', () => {
  it('renders the compact live board instead of DraftPlayerBoard/DraftTopBand/DraftRail', () => {
    setupCompactLiveDraft();

    const { queryByTestId } = render(
      <EliteDraftBoardScreen {...defaultProps} />,
    );

    expect(queryByTestId('draft-player-board')).toBeNull();
    expect(queryByTestId('draft-top-band')).toBeNull();
    expect(queryByTestId('draft-rail')).toBeNull();
    expect(queryByTestId('flatlist')).toBeTruthy();
  });

  it('renders the wide board when useIsCompactDraftViewport is false (default)', () => {
    mockUseIsCompactDraftViewport.mockReturnValue(false);
    mockUseDraftQueries.mockReturnValue(
      makeBaseQueries({ leagueTeams: TEAMS, boardOrderedTeams: TEAMS }),
    );

    const { getByTestId, queryByTestId } = render(
      <EliteDraftBoardScreen {...defaultProps} />,
    );

    expect(getByTestId('draft-player-board')).toBeTruthy();
    expect(queryByTestId('flatlist')).toBeNull();
  });
});

describe('EliteDraftBoardScreen — compact viewport, live board', () => {
  it('wires the on-clock team, round, and round-pick number through to DraftHeaderBand', () => {
    setupCompactLiveDraft();

    render(<EliteDraftBoardScreen {...defaultProps} />);

    const header = screen.getByTestId('draft-header-band');
    expect(header.getAttribute('data-team')).toBe('Bronx Bombers');
    expect(header.getAttribute('data-round')).toBe('1');
    expect(header.getAttribute('data-round-pick-number')).toBe('2');
    expect(header.getAttribute('data-is-my-pick')).toBe('false');
  });

  it('tells DraftHeaderBand when the viewer is on the clock', () => {
    setupCompactLiveDraft({ isMyPick: true });

    render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(
      screen.getByTestId('draft-header-band').getAttribute('data-is-my-pick'),
    ).toBe('true');
  });

  it('passes the draft timer and paused state through to DraftHeaderBand', () => {
    setupCompactLiveDraft({ ui: { draftPaused: true } });
    jest.mocked(useDraftTimer).mockReturnValue({ timeRemaining: 42 });

    render(<EliteDraftBoardScreen {...defaultProps} />);

    const header = screen.getByTestId('draft-header-band');
    expect(header.getAttribute('data-time-remaining')).toBe('42');
    expect(header.getAttribute('data-draft-paused')).toBe('true');
  });

  it('passes the resolved board rounds and sport to DraftBoardGrid', () => {
    setupCompactLiveDraft({ picks: [makePickRecord()] });

    render(<EliteDraftBoardScreen {...defaultProps} sport="football" />);

    const grid = screen.getByTestId('draft-board-grid');
    expect(grid).toBeTruthy();
    expect(grid.getAttribute('data-sport')).toBe('football');
  });

  it('navigates to the Players tab when DraftBoardGrid fires onMakePick', () => {
    const setActiveTab = jest.fn();
    setupCompactLiveDraft({ ui: { setActiveTab } });

    render(<EliteDraftBoardScreen {...defaultProps} />);

    fireEvent.click(screen.getByTestId('draft-board-grid'));

    expect(setActiveTab).toHaveBeenCalledWith('players');
  });

  it('shows a loading footer while more players are being fetched', () => {
    setupCompactLiveDraft({
      players: [makeDraftPlayer()],
      queries: { hasMorePlayers: true, loadingMore: true },
    });

    render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(screen.getByTestId('draft-loading-more')).toBeTruthy();
  });

  it('shows no loading footer when there are no more players to fetch', () => {
    setupCompactLiveDraft({
      players: [makeDraftPlayer()],
      queries: { hasMorePlayers: false, loadingMore: false },
    });

    render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(screen.queryByTestId('draft-loading-more')).toBeNull();
  });

  it('shows each available player with a stat line, points and ADP', () => {
    setupCompactLiveDraft({ players: [makeDraftPlayer()] });

    render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(screen.getByText('Bobby Witt Jr.')).toBeTruthy();
    expect(screen.getByText('AVG .332 · HR 32 · RBI 96')).toBeTruthy();
    expect(screen.getByText('11.4')).toBeTruthy();
    expect(screen.getByText('ADP 1')).toBeTruthy();
  });

  it('hides the DRAFT action until the viewer is on the clock', () => {
    setupCompactLiveDraft({ players: [makeDraftPlayer()] });

    render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(screen.queryByText('DRAFT')).toBeNull();
  });

  it('drafts the tapped player when the viewer is on the clock', () => {
    const handleMakePick = jest.fn();
    setupCompactLiveDraft({ isMyPick: true, players: [makeDraftPlayer()] });
    mockUseDraftActions.mockReturnValue(makeBaseActions({ handleMakePick }));

    render(<EliteDraftBoardScreen {...defaultProps} />);
    fireEvent.click(screen.getByText('DRAFT'));

    expect(handleMakePick).toHaveBeenCalledWith(1);
  });

  // LS-9253: Control All Teams — every team's turn is pickable, not just the
  // human's own seat, routed through commissionerPick (not makeDraftPick)
  // since the current-clock team isn't the human's own registered team.
  it("shows a first-class DRAFT action (not Force Pick) on another team's turn when Control All Teams is on, and routes the pick through commissionerPick", () => {
    const handleMakePick = jest.fn();
    const handleCommissionerPick = jest.fn();
    setupCompactLiveDraft({
      isMyPick: false,
      players: [makeDraftPlayer()],
      queries: {
        isCommissioner: true,
        league: {
          id: 1,
          name: 'Mock Draft Practice',
          draftStatus: 'in-progress',
          isMockDraft: true,
          controlAllTeams: true,
          userMembership: { permissionLevel: 'commissioner', teamId: 1 },
        },
      },
    });
    mockUseDraftActions.mockReturnValue(
      makeBaseActions({ handleMakePick, handleCommissionerPick }),
    );

    render(<EliteDraftBoardScreen {...defaultProps} />);

    // Reads as a first-class pick action, not a commissioner override.
    expect(screen.queryByText('ASSIGN')).toBeNull();
    fireEvent.click(screen.getByText('DRAFT'));

    expect(handleCommissionerPick).toHaveBeenCalledWith(1);
    expect(handleMakePick).not.toHaveBeenCalled();
  });

  it('re-sorts the list by projected points without renumbering ADP', () => {
    setupCompactLiveDraft({
      players: [
        makeDraftPlayer({ id: 1, name: 'Ace Adams', ppg: 6, adp: 1 }),
        makeDraftPlayer({ id: 2, name: 'Bo Baker', ppg: 12, adp: 2 }),
      ],
    });

    render(<EliteDraftBoardScreen {...defaultProps} />);
    fireEvent.click(screen.getByText('PTS'));

    // Bo Baker leads on points but keeps his server-ranked ADP of 2.
    expect(
      screen.getAllByText(/Adams|Baker/).map((node) => node.textContent),
    ).toEqual(['Bo Baker', 'Ace Adams']);
    expect(screen.getByText('ADP 2')).toBeTruthy();
  });

  it('does not reset the best remaining player to ADP 1 once earlier picks are drafted', () => {
    // Players 1-2 are already off the board (drafted) — only the stack-rank
    // #3 player remains available. The board must show his own stable ADP,
    // not renumber him to 1 just because he is first in the remaining list.
    setupCompactLiveDraft({
      players: [makeDraftPlayer({ id: 3, name: 'Cy Cooper', adp: 3 })],
    });

    render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(screen.getByText('ADP 3')).toBeTruthy();
  });

  // LS-9447: the "My Squad" drawer is gone from the board tab — the Team tab
  // (LS-9400) is the one place the compact board shows a roster now, so the
  // strip was a redundant second entry point taking up board real estate.
  it('renders no My Squad drawer on the board tab', () => {
    const player = makeDraftPlayer();
    setupCompactLiveDraft({ players: [player], picks: [makePickRecord()] });
    mockUsePlayerData.mockReturnValue({
      enrichedPlayers: [],
      myTeam: [player],
      myTeamPicks: [makePickRecord()],
      statsLookup: new Map([[player.id, player]]),
    } as unknown as ReturnType<typeof usePlayerData>);

    render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(screen.queryByText(/My Squad/)).toBeNull();
    expect(screen.queryByLabelText(/Open roster/i)).toBeNull();
    // The board tab still renders, so the assertions above are about the
    // drawer's absence rather than an empty screen.
    expect(screen.getByTestId('draft-board-grid')).toBeTruthy();
  });

  it('exposes commissioner pause and comm-pick controls to the commissioner', () => {
    setupCompactLiveDraft({ queries: { isCommissioner: true } });

    render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(screen.getByText('PAUSE')).toBeTruthy();
    expect(screen.getByText('COMM PICK')).toBeTruthy();
  });

  // LS-8841: showCommissionerBar gates strictly on isCommissioner (mirroring
  // the wide-branch DraftTopBand gate), not on the broader isOwner check.
  describe('commissioner control bar visibility by permission level (LS-8841)', () => {
    it.each([
      ['general_manager', false],
      ['assistant_manager', false],
      ['commissioner', true],
    ] as const)(
      'permissionLevel=%s → commissioner bar visible=%s',
      (permissionLevel, expectVisible) => {
        setupCompactLiveDraft({
          queries: {
            isCommissioner: permissionLevel === 'commissioner',
            league: {
              id: 1,
              name: 'Test League',
              draftStatus: 'in-progress',
              isMockDraft: false,
              userMembership: { permissionLevel, teamId: 1 },
            },
          },
        });

        render(<EliteDraftBoardScreen {...defaultProps} />);

        if (expectVisible) {
          expect(screen.getByText('PAUSE')).toBeTruthy();
          expect(screen.getByText('COMM PICK')).toBeTruthy();
        } else {
          expect(screen.queryByText('PAUSE')).toBeNull();
          expect(screen.queryByText('COMM PICK')).toBeNull();
        }
      },
    );
  });

  // LS-9242: initialize-mock-draft.ts registers the human as
  // permissionLevel="commissioner" so the pick/queue flow works, but a solo
  // mock draft has no real commissioner role to manage — the commissioner
  // controls must stay hidden even though isCommissioner is true.
  it('hides commissioner controls in a mock draft even though the user is registered as commissioner', () => {
    setupCompactLiveDraft({
      queries: {
        isCommissioner: true,
        league: {
          id: 1,
          name: 'Test League',
          draftStatus: 'in-progress',
          isMockDraft: true,
          userMembership: { permissionLevel: 'commissioner', teamId: 1 },
        },
      },
    });

    render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(screen.queryByText('PAUSE')).toBeNull();
    expect(screen.queryByText('COMM PICK')).toBeNull();
  });
});

describe('EliteDraftBoardScreen — Draft Room v2 shell (LS-9397)', () => {
  it('renders no last-pick ticker before the first pick', () => {
    setupCompactLiveDraft();

    render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(screen.queryByTestId('draft-last-pick-ticker')).toBeNull();
  });

  it('wires the most recent pick (by overallPick) and the picking team through to DraftLastPickTicker', () => {
    setupCompactLiveDraft({
      picks: [
        makePickRecord({ id: 'p1', overallPick: 1, teamId: 1 }),
        makePickRecord({ id: 'p2', overallPick: 2, teamId: 2 }),
      ],
    });

    render(<EliteDraftBoardScreen {...defaultProps} />);

    const ticker = screen.getByTestId('draft-last-pick-ticker');
    expect(ticker.getAttribute('data-overall-pick')).toBe('2');
    expect(ticker.getAttribute('data-team')).toBe('Bronx Bombers');
  });

  it('defaults to the Board tab, showing the existing board content and hiding tab placeholders and the other tabs', () => {
    setupCompactLiveDraft();

    render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(screen.getByTestId('draft-board-grid')).toBeTruthy();
    expect(screen.getByTestId('flatlist')).toBeTruthy();
    expect(screen.queryByText('Chat tab is coming soon.')).toBeNull();
    expect(screen.queryByTestId('draft-players-tab')).toBeNull();
    expect(screen.queryByTestId('draft-queue-tab')).toBeNull();
    expect(screen.queryByTestId('draft-team-tab')).toBeNull();
  });

  it('shows a placeholder body and hides the board content for the one remaining placeholder tab (chat)', () => {
    setupCompactLiveDraft({ ui: { activeTab: 'chat' } });

    render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(screen.getByText('Chat tab is coming soon.')).toBeTruthy();
    expect(screen.queryByTestId('draft-mini-board')).toBeNull();
    expect(screen.queryByTestId('flatlist')).toBeNull();
    expect(screen.queryByTestId('draft-players-tab')).toBeNull();
  });

  it('renders DraftPlayersTab (LS-9399) instead of a placeholder for the Players tab, and hides the board content', () => {
    setupCompactLiveDraft({ ui: { activeTab: 'players' } });

    render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(screen.getByTestId('draft-players-tab')).toBeTruthy();
    expect(screen.queryByText('Players tab is coming soon.')).toBeNull();
    expect(screen.queryByTestId('draft-mini-board')).toBeNull();
    expect(screen.queryByTestId('flatlist')).toBeNull();
  });

  it('wires players, myTeam, position/search state, canDraft, and myTeamId through to DraftPlayersTab', () => {
    const player = makeDraftPlayer({ id: 5 });
    setupCompactLiveDraft({
      isMyPick: true,
      players: [player],
      ui: { activeTab: 'players', selectedPosition: 'RB', searchTerm: 'kelce' },
    });
    mockUsePlayerData.mockReturnValue({
      enrichedPlayers: [player],
      myTeam: [player],
      myTeamPicks: [],
      statsLookup: new Map([[player.id, player]]),
    } as unknown as ReturnType<typeof usePlayerData>);

    render(<EliteDraftBoardScreen {...defaultProps} />);

    const tab = screen.getByTestId('draft-players-tab');
    expect(tab.getAttribute('data-players-count')).toBe('1');
    expect(tab.getAttribute('data-my-team-count')).toBe('1');
    expect(tab.getAttribute('data-selected-position')).toBe('RB');
    expect(tab.getAttribute('data-search-term')).toBe('kelce');
    expect(tab.getAttribute('data-can-draft')).toBe('true');
    expect(tab.getAttribute('data-my-team-id')).toBe('1');
  });

  it('routes DraftPlayersTab callbacks to ui state setters and the shared draft/queue handlers', () => {
    const setSelectedPosition = jest.fn();
    const setSearchTerm = jest.fn();
    const handleToggleQueue = jest.fn();
    const handleMakePick = jest.fn();
    setupCompactLiveDraft({
      isMyPick: true,
      ui: {
        activeTab: 'players',
        setSelectedPosition,
        setSearchTerm,
      },
    });
    mockUseDraftActions.mockReturnValue(
      makeBaseActions({ handleToggleQueue, handleMakePick }),
    );

    render(<EliteDraftBoardScreen {...defaultProps} />);

    fireEvent.click(screen.getByText('set-position'));
    expect(setSelectedPosition).toHaveBeenCalledWith('QB');

    fireEvent.click(screen.getByText('set-search'));
    expect(setSearchTerm).toHaveBeenCalledWith('mahomes');

    fireEvent.click(screen.getByText('toggle-queue'));
    expect(handleToggleQueue).toHaveBeenCalledWith(7);

    fireEvent.click(screen.getByText('draft-player'));
    expect(handleMakePick).toHaveBeenCalledWith(7);
  });

  it('renders the bottom nav with the current active tab and routes taps to ui.setActiveTab', () => {
    const setActiveTab = jest.fn();
    setupCompactLiveDraft({ ui: { activeTab: 'queue', setActiveTab } });

    render(<EliteDraftBoardScreen {...defaultProps} />);

    const nav = screen.getByTestId('draft-bottom-nav');
    expect(nav.getAttribute('data-active-tab')).toBe('queue');

    fireEvent.click(nav);

    expect(setActiveTab).toHaveBeenCalledWith('players');
  });

  // LS-9444: the draft room is pushed outside the `(tabs)` shell, so its own
  // bottom nav is the only thing that can reserve Android's edge-to-edge
  // navigation-bar inset — it never gets there unless this screen forwards it.
  it('forwards the bottom safe-area inset to the bottom nav', () => {
    setupCompactLiveDraft();

    render(<EliteDraftBoardScreen {...defaultProps} bottomInset={48} />);

    expect(
      screen.getByTestId('draft-bottom-nav').getAttribute('data-bottom-inset'),
    ).toBe('48');
  });

  it('defaults the bottom nav inset to 0 when no inset is supplied', () => {
    setupCompactLiveDraft();

    render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(
      screen.getByTestId('draft-bottom-nav').getAttribute('data-bottom-inset'),
    ).toBe('0');
  });

  it('shows the top queued player on DraftHeaderBand only when it is my pick', () => {
    setupCompactLiveDraft({
      isMyPick: true,
      queries: {
        queueEntries: [
          { id: 1, draftId: 42, teamId: 1, playerId: 1, priority: 1 },
        ],
      },
      players: [makeDraftPlayer()],
    });

    render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(
      screen
        .getByTestId('draft-header-band')
        .getAttribute('data-top-queued-player'),
    ).toBe('Bobby Witt Jr.');
  });

  it('hides the top queued player when it is not my pick, even with a queue', () => {
    setupCompactLiveDraft({
      isMyPick: false,
      queries: {
        queueEntries: [
          { id: 1, draftId: 42, teamId: 1, playerId: 1, priority: 1 },
        ],
      },
      players: [makeDraftPlayer()],
    });

    render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(
      screen
        .getByTestId('draft-header-band')
        .getAttribute('data-top-queued-player'),
    ).toBe('');
  });
});

describe('EliteDraftBoardScreen — Chat tab (LS-9401)', () => {
  it('shows the "coming soon" placeholder on the Chat tab when renderChatTab is omitted', () => {
    setupCompactLiveDraft({ ui: { activeTab: 'chat' } });

    render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(screen.getByText('Chat tab is coming soon.')).toBeTruthy();
  });

  it('calls renderChatTab with leagueId/userId and renders its output on the Chat tab', () => {
    setupCompactLiveDraft({ ui: { activeTab: 'chat' } });
    const renderChatTab = jest.fn(() => <div data-testid="chat-tab-body" />);

    render(
      <EliteDraftBoardScreen {...defaultProps} renderChatTab={renderChatTab} />,
    );

    expect(screen.getByTestId('chat-tab-body')).toBeTruthy();
    expect(screen.queryByText('Chat tab is coming soon.')).toBeNull();
    expect(renderChatTab).toHaveBeenCalledWith(
      expect.objectContaining({ leagueId: 1, userId: 1 }),
    );
  });

  it('keeps the chat renderer mounted (display:none) rather than unmounted when another tab is active', () => {
    setupCompactLiveDraft({ ui: { activeTab: 'players' } });
    const renderChatTab = jest.fn(() => <div data-testid="chat-tab-body" />);

    render(
      <EliteDraftBoardScreen {...defaultProps} renderChatTab={renderChatTab} />,
    );

    expect(renderChatTab).toHaveBeenCalled();
    const slot = screen.getByTestId('draft-chat-tab-slot');
    expect(slot.style.display).toBe('none');
    expect(screen.getByTestId('draft-players-tab')).toBeTruthy();
  });

  it('forwards ui.unreadChat to DraftBottomNav', () => {
    setupCompactLiveDraft({ ui: { activeTab: 'board', unreadChat: true } });

    render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(
      screen.getByTestId('draft-bottom-nav').getAttribute('data-unread-chat'),
    ).toBe('true');
  });

  it('sets the unread-chat flag when a new message arrives while another tab is active', () => {
    const setUnreadChat = jest.fn();
    setupCompactLiveDraft({
      ui: { activeTab: 'players', setUnreadChat },
    });
    let onNewMessage: () => void = jest.fn();
    const renderChatTab = jest.fn((props: { onNewMessage: () => void }) => {
      onNewMessage = props.onNewMessage;
      return <div data-testid="chat-tab-body" />;
    });

    render(
      <EliteDraftBoardScreen {...defaultProps} renderChatTab={renderChatTab} />,
    );
    onNewMessage();

    expect(setUnreadChat).toHaveBeenCalledWith(true);
  });

  it('does not set the unread-chat flag for a new message while the Chat tab is already active', () => {
    const setUnreadChat = jest.fn();
    setupCompactLiveDraft({
      ui: { activeTab: 'chat', setUnreadChat },
    });
    let onNewMessage: () => void = jest.fn();
    const renderChatTab = jest.fn((props: { onNewMessage: () => void }) => {
      onNewMessage = props.onNewMessage;
      return <div data-testid="chat-tab-body" />;
    });

    render(
      <EliteDraftBoardScreen {...defaultProps} renderChatTab={renderChatTab} />,
    );
    setUnreadChat.mockClear(); // clear the mount-time clear-on-open call
    onNewMessage();

    expect(setUnreadChat).not.toHaveBeenCalledWith(true);
  });

  it('clears the unread-chat flag when the Chat tab becomes active', () => {
    const setUnreadChat = jest.fn();
    setupCompactLiveDraft({ ui: { activeTab: 'chat', setUnreadChat } });

    render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(setUnreadChat).toHaveBeenCalledWith(false);
  });
});

describe('EliteDraftBoardScreen — Exit Draft control (LS-9238)', () => {
  it('compact: shows Exit Draft for a mock draft and navigates to /baseball on click when onExitDraft is not supplied', () => {
    const onNavigate = jest.fn();
    setupCompactLiveDraft({
      queries: {
        league: {
          id: 1,
          name: 'Test League',
          draftStatus: 'in-progress',
          isMockDraft: true,
          userMembership: { permissionLevel: 'member', teamId: 1 },
        },
      },
    });

    render(<EliteDraftBoardScreen {...defaultProps} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByText('EXIT DRAFT'));

    expect(onNavigate).toHaveBeenCalledWith('/baseball');
  });

  // LS-9446: native wires onExitDraft to a stack-popping navigator instead of
  // the forward onNavigate('/baseball') push, which stranded the home screen
  // behind the mock-draft stack. web still omits onExitDraft, so the case
  // above continues to cover its onNavigate('/baseball') fallback unchanged.
  it('compact: calls onExitDraft instead of onNavigate when onExitDraft is supplied', () => {
    const onNavigate = jest.fn();
    const onExitDraft = jest.fn();
    setupCompactLiveDraft({
      queries: {
        league: {
          id: 1,
          name: 'Test League',
          draftStatus: 'in-progress',
          isMockDraft: true,
          userMembership: { permissionLevel: 'member', teamId: 1 },
        },
      },
    });

    render(
      <EliteDraftBoardScreen
        {...defaultProps}
        onNavigate={onNavigate}
        onExitDraft={onExitDraft}
      />,
    );
    fireEvent.click(screen.getByText('EXIT DRAFT'));

    expect(onExitDraft).toHaveBeenCalledTimes(1);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('compact: hides Exit Draft for a real league draft', () => {
    setupCompactLiveDraft();

    render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(screen.queryByText('EXIT DRAFT')).toBeNull();
  });

  it('wide: shows Exit Draft for a mock draft and navigates to /baseball on click', () => {
    const onNavigate = jest.fn();
    mockUseIsCompactDraftViewport.mockReturnValue(false);
    mockUseDraftQueries.mockReturnValue(
      makeBaseQueries({
        leagueTeams: TEAMS,
        boardOrderedTeams: TEAMS,
        league: {
          id: 1,
          name: 'Test League',
          draftStatus: 'in-progress',
          isMockDraft: true,
          userMembership: { permissionLevel: 'member', teamId: 1 },
        },
      }),
    );

    const { getByRole } = render(
      <EliteDraftBoardScreen {...defaultProps} onNavigate={onNavigate} />,
    );
    fireEvent.click(getByRole('button', { name: /exit draft/i }));

    expect(onNavigate).toHaveBeenCalledWith('/baseball');
  });

  it('wide: hides Exit Draft for a real league draft', () => {
    mockUseIsCompactDraftViewport.mockReturnValue(false);
    mockUseDraftQueries.mockReturnValue(
      makeBaseQueries({ leagueTeams: TEAMS, boardOrderedTeams: TEAMS }),
    );

    const { queryByRole } = render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(queryByRole('button', { name: /exit draft/i })).toBeNull();
  });
});

describe('EliteDraftBoardScreen — compact viewport, Draft Room v2 overlays (LS-9402)', () => {
  it('wires the toast queue through to DraftPickToast', () => {
    setupCompactLiveDraft({
      ui: {
        pickToastQueue: [
          {
            id: '7',
            player: makeDraftPlayer(),
            pickNumber: 7,
            round: 1,
            roundPickNumber: 7,
            teamName: 'Dinger Dynasty',
            isAuto: false,
          },
        ],
      },
    });

    render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(
      screen.getByTestId('draft-pick-toast').getAttribute('data-pick'),
    ).toBe('7');
  });

  it('renders nothing for DraftPickToast when the toast queue is empty', () => {
    setupCompactLiveDraft();

    render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(screen.queryByTestId('draft-pick-toast')).toBeNull();
  });

  it('wires the splash queue through to DraftMyPickSplash', () => {
    setupCompactLiveDraft({
      ui: {
        pickSplashQueue: [
          {
            id: '3',
            player: makeDraftPlayer(),
            pickNumber: 3,
            round: 1,
            roundPickNumber: 3,
          },
        ],
      },
    });

    render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(
      screen.getByTestId('draft-my-pick-splash').getAttribute('data-pick'),
    ).toBe('3');
  });

  it('renders nothing for DraftMyPickSplash when the splash queue is empty', () => {
    setupCompactLiveDraft();

    render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(screen.queryByTestId('draft-my-pick-splash')).toBeNull();
  });
});

// AC4/Technical-approach: auction drafts have no compact layout yet (a
// deferred product decision, not a capability gap) — gated on viewport, not
// platform, so it reuses the same AuctionNotSupportedScreen at any width.
describe('EliteDraftBoardScreen — compact viewport, auction draft', () => {
  it('shows the auction-not-supported state instead of AuctionDraftRoom', () => {
    mockUseIsCompactDraftViewport.mockReturnValue(true);
    mockUseDraftQueries.mockReturnValue(
      makeBaseQueries({
        leagueDraft: {
          selectionMethod: 'auction',
          draftCompletedAt: null,
          id: '42',
        },
        isAuctionDraft: true,
      }),
    );

    const { getByText, queryByTestId } = render(
      <EliteDraftBoardScreen {...defaultProps} />,
    );

    expect(getByText('Auction Draft')).toBeTruthy();
    expect(queryByTestId('auction-draft-room')).toBeNull();
  });
});

/**
 * LS-9856 — the shell must actually consume the socket state. Before this,
 * `wsConnected` was returned by useDraftWebSocket and read by nobody, so a
 * drop left the board showing stale picks under a running clock with no
 * signal at all.
 */
describe('EliteDraftBoardScreen — connection state (LS-9856)', () => {
  const withConnectionStatus = (
    connectionStatus: 'online' | 'reconnecting' | 'lost',
    retryConnection: () => void = jest.fn(),
  ) => {
    jest.mocked(useDraftWebSocket).mockReturnValue({
      wsConnected: connectionStatus === 'online',
      connectionStatus,
      retryConnection,
    });
  };

  it('shows nothing extra while the socket is online', () => {
    mockUseIsCompactDraftViewport.mockReturnValue(false);
    mockUseDraftQueries.mockReturnValue(
      makeBaseQueries({ leagueTeams: TEAMS, boardOrderedTeams: TEAMS }),
    );
    withConnectionStatus('online');

    const { getByTestId, queryByTestId } = render(
      <EliteDraftBoardScreen {...defaultProps} />,
    );

    expect(queryByTestId('draft-connection-banner')).toBeNull();
    expect(queryByTestId('draft-connection-lost')).toBeNull();
    expect(
      getByTestId('draft-top-band').getAttribute('data-connection-stale'),
    ).toBe('false');
  });

  it('banners the wide board and marks the pick clock stale while reconnecting', () => {
    mockUseIsCompactDraftViewport.mockReturnValue(false);
    mockUseDraftQueries.mockReturnValue(
      makeBaseQueries({ leagueTeams: TEAMS, boardOrderedTeams: TEAMS }),
    );
    withConnectionStatus('reconnecting');

    const { getByTestId } = render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(getByTestId('draft-connection-banner')).toBeTruthy();
    expect(
      getByTestId('draft-top-band').getAttribute('data-connection-stale'),
    ).toBe('true');
    // The board itself stays up — recovery is still the likely outcome.
    expect(getByTestId('draft-player-board')).toBeTruthy();
  });

  it('banners the compact board and marks its clock stale while reconnecting', () => {
    setupCompactLiveDraft();
    withConnectionStatus('reconnecting');

    const { getByTestId } = render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(getByTestId('draft-connection-banner')).toBeTruthy();
    expect(
      getByTestId('draft-header-band').getAttribute('data-connection-stale'),
    ).toBe('true');
  });

  it('replaces the board with the Connection Lost state on a sustained drop', () => {
    mockUseIsCompactDraftViewport.mockReturnValue(false);
    mockUseDraftQueries.mockReturnValue(
      makeBaseQueries({ leagueTeams: TEAMS, boardOrderedTeams: TEAMS }),
    );
    withConnectionStatus('lost');

    const { getByTestId, getByText, queryByTestId } = render(
      <EliteDraftBoardScreen {...defaultProps} />,
    );

    expect(getByTestId('draft-connection-lost')).toBeTruthy();
    expect(getByText("Can't reach the draft room")).toBeTruthy();
    expect(queryByTestId('draft-player-board')).toBeNull();
    expect(queryByTestId('draft-top-band')).toBeNull();
  });

  it('wires the Connection Lost Retry action to a fresh handshake', () => {
    mockUseIsCompactDraftViewport.mockReturnValue(false);
    mockUseDraftQueries.mockReturnValue(
      makeBaseQueries({ leagueTeams: TEAMS, boardOrderedTeams: TEAMS }),
    );
    const retryConnection = jest.fn();
    withConnectionStatus('lost', retryConnection);

    const { getByText } = render(<EliteDraftBoardScreen {...defaultProps} />);
    fireEvent.click(getByText('Retry'));

    expect(retryConnection).toHaveBeenCalledTimes(1);
  });
});
