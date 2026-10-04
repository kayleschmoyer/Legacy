import React from 'react';
import { DraftPlayersTab } from './DraftPlayersTab';
import type { CurrentDraftPickInfo, DraftPlayer, LeagueTeam } from './types';
import { fireEvent, render, screen, within } from '../../test-utils';

// This file imports FlatList/Pressable directly from 'react-native' (the
// compact-branch convention — see EliteDraftBoardScreen.tsx). The web jest
// setup's global react-native mock drops `testID`/`accessibilityLabel`
// rather than converting them to `data-testid`/`aria-label`, so — matching
// EliteDraftBoardScreen.spec.tsx's own override — remap accessibilityLabel
// to aria-label here for RTL a11y queries; `testID` passes straight to the
// DOM as a harmless raw attribute.
jest.mock('react-native', () => {
  /* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires -- jest.mock factory needs runtime require */
  const ReactLocal = require('react') as typeof import('react');
  /* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires */
  return {
    StyleSheet: { create: (s: unknown) => s, flatten: (s: unknown) => s },
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
      onEndReached,
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
      onEndReached?: () => void;
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
      // A button stands in for "scrolled near the end" so specs can drive
      // the pagination callback the real list fires on its own.
      return ReactLocal.createElement(
        'div',
        { 'data-testid': 'flatlist' },
        items,
        ListFooterComponent,
        ReactLocal.createElement(
          'button',
          { 'data-testid': 'flatlist-end-reached', onClick: onEndReached },
          'end',
        ),
      );
    },
  };
});

function makePlayer(overrides: Partial<DraftPlayer> = {}): DraftPlayer {
  return {
    id: 1,
    name: 'Josh Allen',
    position: 'QB',
    avg: 0,
    hr: 0,
    rbi: 0,
    runs: 0,
    sb: 0,
    games: 0,
    hits: 0,
    obp: 0,
    slg: 0,
    ppg: 24.5,
    adp: 1,
    ...overrides,
  };
}

// myTeamId '1' sits at index 1 (draft slot 2) so a currentPickInfo of
// round 1 / overallPick 1 (team '2', slot 1) leaves my next pick at
// round 1 / overallPick 2 — picksUntil 1 (see computeMyUpcomingPicks specs
// in nativeDraftBoard.spec.ts for the underlying snake math).
const TEAMS: LeagueTeam[] = [
  { id: '2', name: 'Bronx Bombers', leagueId: 1 },
  { id: '1', name: 'Dinger Dynasty', leagueId: 1 },
  { id: '3', name: 'Home Run Haulers', leagueId: 1 },
  { id: '4', name: 'Grand Slammers', leagueId: 1 },
];

const LEAGUE_POSITIONS = [
  { id: 1, positionType: 'QB' },
  { id: 2, positionType: 'RB' },
  { id: 3, positionType: 'RB' },
  { id: 4, positionType: 'WR' },
  { id: 5, positionType: 'WR' },
  { id: 6, positionType: 'TE' },
  { id: 7, positionType: 'FLEX' },
  { id: 8, positionType: 'DST' },
  { id: 9, positionType: 'K' },
];

const CURRENT_PICK: CurrentDraftPickInfo = {
  draftId: 42,
  teamId: 2,
  round: 1,
  pickNumber: 2,
  overallPick: 1,
  isComplete: false,
};

function baseProps(
  overrides: Partial<React.ComponentProps<typeof DraftPlayersTab>> = {},
): React.ComponentProps<typeof DraftPlayersTab> {
  return {
    players: [],
    myTeam: [],
    sport: 'football',
    leaguePositions: LEAGUE_POSITIONS,
    maxRosterSize: 10,
    selectedPosition: 'ALL',
    searchTerm: '',
    onSetSelectedPosition: jest.fn(),
    onSetSearchTerm: jest.fn(),
    canDraft: false,
    currentPickInfo: CURRENT_PICK,
    boardOrderedTeams: TEAMS,
    myTeamId: 1,
    queuedPlayerIds: new Set<number>(),
    onToggleQueue: jest.fn(),
    onDraftPlayer: jest.fn(),
    ...overrides,
  };
}

