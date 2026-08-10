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
// spec (DraftClockRing.spec.tsx etc.), so these are shallow wiring mocks
// rather than a re-verification of their internals.
jest.mock('./DraftClockRing', () => ({
  DraftClockRing: ({
    secondsRemaining,
    paused,
  }: {
    secondsRemaining: number;
    paused?: boolean;
  }) => (
    <div
      data-testid="draft-clock-ring"
      data-seconds={secondsRemaining}
      data-paused={String(!!paused)}
    />
  ),
}));
jest.mock('./DraftMiniBoard', () => ({
  DraftMiniBoard: ({ rounds }: { rounds: number }) => (
    <div data-testid="draft-mini-board" data-rounds={rounds} />
  ),
}));
jest.mock('./DraftPickAnnouncement', () => ({
  DraftPickAnnouncement: ({
    announcement,
  }: {
    announcement: { pickNumber: number } | null;
  }) =>
    announcement ? (
      <div
        data-testid="draft-pick-announcement"
        data-pick={announcement.pickNumber}
      />
    ) : null,
}));
jest.mock('./DraftSquadStrip', () => ({
  DraftSquadStrip: ({
    myTeam,
    rounds,
    open,
    onOpen,
    onClose,
  }: {
    myTeam: unknown[];
    rounds: number;
    open: boolean;
    onOpen: () => void;
    onClose: () => void;
  }) => (
    <button
      data-testid="draft-squad-strip"
      data-open={String(open)}
      onClick={open ? onClose : onOpen}
    >
      {`My Squad · ${myTeam.length}/${rounds}`}
    </button>
  ),
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
  it('headlines the team on the clock with its round and pick', () => {
    setupCompactLiveDraft();

    render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(screen.getByText('On the clock')).toBeTruthy();
    expect(screen.getByText('Bronx Bombers')).toBeTruthy();
    expect(screen.getByText('Round 1 · Pick #2')).toBeTruthy();
  });

  it('switches the eyebrow to second person when the viewer is on the clock', () => {
    setupCompactLiveDraft({ isMyPick: true });

    render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(screen.getByText('You’re on the clock')).toBeTruthy();
  });

  it('passes the draft timer and paused state to DraftClockRing', () => {
    setupCompactLiveDraft({ ui: { draftPaused: true } });
    jest.mocked(useDraftTimer).mockReturnValue({ timeRemaining: 42 });

    render(<EliteDraftBoardScreen {...defaultProps} />);

    const ring = screen.getByTestId('draft-clock-ring');
    expect(ring.getAttribute('data-seconds')).toBe('42');
    expect(ring.getAttribute('data-paused')).toBe('true');
    expect(screen.getByText('Draft paused')).toBeTruthy();
  });

  it('passes the resolved board rounds to DraftMiniBoard', () => {
    setupCompactLiveDraft({ picks: [makePickRecord()] });

    render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(screen.getByTestId('draft-mini-board')).toBeTruthy();
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

  it('re-sorts the list by projected points without renumbering ADP', () => {
    setupCompactLiveDraft({
      players: [
        makeDraftPlayer({ id: 1, name: 'Ace Adams', ppg: 6 }),
        makeDraftPlayer({ id: 2, name: 'Bo Baker', ppg: 12 }),
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

  it('summarises the squad strip and toggles the roster sheet', () => {
    const player = makeDraftPlayer();
    setupCompactLiveDraft({ players: [player], picks: [makePickRecord()] });
    mockUsePlayerData.mockReturnValue({
      enrichedPlayers: [],
      myTeam: [player],
      myTeamPicks: [makePickRecord()],
      statsLookup: new Map([[player.id, player]]),
    } as unknown as ReturnType<typeof usePlayerData>);

    render(<EliteDraftBoardScreen {...defaultProps} />);

    const strip = screen.getByTestId('draft-squad-strip');
    expect(strip.textContent).toBe('My Squad · 1/5');
    expect(strip.getAttribute('data-open')).toBe('false');

    fireEvent.click(strip);

    expect(strip.getAttribute('data-open')).toBe('true');
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

describe('EliteDraftBoardScreen — compact viewport, pick announcement', () => {
  it('wires the current announcement through to DraftPickAnnouncement', () => {
    setupCompactLiveDraft({
      ui: {
        announcement: {
          player: makeDraftPlayer(),
          pickNumber: 7,
          round: 1,
          roundPickNumber: 7,
          isMyPick: true,
          isAuto: false,
          teamName: 'Dinger Dynasty',
        },
      },
    });

    render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(
      screen.getByTestId('draft-pick-announcement').getAttribute('data-pick'),
    ).toBe('7');
  });

  it('renders nothing for DraftPickAnnouncement when there is no announcement', () => {
    setupCompactLiveDraft();

    render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(screen.queryByTestId('draft-pick-announcement')).toBeNull();
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
