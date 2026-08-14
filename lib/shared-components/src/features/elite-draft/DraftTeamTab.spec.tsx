import React from 'react';
import { DraftTeamTab } from './DraftTeamTab';
import type { DraftPickRecord, DraftPlayer, LeagueTeam } from './types';
import { fireEvent, render } from '../../test-utils';

const TEAMS: LeagueTeam[] = [
  { id: '1', name: 'My Squad', leagueId: 1 },
  { id: '2', name: 'Rival Team', leagueId: 1 },
];

function makePlayer(overrides: Partial<DraftPlayer>): DraftPlayer {
  return {
    id: 0,
    name: '',
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
    ...overrides,
  };
}

const PICK_HISTORY: DraftPickRecord[] = [
  {
    id: 'p1',
    draftId: 1,
    round: 1,
    pickNumber: 1,
    overallPick: 1,
    pickedAt: '2026-08-01T00:00:00Z',
    teamId: 1,
    playerId: 10,
  },
  {
    id: 'p2',
    draftId: 1,
    round: 2,
    pickNumber: 1,
    overallPick: 9,
    pickedAt: '2026-08-01T00:05:00Z',
    teamId: 1,
    playerId: 11,
  },
];

const STATS_LOOKUP = new Map<number, DraftPlayer>([
  [10, makePlayer({ id: 10, name: 'Patrick Mahomes', position: 'QB' })],
  [11, makePlayer({ id: 11, name: 'Christian McCaffrey', position: 'RB' })],
]);

const LEAGUE_POSITIONS = [
  { positionType: 'QB' },
  { positionType: 'RB' },
  { positionType: 'RB' },
  { positionType: 'WR' },
];

describe('DraftTeamTab', () => {
  it("renders MY TEAM plus each other team's initials as switcher chips", () => {
    const { getByText } = render(
      <DraftTeamTab
        teams={TEAMS}
        myTeamId={1}
        selectedTeamId={null}
        onSelectTeam={jest.fn()}
        pickHistory={PICK_HISTORY}
        statsLookup={STATS_LOOKUP}
        leaguePositions={LEAGUE_POSITIONS}
        sport="football"
        maxRosterSize={6}
      />,
    );

    expect(getByText('MY TEAM')).toBeTruthy();
    expect(getByText('RT')).toBeTruthy(); // initialsOf('Rival Team')
  });

  it('fills slot rows in league-configured order, leaving unfilled slots + bench empty', () => {
    const { getAllByText, getByText } = render(
      <DraftTeamTab
        teams={TEAMS}
        myTeamId={1}
        selectedTeamId={null}
        onSelectTeam={jest.fn()}
        pickHistory={PICK_HISTORY}
        statsLookup={STATS_LOOKUP}
        leaguePositions={LEAGUE_POSITIONS}
        sport="football"
        maxRosterSize={6}
      />,
    );

    expect(getByText('Patrick Mahomes')).toBeTruthy();
    expect(getByText('Christian McCaffrey')).toBeTruthy();
    // Second RB, WR, and two synthetic BENCH slots (6 - 4 starters) are unfilled.
    expect(getAllByText('Empty')).toHaveLength(4);
  });

  it('calls onSelectTeam with the numeric team id when a rival chip is tapped', () => {
    const onSelectTeam = jest.fn();
    const { getByText } = render(
      <DraftTeamTab
        teams={TEAMS}
        myTeamId={1}
        selectedTeamId={null}
        onSelectTeam={onSelectTeam}
        pickHistory={PICK_HISTORY}
        statsLookup={STATS_LOOKUP}
        leaguePositions={LEAGUE_POSITIONS}
        sport="football"
        maxRosterSize={6}
      />,
    );

    fireEvent.click(getByText('RT'));
    expect(onSelectTeam).toHaveBeenCalledWith(2);
  });
});
