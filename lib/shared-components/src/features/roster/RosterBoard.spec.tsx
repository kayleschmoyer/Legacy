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
  injuryStatus?: string | null,
): RosterBoardPlayer => ({
  id,
  positionId,
  isLocked,
  player: { firstName, lastName, eligiblePositions: eligible, injuryStatus },
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

  it('shows an injury badge for an injured starter and does not for a healthy one', () => {
    const playersWithInjury: RosterBoardPlayer[] = [
      mk(101, 'Mike', 'Johnson', ['C'], 1, false, 'IL-10'),
      mk(102, 'Wade', 'Boggs', ['1B'], null),
      mk(103, 'Nolan', 'Ryan', ['SP'], null),
    ];
    render(
      <RosterBoard
        positions={POSITIONS}
        teamPlayers={playersWithInjury}
        onPlayerAssign={noop}
        onPlayerRemove={noop}
      />,
    );
    expect(screen.getByLabelText('Injury status: IL-10')).toBeTruthy();
    expect(screen.getByText('Mike Johnson')).toBeTruthy();
    expect(screen.getByText('Wade Boggs')).toBeTruthy();
    expect(screen.queryByLabelText(/Injury status: (?!IL-10)/)).toBeNull();
  });

  it('shows an injury badge for an injured bench player', () => {
    const playersWithInjury: RosterBoardPlayer[] = [
      mk(101, 'Mike', 'Johnson', ['C'], 1),
      mk(102, 'Wade', 'Boggs', ['1B'], null, false, 'DTD'),
      mk(103, 'Nolan', 'Ryan', ['SP'], null),
    ];
    render(
      <RosterBoard
        positions={POSITIONS}
        teamPlayers={playersWithInjury}
        onPlayerAssign={noop}
        onPlayerRemove={noop}
      />,
    );
    expect(screen.getByLabelText('Injury status: DTD')).toBeTruthy();
  });
});
