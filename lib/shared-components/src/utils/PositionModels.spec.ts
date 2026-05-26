import {
  arePositionsCompatible,
  canPlayerPlayPosition,
} from './PositionModels';
import type { LeaguePosition, TeamMemberWithPositions } from './PositionModels';

// ── arePositionsCompatible (LS-4763) ──────────────────────────────────────

describe('arePositionsCompatible — football (LS-4763)', () => {
  it('FLEX slot accepts RB', () => {
    expect(arePositionsCompatible('RB', 'FLEX', 'football')).toBe(true);
  });

  it('FLEX slot accepts WR', () => {
    expect(arePositionsCompatible('WR', 'FLEX', 'football')).toBe(true);
  });

  it('FLEX slot accepts TE', () => {
    expect(arePositionsCompatible('TE', 'FLEX', 'football')).toBe(true);
  });

  it('FLEX slot rejects QB', () => {
    expect(arePositionsCompatible('QB', 'FLEX', 'football')).toBe(false);
  });

  it('FLEX slot rejects K', () => {
    expect(arePositionsCompatible('K', 'FLEX', 'football')).toBe(false);
  });

  it('FLEX slot rejects DEF', () => {
    expect(arePositionsCompatible('DEF', 'FLEX', 'football')).toBe(false);
  });

  it('QB slot rejects a player with RB position', () => {
    expect(arePositionsCompatible('RB', 'QB', 'football')).toBe(false);
  });

  it('QB slot accepts a player with QB position', () => {
    expect(arePositionsCompatible('QB', 'QB', 'football')).toBe(true);
  });

  it('RB slot rejects a player with QB position (LS-4763 acceptance criteria)', () => {
    expect(arePositionsCompatible('QB', 'RB', 'football')).toBe(false);
  });

  it('BENCH slot accepts all football skill positions', () => {
    for (const pos of ['QB', 'RB', 'WR', 'TE', 'K'] as const) {
      expect(arePositionsCompatible(pos, 'BENCH', 'football')).toBe(true);
    }
  });
});

describe('arePositionsCompatible — baseball (LS-4763)', () => {
  it('OF slot accepts LF, RF, CF, and generic OF', () => {
    for (const pos of ['LF', 'RF', 'CF', 'OF'] as const) {
      expect(arePositionsCompatible(pos, 'OF', 'baseball')).toBe(true);
    }
  });

  it('OF slot rejects pitching positions', () => {
    expect(arePositionsCompatible('SP', 'OF', 'baseball')).toBe(false);
    expect(arePositionsCompatible('RP', 'OF', 'baseball')).toBe(false);
  });
});

// ── canPlayerPlayPosition (LS-4763) ───────────────────────────────────────

describe('canPlayerPlayPosition — football (LS-4763)', () => {
  const makePlayer = (positions: string[]): TeamMemberWithPositions => ({
    id: 1,
    playerId: 1,
    player: {
      id: 1,
      firstName: 'Test',
      lastName: 'Player',
      playerEligiblePositions: {
        nodes: positions.map((position) => ({ position: position as never })),
      },
    },
  });

  const makeSlot = (positionType: string): LeaguePosition => ({
    id: 1,
    positionType,
  });

  it('RB player can fill a legal football trade into an RB slot', () => {
    expect(
      canPlayerPlayPosition(makePlayer(['RB']), makeSlot('RB'), 'football'),
    ).toBe(true);
  });

  it('RB player can fill a FLEX slot (legal FLEX placement)', () => {
    expect(
      canPlayerPlayPosition(makePlayer(['RB']), makeSlot('FLEX'), 'football'),
    ).toBe(true);
  });

  it('QB player cannot fill an RB slot (illegal QB-into-RB-slot placement)', () => {
    expect(
      canPlayerPlayPosition(makePlayer(['QB']), makeSlot('RB'), 'football'),
    ).toBe(false);
  });

  it('QB player cannot fill a FLEX slot', () => {
    expect(
      canPlayerPlayPosition(makePlayer(['QB']), makeSlot('FLEX'), 'football'),
    ).toBe(false);
  });
});
