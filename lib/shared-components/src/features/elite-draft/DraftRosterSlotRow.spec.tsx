import React from 'react';
import { DraftRosterSlotRow } from './DraftRosterSlotRow';
import type { DraftPickRecord, DraftPlayer } from './types';
import { render } from '../../test-utils';

function makePlayer(overrides: Partial<DraftPlayer> = {}): DraftPlayer {
  return {
    id: 1,
    name: 'Patrick Mahomes',
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
    ...overrides,
  };
}

function makePick(overrides: Partial<DraftPickRecord> = {}): DraftPickRecord {
  return {
    id: 'p1',
    draftId: 1,
    round: 2,
    pickNumber: 5,
    overallPick: 17,
    pickedAt: '2026-08-01T00:00:00Z',
    teamId: 1,
    playerId: 1,
    ...overrides,
  };
}

describe('DraftRosterSlotRow', () => {
  it('lists every eligible position, primary first, so slot placement reads correctly (LS-10472)', () => {
    const { getByText } = render(
      <DraftRosterSlotRow
        slotPositionType="C"
        sport="baseball"
        player={makePlayer({
          name: 'Charlie Dexter',
          position: 'OF',
          eligiblePositions: ['OF', 'C'],
        })}
        pick={makePick()}
      />,
    );

    expect(getByText('OF, C · Pick 2.5')).toBeTruthy();
  });

  it('renders italic "Empty" for an unfilled slot', () => {
    const { getByText, queryByText } = render(
      <DraftRosterSlotRow
        slotPositionType="QB"
        sport="football"
        player={null}
      />,
    );

    expect(getByText('Empty')).toBeTruthy();
    expect(getByText('QB')).toBeTruthy();
    expect(queryByText('PROJ')).toBeNull();
  });

  it('renders the BN badge label for the synthetic BENCH bucket', () => {
    const { getByText } = render(
      <DraftRosterSlotRow
        slotPositionType="BENCH"
        sport="football"
        player={null}
      />,
    );

    expect(getByText('BN')).toBeTruthy();
  });

  it('renders name, meta line, and PROJ numeral for a filled slot', () => {
    const { getByText } = render(
      <DraftRosterSlotRow
        slotPositionType="QB"
        sport="football"
        player={makePlayer()}
        pick={makePick()}
      />,
    );

    expect(getByText('Patrick Mahomes')).toBeTruthy();
    expect(getByText('QB · Pick 2.5')).toBeTruthy();
    expect(getByText('PROJ')).toBeTruthy();
    expect(getByText('24.5')).toBeTruthy();
  });

  it('exposes the PROJ label and numeral as one accessible unit (LS-10634)', () => {
    const { getByLabelText } = render(
      <DraftRosterSlotRow
        slotPositionType="QB"
        sport="football"
        player={makePlayer()}
      />,
    );

    expect(getByLabelText('Projected points 24.5')).toBeTruthy();
  });

  it('renders no PROJ label or numeral when the player has no ppg (LS-10634)', () => {
    const { queryByText, queryByTestId } = render(
      <DraftRosterSlotRow
        slotPositionType="QB"
        sport="football"
        player={makePlayer({ ppg: undefined })}
      />,
    );

    expect(queryByText('PROJ')).toBeNull();
    expect(queryByTestId('draft-roster-slot-row-proj')).toBeNull();
  });
});
