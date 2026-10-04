import { formatEligiblePositions } from './utils';

describe('formatEligiblePositions (LS-10472)', () => {
  it('lists every eligible position, primary first', () => {
    expect(
      formatEligiblePositions({
        position: 'OF',
        eligiblePositions: ['OF', 'C'],
      }),
    ).toBe('OF, C');
  });

  it('keeps the primary first even when eligiblePositions orders it later', () => {
    expect(
      formatEligiblePositions({
        position: '3B',
        eligiblePositions: ['1B', '3B', 'C'],
      }),
    ).toBe('3B, 1B, C');
  });

  it('dedupes and drops empty entries', () => {
    expect(
      formatEligiblePositions({
        position: 'C',
        eligiblePositions: ['C', '', 'C', 'DH'],
      }),
    ).toBe('C, DH');
  });

  it('falls back to the primary alone when eligiblePositions is absent', () => {
    expect(formatEligiblePositions({ position: 'SP' })).toBe('SP');
    expect(
      formatEligiblePositions({ position: 'SP', eligiblePositions: null }),
    ).toBe('SP');
  });
});
