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
): RosterBoardPlayer => ({
  id,
  positionId,
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
});
