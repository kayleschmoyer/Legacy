// Mock tamagui dependencies that have react-native-web issues in Jest
jest.mock('@tamagui/config', () => ({
  config: {
    themes: {},
    tokens: {},
    // The real stock media scale, copied from
    // node_modules/@tamagui/config/dist/cjs/media.js. Only the keys LS-9885
    // has not migrated yet are read from here, but the whole set is present
    // so the "still stock" assertions below compare against real values
    // rather than `undefined`.
    media: {
      xl: { maxWidth: 1650 },
      lg: { maxWidth: 1280 },
      md: { maxWidth: 1020 },
      sm: { maxWidth: 800 },
      xs: { maxWidth: 660 },
      xxs: { maxWidth: 390 },
      gtXs: { minWidth: 661 },
      gtSm: { minWidth: 801 },
      gtMd: { minWidth: 1021 },
      gtLg: { minWidth: 1281 },
      gtXl: { minWidth: 1651 },
    },
    shorthands: {},
    settings: {
      mediaQueryDefaultActive: {
        xl: true,
        lg: true,
        md: true,
        sm: true,
        xs: true,
        xxs: false,
      },
    },
  },
  createGenericFont: jest.fn(
    (family: string, font: Record<string, unknown> = {}) => ({
      family,
      ...font,
    }),
  ),
}));

jest.mock('tamagui', () => ({
  createTamagui: jest.fn(
    (config: unknown) => config as Record<string, unknown>,
  ),
  createTokens: jest.fn((tokens: unknown) => tokens as Record<string, unknown>),
}));

import { breakpoints } from '@legacy-sports/design-tokens';

import { foundationTokens, tamaguiConfig } from './tamagui-config';

describe('tamaguiConfig', () => {
  it('should be defined and have required properties', () => {
    expect(tamaguiConfig).toBeDefined();
    expect(tamaguiConfig).toHaveProperty('themes');
    expect(tamaguiConfig).toHaveProperty('tokens');
  });
});

describe('foundationTokens', () => {
  it('re-exports the design-tokens foundation categories without duplicating values', () => {
    expect(foundationTokens.spacing[4]).toBe(16);
    expect(foundationTokens.radii[4]).toBe(12);
    expect(foundationTokens.typeScale.xl).toBe(22);
    expect(foundationTokens.leading.body).toBe(1.55);
    expect(foundationTokens.shadowsDark.gold).toContain('rgba(197, 165, 90');
    expect(foundationTokens.shadowsLight.sm).toContain('rgba(2, 6, 23');
  });
});

describe('cardGradientEnd (LS-9134)', () => {
  it('stays opaque navy in dark theme but softens to a tint in light theme', () => {
    const { themes } = tamaguiConfig as unknown as {
      themes: Record<string, { cardGradientEnd: string; brandNavy: string }>;
    };
    expect(themes.dark.cardGradientEnd).toBe(themes.dark.brandNavy);
    expect(themes.light.cardGradientEnd).not.toBe(themes.light.brandNavy);
    expect(themes.light.cardGradientEnd).toContain('rgba(');
  });
});

