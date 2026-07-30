import {
  baseballPositionBadges,
  contrastRatio,
  darkSurface,
  DERIVED_TEXT_CONTRAST_TARGET,
  lightenForContrast,
  relativeLuminance,
} from './colors';

describe('relativeLuminance', () => {
  it('is 0 for black and 1 for white', () => {
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5);
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 5);
  });
});

describe('contrastRatio', () => {
  it('is 21:1 for black on white (max WCAG ratio)', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
  });

  it('is 1:1 for a color against itself', () => {
    expect(contrastRatio('#C41E3A', '#C41E3A')).toBeCloseTo(1, 5);
  });

  it('is order-independent', () => {
    expect(contrastRatio('#0A0F1A', '#C5A55A')).toBeCloseTo(
      contrastRatio('#C5A55A', '#0A0F1A'),
      10,
    );
  });
});

describe('lightenForContrast', () => {
  const BG = darkSurface.bg; // '#0A0F1A' — the Players card feed page background (LS-8832)

  it('returns the color unchanged when it already clears the target', () => {
    // Near-white already clears any reasonable target against a near-black bg.
    expect(lightenForContrast('#F5F7FA', BG)).toBe('#F5F7FA');
  });

  it('lightens every baseball position badge to at least the target contrast on the dark page bg', () => {
    for (const color of Object.values(baseballPositionBadges)) {
      const lightened = lightenForContrast(color, BG);
      expect(contrastRatio(lightened, BG)).toBeGreaterThanOrEqual(
        DERIVED_TEXT_CONTRAST_TARGET - 0.05, // float slop from the bisection search
      );
    }
  });

  it('preserves hue rather than washing out to grey (OKLab lighten, not a white mix)', () => {
    // Sanity check: the lightened seam-red badge should still read as reddish
    // (R channel clearly dominant), not a neutral grey.
    const lightened = lightenForContrast(baseballPositionBadges.C, BG);
    const r = parseInt(lightened.slice(1, 3), 16);
    const g = parseInt(lightened.slice(3, 5), 16);
    const b = parseInt(lightened.slice(5, 7), 16);
    expect(r).toBeGreaterThan(g);
    expect(r).toBeGreaterThan(b);
  });

  it('is stable across repeated calls (deterministic bisection)', () => {
    const first = lightenForContrast(baseballPositionBadges.SS, BG);
    const second = lightenForContrast(baseballPositionBadges.SS, BG);
    expect(first).toBe(second);
  });

  it('honors a custom target ratio', () => {
    const looseTarget = lightenForContrast(baseballPositionBadges.OF, BG, 4.5);
    const strictTarget = lightenForContrast(baseballPositionBadges.OF, BG, 10);
    expect(contrastRatio(looseTarget, BG)).toBeGreaterThanOrEqual(4.45);
    expect(contrastRatio(strictTarget, BG)).toBeGreaterThanOrEqual(9.9);
  });
});
