import {
  canPlayerPlayPosition,
  getEligiblePositions,
  getPositionLabel,
  isDualEligible,
  isPitcherSlot,
  isPlayerBatter,
  isPlayerPitcher,
  playerHasBatting,
  playerHasPitchingOnly,
} from './rosterEligibility';

const player = (eligible: string[] | null) => ({
  player: { eligiblePositions: eligible },
});

describe('rosterEligibility', () => {
  describe('isPitcherSlot', () => {
    it('recognises pitching slot types case-insensitively', () => {
      expect(isPitcherSlot('SP')).toBe(true);
      expect(isPitcherSlot('rp')).toBe(true);
      expect(isPitcherSlot('P')).toBe(true);
      expect(isPitcherSlot('C')).toBe(false);
      expect(isPitcherSlot(null)).toBe(false);
    });
  });

  describe('getEligiblePositions', () => {
    it('returns a copy of eligible positions or empty array', () => {
      expect(getEligiblePositions(player(['SP', 'RP']))).toEqual(['SP', 'RP']);
      expect(getEligiblePositions(player(null))).toEqual([]);
      expect(getEligiblePositions({})).toEqual([]);
    });
  });

  describe('classification', () => {
    it('identifies pitching-only players', () => {
      expect(playerHasPitchingOnly(player(['SP', 'RP']))).toBe(true);
      expect(playerHasPitchingOnly(player(['SP', 'DH']))).toBe(false);
      expect(playerHasPitchingOnly(player([]))).toBe(false);
    });

    it('treats unclassified players as batters', () => {
      expect(playerHasBatting(player([]))).toBe(true);
      expect(playerHasBatting(player(['SP']))).toBe(false);
      expect(playerHasBatting(player(['C']))).toBe(true);
    });

    it('detects pitcher / batter eligibility', () => {
      expect(isPlayerPitcher(player(['SP', '1B']))).toBe(true);
      expect(isPlayerPitcher(player(['1B']))).toBe(false);
      expect(isPlayerBatter(player(['SP', '1B']))).toBe(true);
      expect(isPlayerBatter(player(['SP']))).toBe(false);
    });

    it('detects dual eligibility', () => {
      expect(isDualEligible(player(['SP', 'DH']))).toBe(true);
      expect(isDualEligible(player(['SP', 'RP']))).toBe(false);
      expect(isDualEligible(player(['1B']))).toBe(false);
    });
  });

  describe('canPlayerPlayPosition', () => {
    it('allows unclassified players into any slot', () => {
      expect(canPlayerPlayPosition(player([]), 'SP')).toBe(true);
    });

    it('matches eligibility against the slot allow-list', () => {
      expect(canPlayerPlayPosition(player(['SP']), 'SP')).toBe(true);
      expect(canPlayerPlayPosition(player(['1B']), 'SP')).toBe(false);
    });

    it('rejects unknown slot types for classified players', () => {
      expect(canPlayerPlayPosition(player(['1B']), 'ZZZ')).toBe(false);
    });

    it('SFLEX (Superflex, premium slot) accepts QB, RB, WR, TE but not K (LS-6337)', () => {
      expect(canPlayerPlayPosition(player(['QB']), 'SFLEX', 'football')).toBe(
        true,
      );
      expect(canPlayerPlayPosition(player(['RB']), 'SFLEX', 'football')).toBe(
        true,
      );
      expect(canPlayerPlayPosition(player(['K']), 'SFLEX', 'football')).toBe(
        false,
      );
    });
  });

  describe('getPositionLabel', () => {
    it('returns friendly labels and falls back to the code', () => {
      expect(getPositionLabel('SP')).toBe('Starting Pitcher');
      expect(getPositionLabel('1B')).toBe('1st Base');
      expect(getPositionLabel('zz')).toBe('ZZ');
    });

    it('labels SFLEX as Superflex (LS-6337)', () => {
      expect(getPositionLabel('SFLEX')).toBe('Superflex');
    });
  });
});