describe('DraftPlayersTab', () => {
  it('renders the search input bound to searchTerm and calls onSetSearchTerm on change', () => {
    const onSetSearchTerm = jest.fn();
    render(
      <DraftPlayersTab
        {...baseProps({ searchTerm: 'mahomes', onSetSearchTerm })}
      />,
    );

    const input = screen.getByPlaceholderText('Search players…');
    expect(input).toHaveValue('mahomes');

    fireEvent.change(input, { target: { value: 'allen' } });
    expect(onSetSearchTerm).toHaveBeenCalledWith('allen');
  });

  it('renders one chip per football position plus ALL, with roster counts from leaguePositions/myTeam', () => {
    render(
      <DraftPlayersTab
        {...baseProps({
          myTeam: [makePlayer({ id: 1, position: 'QB' })],
        })}
      />,
    );

    for (const pos of ['ALL', 'QB', 'RB', 'WR', 'TE', 'FLEX', 'DST', 'K']) {
      expect(screen.getByLabelText(`Filter by ${pos}`)).toBeTruthy();
    }
    // ALL shows picks/rounds (myTeam.length / total roster slots).
    expect(screen.getByText('1/10')).toBeTruthy();
    // QB slot is filled by the one drafted QB.
    expect(
      within(screen.getByLabelText('Filter by QB')).getByText('1/1'),
    ).toBeTruthy();
    // RB has 2 configured slots, none filled.
    expect(
      within(screen.getByLabelText('Filter by RB')).getByText('0/2'),
    ).toBeTruthy();
  });

  it('calls onSetSelectedPosition when a chip is tapped', () => {
    const onSetSelectedPosition = jest.fn();
    render(<DraftPlayersTab {...baseProps({ onSetSelectedPosition })} />);

    fireEvent.click(screen.getByLabelText('Filter by RB'));

    expect(onSetSelectedPosition).toHaveBeenCalledWith('RB');
  });

  it('renders a player row with position badge, name, PROJ, and no DRAFT button when canDraft is false', () => {
    render(
      <DraftPlayersTab
        {...baseProps({
          players: [makePlayer()],
          canDraft: false,
        })}
      />,
    );

    expect(screen.getByText('Josh Allen')).toBeTruthy();
    expect(
      screen.getByText(
        (_content, element) =>
          element?.textContent === 'ADP 1.0 · PROJ 24.5 · ROST —',
      ),
    ).toBeTruthy();
    expect(screen.queryByLabelText('Draft Josh Allen')).toBeNull();
  });

  it('shows the DRAFT button only when canDraft is true and fires onDraftPlayer', () => {
    const onDraftPlayer = jest.fn();
    render(
      <DraftPlayersTab
        {...baseProps({
          players: [makePlayer()],
          canDraft: true,
          onDraftPlayer,
        })}
      />,
    );

    fireEvent.click(screen.getByLabelText('Draft Josh Allen'));
    expect(onDraftPlayer).toHaveBeenCalledWith(1);
  });

  it('renders the queue star filled when the player is queued and toggles on tap', () => {
    const onToggleQueue = jest.fn();
    render(
      <DraftPlayersTab
        {...baseProps({
          players: [makePlayer()],
          queuedPlayerIds: new Set([1]),
          onToggleQueue,
        })}
      />,
    );

    expect(screen.getByText('★')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Remove Josh Allen from queue'));
    expect(onToggleQueue).toHaveBeenCalledWith(1);
  });

  it('inserts a "YOUR PICK" marker at the players-list position matching picks-until-mine, when filter is ALL and search is empty', () => {
    render(
      <DraftPlayersTab
        {...baseProps({
          players: [
            makePlayer({ id: 1, name: 'Player One' }),
            makePlayer({ id: 2, name: 'Player Two' }),
          ],
        })}
      />,
    );

    expect(screen.getByText('Your pick (R1, P2)')).toBeTruthy();
  });

  it('hides YOUR PICK markers when a position filter is active', () => {
    render(
      <DraftPlayersTab
        {...baseProps({
          selectedPosition: 'QB',
          players: [makePlayer({ id: 1, name: 'Player One' })],
        })}
      />,
    );

    expect(screen.queryByTestId('draft-players-your-pick-marker')).toBeNull();
  });

  it('hides YOUR PICK markers when search is non-empty', () => {
    render(
      <DraftPlayersTab
        {...baseProps({
          searchTerm: 'allen',
          players: [makePlayer({ id: 1, name: 'Player One' })],
        })}
      />,
    );

    expect(screen.queryByTestId('draft-players-your-pick-marker')).toBeNull();
  });

  // LS-10002: the phone pick sheet re-hosts this browser for every sport, so
  // chips and roster buckets follow the league's sport rather than football.
  it('labels a multi-eligible player with every eligible position, primary first (LS-10472)', () => {
    render(
      <DraftPlayersTab
        {...baseProps({
          sport: 'baseball',
          leaguePositions: [{ positionType: 'C' }, { positionType: 'OF' }],
          selectedPosition: 'C',
          players: [
            makePlayer({
              name: 'Charlie Dexter',
              position: 'OF',
              eligiblePositions: ['OF', 'C'],
            }),
          ],
        })}
      />,
    );

    expect(screen.getByText('Charlie Dexter')).toBeTruthy();
    expect(screen.getByText('OF, C')).toBeTruthy();
  });

  it('offers baseball position chips and baseball roster buckets for a baseball league', () => {
    render(
      <DraftPlayersTab
        {...baseProps({
          sport: 'baseball',
          leaguePositions: [
            { positionType: 'C' },
            { positionType: 'SS' },
            { positionType: 'OF' },
            { positionType: 'OF' },
          ],
          myTeam: [makePlayer({ id: 9, position: 'OF' })],
        })}
      />,
    );

    for (const pos of ['ALL', 'C', '1B', '2B', '3B', 'SS', 'OF', 'P']) {
      expect(screen.getByLabelText(`Filter by ${pos}`)).toBeTruthy();
    }
    expect(screen.queryByLabelText('Filter by QB')).toBeNull();
    expect(
      within(screen.getByLabelText('Filter by OF')).getByText('1/2'),
    ).toBeTruthy();
  });

  it('sorts by ADP by default and re-sorts by projected points without renumbering ADP', () => {
    render(
      <DraftPlayersTab
        {...baseProps({
          searchTerm: 'x',
          players: [
            makePlayer({ id: 1, name: 'Bo Baker', ppg: 12, adp: 2 }),
            makePlayer({ id: 2, name: 'Ace Adams', ppg: 6, adp: 1 }),
          ],
        })}
      />,
    );

    const names = () =>
      screen.getAllByText(/Adams|Baker/).map((node) => node.textContent);
    expect(names()).toEqual(['Ace Adams', 'Bo Baker']);

    fireEvent.click(screen.getByLabelText('Sort by PTS'));

    expect(names()).toEqual(['Bo Baker', 'Ace Adams']);
    expect(
      screen.getByText(
        (_content, element) =>
          element?.textContent === 'ADP 2.0 · PROJ 12.0 · ROST —',
      ),
    ).toBeTruthy();
  });

  it('asks for the next page near the end of the list only while more remain and none is loading', () => {
    const onLoadMore = jest.fn();
    const { rerender } = render(
      <DraftPlayersTab
        {...baseProps({
          players: [makePlayer()],
          hasMorePlayers: true,
          onLoadMore,
        })}
      />,
    );

    fireEvent.click(screen.getByTestId('flatlist-end-reached'));
    expect(onLoadMore).toHaveBeenCalledTimes(1);

    rerender(
      <DraftPlayersTab
        {...baseProps({
          players: [makePlayer()],
          hasMorePlayers: true,
          loadingMore: true,
          onLoadMore,
        })}
      />,
    );
    fireEvent.click(screen.getByTestId('flatlist-end-reached'));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('draft-loading-more')).toBeTruthy();

    rerender(
      <DraftPlayersTab
        {...baseProps({
          players: [makePlayer()],
          hasMorePlayers: false,
          onLoadMore,
        })}
      />,
    );
    fireEvent.click(screen.getByTestId('flatlist-end-reached'));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('draft-loading-more')).toBeNull();
  });

  it('labels the pick action with draftActionLabel for a commissioner override', () => {
    render(
      <DraftPlayersTab
        {...baseProps({
          players: [makePlayer()],
          canDraft: true,
          draftActionLabel: 'ASSIGN',
        })}
      />,
    );

    expect(screen.getByText('ASSIGN')).toBeTruthy();
    expect(screen.queryByText('DRAFT')).toBeNull();
    // Screen readers hear the same verb the button shows.
    expect(screen.getByLabelText('Assign Josh Allen')).toBeTruthy();
  });
});
