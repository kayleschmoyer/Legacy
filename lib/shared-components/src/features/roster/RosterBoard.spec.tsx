import React from 'react';
import {
  RosterBoard,
  type RosterBoardPlayer,
  type RosterBoardPosition,
} from './RosterBoard';
import { fireEvent, render, screen } from '../../test-utils';

const POSITIONS: RosterBoardPosition[] = [
  { id: 1, positionType: 'C' },
  { id: 2, positionType: '1B' },
  { id: 3, positionType: 'SP' },
];

const mk = (
  id: number,
  firstName: string,
  lastName: string,
  eligible: string[],
  positionId: number | null,
  isLocked?: boolean,
): RosterBoardPlayer => ({
  id,
  positionId,
  isLocked,
  player: { firstName, lastName, eligiblePositions: eligible },
});

const PLAYERS: RosterBoardPlayer[] = [
  mk(101, 'Mike', 'Johnson', ['C'], 1), // assigned to C
  mk(102, 'Wade', 'Boggs', ['1B'], null), // bench hitter
  mk(103, 'Nolan', 'Ryan', ['SP'], null), // bench pitcher
];

const noop = () => undefined;

describe('RosterBoard', () => {
  it('renders the three section headings and assigned player names', () => {
    render(
      <RosterBoard
        positions={POSITIONS}
        teamPlayers={PLAYERS}
        onPlayerAssign={noop}
        onPlayerRemove={noop}
      />,
    );
    expect(
      screen.getByRole('heading', { name: 'Starting Hitters' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: 'Starting Pitchers' }),
    ).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Bench' })).toBeTruthy();
    expect(screen.getByText('Mike Johnson')).toBeTruthy();
  });

  it('renders the loading state', () => {
    render(
      <RosterBoard
        positions={POSITIONS}
        teamPlayers={[]}
        onPlayerAssign={noop}
        onPlayerRemove={noop}
        loading
      />,
    );
    expect(screen.getByText('Loading roster…')).toBeTruthy();
  });

  it('renders the error state', () => {
    render(
      <RosterBoard
        positions={POSITIONS}
        teamPlayers={[]}
        onPlayerAssign={noop}
        onPlayerRemove={noop}
        error={new Error('boom')}
      />,
    );
    expect(screen.getByText('Failed to load roster')).toBeTruthy();
  });

  it('assigns a selected bench player to an eligible empty slot', () => {
    const onPlayerAssign = jest.fn<
      void,
      [RosterBoardPlayer, RosterBoardPosition]
    >();
    render(
      <RosterBoard
        positions={POSITIONS}
        teamPlayers={PLAYERS}
        onPlayerAssign={onPlayerAssign}
        onPlayerRemove={noop}
      />,
    );
    // Select the bench hitter (Wade Boggs, eligible at 1B).
    fireEvent.click(screen.getByRole('button', { name: /Wade Boggs — bench/ }));
    // The empty 1B slot is now an assign target.
    fireEvent.click(
      screen.getByRole('button', { name: 'Assign Wade Boggs to 1B' }),
    );
    expect(onPlayerAssign).toHaveBeenCalledTimes(1);
    expect(onPlayerAssign.mock.calls[0]?.[0].id).toBe(102);
    expect(onPlayerAssign.mock.calls[0]?.[1].id).toBe(2);
  });

  it('does not fire mutations for disabled position slots', () => {
    const onPlayerAssign = jest.fn();
    render(
      <RosterBoard
        positions={POSITIONS}
        teamPlayers={PLAYERS}
        onPlayerAssign={onPlayerAssign}
        onPlayerRemove={noop}
        disabledPositionIds={new Set([2])}
      />,
    );
    // Select Wade Boggs from the bench (eligible at 1B, which is position id 2).
    fireEvent.click(screen.getByRole('button', { name: /Wade Boggs — bench/ }));
    // The 1B slot (id 2) is disabled — clicking it should not fire the callback.
    const slot1B = screen.getByRole('button', { name: /1B/i });
    fireEvent.click(slot1B);
    expect(onPlayerAssign).not.toHaveBeenCalled();
  });

  it('does not fire mutations when read-only', () => {
    const onPlayerAssign = jest.fn();
    const onPlayerRemove = jest.fn();
    render(
      <RosterBoard
        positions={POSITIONS}
        teamPlayers={PLAYERS}
        onPlayerAssign={onPlayerAssign}
        onPlayerRemove={onPlayerRemove}
        readOnly
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Wade Boggs — bench/ }));
    expect(onPlayerAssign).not.toHaveBeenCalled();
    expect(onPlayerRemove).not.toHaveBeenCalled();
  });

  it('shows lock indicator and locked text for a locked starter', () => {
    const lockedPlayers: RosterBoardPlayer[] = [
      mk(101, 'Mike', 'Johnson', ['C'], 1, true), // locked starter at C
      mk(102, 'Wade', 'Boggs', ['1B'], null),
      mk(103, 'Nolan', 'Ryan', ['SP'], null),
    ];
    render(
      <RosterBoard
        positions={POSITIONS}
        teamPlayers={lockedPlayers}
        onPlayerAssign={noop}
        onPlayerRemove={noop}
      />,
    );
    expect(screen.getByText('Locked — game in progress')).toBeTruthy();
  });

  it('does not select a locked starter when tapped', () => {
    const onPlayerAssign = jest.fn();
    const lockedPlayers: RosterBoardPlayer[] = [
      mk(101, 'Mike', 'Johnson', ['C'], 1, true), // locked starter at C
      mk(102, 'Wade', 'Boggs', ['1B'], null), // bench, eligible at 1B
      mk(103, 'Nolan', 'Ryan', ['SP'], null),
    ];
    render(
      <RosterBoard
        positions={POSITIONS}
        teamPlayers={lockedPlayers}
        onPlayerAssign={onPlayerAssign}
        onPlayerRemove={noop}
      />,
    );
    // Tap the locked C slot — Mike is locked so he should NOT become selected.
    fireEvent.click(
      screen.getByRole('button', { name: /Mike Johnson at C — locked/ }),
    );
    // Tap the empty 1B slot — if Mike were selected, onPlayerAssign would fire
    // because Mike is eligible at C but not 1B; however since nothing is selected, nothing fires.
    fireEvent.click(
      screen.getByRole('button', { name: /1st Base.*open slot/i }),
    );
    expect(onPlayerAssign).not.toHaveBeenCalled();
  });

  it('does not swap into a locked starter slot', () => {
    const onPlayerSwap = jest.fn();
    const lockedPlayers: RosterBoardPlayer[] = [
      mk(101, 'Mike', 'Johnson', ['C'], 1, true), // locked at C
      mk(102, 'Wade', 'Boggs', ['C', '1B'], 2), // unlocked at 1B, eligible at C
      mk(103, 'Nolan', 'Ryan', ['SP'], null),
    ];
    render(
      <RosterBoard
        positions={POSITIONS}
        teamPlayers={lockedPlayers}
        onPlayerAssign={noop}
        onPlayerRemove={noop}
        onPlayerSwap={onPlayerSwap}
      />,
    );
    // Select the unlocked 1B player (Wade Boggs).
    fireEvent.click(screen.getByRole('button', { name: /Wade Boggs at 1B/ }));
    // Attempt to swap into the locked C slot (Mike Johnson) — should be blocked.
    fireEvent.click(
      screen.getByRole('button', { name: /Mike Johnson at C — locked/ }),
    );
    expect(onPlayerSwap).not.toHaveBeenCalled();
  });

  // ── mlbTeam / jerseyNumber badge (LS-8597) ─────────────────────────────────

  it('renders a team + jersey number badge for a starter when present', () => {
    const players: RosterBoardPlayer[] = [
      {
        id: 101,
        positionId: 1,
        player: {
          firstName: 'Mike',
          lastName: 'Johnson',
          eligiblePositions: ['C'],
          mlbTeam: 'NYY',
          jerseyNumber: 99,
        },
      },
    ];
    render(
      <RosterBoard
        positions={POSITIONS}
        teamPlayers={players}
        onPlayerAssign={noop}
        onPlayerRemove={noop}
      />,
    );
    expect(screen.getByText('NYY #99')).toBeTruthy();
  });

  it('renders a team + jersey number badge for a bench player when present', () => {
    const players: RosterBoardPlayer[] = [
      {
        id: 102,
        positionId: null,
        player: {
          firstName: 'Wade',
          lastName: 'Boggs',
          eligiblePositions: ['1B'],
          mlbTeam: 'BOS',
          jerseyNumber: 26,
        },
      },
    ];
    render(
      <RosterBoard
        positions={POSITIONS}
        teamPlayers={players}
        onPlayerAssign={noop}
        onPlayerRemove={noop}
      />,
    );
    expect(screen.getByText('BOS #26')).toBeTruthy();
  });

  it('renders no badge when mlbTeam and jerseyNumber are absent', () => {
    render(
      <RosterBoard
        positions={POSITIONS}
        teamPlayers={PLAYERS}
        onPlayerAssign={noop}
        onPlayerRemove={noop}
      />,
    );
    expect(screen.queryByText(/^[A-Z]{2,3} #\d+$/)).toBeNull();
  });

  // ── Command-center stats + quick-swap (LS-9355) ────────────────────────────

  it('renders actual/projected scores and the stat sub-line from getPlayerStats', () => {
    render(
      <RosterBoard
        positions={POSITIONS}
        teamPlayers={PLAYERS}
        onPlayerAssign={noop}
        onPlayerRemove={noop}
        getPlayerStats={(p) =>
          p.id === 101
            ? {
                actual: 32.5,
                projected: 28.6,
                gamesPlayed: 1,
                totalGames: 1,
                seasonYear: 2007,
                teamAbbr: 'NE',
              }
            : p.id === 102
              ? { projected: 23.8 }
              : null
        }
      />,
    );
    // Starter row actual + card-head total both render the same value.
    expect(screen.getAllByText('32.5')).toHaveLength(2);
    expect(screen.getByText('28.6 proj')).toBeTruthy();
    expect(screen.getByText('2007 · NE · 1/1 G')).toBeTruthy();
    // Bench row shows the projection with a bare "proj" label.
    expect(screen.getByText('23.8')).toBeTruthy();
    // Starters card head shows computed totals.
    expect(screen.getByText(/Total:/)).toBeTruthy();
  });

  it('quick-swap menu assigns an eligible bench player to an empty slot', () => {
    const onPlayerAssign = jest.fn<
      void,
      [RosterBoardPlayer, RosterBoardPosition]
    >();
    render(
      <RosterBoard
        positions={POSITIONS}
        teamPlayers={PLAYERS}
        onPlayerAssign={onPlayerAssign}
        onPlayerRemove={noop}
      />,
    );
    // Open the quick-swap menu on the empty SP slot.
    fireEvent.click(screen.getByRole('button', { name: 'Quick swap SP' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Assign Nolan Ryan to SP' }),
    );
    expect(onPlayerAssign).toHaveBeenCalledTimes(1);
    expect(onPlayerAssign.mock.calls[0]?.[0].id).toBe(103);
    expect(onPlayerAssign.mock.calls[0]?.[1].id).toBe(3);
  });

  it('quick-swap menu swaps an eligible bench player into an occupied slot', () => {
    const onPlayerSwap = jest.fn<
      void,
      [RosterBoardPlayer, RosterBoardPosition, RosterBoardPlayer]
    >();
    const players: RosterBoardPlayer[] = [
      mk(101, 'Mike', 'Johnson', ['C'], 1),
      mk(102, 'Wade', 'Boggs', ['C', '1B'], null),
    ];
    render(
      <RosterBoard
        positions={POSITIONS}
        teamPlayers={players}
        onPlayerAssign={noop}
        onPlayerRemove={noop}
        onPlayerSwap={onPlayerSwap}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Quick swap C' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Swap in Wade Boggs at C' }),
    );
    expect(onPlayerSwap).toHaveBeenCalledTimes(1);
    expect(onPlayerSwap.mock.calls[0]?.[0].id).toBe(102); // incoming: Wade
    expect(onPlayerSwap.mock.calls[0]?.[1].id).toBe(1); // target: C slot
    expect(onPlayerSwap.mock.calls[0]?.[2].id).toBe(101); // displaced: Mike
  });

  it('overflow menu moves a starter to the bench', () => {
    const onPlayerRemove = jest.fn<void, [RosterBoardPosition]>();
    render(
      <RosterBoard
        positions={POSITIONS}
        teamPlayers={PLAYERS}
        onPlayerAssign={noop}
        onPlayerRemove={onPlayerRemove}
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'More actions for Mike Johnson' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Move Mike Johnson to bench' }),
    );
    expect(onPlayerRemove).toHaveBeenCalledTimes(1);
    expect(onPlayerRemove.mock.calls[0]?.[0].id).toBe(1);
  });

  it('hides quick-swap and overflow actions when read-only', () => {
    render(
      <RosterBoard
        positions={POSITIONS}
        teamPlayers={PLAYERS}
        onPlayerAssign={noop}
        onPlayerRemove={noop}
        readOnly
      />,
    );
    expect(screen.queryByRole('button', { name: /Quick swap/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /More actions/ })).toBeNull();
  });
});
