import React from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { CombinedGraphQLErrors } from '@apollo/client';
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
import type { DraftPickRecord, DraftPlayer, LeagueTeam } from './types';
import { useAuth } from '../../features/auth';
import { render } from '../../test-utils';

// react-native-svg's real implementation pulls in RN's native Touchable mixin,
// which the local 'react-native' mock below doesn't provide. Stub the two
// primitives DraftClockRing.native draws with.
jest.mock('react-native-svg', () => {
  /* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires -- jest.mock factory needs runtime require */
  const ReactLocal = require('react') as typeof import('react');
  /* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires */
  const stub = (tag: string) => {
    const Component = ({
      children,
      ...props
    }: { children?: React.ReactNode } & Record<string, unknown>) =>
      ReactLocal.createElement(tag, props, children);
    Component.displayName = tag;
    return Component;
  };
  return { __esModule: true, default: stub('svg'), Circle: stub('circle') };
});

// The shared mobile jest setup mocks most of react-native but omits Pressable
// and StyleSheet, which the draft board imports directly. Provide a mock that
// covers the primitives this screen and its sub-components use, including the
// Animated surface behind the clock ring, board pulse, and confetti.
jest.mock('react-native', () => {
  /* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires -- jest.mock factory needs runtime require */
  const ReactLocal = require('react') as typeof import('react');
  /* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires */
  const noopAnimation = { start: jest.fn(), stop: jest.fn(), reset: jest.fn() };
  function AnimatedValue(this: Record<string, unknown>, value: number) {
    this['value'] = value;
    this['setValue'] = (next: number) => {
      this['value'] = next;
    };
    this['interpolate'] = () => this['value'];
  }
  return {
    StyleSheet: { create: (s: unknown) => s, flatten: (s: unknown) => s },
    Easing: {
      in: (fn: unknown) => fn,
      out: (fn: unknown) => fn,
      inOut: (fn: unknown) => fn,
      quad: 'quad',
    },
    Animated: {
      // `style` carries interpolated transforms that React DOM rejects, and
      // `pointerEvents` is RN-only — drop both, they carry no assertions.
      View: ({
        children,
        style: _style,
        pointerEvents: _pointerEvents,
        ...props
      }: {
        children?: React.ReactNode;
        style?: unknown;
        pointerEvents?: unknown;
      } & Record<string, unknown>) =>
        ReactLocal.createElement('div', props, children),
      Value: AnimatedValue,
      timing: () => noopAnimation,
      sequence: () => noopAnimation,
      loop: () => noopAnimation,
    },
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

// ---------------------------------------------------------------------------
// Fixtures for the redesigned board
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

/** Puts the screen into the live in-progress state with two teams on the board. */
function setupLiveDraft({
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
  mockUseDraftUIState.mockReturnValue({
    ...makeBaseUI(),
    ...ui,
  });
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

/** The actions object handed to the screen for the current test. */
let actionsMock: ReturnType<typeof useDraftActions>;

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAuth.mockReturnValue({
    user: { id: 1, accessLevel: 'member' },
  } as unknown as ReturnType<typeof useAuth>);
  mockUseDraftUIState.mockReturnValue(makeBaseUI());
  mockUseDraftQueries.mockReturnValue(makeBaseQueries());
  actionsMock = makeBaseActions();
  mockUseDraftActions.mockReturnValue(actionsMock);
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
  jest.mocked(useDraftTimer).mockReturnValue({ timeRemaining: 90 });
  jest.mocked(useDraftEffects).mockReturnValue(undefined);
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

// ---------------------------------------------------------------------------
// Draft Room redesign — the mobile board is a single surface: on-the-clock
// header + countdown ring, the board grid itself, the available-player list,
// and the My Squad strip. There is no tab bar; pick history is reached by
// tapping a board cell and the roster by tapping the squad strip.
// ---------------------------------------------------------------------------
describe('EliteDraftBoardScreen (native) — live board', () => {
  it('headlines the team on the clock with its round and pick', () => {
    setupLiveDraft();

    render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(screen.getByText('On the clock')).toBeTruthy();
    expect(screen.getByText('Bronx Bombers')).toBeTruthy();
    expect(screen.getByText('Round 1 · Pick #2')).toBeTruthy();
  });

  it('switches the eyebrow to second person when the viewer is on the clock', () => {
    setupLiveDraft({ isMyPick: true });

    render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(screen.getByText('You’re on the clock')).toBeTruthy();
  });

  it('renders the countdown clock from the draft timer', () => {
    setupLiveDraft();

    render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(screen.getByText('1:30')).toBeTruthy();
  });

  it('replaces the countdown with a paused state', () => {
    setupLiveDraft({ ui: { draftPaused: true } });

    render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(screen.getByText('Draft paused')).toBeTruthy();
    expect(screen.getByText('PAUSE')).toBeTruthy();
  });

  it('labels the board columns with each team’s initials', () => {
    setupLiveDraft();

    render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(screen.getByText('DD')).toBeTruthy();
    expect(screen.getByText('BB')).toBeTruthy();
  });

  it('describes a drafted board cell when it is tapped', () => {
    setupLiveDraft({
      players: [makeDraftPlayer()],
      picks: [makePickRecord()],
    });

    render(<EliteDraftBoardScreen {...defaultProps} />);

    // The how-to hint shows until a cell is selected.
    expect(screen.getByText(/Tap a cell to inspect a pick/)).toBeTruthy();

    fireEvent.click(
      screen.getByLabelText('R1 · Dinger Dynasty — Bobby Witt Jr. (SS)'),
    );

    expect(
      screen.getByText('R1 · Dinger Dynasty — Bobby Witt Jr. (SS)'),
    ).toBeTruthy();
  });

  it('shows each available player with a stat line, points and ADP', () => {
    setupLiveDraft({ players: [makeDraftPlayer()] });

    render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(screen.getByText('Bobby Witt Jr.')).toBeTruthy();
    expect(screen.getByText('AVG .332 · HR 32 · RBI 96')).toBeTruthy();
    expect(screen.getByText('11.4')).toBeTruthy();
    expect(screen.getByText('ADP 1')).toBeTruthy();
  });

  it('hides the DRAFT action until the viewer is on the clock', () => {
    setupLiveDraft({ players: [makeDraftPlayer()] });

    render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(screen.queryByText('DRAFT')).toBeNull();
  });

  it('drafts the tapped player when the viewer is on the clock', () => {
    setupLiveDraft({ isMyPick: true, players: [makeDraftPlayer()] });

    render(<EliteDraftBoardScreen {...defaultProps} />);
    fireEvent.click(screen.getByText('DRAFT'));

    expect(actionsMock.handleMakePick).toHaveBeenCalledWith(1);
  });

  it('re-sorts the list by projected points without renumbering ADP', () => {
    setupLiveDraft({
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

  it('summarises the squad strip and opens the roster sheet', () => {
    const player = makeDraftPlayer();
    setupLiveDraft({ players: [player], picks: [makePickRecord()] });
    mockUsePlayerData.mockReturnValue({
      enrichedPlayers: [],
      myTeam: [player],
      myTeamPicks: [makePickRecord()],
      statsLookup: new Map([[player.id, player]]),
    } as unknown as ReturnType<typeof usePlayerData>);

    render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(screen.getByText('My Squad · 1/5')).toBeTruthy();
    expect(screen.getByText('Witt')).toBeTruthy();

    fireEvent.click(
      screen.getByLabelText('My squad, 1 of 5 picks made. Open roster.'),
    );

    expect(screen.getByText('DINGER DYNASTY')).toBeTruthy();
    expect(screen.getByText('Round 2 — not drafted yet')).toBeTruthy();
  });

  it('exposes commissioner pause and comm-pick controls to the owner', () => {
    setupLiveDraft({ queries: { isOwner: true } });

    render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(screen.getByText('PAUSE')).toBeTruthy();
    expect(screen.getByText('COMM PICK')).toBeTruthy();
  });
});

describe('EliteDraftBoardScreen (native) — pick announcement', () => {
  it('announces the viewer’s own pick in the second person', () => {
    setupLiveDraft({
      isMyPick: true,
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

    expect(screen.getByText('WITH PICK #7, YOU SELECT')).toBeTruthy();
    expect(screen.getByText('BW')).toBeTruthy();
  });

  it('credits another team when the pick is not the viewer’s', () => {
    setupLiveDraft({
      ui: {
        announcement: {
          player: makeDraftPlayer(),
          pickNumber: 4,
          round: 1,
          roundPickNumber: 4,
          isMyPick: false,
          isAuto: false,
          teamName: 'Bronx Bombers',
        },
      },
    });

    render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(screen.getByText('PICK #4 · Bronx Bombers')).toBeTruthy();
  });

  it('flags an expired-clock auto-pick', () => {
    setupLiveDraft({
      ui: {
        announcement: {
          player: makeDraftPlayer(),
          pickNumber: 4,
          round: 1,
          roundPickNumber: 4,
          isMyPick: false,
          isAuto: true,
          teamName: 'Bronx Bombers',
        },
      },
    });

    render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(screen.getByText('AUTO-PICK #4 · Bronx Bombers')).toBeTruthy();
  });
});

describe('EliteDraftBoardScreen (native) — lobby and complete states', () => {
  function setupLobby() {
    mockUseDraftQueries.mockReturnValue({
      ...makeBaseQueries(),
      league: {
        id: 1,
        name: 'Test League',
        draftStatus: 'scheduled',
        isMockDraft: false,
        userMembership: { permissionLevel: 'owner', teamId: 1 },
      },
      leagueTeams: TEAMS,
      boardOrderedTeams: TEAMS,
      isOwner: true,
    });
  }

  it('renders the pre-draft lobby when the draft has not started', () => {
    setupLobby();

    render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(screen.getByText(/THE BOARD/)).toBeTruthy();
    expect(
      screen.getByText('2 teams, one board. Watch it fill in live.'),
    ).toBeTruthy();
    expect(screen.getByText('START SNAKE DRAFT')).toBeTruthy();
    expect(screen.getByText('LINEAR ORDER')).toBeTruthy();
  });

  it('starts a snake draft from the lobby', () => {
    setupLobby();

    render(<EliteDraftBoardScreen {...defaultProps} />);
    fireEvent.click(screen.getByText('START SNAKE DRAFT'));

    expect(actionsMock.handleInitializeDraft).toHaveBeenCalledWith('snake');
  });

  it('renders the final board once the draft completes', () => {
    const player = makeDraftPlayer();
    mockUseDraftUIState.mockReturnValue({
      ...makeBaseUI(),
      draftComplete: true,
    });
    mockUseDraftQueries.mockReturnValue({
      ...makeBaseQueries(),
      leagueTeams: TEAMS,
      boardOrderedTeams: TEAMS,
      myTeamId: 1,
      pickHistory: [makePickRecord()],
    });
    mockUsePlayerData.mockReturnValue({
      enrichedPlayers: [],
      myTeam: [player],
      myTeamPicks: [makePickRecord()],
      statsLookup: new Map([[player.id, player]]),
    } as unknown as ReturnType<typeof usePlayerData>);

    render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(screen.getByText('FINAL BOARD')).toBeTruthy();
    expect(screen.getByText('Your haul · 1 picks')).toBeTruthy();
    expect(screen.getByText('Rd 1 · Pick #1')).toBeTruthy();
    expect(screen.getByText('BACK TO LEAGUE')).toBeTruthy();
  });
});

// LS-8863: a user removed from a league between navigating to /draft and the
// draft-scoped query resolving previously fell through every early-return
// check (the league itself still loads — it's public data) and rendered a
// broken, dataless board instead of telling the user why.
describe('EliteDraftBoardScreen (native) — lost league access (LS-8863)', () => {
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
    mockUseDraftQueries.mockReturnValue({
      ...makeBaseQueries(),
      draftError: forbiddenError(),
    });

    render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(screen.getByText('ACCESS DENIED')).toBeTruthy();
    expect(
      screen.getByText("You don't have access to this draft room."),
    ).toBeTruthy();
  });

  it('shows Access Denied when the league query returns FORBIDDEN', () => {
    mockUseDraftQueries.mockReturnValue({
      ...makeBaseQueries(),
      league: undefined,
      leagueError: forbiddenError(),
    });

    render(<EliteDraftBoardScreen {...defaultProps} />);

    expect(screen.getByText('ACCESS DENIED')).toBeTruthy();
  });
});
