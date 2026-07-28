import React from 'react';
import { DraftGrid } from './DraftGrid';
import { getPositionColor } from './utils';
import type { DraftPickRecord, DraftPlayer, LeagueTeam } from './types';
import { render } from '../../test-utils';

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
