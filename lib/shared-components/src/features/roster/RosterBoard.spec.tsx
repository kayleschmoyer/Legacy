import React from 'react';
import { LOGGER } from '@legacy-sports/logging';
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

  // ── Blocked-placement reason (LS-9768) ─────────────────────────────────────

  it('shows a reason banner when the selected player is not eligible for the tapped slot', () => {
    render(
      <RosterBoard
        positions={POSITIONS}
        teamPlayers={PLAYERS}
        onPlayerAssign={noop}
        onPlayerRemove={noop}
      />,
    );
    // Nolan Ryan (SP-only) can't play the empty 1B slot.
    fireEvent.click(screen.getByRole('button', { name: /Nolan Ryan — bench/ }));
    fireEvent.click(
      screen.getByRole('button', { name: /1st Base.*open slot/i }),
    );
    expect(
      screen.getByText(
        "Nolan Ryan is only eligible for SP — can't be placed at 1st Base.",
      ),
    ).toBeTruthy();
  });

  it('does not fire onPlayerAssign for a position-mismatched placement', () => {
    const onPlayerAssign = jest.fn();
    render(
      <RosterBoard
        positions={POSITIONS}
        teamPlayers={PLAYERS}
        onPlayerAssign={onPlayerAssign}
        onPlayerRemove={noop}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Nolan Ryan — bench/ }));
    fireEvent.click(
      screen.getByRole('button', { name: /1st Base.*open slot/i }),
    );
    expect(onPlayerAssign).not.toHaveBeenCalled();
  });

  it('dismisses the blocked-reason banner', () => {
    render(
      <RosterBoard
        positions={POSITIONS}
        teamPlayers={PLAYERS}
        onPlayerAssign={noop}
        onPlayerRemove={noop}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Nolan Ryan — bench/ }));
    fireEvent.click(
      screen.getByRole('button', { name: /1st Base.*open slot/i }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText(/Nolan Ryan is only eligible for SP/)).toBeNull();
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

  // ── Row-menu keyboard activation (LS-10719) ────────────────────────────────

  describe.each([
    ['Enter', 'Enter'],
    ['Space', ' '],
  ])('row-menu items activate on %s (LS-10719)', (_name, key) => {
    it('quick-swap assigns into an empty slot', () => {
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
      fireEvent.click(screen.getByRole('button', { name: 'Quick swap SP' }));
      fireEvent.keyDown(
        screen.getByRole('button', { name: 'Assign Nolan Ryan to SP' }),
        { key },
      );
      expect(onPlayerAssign).toHaveBeenCalledTimes(1);
      expect(onPlayerAssign.mock.calls[0]?.[0].id).toBe(103);
      expect(onPlayerAssign.mock.calls[0]?.[1].id).toBe(3);
    });

    it('quick-swap swaps into an occupied slot', () => {
      const onPlayerSwap = jest.fn<
        void,
        [RosterBoardPlayer, RosterBoardPosition, RosterBoardPlayer]
      >();
      render(
        <RosterBoard
          positions={POSITIONS}
          teamPlayers={[
            mk(101, 'Mike', 'Johnson', ['C'], 1),
            mk(102, 'Wade', 'Boggs', ['C', '1B'], null),
          ]}
          onPlayerAssign={noop}
          onPlayerRemove={noop}
          onPlayerSwap={onPlayerSwap}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Quick swap C' }));
      fireEvent.keyDown(
        screen.getByRole('button', { name: 'Swap in Wade Boggs at C' }),
        { key },
      );
      expect(onPlayerSwap).toHaveBeenCalledTimes(1);
      expect(onPlayerSwap.mock.calls[0]?.[0].id).toBe(102);
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
      fireEvent.keyDown(
        screen.getByRole('button', { name: 'Move Mike Johnson to bench' }),
        { key },
      );
      expect(onPlayerRemove).toHaveBeenCalledTimes(1);
      expect(onPlayerRemove.mock.calls[0]?.[0].id).toBe(1);
    });

    it('overflow menu opens player details', () => {
      const onPlayerPress = jest.fn<void, [RosterBoardPlayer]>();
      render(
        <RosterBoard
          positions={POSITIONS}
          teamPlayers={PLAYERS}
          onPlayerAssign={noop}
          onPlayerRemove={noop}
          onPlayerPress={onPlayerPress}
        />,
      );
      fireEvent.click(
        screen.getByRole('button', { name: 'More actions for Mike Johnson' }),
      );
      fireEvent.keyDown(
        screen.getByRole('button', { name: 'View Mike Johnson details' }),
        { key },
      );
      expect(onPlayerPress).toHaveBeenCalledTimes(1);
      expect(onPlayerPress.mock.calls[0]?.[0].id).toBe(101);
    });
  });

  it('row-menu items ignore unrelated keys (LS-10719)', () => {
    const onPlayerAssign = jest.fn();
    render(
      <RosterBoard
        positions={POSITIONS}
        teamPlayers={PLAYERS}
        onPlayerAssign={onPlayerAssign}
        onPlayerRemove={noop}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Quick swap SP' }));
    fireEvent.keyDown(
      screen.getByRole('button', { name: 'Assign Nolan Ryan to SP' }),
      { key: 'a' },
    );
    expect(onPlayerAssign).not.toHaveBeenCalled();
  });

  // ── Salary cap column (LS-6338) ──────────────────────────────────────────

  it('renders each player salary when salaryCapEnabled is true', () => {
    const playersWithSalary: RosterBoardPlayer[] = [
      { ...mk(101, 'Mike', 'Johnson', ['C'], 1), salary: 4500000 },
      { ...mk(102, 'Wade', 'Boggs', ['1B'], null), salary: 1200000 },
    ];
    render(
      <RosterBoard
        positions={POSITIONS}
        teamPlayers={playersWithSalary}
        onPlayerAssign={noop}
        onPlayerRemove={noop}
        salaryCapEnabled
      />,
    );
    expect(screen.getByText('$4,500,000')).toBeTruthy();
    expect(screen.getByText('$1,200,000')).toBeTruthy();
  });

  it('hides player salary when salaryCapEnabled is false or omitted', () => {
    const playersWithSalary: RosterBoardPlayer[] = [
      { ...mk(101, 'Mike', 'Johnson', ['C'], 1), salary: 4500000 },
    ];
    render(
      <RosterBoard
        positions={POSITIONS}
        teamPlayers={playersWithSalary}
        onPlayerAssign={noop}
        onPlayerRemove={noop}
      />,
    );
    expect(screen.queryByText('$4,500,000')).toBeNull();
  });

  describe('bye-week warning (LS-6334)', () => {
    const FOOTBALL_POSITIONS: RosterBoardPosition[] = [
      { id: 1, positionType: 'QB' },
      { id: 2, positionType: 'RB' },
    ];
    const mkFootball = (
      id: number,
      firstName: string,
      lastName: string,
      nflTeam: string,
      positionId: number | null,
    ): RosterBoardPlayer => ({
      id,
      positionId,
      player: { firstName, lastName, eligiblePositions: ['QB'], nflTeam },
    });
    const FOOTBALL_PLAYERS: RosterBoardPlayer[] = [
      mkFootball(201, 'Pat', 'Mahomes', 'KC', 1), // starter, team on bye
      mkFootball(202, 'Josh', 'Allen', 'BUF', 2), // starter, team not on bye
      mkFootball(203, 'Bench', 'Guy', 'KC', null), // bench, team on bye
    ];

    it('shows the "On Bye Week" chip next to a starter whose team is on bye', () => {
      render(
        <RosterBoard
          sport="football"
          positions={FOOTBALL_POSITIONS}
          teamPlayers={FOOTBALL_PLAYERS}
          onPlayerAssign={noop}
          onPlayerRemove={noop}
          currentWeek={6}
          byeWeeksByTeam={{ KC: 6, BUF: 12 }}
        />,
      );
      expect(screen.getByText('On Bye Week')).toBeTruthy();
      expect(
        screen.getByRole('button', {
          name: 'Pat Mahomes at QB — on bye week',
        }),
      ).toBeTruthy();
    });

    it('does not show the chip for a starter whose team is not on bye this week', () => {
      render(
        <RosterBoard
          sport="football"
          positions={FOOTBALL_POSITIONS}
          teamPlayers={FOOTBALL_PLAYERS}
          onPlayerAssign={noop}
          onPlayerRemove={noop}
          currentWeek={6}
          byeWeeksByTeam={{ KC: 6, BUF: 12 }}
        />,
      );
      expect(
        screen.getByRole('button', { name: 'Josh Allen at RB' }),
      ).toBeTruthy();
    });

    it('does not show the chip when sport is baseball, even with matching bye data', () => {
      render(
        <RosterBoard
          positions={FOOTBALL_POSITIONS}
          teamPlayers={FOOTBALL_PLAYERS}
          onPlayerAssign={noop}
          onPlayerRemove={noop}
          currentWeek={6}
          byeWeeksByTeam={{ KC: 6, BUF: 12 }}
        />,
      );
      expect(screen.queryByText('On Bye Week')).toBeNull();
    });

    it('only warns on the starter slot, not the bench copy of a bye-week player', () => {
      render(
        <RosterBoard
          sport="football"
          positions={FOOTBALL_POSITIONS}
          teamPlayers={FOOTBALL_PLAYERS}
          onPlayerAssign={noop}
          onPlayerRemove={noop}
          currentWeek={6}
          byeWeeksByTeam={{ KC: 6 }}
        />,
      );
      expect(screen.getAllByText('On Bye Week')).toHaveLength(1);
    });
  });

  describe('stable testIDs on interactive rows and controls (LS-9654)', () => {
    // Mirrors the MatchupRosterEditorView `data-testid` regression test
    // (LS-4133): Tamagui drops `data-testid` on animated XStacks with
    // onPress in Chromium, so the slot/bench rows use the same web-only
    // `<div>` wrapper workaround. This test fails immediately if that
    // wrapper (or the `testID` prop) is ever removed.
    it('emits data-testid="roster-slot-{positionId}" on lineup slot rows', () => {
      const { container } = render(
        <RosterBoard
          positions={POSITIONS}
          teamPlayers={PLAYERS}
          onPlayerAssign={noop}
          onPlayerRemove={noop}
        />,
      );
      expect(
        container.querySelector('[data-testid="roster-slot-1"]'),
      ).not.toBeNull();
    });

    it('emits data-testid="roster-bench-{playerId}" on bench rows', () => {
      const { container } = render(
        <RosterBoard
          positions={POSITIONS}
          teamPlayers={PLAYERS}
          onPlayerAssign={noop}
          onPlayerRemove={noop}
        />,
      );
      expect(
        container.querySelector('[data-testid="roster-bench-102"]'),
      ).not.toBeNull();
    });

    it('emits data-testid="roster-cancel-selection" on the cancel control', () => {
      const { container } = render(
        <RosterBoard
          positions={POSITIONS}
          teamPlayers={PLAYERS}
          onPlayerAssign={noop}
          onPlayerRemove={noop}
        />,
      );
      fireEvent.click(
        screen.getByRole('button', { name: /Wade Boggs — bench/ }),
      );
      expect(
        container.querySelector('[data-testid="roster-cancel-selection"]'),
      ).not.toBeNull();
    });

    it('emits data-testid="roster-move-to-bench" when a starter is selected', () => {
      const { container } = render(
        <RosterBoard
          positions={POSITIONS}
          teamPlayers={PLAYERS}
          onPlayerAssign={noop}
          onPlayerRemove={noop}
        />,
      );
      fireEvent.click(
        screen.getByRole('button', { name: /Mike Johnson at C/ }),
      );
      expect(
        container.querySelector('[data-testid="roster-move-to-bench"]'),
      ).not.toBeNull();
    });
  });

  describe('duplicate positionId defensive logging (LS-6439)', () => {
    it('logs both player IDs, the shared positionId, and the team when two team_members rows share a positionId', () => {
      const warnSpy = jest.spyOn(LOGGER, 'warn').mockImplementation();
      const duplicatePlayers: RosterBoardPlayer[] = [
        mk(101, 'Mike', 'Johnson', ['C'], 1),
        mk(999, 'Ghost', 'Player', ['C'], 1), // corrupt seed: same positionId as 101
      ];

      render(
        <RosterBoard
          positions={POSITIONS}
          teamPlayers={duplicatePlayers}
          onPlayerAssign={noop}
          onPlayerRemove={noop}
          teamId={42}
        />,
      );

      expect(warnSpy).toHaveBeenCalledWith(
        'Duplicate positionId in team roster',
        expect.objectContaining({
          teamId: 42,
          positionId: 1,
          overwrittenPlayerId: 101,
          newPlayerId: 999,
        }),
      );
      warnSpy.mockRestore();
    });

    it('still resolves the slot to exactly one entry (the later row) despite the collision', () => {
      const warnSpy = jest.spyOn(LOGGER, 'warn').mockImplementation();
      const duplicatePlayers: RosterBoardPlayer[] = [
        mk(101, 'Mike', 'Johnson', ['C'], 1),
        mk(999, 'Ghost', 'Player', ['C'], 1),
      ];

      render(
        <RosterBoard
          positions={POSITIONS}
          teamPlayers={duplicatePlayers}
          onPlayerAssign={noop}
          onPlayerRemove={noop}
        />,
      );

      expect(screen.getByText('Ghost Player')).toBeTruthy();
      expect(screen.queryByText('Mike Johnson')).toBeNull();
      warnSpy.mockRestore();
    });

    it('does not log when no positionId collision exists', () => {
      const warnSpy = jest.spyOn(LOGGER, 'warn').mockImplementation();

      render(
        <RosterBoard
          positions={POSITIONS}
          teamPlayers={PLAYERS}
          onPlayerAssign={noop}
          onPlayerRemove={noop}
        />,
      );

      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });
});
