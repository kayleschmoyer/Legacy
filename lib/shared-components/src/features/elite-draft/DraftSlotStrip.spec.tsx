import React from 'react';
import { DraftSlotStrip } from './DraftSlotStrip';
import { DraftTeamTab } from './DraftTeamTab';
import type { DraftPickRecord, DraftPlayer } from './types';
import { render } from '../../test-utils';

function makePlayer(id: number, name: string, position: string): DraftPlayer {
  return {
    id,
    name,
    position,
    eligiblePositions: [position],
    avg: 0,
    hr: 0,
    rbi: 0,
    runs: 0,
    sb: 0,
    games: 0,
    hits: 0,
    obp: 0,
    slg: 0,
  };
}

// Real league slot types (`ALLOWED_POSITIONS_BY_SPORT.football`): the team
// defense slot is 'DST', not the design's display-only 'DEF' label.
const FOOTBALL_POSITIONS = [
  'QB',
  'RB',
  'RB',
  'WR',
  'WR',
  'TE',
  'FLEX',
  'K',
  'DST',
].map((positionType) => ({ positionType }));

/** A stat position that actually fills the given slot — FLEX takes an RB. */
function fillerFor(positionType: string): string {
  return positionType === 'FLEX' ? 'RB' : positionType;
}

const MAX_ROSTER_SIZE = 12;

describe('DraftSlotStrip', () => {
  it('renders one chip per roster slot in lineup order', () => {
    const { getAllByLabelText, getByText } = render(
      <DraftSlotStrip
        leaguePositions={FOOTBALL_POSITIONS}
        players={[]}
        sport="football"
        maxRosterSize={MAX_ROSTER_SIZE}
      />,
    );

    // 9 starters + 3 bench.
    expect(getAllByLabelText(/— open/)).toHaveLength(MAX_ROSTER_SIZE);
    expect(getByText('0 / 12 slots')).toBeTruthy();
  });

  it('shows a monogram for filled slots and advances the counter', () => {
    const { getByText, getByLabelText } = render(
      <DraftSlotStrip
        leaguePositions={FOOTBALL_POSITIONS}
        players={[makePlayer(1, 'Patrick Mahomes', 'QB')]}
        sport="football"
        maxRosterSize={MAX_ROSTER_SIZE}
      />,
    );

    expect(getByLabelText('QB — Patrick Mahomes')).toBeTruthy();
    expect(getByText('PM')).toBeTruthy();
    expect(getByText('1 / 12 slots')).toBeTruthy();
  });

  it('calls out exactly one priority hole — the first open starter', () => {
    const { getAllByLabelText } = render(
      <DraftSlotStrip
        leaguePositions={FOOTBALL_POSITIONS}
        players={[makePlayer(1, 'Patrick Mahomes', 'QB')]}
        sport="football"
        maxRosterSize={MAX_ROSTER_SIZE}
      />,
    );

    const priority = getAllByLabelText(/— open, priority$/);
    expect(priority).toHaveLength(1);
    expect(priority[0].getAttribute('aria-label')).toBe('RB — open, priority');
  });

  it('never nominates a bench slot as the priority hole', () => {
    const starters = FOOTBALL_POSITIONS.map((p, i) =>
      makePlayer(i + 1, `Player ${i + 1}`, fillerFor(p.positionType)),
    );
    const { queryAllByLabelText, getAllByLabelText } = render(
      <DraftSlotStrip
        leaguePositions={FOOTBALL_POSITIONS}
        players={starters}
        sport="football"
        maxRosterSize={MAX_ROSTER_SIZE}
      />,
    );

    expect(queryAllByLabelText(/— open, priority$/)).toHaveLength(0);
    // The three bench slots stay plainly open.
    expect(getAllByLabelText('BN — open')).toHaveLength(3);
  });
});

// LS-10004: "Mirrors the depth chart counts exactly so the two views can never
// disagree." `rosterSlots.spec.ts` proves the shared derivation is lossless;
// this proves both *rendered* views actually consume it, so a regression that
// re-derives occupancy in one of them is caught at the component boundary.
describe('slot strip / depth chart rendered parity', () => {
  const players = [
    makePlayer(1, 'Patrick Mahomes', 'QB'),
    makePlayer(2, 'Tyreek Hill', 'WR'),
    makePlayer(3, 'Travis Kelce', 'TE'),
  ];
  const pickHistory: DraftPickRecord[] = players.map((p, i) => ({
    id: `pick-${p.id}`,
    draftId: 1,
    round: i + 1,
    pickNumber: 1,
    overallPick: i + 1,
    pickedAt: '2026-08-01T00:00:00Z',
    teamId: 7,
    playerId: p.id,
  }));

  it('renders the same slot sequence as the depth-chart Team tab', () => {
    const strip = render(
      <DraftSlotStrip
        leaguePositions={FOOTBALL_POSITIONS}
        players={players}
        sport="football"
        maxRosterSize={MAX_ROSTER_SIZE}
      />,
    );
    const stripSlots = strip
      .getAllByTestId('draft-slot-chip')
      .map((el) => el.getAttribute('data-pos'));

    const teamTab = render(
      <DraftTeamTab
        teams={[{ id: 7, name: 'My Team' }]}
        myTeamId={7}
        selectedTeamId={null}
        onSelectTeam={() => undefined}
        pickHistory={pickHistory}
        statsLookup={new Map(players.map((p) => [p.id, p]))}
        leaguePositions={FOOTBALL_POSITIONS}
        sport="football"
        maxRosterSize={MAX_ROSTER_SIZE}
      />,
    );
    const depthChartRows = teamTab.getAllByTestId('draft-roster-slot-row');

    // Same number of slots on both surfaces, and the same number filled:
    // the depth chart writes "Empty" into every open row.
    expect(stripSlots).toHaveLength(MAX_ROSTER_SIZE);
    expect(depthChartRows).toHaveLength(MAX_ROSTER_SIZE);

    const depthChartFilled = depthChartRows.filter(
      (el) => !el.textContent?.includes('Empty'),
    ).length;
    expect(depthChartFilled).toBe(players.length);
    expect(
      strip.getByText(`${players.length} / ${MAX_ROSTER_SIZE} slots`),
    ).toBeTruthy();

    // And the same slot *sequence* — each depth chart row leads with the same
    // slot label as the chip at that index, in lineup order.
    stripSlots.forEach((label, i) => {
      expect(depthChartRows[i].textContent ?? '').toMatch(
        new RegExp(`^${label}`),
      );
    });
  });
});
