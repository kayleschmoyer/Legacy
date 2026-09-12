import React from 'react';
import { fireEvent } from '@testing-library/react';

import {
  DraftSquadStrip,
  openSlotsSummary,
  ROSTER_SET_LABEL,
} from './DraftSquadStrip';
import { buildRosterSlotInstances, openStarterSlotLabels } from './rosterSlots';
import type { DraftPlayer } from './types';
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
const FOOTBALL_POSITIONS = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE'].map(
  (positionType) => ({ positionType }),
);

const MAX_ROSTER_SIZE = 8;

describe('DraftSquadStrip', () => {
  it('renders one chip per roster slot, in lineup order', () => {
    const { getAllByTestId } = render(
      <DraftSquadStrip
        leaguePositions={FOOTBALL_POSITIONS}
        players={[]}
        sport="football"
        maxRosterSize={MAX_ROSTER_SIZE}
        onOpen={jest.fn()}
      />,
    );

    // Derivation is shared with the Team tab and the desktop strip — assert
    // against it rather than a hand-counted literal, so a league-config change
    // can never make this spec and the component disagree.
    const expected = buildRosterSlotInstances(
      FOOTBALL_POSITIONS,
      [],
      'football',
      MAX_ROSTER_SIZE,
    );
    expect(getAllByTestId('draft-slot-chip')).toHaveLength(expected.length);
  });

  it('shows the filled/total count', () => {
    const { getByTestId } = render(
      <DraftSquadStrip
        leaguePositions={FOOTBALL_POSITIONS}
        players={[makePlayer(1, 'Joe Montana', 'QB')]}
        sport="football"
        maxRosterSize={MAX_ROSTER_SIZE}
        onOpen={jest.fn()}
      />,
    );

    expect(getByTestId('draft-squad-strip-count')).toHaveTextContent(
      'Positions drafted · 1/8',
    );
  });

  it('marks filled slots, the next priority hole, and plain open slots', () => {
    const { getAllByTestId } = render(
      <DraftSquadStrip
        leaguePositions={FOOTBALL_POSITIONS}
        players={[makePlayer(1, 'Joe Montana', 'QB')]}
        sport="football"
        maxRosterSize={MAX_ROSTER_SIZE}
        onOpen={jest.fn()}
      />,
    );

    const states = getAllByTestId('draft-slot-chip').map((chip) =>
      chip.getAttribute('data-state'),
    );
    // QB filled, then the first open starter (RB) is the gold priority hole,
    // and everything after it is a plain open slot.
    expect(states[0]).toBe('filled');
    expect(states[1]).toBe('need');
    expect(states.filter((s) => s === 'need')).toHaveLength(1);
    expect(states[2]).toBe('open');
  });

  it('summarises the open starter slots and opens the sheet when tapped', () => {
    const onOpen = jest.fn();
    const { getByTestId } = render(
      <DraftSquadStrip
        leaguePositions={FOOTBALL_POSITIONS}
        players={[makePlayer(1, 'Joe Montana', 'QB')]}
        sport="football"
        maxRosterSize={MAX_ROSTER_SIZE}
        onOpen={onOpen}
      />,
    );

    const open = getByTestId('draft-squad-strip-open');
    // Deduplicated: two RB and two WR slots are open, but each reads once.
    expect(open).toHaveAttribute(
      'aria-label',
      expect.stringContaining('Open slots: RB, WR, TE'),
    );

    fireEvent.click(open);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  // The design marks both `.hd .open` and `.sb-track` as `data-sheet-open`,
  // and AC3 is "tapping it expands the full squad sheet" — the chips are the
  // obvious thing to tap, so they open it too.
  it('also opens the sheet when the chip track is tapped', () => {
    const onOpen = jest.fn();
    const { getByTestId } = render(
      <DraftSquadStrip
        leaguePositions={FOOTBALL_POSITIONS}
        players={[]}
        sport="football"
        maxRosterSize={MAX_ROSTER_SIZE}
        onOpen={onOpen}
      />,
    );

    fireEvent.click(getByTestId('draft-squad-strip-track'));

    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  // The chips are how a screen-reader user reads the roster, so the track must
  // not be hidden from the accessibility tree to suppress its press target.
  it('keeps each chip individually announced', () => {
    const { getByLabelText } = render(
      <DraftSquadStrip
        leaguePositions={FOOTBALL_POSITIONS}
        players={[makePlayer(1, 'Joe Montana', 'QB')]}
        sport="football"
        maxRosterSize={MAX_ROSTER_SIZE}
        onOpen={jest.fn()}
      />,
    );

    expect(getByLabelText('QB — Joe Montana')).toBeTruthy();
    expect(getByLabelText('RB — open, priority')).toBeTruthy();
  });

  it('reads "Roster set" once every starter slot is filled', () => {
    const players = [
      makePlayer(1, 'Joe Montana', 'QB'),
      makePlayer(2, 'Barry Sanders', 'RB'),
      makePlayer(3, 'Emmitt Smith', 'RB'),
      makePlayer(4, 'Jerry Rice', 'WR'),
      makePlayer(5, 'Randy Moss', 'WR'),
      makePlayer(6, 'Tony Gonzalez', 'TE'),
    ];
    const { getByTestId } = render(
      <DraftSquadStrip
        leaguePositions={FOOTBALL_POSITIONS}
        players={players}
        sport="football"
        maxRosterSize={MAX_ROSTER_SIZE}
        onOpen={jest.fn()}
      />,
    );

    expect(getByTestId('draft-squad-strip-open')).toHaveAttribute(
      'aria-label',
      expect.stringContaining(ROSTER_SET_LABEL),
    );
  });

  describe('openStarterSlotLabels', () => {
    it('excludes bench slots — "bench" is not a need you draft for', () => {
      // Every starter filled, so only the synthetic BENCH overflow is open.
      const players = [
        makePlayer(1, 'Joe Montana', 'QB'),
        makePlayer(2, 'Barry Sanders', 'RB'),
        makePlayer(3, 'Emmitt Smith', 'RB'),
        makePlayer(4, 'Jerry Rice', 'WR'),
        makePlayer(5, 'Randy Moss', 'WR'),
        makePlayer(6, 'Tony Gonzalez', 'TE'),
      ];
      const slots = buildRosterSlotInstances(
        FOOTBALL_POSITIONS,
        players,
        'football',
        MAX_ROSTER_SIZE,
      );

      expect(slots.some((s) => s.isBench && s.player == null)).toBe(true);
      expect(openStarterSlotLabels(slots)).toEqual([]);
    });
  });

  describe('openSlotsSummary', () => {
    it('falls back to the roster-set label on an empty list', () => {
      expect(openSlotsSummary([])).toBe(ROSTER_SET_LABEL);
    });

    it('joins labels in the order given', () => {
      expect(openSlotsSummary(['RB', 'WR'])).toBe('Open slots: RB, WR');
    });
  });
});
