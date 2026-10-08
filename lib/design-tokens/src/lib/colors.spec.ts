import {
  baseballPositionBadges,
  contrastRatio,
  darkSurface,
  darkText,
  DERIVED_TEXT_CONTRAST_TARGET,
  goldTextDark,
  goldTextLight,
  ledger,
  lightenForContrast,
  lightSurface,
  lightText,
  relativeLuminance,
  semanticLight,
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

// LS-10452: every text tier must meet WCAG AA for normal text (4.5:1) on
// every surface it can sit on. Outlines/borders are not text surfaces, and
// `fgOnAccent` sits on navy/gold/red accent fills, so both are excluded.
describe('text tokens meet WCAG AA (4.5:1) on every surface', () => {
  const WCAG_AA_NORMAL_TEXT = 4.5;
  const textSurfaceKeys = [
    'bg',
    'bgHover',
    'bgPress',
    'surfaceSubtle',
    'surfacePanel',
    'surfaceCard',
    'surfaceRaised',
  ] as const;
  const textKeys = ['fg1', 'fg1Strong', 'fg2', 'fg3', 'fg4'] as const;

  const themes = [
    { theme: 'dark', text: darkText, surface: darkSurface },
    { theme: 'light', text: lightText, surface: lightSurface },
  ] as const;

  const cases = themes.flatMap(({ theme, text, surface }) =>
    textKeys.flatMap((textKey) =>
      textSurfaceKeys.map(
        (surfaceKey) =>
          [
            theme,
            textKey,
            surfaceKey,
            text[textKey],
            surface[surfaceKey],
          ] as const,
      ),
    ),
  );

  it.each(cases)(
    '%s %s on %s (%s on %s)',
    (_theme, _textKey, _surfaceKey, fg, bg) => {
      expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    },
  );

  it.each(themes)(
    '$theme fg4 stays visually distinct from fg3 (quieter tier, not a duplicate)',
    ({ text, surface }) => {
      expect(text.fg4).not.toBe(text.fg3);
      // fg4 is the quieter tier: lower contrast against the page than fg3.
      expect(contrastRatio(text.fg4, surface.bg)).toBeLessThan(
        contrastRatio(text.fg3, surface.bg),
      );
    },
  );

  it('keeps the disabled foreground out of the readable-text ramp', () => {
    // `ledger.disabledFg` is intentionally sub-AA (inactive UI is exempt
    // under WCAG 1.4.3); it must never be reused as an enabled text tier.
    expect(Object.values(darkText)).not.toContain(ledger.disabledFg);
    expect(Object.values(lightText)).not.toContain(ledger.disabledFg);
  });
});

describe('light-theme status colours (LS-10852)', () => {
  const AA = 4.5;
  const surfaces = [
    lightSurface.bg,
    lightSurface.surfaceCard,
    lightSurface.surfaceSubtle,
    lightSurface.surfacePanel,
    lightSurface.surfaceRaised,
  ];

  // Composite an `rgba(r, g, b, a)` fill over an opaque `#rrggbb` surface.
  const composite = (rgba: string, surface: string): string => {
    const [r, g, b, a] = rgba
      .replace(/rgba\(|\)/g, '')
      .split(',')
      .map((part) => Number(part.trim()));
    const base = surface.replace('#', '');
    const channel = (value: number, offset: number) =>
      Math.round(
        value * a + parseInt(base.slice(offset, offset + 2), 16) * (1 - a),
      )
        .toString(16)
        .padStart(2, '0');
    return `#${channel(r, 0)}${channel(g, 2)}${channel(b, 4)}`;
  };

  const statuses = [
    'success',
    'warning',
    'danger',
    'info',
    'neutral',
    'accent',
  ] as const;

  const cases = statuses.flatMap((status) =>
    surfaces.map((surface) => [status, surface] as const),
  );

  it.each(cases)(
    '%s Fg clears AA on %s and over its soft fill',
    (status, surface) => {
      const fg = semanticLight[`${status}Fg`];
      const soft = semanticLight[`${status}Soft`];
      expect(contrastRatio(fg, surface)).toBeGreaterThanOrEqual(AA);
      expect(
        contrastRatio(fg, composite(soft, surface)),
      ).toBeGreaterThanOrEqual(AA);
    },
  );
});

describe('gold text tokens (LS-10697)', () => {
  const textSurfaces = [
    'bg',
    'surfaceSubtle',
    'surfacePanel',
    'surfaceCard',
    'surfaceRaised',
  ] as const;
  const themes = [
    { theme: 'dark', gold: goldTextDark, surface: darkSurface },
    { theme: 'light', gold: goldTextLight, surface: lightSurface },
  ] as const;

  const cases = themes.flatMap(({ theme, gold, surface }) =>
    textSurfaces.map((key) => [theme, key, gold, surface[key]] as const),
  );

  it.each(cases)(
    '%s goldText clears AA on %s',
    (_theme, _key, gold, surface) => {
      expect(contrastRatio(gold.goldText, surface)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each(themes)(
    '$theme wordmarkGold clears the 3:1 large-text bar on the page background',
    ({ gold, surface }) => {
      expect(
        contrastRatio(gold.wordmarkGold, surface.bg),
      ).toBeGreaterThanOrEqual(3);
    },
  );

  it('keeps the dark-theme wordmark on the existing $brandGoldLight value', () => {
    expect(goldTextDark.wordmarkGold).toBe('#D4BB78');
  });
});