// LS-9885. The workspace config used to inherit @tamagui/config's stock media
// scale while a comment claimed it mirrored the design tokens. Nothing checked
// the claim, so `$md` fired 160px late and `$lg` 300px late for as long as the
// comment stood. These assertions exist so that drift fails CI instead of
// living in a comment.
describe('media config (design-token breakpoint alignment)', () => {
  const media = (
    tamaguiConfig as unknown as {
      media: Record<string, { maxWidth?: number; minWidth?: number }>;
    }
  ).media;

  it('derives every migrated key from the design-token scale, not literals', () => {
    // `$X` is a maxWidth ending one pixel below the NEXT band's lower bound;
    // `$gtX` is a minWidth at that same lower bound. The two are complements.
    expect(media.xxs).toEqual({ maxWidth: breakpoints.xs - 1 }); // ≤659
    expect(media.lg).toEqual({ maxWidth: breakpoints.xl - 1 }); // ≤1119
    expect(media.xl).toEqual({ maxWidth: breakpoints.xxl - 1 }); // ≤1279
    expect(media.gtLg).toEqual({ minWidth: breakpoints.xl }); // ≥1120
    expect(media.gtXl).toEqual({ minWidth: breakpoints.xxl }); // ≥1280
  });

  it('exposes an $xxl band, which the stock Tamagui scale has no key for', () => {
    expect(media.xxl).toEqual({ minWidth: breakpoints.xxl }); // ≥1280
  });

  it('defaults $xxl inactive before measurement, unlike the maxWidth bands', () => {
    // Every key in this map is treated as matching until measurement. That is
    // right for the mobile-first maxWidth bands and wrong for a minWidth one:
    // a truthy `xxl` would apply `$xxl` styling at every width during SSR,
    // first paint and jest.
    const settings = (
      tamaguiConfig as unknown as {
        settings: { mediaQueryDefaultActive: Record<string, boolean> };
      }
    ).settings;
    expect(settings.mediaQueryDefaultActive.xxl).toBe(false);
    expect(settings.mediaQueryDefaultActive.xxs).toBe(false);
    expect(settings.mediaQueryDefaultActive.sm).toBe(true);
  });

  it('keeps the not-yet-migrated keys on the stock scale (staged rollout)', () => {
    // Deleting a line here is the signal that a follow-up slice has landed.
    expect(media.xs).toEqual({ maxWidth: 660 }); // → LS-9897 widens to 799
    expect(media.gtXs).toEqual({ minWidth: 661 }); // → LS-9897 → 800
    expect(media.sm).toEqual({ maxWidth: 800 }); // → LS-9898 → 859
    expect(media.gtSm).toEqual({ minWidth: 801 }); // → LS-9898 → 860
    expect(media.md).toEqual({ maxWidth: 1020 }); // → LS-9896 → 979
    expect(media.gtMd).toEqual({ minWidth: 1021 }); // → LS-9896 → 980
  });

  it('keeps the band order monotonic across the staged rollout', () => {
    // The invariant that makes partial migration safe: each maxWidth band must
    // stay strictly below the next, or a narrower token would out-rank a wider
    // one and the mobile-first cascade would invert.
    const ascending = ['xxs', 'xs', 'sm', 'md', 'lg', 'xl'] as const;
    const widths = ascending.map((key) => media[key].maxWidth as number);
    expect(widths).toEqual([...widths].sort((a, b) => a - b));
    expect(new Set(widths).size).toBe(widths.length);
    // …and the top band starts immediately above the last maxWidth band.
    expect(media.xxl.minWidth).toBe((media.xl.maxWidth as number) + 1);
  });

  it('makes $X and $gtX exact complements for every migrated pair', () => {
    for (const [band, gt] of [
      ['lg', 'gtLg'],
      ['xl', 'gtXl'],
    ] as const) {
      expect(media[gt].minWidth).toBe((media[band].maxWidth as number) + 1);
    }
  });
});

// LS-9900. `$lg`'s realignment above flips LeagueCreatePage from stacked to
// two-column at exactly the web-e2e desktop viewport (1280x720), which moved
// DateTimePicker's popover trigger low enough that its anchored "Apply"
// control opened below the fold. `short` is a viewport-HEIGHT escape hatch
// for that — not a design-token band, so it lives outside `designTokenMedia`
// and gets its own assertions here.
describe('short media key (viewport-height overlay escape hatch, LS-9900)', () => {
  it('is a maxHeight query, not a design-token band', () => {
    const media = (
      tamaguiConfig as unknown as {
        media: Record<string, { maxWidth?: number; maxHeight?: number }>;
      }
    ).media;
    expect(media.short).toEqual({ maxHeight: 800 });
  });

  it('defaults active, like the other maxWidth/maxHeight bands', () => {
    const settings = (
      tamaguiConfig as unknown as {
        settings: { mediaQueryDefaultActive: Record<string, boolean> };
      }
    ).settings;
    expect(settings.mediaQueryDefaultActive.short).toBe(true);
  });
});
