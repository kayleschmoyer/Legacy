import React from 'react';

import { DraftRoundBoard } from './DraftRoundBoard';
import type {
  CurrentDraftPickInfo,
  DraftPickRecord,
  DraftPlayer,
  LeagueTeam,
} from './types';
import { fireEvent, render, screen } from '../../test-utils';

const TEAM_COUNT = 12;

const teams: LeagueTeam[] = Array.from({ length: TEAM_COUNT }, (_, index) => ({
  id: String(index + 1),
  name: `Team ${index + 1}`,
  leagueId: 1,
}));

function makePick(overrides: Partial<DraftPickRecord> = {}): DraftPickRecord {
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

function makeStats(
  entries: Array<[number, Partial<DraftPlayer>]>,
): Map<number, DraftPlayer> {
  return new Map(
    entries.map(([id, player]) => [id, player as unknown as DraftPlayer]),
  );
}

function currentPick(
  overrides: Partial<CurrentDraftPickInfo> = {},
): CurrentDraftPickInfo {
  return {
    draftId: 1,
    teamId: 1,
    round: 1,
    pickNumber: 1,
    overallPick: 1,
    isComplete: false,
    ...overrides,
  };
}

function renderBoard(
  props: Partial<React.ComponentProps<typeof DraftRoundBoard>> = {},
) {
  return render(
    <DraftRoundBoard
      teams={teams}
      picks={[]}
      currentPickInfo={null}
      myTeamId={null}
      statsLookup={new Map()}
      rounds={12}
      sport="baseball"
      onMakePick={jest.fn()}
      {...props}
    />,
  );
}

describe('DraftRoundBoard', () => {
  it('renders nothing when the league has no teams', () => {
    const { container } = renderBoard({ teams: [] });
    expect(container.textContent).toBe('');
  });

  // -------------------------------------------------------------------------
  // Round tabs — the phone board is round-scoped, not a sideways-scrolled grid
  // -------------------------------------------------------------------------

  it('renders a numbered tab per round', () => {
    renderBoard({ rounds: 12 });

    expect(screen.getByTestId('draft-round-board-tabs')).toBeTruthy();
    expect(screen.getByTestId('draft-round-board-tab-1')).toBeTruthy();
    expect(screen.getByTestId('draft-round-board-tab-12')).toBeTruthy();
    expect(screen.queryByTestId('draft-round-board-tab-13')).toBeNull();
  });

  it('opens on the round currently on the clock', () => {
    renderBoard({ currentPickInfo: currentPick({ round: 4 }) });

    expect(screen.getByText('Round 4')).toBeTruthy();
  });

  it('switches rounds when a tab is tapped', () => {
    renderBoard({ currentPickInfo: currentPick({ round: 4 }) });

    fireEvent.click(screen.getByTestId('draft-round-board-tab-7'));

    expect(screen.getByText('Round 7')).toBeTruthy();
  });

  it('renders twelve tiles for the selected round', () => {
    renderBoard();

    for (const team of teams) {
      expect(
        screen.getByTestId(`draft-round-board-tile-${team.id}`),
      ).toBeTruthy();
    }
  });

  // -------------------------------------------------------------------------
  // Round summary — position mix + snake direction
  // -------------------------------------------------------------------------

  it('summarises progress and the overall-pick range', () => {
    renderBoard({
      currentPickInfo: currentPick({ round: 2, teamId: 3 }),
      picks: [
        makePick({ round: 2, teamId: 1, playerId: 10, pickNumber: 12 }),
        makePick({
          id: '2',
          round: 2,
          teamId: 2,
          playerId: 11,
          pickNumber: 11,
        }),
      ],
      statsLookup: makeStats([
        [10, { name: 'Willie Mays', position: 'OF' }],
        [11, { name: 'Ozzie Smith', position: 'SS' }],
      ]),
    });

    expect(
      screen.getByTestId('draft-round-board-summary-progress').textContent,
    ).toBe('2 of 12 · #13–24');
  });

  it('renders a position-mix segment per drafted position', () => {
    renderBoard({
      currentPickInfo: currentPick(),
      picks: [
        makePick({ teamId: 1, playerId: 10 }),
        makePick({ id: '2', teamId: 2, playerId: 11 }),
        makePick({ id: '3', teamId: 3, playerId: 12 }),
      ],
      statsLookup: makeStats([
        [10, { name: 'Willie Mays', position: 'OF' }],
        [11, { name: 'Hank Aaron', position: 'OF' }],
        [12, { name: 'Ozzie Smith', position: 'SS' }],
      ]),
    });

    expect(screen.getByTestId('draft-round-board-mix')).toBeTruthy();
    expect(screen.getByTestId('draft-round-board-mix-OF')).toBeTruthy();
    expect(screen.getByTestId('draft-round-board-mix-SS')).toBeTruthy();
    expect(screen.getByText('2 OF')).toBeTruthy();
    expect(screen.getByText('1 SS')).toBeTruthy();
  });

  it('states the snake direction, reversing on even rounds', () => {
    // Round 2 is on the clock, so both round 1 (drafted) and round 2 (live)
    // have started — a round that has not started shows the lock notice
    // instead, which the next test covers.
    renderBoard({
      currentPickInfo: currentPick({ round: 2, teamId: 1 }),
      picks: [makePick({ round: 1, teamId: 1, playerId: 10, pickNumber: 1 })],
      statsLookup: makeStats([[10, { name: 'Willie Mays', position: 'OF' }]]),
    });

    expect(screen.getByTestId('draft-round-board-snake').textContent).toBe(
      'SNAKE RIGHT TO LEFT',
    );

    fireEvent.click(screen.getByTestId('draft-round-board-tab-1'));
    expect(screen.getByTestId('draft-round-board-snake').textContent).toBe(
      'SNAKE LEFT TO RIGHT',
    );
  });

  it('shows the unlock notice — not a mix bar — for a round that has not started', () => {
    renderBoard({ currentPickInfo: currentPick({ round: 2 }) });

    fireEvent.click(screen.getByTestId('draft-round-board-tab-9'));

    expect(screen.getByTestId('draft-round-board-locked').textContent).toBe(
      'UNLOCKS WHEN ROUND 8 COMPLETES',
    );
    expect(screen.queryByTestId('draft-round-board-mix')).toBeNull();
    expect(
      screen.getByTestId('draft-round-board-summary-progress').textContent,
    ).toBe('picks #97–108');
  });

  // -------------------------------------------------------------------------
  // Tile state matrix — mine / on-the-clock / upcoming / drafted
  // -------------------------------------------------------------------------

  it('renders the four tile states distinctly in one round', () => {
    renderBoard({
      myTeamId: 1,
      currentPickInfo: currentPick({ round: 1, teamId: 3 }),
      picks: [
        makePick({ teamId: 1, playerId: 10, pickNumber: 1 }),
        makePick({ id: '2', teamId: 2, playerId: 11, pickNumber: 2 }),
      ],
      statsLookup: makeStats([
        [10, { name: 'Willie Mays', position: 'OF', club: 'SFG' }],
        [11, { name: 'Ozzie Smith', position: 'SS', club: 'STL' }],
      ]),
    });

    // mine — the viewer's own completed pick
    expect(
      screen.getByLabelText('Team 1, pick 1.01, Willie Mays, OF — your pick'),
    ).toBeTruthy();
    // drafted — another team's completed pick
    expect(
      screen.getByLabelText('Team 2, pick 1.02, Ozzie Smith, SS'),
    ).toBeTruthy();
    // on-the-clock — another team's live pick
    expect(
      screen.getByLabelText('Team 3, pick 1.03, on the clock'),
    ).toBeTruthy();
    // upcoming — not yet reached
    expect(screen.getByLabelText('Team 4, pick 1.04, upcoming')).toBeTruthy();
  });

  it("labels the viewer's own turn distinctly from another team's", () => {
    renderBoard({
      myTeamId: 5,
      currentPickInfo: currentPick({ round: 1, teamId: 5 }),
    });

    expect(
      screen.getByLabelText('Team 5, pick 1.05, your pick — on the clock'),
    ).toBeTruthy();
  });

  it('leads the tile with the player name and carries position as a tag', () => {
    renderBoard({
      currentPickInfo: currentPick(),
      picks: [makePick({ teamId: 1, playerId: 10 })],
      statsLookup: makeStats([
        [10, { name: 'Willie Mays', position: 'OF', club: 'SFG' }],
      ]),
    });

    expect(
      screen.getByTestId('draft-round-board-tile-1-name').textContent,
    ).toBe('Willie Mays');
    expect(screen.getByText('OF · SFG')).toBeTruthy();
  });

  it('renders the position alone when the player has no club on file', () => {
    renderBoard({
      currentPickInfo: currentPick(),
      picks: [makePick({ teamId: 1, playerId: 10 })],
      statsLookup: makeStats([[10, { name: 'Cy Young', position: 'P' }]]),
    });

    expect(screen.getByText('P')).toBeTruthy();
  });

  it('marks upcoming tiles with their snake pick number', () => {
    renderBoard({ currentPickInfo: currentPick({ round: 2, teamId: 12 }) });

    // Round 2 reverses: team 1 picks last.
    expect(screen.getByLabelText('Team 1, pick 2.12, upcoming')).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Make-pick routing
  // -------------------------------------------------------------------------

  it('fires onMakePick when the viewer taps their own on-the-clock tile', () => {
    const onMakePick = jest.fn();
    renderBoard({
      myTeamId: 2,
      currentPickInfo: currentPick({ round: 1, teamId: 2 }),
      onMakePick,
    });

    fireEvent.click(
      screen.getByLabelText('Team 2, pick 1.02, your pick — on the clock'),
    );

    expect(onMakePick).toHaveBeenCalledTimes(1);
  });

  it("does not fire onMakePick for another team's on-the-clock tile", () => {
    const onMakePick = jest.fn();
    renderBoard({
      myTeamId: 5,
      currentPickInfo: currentPick({ round: 1, teamId: 2 }),
      onMakePick,
    });

    fireEvent.click(screen.getByLabelText('Team 2, pick 1.02, on the clock'));

    expect(onMakePick).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Pick inspector (LS-10163)
  // -------------------------------------------------------------------------

  it("opens the pick inspector for another team's on-the-clock tile instead of firing onMakePick", () => {
    renderBoard({
      myTeamId: 5,
      currentPickInfo: currentPick({ round: 1, teamId: 2 }),
    });

    fireEvent.click(screen.getByLabelText('Team 2, pick 1.02, on the clock'));

    expect(
      screen.getByTestId('draft-round-board-pick-inspector-title').textContent,
    ).toBe('On the clock');
  });

  it('opens the pick inspector for an upcoming tile', () => {
    renderBoard({
      myTeamId: 5,
      currentPickInfo: currentPick({ round: 1, teamId: 2 }),
    });

    fireEvent.click(screen.getByLabelText('Team 4, pick 1.04, upcoming'));

    expect(
      screen.getByTestId('draft-round-board-pick-inspector-title').textContent,
    ).toBe('Not yet made');
  });

  it('opens the pick inspector for a made tile, not onMakePick', () => {
    const onMakePick = jest.fn();
    renderBoard({
      myTeamId: 5,
      picks: [makePick({ round: 1, teamId: 1, playerId: 1 })],
      onMakePick,
    });

    fireEvent.click(screen.getByTestId('draft-round-board-tile-1'));

    expect(onMakePick).not.toHaveBeenCalled();
    expect(screen.getByTestId('draft-round-board-pick-inspector')).toBeTruthy();
  });

  it('still fires onMakePick — not the inspector — for the viewer’s own on-the-clock tile', () => {
    const onMakePick = jest.fn();
    renderBoard({
      myTeamId: 1,
      currentPickInfo: currentPick({ round: 1, teamId: 1 }),
      onMakePick,
    });

    fireEvent.click(screen.getByTestId('draft-round-board-tile-1'));

    expect(onMakePick).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('draft-round-board-pick-inspector')).toBeNull();
  });

  it('closes the inspector via the close control', () => {
    renderBoard({
      myTeamId: 5,
      currentPickInfo: currentPick({ round: 1, teamId: 2 }),
    });

    fireEvent.click(screen.getByLabelText('Team 2, pick 1.02, on the clock'));
    fireEvent.click(
      screen.getByTestId('draft-round-board-pick-inspector-close'),
    );

    expect(screen.queryByTestId('draft-round-board-pick-inspector')).toBeNull();
  });

  it('activates a round tab from the keyboard', () => {
    renderBoard({ currentPickInfo: currentPick({ round: 1 }) });

    const tab = screen.getByTestId('draft-round-board-tab-6');
    expect(tab.getAttribute('tabindex')).toBe('0');

    fireEvent.keyDown(tab, { key: 'Enter' });

    expect(screen.getByText('Round 6')).toBeTruthy();
  });

  it("activates the viewer's own on-the-clock tile from the keyboard", () => {
    const onMakePick = jest.fn();
    renderBoard({
      myTeamId: 2,
      currentPickInfo: currentPick({ round: 1, teamId: 2 }),
      onMakePick,
    });

    const tile = screen.getByLabelText(
      'Team 2, pick 1.02, your pick — on the clock',
    );
    expect(tile.getAttribute('tabindex')).toBe('0');

    fireEvent.keyDown(tile, { key: ' ' });

    expect(onMakePick).toHaveBeenCalledTimes(1);
  });

  it('keeps every tile in the tab order — non-actionable ones open the pick inspector (LS-10163)', () => {
    renderBoard({
      myTeamId: 5,
      currentPickInfo: currentPick({ round: 1, teamId: 2 }),
    });

    expect(
      screen
        .getByLabelText('Team 2, pick 1.02, on the clock')
        .getAttribute('tabindex'),
    ).toBe('0');
    expect(
      screen
        .getByLabelText('Team 4, pick 1.04, upcoming')
        .getAttribute('tabindex'),
    ).toBe('0');
  });

  // -------------------------------------------------------------------------
  // Sport awareness — the same structure, both sports
  // -------------------------------------------------------------------------

  it.each([
    [
      'baseball' as const,
      [
        { id: 10, name: 'Willie Mays', position: 'OF', club: 'SFG' },
        { id: 11, name: 'Cy Young', position: 'P', club: 'BOS' },
      ],
    ],
    [
      'football' as const,
      [
        { id: 10, name: 'Jerry Rice', position: 'WR', club: 'SFO' },
        { id: 11, name: 'Tom Brady', position: 'QB', club: 'NWE' },
      ],
    ],
  ])('renders the round view for %s', (sport, players) => {
    renderBoard({
      sport,
      myTeamId: 1,
      currentPickInfo: currentPick({ round: 1, teamId: 3 }),
      picks: players.map((player, index) =>
        makePick({
          id: String(index + 1),
          teamId: index + 1,
          playerId: player.id,
          pickNumber: index + 1,
        }),
      ),
      statsLookup: makeStats(
        players.map((player) => [
          player.id,
          { name: player.name, position: player.position, club: player.club },
        ]),
      ),
    });

    // Player leads the tile in both sports.
    expect(
      screen.getByTestId('draft-round-board-tile-1-name').textContent,
    ).toBe(players[0].name);
    // Position mix keys off the sport's own position vocabulary.
    expect(screen.getByText(`1 ${players[0].position}`)).toBeTruthy();
    expect(screen.getByText(`1 ${players[1].position}`)).toBeTruthy();
    expect(
      screen.getByTestId(`draft-round-board-mix-${players[0].position}`),
    ).toBeTruthy();
    // The full state matrix is present in both sports.
    expect(
      screen.getByLabelText(
        `Team 1, pick 1.01, ${players[0].name}, ${players[0].position} — your pick`,
      ),
    ).toBeTruthy();
    expect(
      screen.getByLabelText(
        `Team 2, pick 1.02, ${players[1].name}, ${players[1].position}`,
      ),
    ).toBeTruthy();
    expect(
      screen.getByLabelText('Team 3, pick 1.03, on the clock'),
    ).toBeTruthy();
    expect(screen.getByLabelText('Team 4, pick 1.04, upcoming')).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Following the clock
  // -------------------------------------------------------------------------

  it('follows the clock into a new round', () => {
    const { rerender } = renderBoard({
      currentPickInfo: currentPick({ round: 1 }),
    });
    expect(screen.getByText('Round 1')).toBeTruthy();

    rerender(
      <DraftRoundBoard
        teams={teams}
        picks={[]}
        currentPickInfo={currentPick({ round: 2 })}
        myTeamId={null}
        statsLookup={new Map()}
        rounds={12}
        sport="baseball"
        onMakePick={jest.fn()}
      />,
    );

    expect(screen.getByText('Round 2')).toBeTruthy();
  });

  it('leaves a hand-picked round alone until the clock moves on', () => {
    const props = {
      teams,
      picks: [],
      currentPickInfo: currentPick({ round: 5 }),
      myTeamId: null,
      statsLookup: new Map<number, DraftPlayer>(),
      rounds: 12,
      sport: 'baseball' as const,
      onMakePick: jest.fn(),
    };
    const { rerender } = render(<DraftRoundBoard {...props} />);

    fireEvent.click(screen.getByTestId('draft-round-board-tab-2'));
    expect(screen.getByText('Round 2')).toBeTruthy();

    // A re-render that does not move the clock must not yank the browsed
    // round away from the viewer.
    rerender(<DraftRoundBoard {...props} picks={[makePick({ round: 5 })]} />);

    expect(screen.getByText('Round 2')).toBeTruthy();
  });

  it('opens on the last drafted round once the draft is complete', () => {
    renderBoard({
      rounds: 12,
      currentPickInfo: currentPick({ round: 12, isComplete: true }),
      picks: [makePick({ round: 12, teamId: 1, playerId: 10, pickNumber: 12 })],
      statsLookup: makeStats([[10, { name: 'Willie Mays', position: 'OF' }]]),
    });

    expect(screen.getByText('Round 12')).toBeTruthy();
  });
});
