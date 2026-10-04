import React from 'react';

import { DraftBoardTimeline } from './DraftBoardTimeline';
import { getPositionColor } from './utils';
import type {
  CurrentDraftPickInfo,
  DraftPickRecord,
  DraftPlayer,
  LeagueTeam,
} from './types';
import { fireEvent, render } from '../../test-utils';

// jsdom normalizes inline hex colors to `rgb(r, g, b)` when read back.
const hexToRgb = (hex: string): string => {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

const TEAMS: LeagueTeam[] = [
  { id: '1', name: 'Bronx Bombers', leagueId: 1 },
  { id: '2', name: 'Sandlot Swingers', leagueId: 1 },
  { id: '3', name: 'Chi Town', leagueId: 1 },
];

const pick = (overrides: Partial<DraftPickRecord> = {}): DraftPickRecord => ({
  id: '1',
  draftId: 1,
  round: 1,
  pickNumber: 1,
  overallPick: 1,
  pickedAt: '2026-01-01T00:00:00.000Z',
  teamId: 1,
  playerId: 1,
  ...overrides,
});

const CURRENT: CurrentDraftPickInfo = {
  draftId: 1,
  teamId: 2,
  round: 2,
  pickNumber: 2,
  overallPick: 5,
  isComplete: false,
};

const STATS = new Map<number, DraftPlayer>([
  [7, { id: 7, name: 'Rod Carew', position: '2B' } as DraftPlayer],
]);

function renderTimeline(overrides: Record<string, unknown> = {}) {
  return render(
    <DraftBoardTimeline
      teams={TEAMS}
      picks={[pick({ round: 2, teamId: 3, overallPick: 4, playerId: 7 })]}
      currentPickInfo={CURRENT}
      myTeamId={2}
      statsLookup={STATS}
      sport="baseball"
      timeRemaining={47}
      pickTimeLimitSeconds={90}
      {...overrides}
    />,
  );
}

describe('DraftBoardTimeline — clock header (LS-10003)', () => {
  it('names the team on the clock and the pick it is on', () => {
    const { getByText } = renderTimeline();

    expect(getByText('Sandlot Swingers')).toBeTruthy();
    expect(getByText("You're on the clock · Pick #5")).toBeTruthy();
    expect(getByText('Round 2 · Pick 2 of 3 · You')).toBeTruthy();
  });

  it('renders the countdown ring with the time remaining', () => {
    const { getByText } = renderTimeline();

    expect(getByText('0:47')).toBeTruthy();
  });

  it('drains the ring arc in proportion to the time left', () => {
    const { container } = renderTimeline();

    const arcs = container.querySelectorAll('.d-tl-ring circle');
    // Two circles: the track, then the progress arc.
    expect(arcs).toHaveLength(2);
    const dashArray = Number(arcs[1].getAttribute('stroke-dasharray'));
    const dashOffset = Number(arcs[1].getAttribute('stroke-dashoffset'));
    // 47 of 90 seconds left → a little under half the ring drained.
    expect(dashOffset / dashArray).toBeCloseTo(1 - 47 / 90, 5);
  });

  it('shows an infinity glyph rather than a countdown in an untimed draft', () => {
    const { getByText, queryByText } = renderTimeline({ untimed: true });

    expect(getByText('∞')).toBeTruthy();
    expect(queryByText('0:47')).toBeNull();
  });

  it('does not divide by a zero pick limit', () => {
    const { container } = renderTimeline({ pickTimeLimitSeconds: 0 });

    const arcs = container.querySelectorAll('.d-tl-ring circle');
    expect(Number(arcs[1].getAttribute('stroke-dashoffset'))).not.toBeNaN();
  });

  it('omits the header entirely once the draft is complete', () => {
    const { container } = renderTimeline({
      currentPickInfo: { ...CURRENT, isComplete: true },
    });

    expect(container.querySelector('.d-tl-clock')).toBeNull();
  });

  it('does not claim the viewer is up when someone else is on the clock', () => {
    const { getByText } = renderTimeline({ myTeamId: 1 });

    expect(getByText('On the clock · Pick #5')).toBeTruthy();
  });
});

describe('DraftBoardTimeline — collapsible rounds (LS-10003)', () => {
  it('opens the current round and collapses the rest', () => {
    const { getByTestId } = renderTimeline();

    expect(getByTestId('draft-timeline-round-2').className).toContain('open');
    expect(getByTestId('draft-timeline-round-1').className).not.toContain(
      'open',
    );
  });

  it('renders only the open round’s picks', () => {
    const { queryByTestId } = renderTimeline();

    expect(queryByTestId('draft-timeline-pick-2-3')).toBeTruthy();
    expect(queryByTestId('draft-timeline-pick-1-1')).toBeNull();
  });

  it('expands a collapsed round when its header is pressed', () => {
    const { getByTestId, queryByTestId } = renderTimeline();

    fireEvent.click(getByTestId('draft-timeline-round-head-1'));

    expect(queryByTestId('draft-timeline-pick-1-1')).toBeTruthy();
    // Accordion: opening one closes the other.
    expect(queryByTestId('draft-timeline-pick-2-3')).toBeNull();
  });

  it('collapses the open round when its own header is pressed', () => {
    const { getByTestId, queryByTestId } = renderTimeline();

    fireEvent.click(getByTestId('draft-timeline-round-head-2'));

    expect(queryByTestId('draft-timeline-pick-2-3')).toBeNull();
  });

  it('exposes the open state to assistive tech', () => {
    const { getByTestId } = renderTimeline();

    const open = getByTestId('draft-timeline-round-head-2');
    const closed = getByTestId('draft-timeline-round-head-1');
    expect(open.getAttribute('aria-expanded')).toBe('true');
    expect(closed.getAttribute('aria-expanded')).toBe('false');
    expect(open.getAttribute('aria-controls')).toBe('d-tl-round-2');
  });

  it('labels a round with its made-versus-total pick count', () => {
    const { getByText } = renderTimeline();

    expect(getByText('1 of 3 picks')).toBeTruthy();
  });
});

describe('DraftBoardTimeline — pick rows (LS-10003)', () => {
  it('carries the monogram, player and position of a completed pick', () => {
    const { getByTestId, getByText } = renderTimeline();

    const row = getByTestId('draft-timeline-pick-2-3');
    expect(row.getAttribute('data-state')).toBe('made');
    expect(row.textContent).toContain('CT');
    expect(getByText('Rod Carew')).toBeTruthy();
    expect(getByText('2B · Chi Town')).toBeTruthy();
  });

  it('distinguishes the on-the-clock row from upcoming and completed rows', () => {
    const { getByTestId } = renderTimeline();

    expect(
      getByTestId('draft-timeline-pick-2-2').getAttribute('data-state'),
    ).toBe('now');
    expect(
      getByTestId('draft-timeline-pick-2-1').getAttribute('data-state'),
    ).toBe('up');
    expect(
      getByTestId('draft-timeline-pick-2-3').getAttribute('data-state'),
    ).toBe('made');
  });

  it('names the viewer’s own turn as their pick', () => {
    const { getByText } = renderTimeline();

    expect(getByText('On the clock')).toBeTruthy();
    expect(getByText('Sandlot Swingers · your pick')).toBeTruthy();
  });

  it('colors a completed row by the sport’s position palette (LS-8784)', () => {
    const { getByTestId } = renderTimeline();

    const row = getByTestId('draft-timeline-pick-2-3');
    expect(row.getAttribute('data-pos')).toBe('2B');
    expect(row.style.borderLeftColor).toBe(
      hexToRgb(getPositionColor('baseball', '2B')),
    );
  });

  it('uses the football palette for the same position code', () => {
    const stats = new Map<number, DraftPlayer>([
      [7, { id: 7, name: 'Lamar Jackson', position: 'QB' } as DraftPlayer],
    ]);
    const { getByTestId } = renderTimeline({
      sport: 'football',
      statsLookup: stats,
    });

    expect(getByTestId('draft-timeline-pick-2-3').style.borderLeftColor).toBe(
      hexToRgb(getPositionColor('football', 'QB')),
    );
  });

  it('renders nothing at all when the league has no teams', () => {
    const { container } = renderTimeline({ teams: [] });

    expect(container.querySelector('.d-tl-view')).toBeNull();
  });
});

describe('DraftBoardTimeline — pick inspector (LS-10163)', () => {
  it('opens the made variant when a made row is tapped', () => {
    const { getByTestId } = renderTimeline();

    fireEvent.click(getByTestId('draft-timeline-pick-2-3'));

    expect(getByTestId('draft-timeline-pick-inspector-title').textContent).toBe(
      'Rod Carew',
    );
  });

  it('opens the on-the-clock variant when the now row is tapped', () => {
    const { getByTestId } = renderTimeline();

    fireEvent.click(getByTestId('draft-timeline-pick-2-2'));

    expect(getByTestId('draft-timeline-pick-inspector-title').textContent).toBe(
      'On the clock',
    );
  });

  it('opens the upcoming variant when an up row is tapped', () => {
    const { getByTestId } = renderTimeline();

    fireEvent.click(getByTestId('draft-timeline-pick-2-1'));

    expect(getByTestId('draft-timeline-pick-inspector-title').textContent).toBe(
      'Not yet made',
    );
  });

  it('closes on a backdrop tap', () => {
    const { getByTestId, queryByTestId } = renderTimeline();

    fireEvent.click(getByTestId('draft-timeline-pick-2-3'));
    fireEvent.click(getByTestId('draft-timeline-pick-inspector-overlay'));

    expect(queryByTestId('draft-timeline-pick-inspector')).toBeNull();
  });

  it('activates from the keyboard', () => {
    const { getByTestId } = renderTimeline();

    fireEvent.keyDown(getByTestId('draft-timeline-pick-2-3'), {
      key: 'Enter',
    });

    expect(getByTestId('draft-timeline-pick-inspector-title').textContent).toBe(
      'Rod Carew',
    );
  });
});

describe('DraftBoardTimeline — draft order (LS-10569)', () => {
  const roundTwoTeamOrder = (container: HTMLElement): string[] =>
    Array.from(
      container.querySelectorAll('[data-testid^="draft-timeline-pick-2-"]'),
    ).map((el) => el.getAttribute('data-testid')?.split('-').pop() ?? '');

  it('lists a linear draft’s even round in board order', () => {
    const { container } = renderTimeline({ draftOrder: 'linear' });

    expect(roundTwoTeamOrder(container)).toEqual(['1', '2', '3']);
  });

  it('keeps snake order when the draft snakes', () => {
    const { container } = renderTimeline({ draftOrder: 'snake' });

    expect(roundTwoTeamOrder(container)).toEqual(['3', '2', '1']);
  });
});
