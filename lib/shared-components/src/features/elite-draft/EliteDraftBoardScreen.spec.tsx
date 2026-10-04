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
  useDraftViewportTier,
  useDraftWebSocket,
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
  useDraftViewportTier: jest.fn(),
  usePlayerData: jest.fn(),
}));

jest.mock('../../features/auth', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@legacy-sports/graphql', () => ({
  useGetUserByIdQuery: jest.fn(() => ({ data: undefined })),
  // The `draft_packet` entitlement gate (LS-9750) reads this via
  // useHasEntitlement -> useEntitlements.
  useMyEntitlementsQuery: jest.fn(() => ({ data: undefined, loading: false })),
  // The screen compares league.sport against the generated Sport enum, so the
  // mocked module has to carry it (its members are the schema's string values).
  Sport: { Baseball: 'baseball', Football: 'football' },
}));

// LS-10076 — a mock draft's pre-draft view is MockDraftLobby, driven by the
// lobby mutations in `useMockDraftLobby`. The hook calls useMutation directly,
// so it needs a double here the way the other draft hooks do.
jest.mock('./hooks/useMockDraftLobby', () => ({
  useMockDraftLobby: jest.fn(() => ({
    error: null,
    starting: false,
    handleStart: jest.fn(),
    handleKick: jest.fn(),
    handleToggleVisibility: jest.fn(),
    handleLeave: jest.fn(),
  })),
}));
jest.mock('./MockDraftLobby', () => ({
  MockDraftLobby: ({ inviteCode }: { inviteCode?: string | null }) => (
    <div data-testid="mock-draft-lobby" data-invite-code={inviteCode ?? ''} />
  ),
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
// has its own component-level spec (DraftClockBar.spec.tsx etc.).
jest.mock('./DraftClockBar', () => ({
  DraftClockBar: ({
    isMyPick,
    draftPaused,
    round,
    roundPickNumber,
    timeRemaining,
    pickTimeLimitSeconds,
    onClockTeamName,
    connectionStale,
    onOpenChat,
    unreadChat,
  }: {
    isMyPick: boolean;
    draftPaused: boolean;
    round: number;
    roundPickNumber: number;
    timeRemaining: number;
    pickTimeLimitSeconds: number;
    onClockTeamName: string | null;
    connectionStale?: boolean;
    onOpenChat?: () => void;
    unreadChat?: boolean;
  }) => (
    <div
      data-testid="draft-clock-bar"
      data-connection-stale={String(!!connectionStale)}
      data-is-my-pick={String(!!isMyPick)}
      data-draft-paused={String(!!draftPaused)}
      data-round={round}
      data-round-pick-number={roundPickNumber}
      data-time-remaining={timeRemaining}
      data-pick-time-limit-seconds={pickTimeLimitSeconds}
      data-team={onClockTeamName ?? ''}
    >
      {onOpenChat && (
        <button
          data-testid="draft-clock-bar-chat"
          data-unread-chat={String(!!unreadChat)}
          onClick={onOpenChat}
        />
      )}
    </div>
  ),
}));
jest.mock('./DraftSlimNav', () => ({
  DraftSlimNav: ({
    leagueName,
    onBack,
  }: {
    leagueName?: string | null;
    onBack: () => void;
  }) => (
    <button
      data-testid="draft-slim-nav"
      data-league-name={leagueName ?? ''}
      onClick={onBack}
    />
  ),
}));
jest.mock('./DraftHero', () => ({
  DraftHero: ({
    leagueName,
    backHref,
    onNavigate,
    draftPaused,
    round,
    overallPick,
    totalPicks,
    teamCount,
    selectionMethod,
    draftOrder,
    compact,
  }: {
    leagueName?: string | null;
    backHref: string | null;
    onNavigate: (path: string) => void;
    draftPaused: boolean;
    round: number;
    overallPick: number;
    totalPicks: number | null;
    teamCount: number;
    selectionMethod?: string | null;
    draftOrder?: string | null;
    compact: boolean;
  }) => (
    <div
      data-testid="draft-hero"
      data-league-name={leagueName ?? ''}
      data-back-href={backHref ?? ''}
      data-draft-paused={String(draftPaused)}
      data-round={round}
      data-overall-pick={overallPick}
      data-total-picks={totalPicks ?? ''}
      data-team-count={teamCount}
      data-selection-method={selectionMethod ?? ''}
      data-draft-order={draftOrder ?? ''}
      data-compact={String(compact)}
    >
      {backHref && (
        <button
          data-testid="draft-hero-back"
          onClick={() => onNavigate(backHref)}
        />
      )}
    </div>
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
// Pick-sheet tabs + History (LS-10165) — DraftSheetTabs.spec.tsx and
// DraftPickHistoryList.spec.tsx cover the components; here they only have to
// report what the screen passed them.
jest.mock('./DraftSheetTabs', () => ({
  DraftSheetTabs: ({
    activeTab,
    onChangeTab,
  }: {
    activeTab: string;
    onChangeTab: (tab: string) => void;
  }) => (
    <div data-testid="draft-sheet-tabs" data-active-tab={activeTab}>
      <button onClick={() => onChangeTab('history')}>tab-history</button>
    </div>
  ),
}));
jest.mock('./DraftPickHistoryList', () => ({
  DraftPickHistoryList: ({ picks }: { picks: readonly unknown[] }) => (
    <div data-testid="draft-pick-history" data-picks-count={picks.length} />
  ),
}));
// Pick sheet (LS-10002) — DraftPickSheet.spec.tsx covers the host itself; here
// the sheet only has to gate its body on `open` and expose its close path.
jest.mock('./DraftPickSheet', () => ({
  DraftPickCta: ({
    canDraft,
    untimed,
    draftPaused,
    timeRemaining,
    onPress,
  }: {
    canDraft: boolean;
    untimed: boolean;
    draftPaused: boolean;
    timeRemaining: number;
    onPress: () => void;
  }) => (
    <button
      data-testid="draft-pick-cta"
      data-can-draft={String(canDraft)}
      data-untimed={String(untimed)}
      data-draft-paused={String(draftPaused)}
      data-time-remaining={timeRemaining}
      onClick={onPress}
    />
  ),
  SQUAD_SHEET_HEIGHT_PERCENT: 74,
  // The phone board raises two sheets from this one host (LS-10001 added the
  // squad sheet alongside LS-10002's player browser), so the mock has to honor
  // `testID` — otherwise both render as `draft-pick-sheet` and every
  // `getByTestId` here becomes ambiguous.
  DraftPickSheet: ({
    open,
    onOpenChange,
    title,
    subtitle,
    heightPercent,
    bottomInset,
    testID = 'draft-pick-sheet',
    children,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title?: string;
    subtitle?: string;
    heightPercent?: number;
    bottomInset?: number;
    testID?: string;
    children: React.ReactNode;
  }) => (
    <div
      data-testid={testID}
      data-open={String(open)}
      data-title={title ?? ''}
      data-subtitle={subtitle ?? ''}
      data-height-percent={String(heightPercent)}
      data-bottom-inset={String(bottomInset)}
    >
      <button onClick={() => onOpenChange(false)}>close-{testID}</button>
      {open ? children : null}
    </div>
  ),
}));
jest.mock('./DraftRoundBoard', () => ({
  DraftRoundBoard: ({
    rounds,
    sport,
    onMakePick,
  }: {
    rounds: number;
    sport: string;
    onMakePick: () => void;
  }) => (
    <button
      data-testid="draft-round-board"
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
jest.mock('./DraftMyPickAnnouncement', () => ({
  DraftMyPickAnnouncement: ({
    queue,
  }: {
    queue: ReadonlyArray<{ pickNumber: number }>;
  }) =>
    queue[0] ? (
      <div
        data-testid="draft-my-pick-announcement"
        data-pick={queue[0].pickNumber}
      />
    ) : null,
}));
jest.mock('./DraftRoomRecap', () => ({
  DraftRoomRecap: ({
    isMockDraft,
    leagueId,
    myTeamId,
    leagueTeams,
    sport,
    onNavigate,
  }: {
    isMockDraft: boolean;
    leagueId: number | null;
    myTeamId: number | null;
    leagueTeams: unknown[];
    sport: string;
    onNavigate: (path: string) => void;
  }) => (
    <div
      data-testid="draft-room-recap"
      data-is-mock-draft={String(isMockDraft)}
      data-league-id={String(leagueId)}
      data-my-team-id={String(myTeamId)}
      data-team-count={String(leagueTeams.length)}
      data-sport={sport}
    >
      <button
        data-testid="recap-navigate"
        onClick={() => onNavigate('/somewhere')}
      />
    </div>
  ),
}));
jest.mock('./DraftPlayersTab', () => ({
  DraftPlayersTab: ({
    players,
    myTeam,
    sport,
    selectedPosition,
    searchTerm,
    canDraft,
    draftActionLabel,
    myTeamId,
    hasMorePlayers,
    loadingMore,
    onSetSelectedPosition,
    onSetSearchTerm,
    onToggleQueue,
    onDraftPlayer,
    onLoadMore,
  }: {
    players: unknown[];
    myTeam: unknown[];
    sport: string;
    selectedPosition: string;
    searchTerm: string;
    canDraft: boolean;
    draftActionLabel?: string;
    myTeamId: number | null;
    hasMorePlayers?: boolean;
    loadingMore?: boolean;
    onSetSelectedPosition: (pos: string) => void;
    onSetSearchTerm: (term: string) => void;
    onToggleQueue: (id: number) => void;
    onDraftPlayer: (id: number) => void;
    onLoadMore?: () => void;
  }) => (
    <div
      data-testid="draft-players-tab"
      data-players-count={players.length}
      data-my-team-count={myTeam.length}
      data-sport={sport}
      data-selected-position={selectedPosition}
      data-search-term={searchTerm}
      data-can-draft={String(canDraft)}
      data-draft-action-label={draftActionLabel ?? ''}
      data-my-team-id={myTeamId ?? ''}
      data-has-more-players={String(!!hasMorePlayers)}
      data-loading-more={String(!!loadingMore)}
    >
      <button onClick={() => onSetSelectedPosition('QB')}>set-position</button>
      <button onClick={() => onSetSearchTerm('mahomes')}>set-search</button>
      <button onClick={() => onToggleQueue(7)}>toggle-queue</button>
      <button onClick={() => onDraftPlayer(7)}>draft-player</button>
      <button onClick={() => onLoadMore?.()}>load-more</button>
    </div>
  ),
}));
jest.mock('./DraftQueueTab', () => ({
  DraftQueueTab: () => <div data-testid="draft-queue-tab" />,
}));
// Squad strip (LS-10001) — DraftSquadStrip.spec.tsx covers the strip itself;
// here it only has to be mounted and to raise the squad sheet.
jest.mock('./DraftSquadStrip', () => ({
  DraftSquadStrip: ({
    onOpen,
    bottomInset,
  }: {
    onOpen: () => void;
    bottomInset?: number;
  }) => (
    <button
      data-testid="draft-squad-strip"
      data-bottom-inset={String(bottomInset)}
      onClick={onOpen}
    />
  ),
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
const mockUseDraftViewportTier = jest.mocked(useDraftViewportTier);

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
    activeTab: 'players' as const,
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

/** Shape of the `league` fixture the derived values below are read from. */
type LeagueFixture = {
  draftStatus?: string | null;
  isMockDraft?: boolean | null;
  isOfflineDraft?: boolean | null;
  controlAllTeams?: boolean | null;
  maxRosterSize?: number | null;
  sport?: string | null;
  name?: string | null;
} | null;

function makeBaseQueries(
  overrides: Partial<ReturnType<typeof useDraftQueries>> = {},
) {
  // LS-10076: the board no longer reads status/roster size/mock-ness off
  // `league` — `useDraftQueries` derives them from whichever source it loaded
  // (the league, or `draftRoom` in draft-room mode). In league mode they
  // mirror the league, so derive them from the fixture here and let a test
  // still override any of them explicitly.
  const league =
    'league' in overrides
      ? (overrides.league as LeagueFixture)
      : {
          draftStatus: 'in-progress',
          isMockDraft: false,
          sport: null,
          name: 'Test League',
        };

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
    // The real `useDraftQueries` always returns an array here (it defaults to
    // `[]`); the double omitted it, which only surfaced once the wide branch
    // grew a consumer that reads it directly (LS-10004's slot strip).
    leaguePositions: [],
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
    // Draft-room mode is off by default — these tests cover the league draft.
    room: null,
    isRoomMode: false,
    refetchRoom: jest.fn(),
    // Derived board values (LS-10076).
    draftStatus: league?.draftStatus ?? null,
    maxRosterSize: league?.maxRosterSize ?? null,
    isMockDraft: league?.isMockDraft === true,
    isOfflineDraft: league?.isOfflineDraft === true,
    controlAllTeams: league?.controlAllTeams === true,
    draftSport: league?.sport ?? null,
    draftTitle: league?.name ?? null,
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
  mockUseDraftViewportTier.mockReturnValue('desktop');
  mockUseDraftUIState.mockReturnValue(makeBaseUI());
  mockUseDraftQueries.mockReturnValue(makeBaseQueries());
  mockUseDraftActions.mockReturnValue(makeBaseActions());
  mockUsePlayerData.mockReturnValue({
    enrichedPlayers: [],
    // Real `usePlayerData` types this `DraftPlayer[]` and never returns null.
    myTeam: [],
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
    mockUseDraftViewportTier.mockReturnValue('phone');
    mockUseDraftUIState.mockReturnValue(makeBaseUI({ draftComplete: true }));

    const { getByTestId, queryByTestId } = render(
      <EliteDraftBoardScreen {...defaultProps} />,
    );

    expect(getByTestId('draft-room-recap')).toBeTruthy();
    expect(queryByTestId('draft-complete-view')).toBeNull();
  });

  // LS-10528: the compact recap must get what it needs to offer the wide
  // view's CTAs and team selector at phone/tablet widths and on native.
  it('passes the compact recap its CTA routing and team-selector inputs', () => {
    mockUseDraftViewportTier.mockReturnValue('phone');
    mockUseDraftUIState.mockReturnValue(makeBaseUI({ draftComplete: true }));
    mockUseDraftQueries.mockReturnValue(
      makeBaseQueries({
        isMockDraft: true,
        leagueTeams: [
          { id: '1', name: 'Mine', leagueId: 1 },
          { id: '2', name: 'CPU', leagueId: 1, isCpu: true },
        ],
      }),
    );
    const onNavigate = jest.fn();

    const { getByTestId } = render(
      <EliteDraftBoardScreen {...defaultProps} onNavigate={onNavigate} />,
    );

    const recap = getByTestId('draft-room-recap');
    expect(recap.getAttribute('data-is-mock-draft')).toBe('true');
    expect(recap.getAttribute('data-league-id')).toBe('1');
    expect(recap.getAttribute('data-my-team-id')).toBe('1');
    expect(recap.getAttribute('data-team-count')).toBe('2');
    getByTestId('recap-navigate').click();
    expect(onNavigate).toHaveBeenCalledWith('/somewhere');
  });

  it('keeps rendering DraftCompleteView (not DraftRoomRecap) on the wide viewport', () => {
    mockUseDraftViewportTier.mockReturnValue('desktop');
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
// that only renders when useDraftViewportTier() returns 'phone'.
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
  mockUseDraftViewportTier.mockReturnValue('phone');
  mockUseDraftUIState.mockReturnValue({ ...makeBaseUI(), ...ui });
  mockUseDraftQueries.mockReturnValue({
    // Passed through makeBaseQueries so a `league` override still drives the
    // derived board values (draftStatus, isMockDraft, …) (LS-10076).
    ...makeBaseQueries(queries),
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
    expect(queryByTestId('draft-pick-cta')).toBeTruthy();
  });

  it("renders the wide board when useDraftViewportTier is not 'phone' (default)", () => {
    mockUseDraftViewportTier.mockReturnValue('desktop');
    mockUseDraftQueries.mockReturnValue(
      makeBaseQueries({ leagueTeams: TEAMS, boardOrderedTeams: TEAMS }),
    );

    const { getByTestId, queryByTestId } = render(
      <EliteDraftBoardScreen {...defaultProps} />,
    );

    expect(getByTestId('draft-player-board')).toBeTruthy();
    expect(queryByTestId('draft-pick-cta')).toBeNull();
  });
});

describe('EliteDraftBoardScreen — compact viewport, live board', () => {
  it('wires the on-clock team, round, and round-pick number through to DraftClockBar', () => {
    setupCompactLiveDraft();

    render(<EliteDraftBoardScreen {...defaultProps} />);

    const header = screen.getByTestId('draft-clock-bar');
    expect(header.getAttribute('data-team')).toBe('Bronx Bombers');
    expect(header.getAttribute('data-round')).toBe('1');
    expect(header.getAttribute('data-round-pick-number')).toBe('2');
    expect(header.getAttribute('data-is-my-pick')).toBe('false');
  });

  it('tells DraftClockBar when the viewer is on the clock', () => {
    setupCompactLiveDraft({ isMyPick: true });

    render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(
      screen.getByTestId('draft-clock-bar').getAttribute('data-is-my-pick'),
    ).toBe('true');
  });

  it('passes the draft timer and paused state through to DraftClockBar', () => {
    setupCompactLiveDraft({ ui: { draftPaused: true } });
    jest.mocked(useDraftTimer).mockReturnValue({ timeRemaining: 42 });

    render(<EliteDraftBoardScreen {...defaultProps} />);

    const header = screen.getByTestId('draft-clock-bar');
    expect(header.getAttribute('data-time-remaining')).toBe('42');
    expect(header.getAttribute('data-draft-paused')).toBe('true');
  });

  it('passes the resolved board rounds and sport to DraftRoundBoard', () => {
    setupCompactLiveDraft({ picks: [makePickRecord()] });

    render(<EliteDraftBoardScreen {...defaultProps} sport="football" />);

    const grid = screen.getByTestId('draft-round-board');
    expect(grid).toBeTruthy();
    expect(grid.getAttribute('data-sport')).toBe('football');
  });

  // ---- Pick sheet (LS-10002) ----------------------------------------------
  // The player browser rides in a sheet raised over the board; it replaced
  // both the board tab's inline player list and the Players bottom-nav tab.

  it('keeps the pick sheet, and the browser it hosts, down until raised', () => {
    setupCompactLiveDraft({ players: [makeDraftPlayer()] });

    render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(
      screen.getByTestId('draft-pick-sheet').getAttribute('data-open'),
    ).toBe('false');
    expect(screen.queryByTestId('draft-players-tab')).toBeNull();
    // The inline list the sheet replaced is gone from the board tab.
    expect(screen.queryByTestId('flatlist')).toBeNull();
  });

  it('raises the pick sheet over the board from the CTA', () => {
    setupCompactLiveDraft({ isMyPick: true });

    render(<EliteDraftBoardScreen {...defaultProps} />);
    fireEvent.click(screen.getByTestId('draft-pick-cta'));

    expect(
      screen.getByTestId('draft-pick-sheet').getAttribute('data-open'),
    ).toBe('true');
    expect(screen.getByTestId('draft-players-tab')).toBeTruthy();
    // Over the board, not instead of it.
    expect(screen.getByTestId('draft-round-board')).toBeTruthy();
  });

  it('raises the pick sheet on its Players tab when DraftRoundBoard fires onMakePick', () => {
    const setActiveTab = jest.fn();
    setupCompactLiveDraft({
      isMyPick: true,
      ui: { activeTab: 'history', setActiveTab },
    });

    render(<EliteDraftBoardScreen {...defaultProps} />);
    fireEvent.click(screen.getByTestId('draft-round-board'));

    expect(
      screen.getByTestId('draft-pick-sheet').getAttribute('data-open'),
    ).toBe('true');
    // A pick action lands on the browser, whichever tab the sheet was left on.
    expect(setActiveTab).toHaveBeenCalledWith('players');
  });

  it('closes the pick sheet from its dismissal path', () => {
    setupCompactLiveDraft({ isMyPick: true });

    render(<EliteDraftBoardScreen {...defaultProps} />);
    fireEvent.click(screen.getByTestId('draft-pick-cta'));
    fireEvent.click(screen.getByText('close-draft-pick-sheet'));

    expect(
      screen.getByTestId('draft-pick-sheet').getAttribute('data-open'),
    ).toBe('false');
    expect(screen.queryByTestId('draft-players-tab')).toBeNull();
  });

  it('tells the CTA whether the viewer can pick and how long is left', () => {
    setupCompactLiveDraft({ isMyPick: true, ui: { draftPaused: true } });
    jest.mocked(useDraftTimer).mockReturnValue({ timeRemaining: 47 });

    render(<EliteDraftBoardScreen {...defaultProps} />);

    const cta = screen.getByTestId('draft-pick-cta');
    expect(cta.getAttribute('data-can-draft')).toBe('true');
    expect(cta.getAttribute('data-time-remaining')).toBe('47');
    expect(cta.getAttribute('data-draft-paused')).toBe('true');
  });

  it('keeps the CTA off the clock, as a browse action, so players can still be queued', () => {
    setupCompactLiveDraft({ isMyPick: false });

    render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(
      screen.getByTestId('draft-pick-cta').getAttribute('data-can-draft'),
    ).toBe('false');
  });

  it('titles the sheet with the current pick and forwards the safe-area inset', () => {
    setupCompactLiveDraft({ isMyPick: true });

    render(<EliteDraftBoardScreen {...defaultProps} bottomInset={24} />);

    const sheet = screen.getByTestId('draft-pick-sheet');
    expect(sheet.getAttribute('data-subtitle')).toBe('Pick #1 · Round 1');
    expect(sheet.getAttribute('data-bottom-inset')).toBe('24');
  });

  it('drafting from the sheet completes the pick and dismisses the sheet', () => {
    const handleMakePick = jest.fn();
    setupCompactLiveDraft({ isMyPick: true, players: [makeDraftPlayer()] });
    mockUseDraftActions.mockReturnValue(makeBaseActions({ handleMakePick }));

    render(<EliteDraftBoardScreen {...defaultProps} />);
    fireEvent.click(screen.getByTestId('draft-pick-cta'));
    fireEvent.click(screen.getByText('draft-player'));

    expect(handleMakePick).toHaveBeenCalledWith(7);
    expect(
      screen.getByTestId('draft-pick-sheet').getAttribute('data-open'),
    ).toBe('false');
  });

  // LS-9253: Control All Teams — every team's turn is pickable, not just the
  // human's own seat, routed through commissionerPick (not makeDraftPick)
  // since the current-clock team isn't the human's own registered team.
  // LS-10076: a mock draft has no commissioner, so a Control All Teams pick
  // for another seat goes through makeDraftPick (whose turn check recognises
  // the host) rather than the league-only commissionerPick tool.
  it("offers a first-class DRAFT action (not ASSIGN) on another team's turn when Control All Teams is on, and routes the pick through makeDraftPick", () => {
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
    fireEvent.click(screen.getByTestId('draft-pick-cta'));

    const browser = screen.getByTestId('draft-players-tab');
    expect(browser.getAttribute('data-can-draft')).toBe('true');
    expect(browser.getAttribute('data-draft-action-label')).toBe('DRAFT');
    fireEvent.click(screen.getByText('draft-player'));

    expect(handleMakePick).toHaveBeenCalledWith(7);
    expect(handleCommissionerPick).not.toHaveBeenCalled();
  });

  it('labels a real commissioner override ASSIGN and routes it through commissionerPick', () => {
    const handleCommissionerPick = jest.fn();
    setupCompactLiveDraft({
      isMyPick: false,
      ui: { commPickMode: true },
      queries: { isCommissioner: true },
    });
    mockUseDraftActions.mockReturnValue(
      makeBaseActions({ handleCommissionerPick }),
    );

    render(<EliteDraftBoardScreen {...defaultProps} />);
    fireEvent.click(screen.getByTestId('draft-pick-cta'));

    expect(
      screen
        .getByTestId('draft-players-tab')
        .getAttribute('data-draft-action-label'),
    ).toBe('ASSIGN');
    fireEvent.click(screen.getByText('draft-player'));
    expect(handleCommissionerPick).toHaveBeenCalledWith(7);
  });

  it('hands the sheet browser the league sport and the player-list pagination', () => {
    const handleLoadMorePlayers = jest.fn();
    setupCompactLiveDraft({
      players: [makeDraftPlayer()],
      queries: {
        hasMorePlayers: true,
        loadingMore: true,
        handleLoadMorePlayers,
      },
    });

    render(<EliteDraftBoardScreen {...defaultProps} sport="football" />);
    fireEvent.click(screen.getByTestId('draft-pick-cta'));

    const browser = screen.getByTestId('draft-players-tab');
    expect(browser.getAttribute('data-sport')).toBe('football');
    expect(browser.getAttribute('data-has-more-players')).toBe('true');
    expect(browser.getAttribute('data-loading-more')).toBe('true');
    fireEvent.click(screen.getByText('load-more'));
    expect(handleLoadMorePlayers).toHaveBeenCalled();
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
    expect(screen.getByTestId('draft-round-board')).toBeTruthy();
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

  it('shows the board and its pick CTA as the page, with every other surface down', () => {
    setupCompactLiveDraft();

    render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(screen.getByTestId('draft-round-board')).toBeTruthy();
    expect(screen.getByTestId('draft-pick-cta')).toBeTruthy();
    expect(screen.getByTestId('draft-chat-panel').style.display).toBe('none');
    expect(screen.queryByTestId('draft-players-tab')).toBeNull();
    expect(screen.queryByTestId('draft-queue-tab')).toBeNull();
    expect(screen.queryByTestId('draft-pick-history')).toBeNull();
    expect(screen.queryByTestId('draft-team-tab')).toBeNull();
  });

  // LS-10165: on web at phone width the app keeps its header and fixed
  // MobileBottomBar on the draft route, so the draft room must not render a
  // nav bar of its own — the old DraftBottomNav stacked on the app's.
  it('renders no draft-owned bottom nav', () => {
    setupCompactLiveDraft();

    render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(screen.queryByTestId('draft-bottom-nav')).toBeNull();
  });

  it('wires players, myTeam, position/search state, canDraft, and myTeamId through to the sheet browser', () => {
    const player = makeDraftPlayer({ id: 5 });
    setupCompactLiveDraft({
      isMyPick: true,
      players: [player],
      ui: { selectedPosition: 'RB', searchTerm: 'kelce' },
    });
    mockUsePlayerData.mockReturnValue({
      enrichedPlayers: [player],
      myTeam: [player],
      myTeamPicks: [],
      statsLookup: new Map([[player.id, player]]),
    } as unknown as ReturnType<typeof usePlayerData>);

    render(<EliteDraftBoardScreen {...defaultProps} />);
    fireEvent.click(screen.getByTestId('draft-pick-cta'));

    const tab = screen.getByTestId('draft-players-tab');
    expect(tab.getAttribute('data-players-count')).toBe('1');
    expect(tab.getAttribute('data-my-team-count')).toBe('1');
    expect(tab.getAttribute('data-selected-position')).toBe('RB');
    expect(tab.getAttribute('data-search-term')).toBe('kelce');
    expect(tab.getAttribute('data-can-draft')).toBe('true');
    expect(tab.getAttribute('data-my-team-id')).toBe('1');
  });

  it('routes sheet-browser callbacks to ui state setters and the shared queue handler, keeping the sheet up', () => {
    const setSelectedPosition = jest.fn();
    const setSearchTerm = jest.fn();
    const handleToggleQueue = jest.fn();
    setupCompactLiveDraft({
      ui: { setSelectedPosition, setSearchTerm },
    });
    mockUseDraftActions.mockReturnValue(makeBaseActions({ handleToggleQueue }));

    render(<EliteDraftBoardScreen {...defaultProps} />);
    fireEvent.click(screen.getByTestId('draft-pick-cta'));

    fireEvent.click(screen.getByText('set-position'));
    expect(setSelectedPosition).toHaveBeenCalledWith('QB');

    fireEvent.click(screen.getByText('set-search'));
    expect(setSearchTerm).toHaveBeenCalledWith('mahomes');

    fireEvent.click(screen.getByText('toggle-queue'));
    expect(handleToggleQueue).toHaveBeenCalledWith(7);

    // Queueing and filtering are browsing, not picking — the sheet stays up.
    expect(
      screen.getByTestId('draft-pick-sheet').getAttribute('data-open'),
    ).toBe('true');
  });

  // ---- Pick-sheet tabs (LS-10165) ----

  it('hosts the Players / Queue / History tabs in the pick sheet and routes taps to ui.setActiveTab', () => {
    const setActiveTab = jest.fn();
    setupCompactLiveDraft({ ui: { activeTab: 'queue', setActiveTab } });

    render(<EliteDraftBoardScreen {...defaultProps} />);
    // Down: no tabs mounted outside the sheet.
    expect(screen.queryByTestId('draft-sheet-tabs')).toBeNull();

    fireEvent.click(screen.getByTestId('draft-pick-cta'));
    setActiveTab.mockClear(); // the CTA's own "land on Players"

    expect(
      screen.getByTestId('draft-sheet-tabs').getAttribute('data-active-tab'),
    ).toBe('queue');
    fireEvent.click(screen.getByText('tab-history'));
    expect(setActiveTab).toHaveBeenCalledWith('history');
  });

  it.each([
    ['players', 'draft-players-tab', 'Available players'],
    ['queue', 'draft-queue-tab', 'Queue'],
    ['history', 'draft-pick-history', 'Pick history'],
  ] as const)(
    'renders the %s body, titled for it, when that sheet tab is active',
    (activeTab, bodyTestId, title) => {
      setupCompactLiveDraft({ ui: { activeTab } });

      render(<EliteDraftBoardScreen {...defaultProps} />);
      fireEvent.click(screen.getByTestId('draft-pick-cta'));

      expect(screen.getByTestId(bodyTestId)).toBeTruthy();
      expect(
        screen.getByTestId('draft-pick-sheet').getAttribute('data-title'),
      ).toBe(title);
      // The board stays up behind the sheet on every tab.
      expect(screen.getByTestId('draft-round-board')).toBeTruthy();
    },
  );

  // ---- Squad strip / squad sheet (LS-10001) ----

  // "Persistent" is the whole point: the strip is the only route to the
  // roster, so it has to survive whichever sheet tab was last left open.
  it.each(['players', 'queue', 'history'] as const)(
    'keeps the squad strip mounted on the %s tab',
    (activeTab) => {
      setupCompactLiveDraft({ ui: { activeTab } });

      render(<EliteDraftBoardScreen {...defaultProps} />);

      expect(screen.getByTestId('draft-squad-strip')).toBeTruthy();
    },
  );

  it('raises the squad sheet from the strip, and keeps it down until then', () => {
    setupCompactLiveDraft();

    render(<EliteDraftBoardScreen {...defaultProps} />);

    const sheet = (): HTMLElement => screen.getByTestId('draft-squad-sheet');
    expect(sheet().getAttribute('data-open')).toBe('false');

    fireEvent.click(screen.getByTestId('draft-squad-strip'));

    expect(sheet().getAttribute('data-open')).toBe('true');
    expect(sheet().getAttribute('data-title')).toBe('Squad');
    // The design's `.mob-sheet { max-height: 74% }`, shorter than the pick
    // sheet so more of the board stays visible behind it.
    expect(sheet().getAttribute('data-height-percent')).toBe('74');
  });

  it('hosts the roster in the squad sheet rather than a tab', () => {
    setupCompactLiveDraft();

    render(<EliteDraftBoardScreen {...defaultProps} />);

    // Down: the roster is not mounted anywhere, on any tab.
    expect(screen.queryByTestId('draft-team-tab')).toBeNull();

    fireEvent.click(screen.getByTestId('draft-squad-strip'));

    // Up: the roster — and the compact home for the Draft Details panel that
    // came with the old Team tab (LS-9857) — is inside the sheet.
    expect(screen.getByTestId('draft-team-tab')).toBeTruthy();
  });

  it('dismisses the squad sheet from its own close path', () => {
    setupCompactLiveDraft();

    render(<EliteDraftBoardScreen {...defaultProps} />);

    fireEvent.click(screen.getByTestId('draft-squad-strip'));
    expect(
      screen.getByTestId('draft-squad-sheet').getAttribute('data-open'),
    ).toBe('true');

    fireEvent.click(screen.getByText('close-draft-squad-sheet'));

    expect(
      screen.getByTestId('draft-squad-sheet').getAttribute('data-open'),
    ).toBe('false');
  });

  it('forwards the bottom safe-area inset to the squad sheet', () => {
    setupCompactLiveDraft();

    render(<EliteDraftBoardScreen {...defaultProps} bottomInset={48} />);

    expect(
      screen.getByTestId('draft-squad-sheet').getAttribute('data-bottom-inset'),
    ).toBe('48');
  });

  // LS-9444: the draft room is pushed outside the `(tabs)` shell, so its
  // bottom-most band — the squad strip, now that the draft bottom nav is gone
  // (LS-10165) — is the only thing that can reserve Android's edge-to-edge
  // navigation-bar inset; it never gets there unless this screen forwards it.
  it('forwards the bottom safe-area inset to the squad strip', () => {
    setupCompactLiveDraft();

    render(<EliteDraftBoardScreen {...defaultProps} bottomInset={48} />);

    expect(
      screen.getByTestId('draft-squad-strip').getAttribute('data-bottom-inset'),
    ).toBe('48');
  });

  it('defaults the squad strip inset to 0 when no inset is supplied', () => {
    setupCompactLiveDraft();

    render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(
      screen.getByTestId('draft-squad-strip').getAttribute('data-bottom-inset'),
    ).toBe('0');
  });
});

describe('EliteDraftBoardScreen — Chat panel (LS-9401, LS-10165)', () => {
  const chatPanel = (): HTMLElement => screen.getByTestId('draft-chat-panel');
  const openChat = (): void => {
    fireEvent.click(screen.getByTestId('draft-clock-bar-chat'));
  };

  it('raises the chat panel from the clock bar and closes it from its own control', () => {
    setupCompactLiveDraft();

    render(<EliteDraftBoardScreen {...defaultProps} />);
    expect(chatPanel().style.display).toBe('none');

    openChat();
    expect(chatPanel().style.display).toBe('flex');

    fireEvent.click(screen.getByTestId('draft-chat-panel-close'));
    expect(chatPanel().style.display).toBe('none');
  });

  it('shows the "coming soon" placeholder in the chat panel when renderChatTab is omitted', () => {
    setupCompactLiveDraft();

    render(<EliteDraftBoardScreen {...defaultProps} />);
    openChat();

    expect(screen.getByText('Chat is coming soon.')).toBeTruthy();
  });

  it('calls renderChatTab with leagueId/userId and renders its output in the chat panel', () => {
    setupCompactLiveDraft();
    const renderChatTab = jest.fn(() => <div data-testid="chat-tab-body" />);

    render(
      <EliteDraftBoardScreen {...defaultProps} renderChatTab={renderChatTab} />,
    );
    openChat();

    expect(screen.getByTestId('chat-tab-body')).toBeTruthy();
    expect(screen.queryByText('Chat is coming soon.')).toBeNull();
    expect(renderChatTab).toHaveBeenCalledWith(
      expect.objectContaining({ leagueId: 1, userId: 1 }),
    );
  });

  it('keeps the chat renderer mounted (display:none) while the panel is down', () => {
    setupCompactLiveDraft();
    const renderChatTab = jest.fn(() => <div data-testid="chat-tab-body" />);

    render(
      <EliteDraftBoardScreen {...defaultProps} renderChatTab={renderChatTab} />,
    );

    expect(renderChatTab).toHaveBeenCalled();
    expect(screen.getByTestId('draft-chat-tab-slot')).toBeTruthy();
    expect(chatPanel().style.display).toBe('none');
    expect(screen.getByTestId('draft-round-board')).toBeTruthy();
  });

  it('forwards ui.unreadChat to the clock bar chat control', () => {
    setupCompactLiveDraft({ ui: { unreadChat: true } });

    render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(
      screen
        .getByTestId('draft-clock-bar-chat')
        .getAttribute('data-unread-chat'),
    ).toBe('true');
  });

  it('sets the unread-chat flag when a new message arrives while the panel is down', () => {
    const setUnreadChat = jest.fn();
    setupCompactLiveDraft({ ui: { setUnreadChat } });
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

  it('does not set the unread-chat flag for a new message while the panel is open', () => {
    const setUnreadChat = jest.fn();
    setupCompactLiveDraft({ ui: { setUnreadChat } });
    let onNewMessage: () => void = jest.fn();
    const renderChatTab = jest.fn((props: { onNewMessage: () => void }) => {
      onNewMessage = props.onNewMessage;
      return <div data-testid="chat-tab-body" />;
    });

    render(
      <EliteDraftBoardScreen {...defaultProps} renderChatTab={renderChatTab} />,
    );
    openChat();
    setUnreadChat.mockClear(); // clear the clear-on-open call
    onNewMessage();

    expect(setUnreadChat).not.toHaveBeenCalledWith(true);
  });

  it('clears the unread-chat flag when the panel opens', () => {
    const setUnreadChat = jest.fn();
    setupCompactLiveDraft({ ui: { setUnreadChat } });

    render(<EliteDraftBoardScreen {...defaultProps} />);
    expect(setUnreadChat).not.toHaveBeenCalledWith(false);

    openChat();

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
    mockUseDraftViewportTier.mockReturnValue('desktop');
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
    mockUseDraftViewportTier.mockReturnValue('desktop');
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

  it('wires the splash queue through to DraftMyPickAnnouncement', () => {
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
      screen
        .getByTestId('draft-my-pick-announcement')
        .getAttribute('data-pick'),
    ).toBe('3');
  });

  it('renders nothing for DraftMyPickAnnouncement when the splash queue is empty', () => {
    setupCompactLiveDraft();

    render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(screen.queryByTestId('draft-my-pick-announcement')).toBeNull();
  });
});

// AC4/Technical-approach: auction drafts have no compact layout yet (a
// deferred product decision, not a capability gap) — gated on viewport, not
// platform, so it reuses the same AuctionNotSupportedScreen at any width.
describe('EliteDraftBoardScreen — compact viewport, auction draft', () => {
  it('shows the auction-not-supported state instead of AuctionDraftRoom', () => {
    mockUseDraftViewportTier.mockReturnValue('phone');
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
    mockUseDraftViewportTier.mockReturnValue('desktop');
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
    mockUseDraftViewportTier.mockReturnValue('desktop');
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
      getByTestId('draft-clock-bar').getAttribute('data-connection-stale'),
    ).toBe('true');
  });

  it('replaces the board with the Connection Lost state on a sustained drop', () => {
    mockUseDraftViewportTier.mockReturnValue('desktop');
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
    mockUseDraftViewportTier.mockReturnValue('desktop');
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

// LS-10204 — header chrome per tier: the phone gets the slim nav + clock bar,
// the tablet/desktop frame gets the hero. Each component's own spec covers its
// rendering; these check what the screen hands them.
describe('EliteDraftBoardScreen — header chrome (LS-10204)', () => {
  it('gives the phone slim nav the league name and the exit handler', () => {
    setupCompactLiveDraft();
    const onExitDraft = jest.fn();

    render(
      <EliteDraftBoardScreen {...defaultProps} onExitDraft={onExitDraft} />,
    );

    const nav = screen.getByTestId('draft-slim-nav');
    expect(nav.getAttribute('data-league-name')).toBe('Test League');
    fireEvent.click(nav);
    expect(onExitDraft).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('draft-hero')).toBeNull();
  });

  it('renders the hero on the wide board, not the phone header', () => {
    mockUseDraftQueries.mockReturnValue(
      makeBaseQueries({
        league: {
          id: 1,
          name: 'Test League',
          draftStatus: 'in-progress',
          isMockDraft: false,
          maxRosterSize: 23,
          userMembership: { permissionLevel: 'member', teamId: 1 },
        },
        leagueTeams: TEAMS,
        boardOrderedTeams: TEAMS,
        leagueDraft: {
          selectionMethod: 'standard',
          draftOrder: 'snake',
          draftCompletedAt: null,
          id: '42',
        },
        currentPickInfo: {
          draftId: 42,
          teamId: 2,
          round: 2,
          pickNumber: 1,
          overallPick: 3,
          isComplete: false,
        },
      } as unknown as Partial<ReturnType<typeof useDraftQueries>>),
    );

    render(<EliteDraftBoardScreen {...defaultProps} sport="football" />);

    const hero = screen.getByTestId('draft-hero');
    expect(hero.getAttribute('data-league-name')).toBe('Test League');
    expect(hero.getAttribute('data-back-href')).toBe('/football/league/1');
    expect(hero.getAttribute('data-round')).toBe('2');
    expect(hero.getAttribute('data-overall-pick')).toBe('3');
    // 23 rounds × 2 teams.
    expect(hero.getAttribute('data-total-picks')).toBe('46');
    expect(hero.getAttribute('data-team-count')).toBe('2');
    expect(hero.getAttribute('data-selection-method')).toBe('standard');
    expect(hero.getAttribute('data-draft-order')).toBe('snake');
    expect(screen.queryByTestId('draft-slim-nav')).toBeNull();
    expect(screen.queryByTestId('draft-clock-bar')).toBeNull();
  });

  it('routes the hero back link through onNavigate', () => {
    const onNavigate = jest.fn();

    render(<EliteDraftBoardScreen {...defaultProps} onNavigate={onNavigate} />);

    fireEvent.click(screen.getByTestId('draft-hero-back'));
    expect(onNavigate).toHaveBeenCalledWith('/baseball/league/1');
  });

  it('omits the total when the round count is unknown', () => {
    render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(
      screen.getByTestId('draft-hero').getAttribute('data-total-picks'),
    ).toBe('');
  });

  // A mock draft already has DraftTopBand's Exit Draft; a second way out in
  // the hero would duplicate it.
  it('drops the hero back link for mock drafts', () => {
    mockUseDraftQueries.mockReturnValue(
      makeBaseQueries({
        league: {
          id: 1,
          name: 'Mock Draft Practice',
          draftStatus: 'in-progress',
          isMockDraft: true,
          userMembership: { permissionLevel: 'commissioner', teamId: 1 },
        },
      }),
    );

    render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(
      screen.getByTestId('draft-hero').getAttribute('data-back-href'),
    ).toBe('');
    expect(screen.queryByTestId('draft-hero-back')).toBeNull();
  });
});
