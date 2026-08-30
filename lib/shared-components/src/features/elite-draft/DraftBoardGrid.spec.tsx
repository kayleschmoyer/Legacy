import React from 'react';
import { DraftBoardGrid } from './DraftBoardGrid';
import type {
  CurrentDraftPickInfo,
  DraftPickRecord,
  DraftPlayer,
  LeagueTeam,
} from './types';
import { fireEvent, render } from '../../test-utils';

const teams: LeagueTeam[] = [
  { id: '1', name: 'Dinger Dynasty', leagueId: 1 },
  { id: '2', name: 'Bronx Bombers', leagueId: 1 },
];

function pick(overrides: Partial<DraftPickRecord> = {}): DraftPickRecord {
  return {
    id: '1',
    draftId: 1,
    round: 1,
    pickNumber: 1,
    overallPick: 1,
    pickedAt: '2026-01-01T00:00:00.000Z',
    teamId: 1,
    playerId: 1,
    ...overrides,
  };
}

describe('DraftBoardGrid', () => {
  it('returns null when there are no teams', () => {
    const { container } = render(
      <DraftBoardGrid
        teams={[]}
        picks={[]}
        currentPickInfo={null}
        myTeamId={null}
        statsLookup={new Map()}
        rounds={1}
        sport="football"
        onMakePick={jest.fn()}
      />,
    );
    expect(container.textContent).toBe('');
  });

  it('renders team header avatars, marking the viewer column YOU', () => {
    const { getByText } = render(
      <DraftBoardGrid
        teams={teams}
        picks={[]}
        currentPickInfo={null}
        myTeamId={1}
        statsLookup={new Map()}
        rounds={1}
        sport="football"
        onMakePick={jest.fn()}
      />,
    );

    expect(getByText('YOU')).toBeTruthy();
    expect(getByText('Bronx Bombers')).toBeTruthy();
    expect(getByText('DD')).toBeTruthy();
  });

  it('renders a filled cell with the abbreviated player name, pick number, and position', () => {
    const statsLookup = new Map<number, DraftPlayer>([
      [
        1,
        {
          id: 1,
          name: 'Bobby Witt Jr.',
          position: 'RB',
        } as DraftPlayer,
      ],
    ]);
    const { getByText } = render(
      <DraftBoardGrid
        teams={teams}
        picks={[pick({ teamId: 1, playerId: 1, round: 1, pickNumber: 1 })]}
        currentPickInfo={null}
        myTeamId={1}
        statsLookup={statsLookup}
        rounds={1}
        sport="football"
        onMakePick={jest.fn()}
      />,
    );

    expect(getByText('1.1')).toBeTruthy();
    expect(getByText('B. Witt')).toBeTruthy();
    expect(getByText('RB')).toBeTruthy();
  });

  it('shows MAKE PICK on the current cell when it is my pick, and fires onMakePick on tap', () => {
    const currentPickInfo: CurrentDraftPickInfo = {
      draftId: 1,
      teamId: 1,
      round: 1,
      pickNumber: 1,
      overallPick: 1,
      isComplete: false,
    };
    const onMakePick = jest.fn();
    const { getByRole } = render(
      <DraftBoardGrid
        teams={teams}
        picks={[]}
        currentPickInfo={currentPickInfo}
        myTeamId={1}
        statsLookup={new Map()}
        rounds={1}
        sport="football"
        onMakePick={onMakePick}
      />,
    );

    const cell = getByRole('button', { name: 'MAKE PICK' });
    fireEvent.click(cell);
    expect(onMakePick).toHaveBeenCalledTimes(1);
  });

  it('shows "On the clock…" on the current cell when it is not my pick, with no tap target', () => {
    const currentPickInfo: CurrentDraftPickInfo = {
      draftId: 1,
      teamId: 2,
      round: 1,
      pickNumber: 2,
      overallPick: 2,
      isComplete: false,
    };
    const { getByText, queryByRole } = render(
      <DraftBoardGrid
        teams={teams}
        picks={[]}
        currentPickInfo={currentPickInfo}
        myTeamId={1}
        statsLookup={new Map()}
        rounds={1}
        sport="football"
        onMakePick={jest.fn()}
      />,
    );

    expect(getByText('On the clock…')).toBeTruthy();
    expect(queryByRole('button', { name: 'On the clock…' })).toBeNull();
  });

  it('labels an empty cell with the snake-correct round.pick number', () => {
    const { getByText } = render(
      <DraftBoardGrid
        teams={teams}
        picks={[]}
        currentPickInfo={null}
        myTeamId={1}
        statsLookup={new Map()}
        rounds={2}
        sport="football"
        onMakePick={jest.fn()}
      />,
    );

    // Round 2 is snake-reversed: column 0 (team 1) picks last => 2.2.
    expect(getByText('2.2')).toBeTruthy();
  });

  it('labels each round gutter with an explicit reading-direction announcement (LS-9461)', () => {
    const { getByTestId } = render(
      <DraftBoardGrid
        teams={teams}
        picks={[]}
        currentPickInfo={null}
        myTeamId={1}
        statsLookup={new Map()}
        rounds={2}
        sport="football"
        onMakePick={jest.fn()}
      />,
    );

    expect(
      getByTestId('draft-board-grid-round-direction-1').getAttribute(
        'aria-label',
      ),
    ).toBe('Round 1 picks read left to right');
    expect(
      getByTestId('draft-board-grid-round-direction-2').getAttribute(
        'aria-label',
      ),
    ).toBe('Round 2 picks read right to left');
  });
});
