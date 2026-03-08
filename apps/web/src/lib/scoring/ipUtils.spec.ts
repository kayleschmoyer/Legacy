import { ipToDecimalInnings, ipToOuts, outsToBaseballIP } from './ipUtils';

describe('ipToOuts', () => {
  it('converts whole innings', () => {
    expect(ipToOuts(0)).toBe(0);
    expect(ipToOuts(1)).toBe(3);
    expect(ipToOuts(9)).toBe(27);
    expect(ipToOuts(12)).toBe(36);
  });

  it('converts 1-out innings (.1 suffix)', () => {
    expect(ipToOuts(0.1)).toBe(1);
    expect(ipToOuts(1.1)).toBe(4);
    expect(ipToOuts(12.1)).toBe(37);
  });

  it('converts 2-out innings (.2 suffix)', () => {
    expect(ipToOuts(0.2)).toBe(2);
    expect(ipToOuts(1.2)).toBe(5);
    expect(ipToOuts(12.2)).toBe(38);
  });

  it('handles large season totals', () => {
    // 200.1 IP typical for a starter
    expect(ipToOuts(200.1)).toBe(601);
    expect(ipToOuts(200.2)).toBe(602);
  });
});

describe('ipToDecimalInnings', () => {
  it('returns exact decimal innings for whole innings', () => {
    expect(ipToDecimalInnings(9)).toBe(9);
    expect(ipToDecimalInnings(12)).toBe(12);
  });

  it('converts 12.1 to 12⅓ innings', () => {
    expect(ipToDecimalInnings(12.1)).toBeCloseTo(12 + 1 / 3);
  });

  it('converts 12.2 to 12⅔ innings', () => {
    expect(ipToDecimalInnings(12.2)).toBeCloseTo(12 + 2 / 3);
  });

  it('produces correct ERA denominator', () => {
    // Pitcher with 9.0 IP and 3 ER should have ERA = 3.00
    const era = (3 * 9) / ipToDecimalInnings(9.0);
    expect(era).toBeCloseTo(3.0);
  });

  it('ERA from 12.1 IP is lower than naively using 12.1', () => {
    const er = 3;
    const naiveEra = (er * 9) / 12.1;
    const correctEra = (er * 9) / ipToDecimalInnings(12.1);
    expect(correctEra).toBeLessThan(naiveEra);
    expect(correctEra).toBeCloseTo((3 * 9) / (37 / 3));
  });
});

describe('outsToBaseballIP', () => {
  it('shows whole innings as x.0', () => {
    expect(outsToBaseballIP(0)).toBe('0.0');
    expect(outsToBaseballIP(27)).toBe('9.0');
    expect(outsToBaseballIP(36)).toBe('12.0');
  });

  it('shows 1-out remainder as x.1', () => {
    expect(outsToBaseballIP(1)).toBe('0.1');
    expect(outsToBaseballIP(37)).toBe('12.1');
  });

  it('shows 2-out remainder as x.2', () => {
    expect(outsToBaseballIP(2)).toBe('0.2');
    expect(outsToBaseballIP(38)).toBe('12.2');
  });

  it('round-trips season IP values correctly', () => {
    // Adding two seasons: 150.1 + 100.2 should give 251.0
    const season1Outs = ipToOuts(150.1); // 451
    const season2Outs = ipToOuts(100.2); // 302
    expect(outsToBaseballIP(season1Outs + season2Outs)).toBe('251.0');
  });
});
