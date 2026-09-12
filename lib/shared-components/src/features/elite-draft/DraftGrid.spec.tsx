import React from 'react';
import { DraftGrid } from './DraftGrid';
import { getPositionColor } from './utils';
import type { DraftPickRecord, DraftPlayer, LeagueTeam } from './types';
import { render, screen } from '../../test-utils';

// jsdom normalizes inline hex colors to `rgb(r, g, b)` when read back from
// the DOM, so assertions compare against this normalized form rather than
// the raw hex string.
const hexToRgb = (hex: string): string => {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

const team = (id: string): LeagueTeam => ({
  id,
  name: `Team ${id}`,
  leagueId: 1,
});

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

describe('DraftGrid — sport-aware position colors (LS-8784)', () => {
  it('colors a baseball pick using getPositionColor(baseball, position)', () => {
    const statsLookup = new Map<number, DraftPlayer>([
      [1, { id: 1, name: 'Infielder One', position: '1B' } as DraftPlayer],
    ]);
    const { container } = render(
      <DraftGrid
        teams={[team('1'), team('2')]}
        picks={[pick({ teamId: 1, playerId: 1 })]}
        currentPickInfo={null}
        myTeamId={2}
        statsLookup={statsLookup}
        maxRounds={1}
        sport="baseball"
      />,
    );
    const cell = container.querySelector('[data-pos="1B"]');
    expect(cell).toBeTruthy();
    const color = getPositionColor('baseball', '1B');
    expect(cell?.getAttribute('style')).toContain(hexToRgb(color));
  });

  it('colors a football pick using getPositionColor(football, position), not the baseball palette', () => {
    const statsLookup = new Map<number, DraftPlayer>([
      [1, { id: 1, name: 'Quarterback One', position: 'QB' } as DraftPlayer],
    ]);
    const { container } = render(
      <DraftGrid
        teams={[team('1'), team('2')]}
        picks={[pick({ teamId: 1, playerId: 1 })]}
        currentPickInfo={null}
        myTeamId={2}
        statsLookup={statsLookup}
        maxRounds={1}
        sport="football"
      />,
    );
    const cell = container.querySelector('[data-pos="QB"]');
    expect(cell).toBeTruthy();
    const footballColor = getPositionColor('football', 'QB');
    const baseballColor = getPositionColor('baseball', 'QB');
    expect(cell?.getAttribute('style')).toContain(hexToRgb(footballColor));
    expect(footballColor).not.toBe(baseballColor);
  });

  it('lets the my-team gold accent win over the position stripe color', () => {
    const statsLookup = new Map<number, DraftPlayer>([
      [1, { id: 1, name: 'My Guy', position: 'OF' } as DraftPlayer],
    ]);
    const { container } = render(
      <DraftGrid
        teams={[team('1'), team('2')]}
        picks={[pick({ teamId: 1, playerId: 1 })]}
        currentPickInfo={null}
        myTeamId={1}
        statsLookup={statsLookup}
        maxRounds={1}
        sport="baseball"
      />,
    );
    const cell = container.querySelector('[data-pos="OF"]');
    const posColor = getPositionColor('baseball', 'OF');
    expect(cell?.className).toContain('me-team');
    expect(cell?.getAttribute('style')).not.toContain(posColor);
  });
});

describe('DraftGrid — value heat (LS-10096)', () => {
  const player = (
    id: number,
    name: string,
    position: string,
  ): [number, DraftPlayer] => [
    id,
    { id, name, position, club: 'NYY' } as DraftPlayer,
  ];

  const renderGrid = (
    picks: DraftPickRecord[],
    statsLookup: Map<number, DraftPlayer>,
    myTeamId = 2,
  ) =>
    render(
      <DraftGrid
        teams={[team('1'), team('2')]}
        picks={picks}
        currentPickInfo={null}
        myTeamId={myTeamId}
        statsLookup={statsLookup}
        maxRounds={2}
        sport="baseball"
      />,
    );

  it('shows the signed delta and tints the cell by the 6/14 bands', () => {
    const { container } = renderGrid(
      [
        // Consensus #1 at pick 20 — a 19-slot steal, the strong band.
        pick({ id: '1', teamId: 1, playerId: 1, overallPick: 20, adp: 1 }),
        // Consensus #40 at pick 32 — an 8-slot reach, the light band.
        pick({
          id: '2',
          teamId: 1,
          playerId: 2,
          round: 2,
          overallPick: 32,
          adp: 40,
        }),
      ],
      new Map([player(1, 'Steal Guy', 'OF'), player(2, 'Reach Guy', '1B')]),
    );

    expect(screen.getByText('+19')).toBeTruthy();
    expect(screen.getByText('-8')).toBeTruthy();
    expect(container.querySelector('[data-v="3"]')).toBeTruthy();
    expect(container.querySelector('[data-v="-2"]')).toBeTruthy();
  });

  it('renders an em dash, applies no tint, and omits the pick from the total when adp is null', () => {
    // The null-adp path is the one real data hits today: historical ADP isn't
    // collected yet, so the rank can simply be absent.
    const { container } = renderGrid(
      [
        pick({ id: '1', teamId: 1, playerId: 1, overallPick: 20, adp: 1 }),
        pick({
          id: '2',
          teamId: 1,
          playerId: 2,
          round: 2,
          overallPick: 32,
          adp: null,
        }),
      ],
      new Map([player(1, 'Ranked Guy', 'OF'), player(2, 'Unranked Guy', '1B')]),
    );

    const unranked = container.querySelector('[data-pos="1B"]');
    expect(unranked).toBeTruthy();
    // No tint: band 0, same as a pick made on consensus.
    expect(unranked?.getAttribute('data-v')).toBe('0');
    // An em dash for the delta, never a 0 — "unknown" must not read as
    // "drafted exactly on consensus".
    expect(unranked?.textContent).toContain('—');
    expect(unranked?.textContent).not.toContain('+32');

    // The team total is the ranked pick alone (+19), not +19 plus the
    // unranked pick's overall number (which `overallPick - (adp ?? 0)` would
    // have produced).
    expect(screen.getByLabelText('Team 1 net draft value +19')).toBeTruthy();
  });

  it('totals net value per team and marks the signed-in manager’s column', () => {
    const { container } = renderGrid(
      [
        pick({ id: '1', teamId: 1, playerId: 1, overallPick: 20, adp: 1 }),
        pick({ id: '2', teamId: 2, playerId: 2, overallPick: 2, adp: 30 }),
      ],
      new Map([player(1, 'Their Guy', 'OF'), player(2, 'My Guy', '1B')]),
      2,
    );

    expect(screen.getByLabelText('Team 1 net draft value +19')).toBeTruthy();
    expect(screen.getByLabelText('Team 2 net draft value -28')).toBeTruthy();
    expect(container.textContent).toContain('NET VALUE');
  });

  it('states the real 6/14 thresholds in the legend, not the prototype’s "8+"', () => {
    const { container } = renderGrid(
      [pick({ teamId: 1, playerId: 1, overallPick: 20, adp: 1 })],
      new Map([player(1, 'Someone', 'OF')]),
    );

    const text = container.textContent ?? '';
    expect(text).toContain('fell 14+ slots');
    expect(text).toContain('fell 6–13 slots');
    expect(text).toContain('6–13 slots early');
    expect(text).toContain('14+ slots early');
    expect(text).not.toContain('8+');
  });
});
