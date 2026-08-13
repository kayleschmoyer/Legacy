import React from 'react';
import { DraftLastPickTicker } from './DraftLastPickTicker';
import type { DraftPickRecord, DraftPlayer } from './types';
import { render } from '../../test-utils';

function makePick(overrides: Partial<DraftPickRecord> = {}): DraftPickRecord {
  return {
    id: 'p1',
    draftId: 42,
    round: 1,
    pickNumber: 3,
    overallPick: 3,
    pickedAt: '2026-07-28T00:00:00Z',
    teamId: 1,
    playerId: 1,
    ...overrides,
  };
}

function makePlayer(overrides: Partial<DraftPlayer> = {}): DraftPlayer {
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
    ...overrides,
  };
}

describe('DraftLastPickTicker', () => {
  it('renders nothing before the first pick', () => {
    const { queryByTestId } = render(
      <DraftLastPickTicker
        lastPick={null}
        statsLookup={new Map()}
        teamName="Dinger Dynasty"
      />,
    );

    expect(queryByTestId('draft-last-pick-ticker')).toBeNull();
  });

  it('renders the LAST label and the formatted pick line on a single row', () => {
    const { getByText } = render(
      <DraftLastPickTicker
        lastPick={makePick()}
        statsLookup={new Map([[1, makePlayer()]])}
        teamName="Bronx Bombers"
      />,
    );

    expect(getByText('LAST')).toBeTruthy();
    expect(getByText('1.3 — Bobby Witt Jr., SS (Bronx Bombers)')).toBeTruthy();
  });
});
