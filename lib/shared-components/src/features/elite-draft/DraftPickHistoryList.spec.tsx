import React from 'react';

import {
  DraftPickHistoryList,
  pickPlayerName,
  pickRoundLabel,
} from './DraftPickHistoryList';
import type { DraftPickRecord, DraftPlayer } from './types';
import { render, screen } from '../../test-utils';

function makePick(
  overallPick: number,
  overrides: Partial<DraftPickRecord> = {},
): DraftPickRecord {
  return {
    id: `pick-${overallPick}`,
    draftId: 1,
    round: 1,
    pickNumber: overallPick,
    overallPick,
    pickedAt: '2026-09-15T00:00:00Z',
    teamId: 1,
    playerId: overallPick * 10,
    ...overrides,
  };
}

const statsLookup = new Map<number, DraftPlayer>([
  [
    10,
    {
      id: 10,
      name: 'Lou Gehrig',
      position: '1B',
      eligiblePositions: ['1B'],
    } as DraftPlayer,
  ],
]);

const teamNameById = (teamId: number | null): string | null =>
  teamId === 1 ? 'Sandlot Dreamers' : 'Bronx Bombers';

describe('DraftPickHistoryList (LS-10165)', () => {
  it('lists picks newest first', () => {
    render(
      <DraftPickHistoryList
        picks={[makePick(1), makePick(3), makePick(2)]}
        statsLookup={statsLookup}
        myTeamId={1}
        teamNameById={teamNameById}
      />,
    );

    const rows = screen.getAllByTestId(/^draft-pick-history-row-/);
    expect(rows.map((row) => row.getAttribute('data-testid'))).toEqual([
      'draft-pick-history-row-3',
      'draft-pick-history-row-2',
      'draft-pick-history-row-1',
    ]);
  });

  it('names the player, position and team for each pick', () => {
    render(
      <DraftPickHistoryList
        picks={[makePick(1)]}
        statsLookup={statsLookup}
        myTeamId={2}
        teamNameById={teamNameById}
      />,
    );

    expect(screen.getByText('Lou Gehrig')).toBeTruthy();
    expect(screen.getByText('1B · Sandlot Dreamers')).toBeTruthy();
    expect(screen.getByText('1.01')).toBeTruthy();
  });

  it('shows an empty state before the first pick', () => {
    render(
      <DraftPickHistoryList
        picks={[]}
        statsLookup={statsLookup}
        myTeamId={1}
        teamNameById={teamNameById}
      />,
    );

    expect(screen.getByText('No picks yet.')).toBeTruthy();
  });
});

describe('pick label helpers', () => {
  it('formats round.pick with a zero-padded pick number', () => {
    expect(pickRoundLabel(makePick(7, { round: 3, pickNumber: 7 }))).toBe(
      '3.07',
    );
  });

  it('falls back from the stats row to the pick record to a placeholder', () => {
    expect(pickPlayerName(makePick(1), statsLookup)).toBe('Lou Gehrig');
    expect(
      pickPlayerName(
        makePick(2, {
          player: { firstName: 'Honus', lastName: 'Wagner' },
        } as Partial<DraftPickRecord>),
        statsLookup,
      ),
    ).toBe('Honus Wagner');
    expect(pickPlayerName(makePick(4), statsLookup)).toBe('Player #40');
  });
});
