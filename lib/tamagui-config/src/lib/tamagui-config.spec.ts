// Mock tamagui dependencies that have react-native-web issues in Jest
jest.mock('@tamagui/config', () => ({
  config: {
    themes: {},
    tokens: {},
    // The real stock media scale, copied from
    // node_modules/@tamagui/config/dist/cjs/media.js. Since LS-9898 the
    // config overrides every one of these keys, so nothing reads them any
    // more — the set is kept so the "no key left on the stock scale"
    // assertion below compares against real values rather than `undefined`,
    // and so a regression that drops the override is visible as the stock
    // number rather than as `undefined`.
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
    expect(media.xs).toEqual({ maxWidth: breakpoints.sm - 1 }); // ≤799
    expect(media.sm).toEqual({ maxWidth: breakpoints.md - 1 }); // ≤859
    expect(media.md).toEqual({ maxWidth: breakpoints.lg - 1 }); // ≤979
    expect(media.lg).toEqual({ maxWidth: breakpoints.xl - 1 }); // ≤1119
    expect(media.xl).toEqual({ maxWidth: breakpoints.xxl - 1 }); // ≤1279
    expect(media.gtXs).toEqual({ minWidth: breakpoints.sm }); // ≥800
    expect(media.gtSm).toEqual({ minWidth: breakpoints.md }); // ≥860
    expect(media.gtMd).toEqual({ minWidth: breakpoints.lg }); // ≥980
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

  it('leaves no key on the stock @tamagui/config scale', () => {
    // The staged rollout (LS-9895→9898) is complete: every `$` band and its
    // `gt` complement is now derived from `breakpoints`. Nothing reads
    // `config.media` any more, so a key reappearing at a stock value here
    // means an override crept back in.
    const stock = { sm: 800, xs: 660, md: 1020, lg: 1280, xl: 1650 };
    for (const [key, width] of Object.entries(stock)) {
      expect(media[key].maxWidth).not.toBe(width);
    }
  });

  it('keeps the band order monotonic', () => {
    // Each maxWidth band must stay strictly below the next, so the bands nest
    // cleanly (xxs ⊂ xs ⊂ sm ⊂ md ⊂ lg ⊂ xl) and every band has a distinct
    // boundary. Now that every key is derived this also pins the full scale:
    // 659 < 799 < 859 < 979 < 1119 < 1279 < 1280+. Which of several matching
    // bands actually WINS is a separate question, decided by key order rather
    // than by these widths — see the key-order test below (LS-10095).
    const ascending = ['xxs', 'xs', 'sm', 'md', 'lg', 'xl'] as const;
    const widths = ascending.map((key) => media[key].maxWidth as number);
    expect(widths).toEqual([...widths].sort((a, b) => a - b));
    expect(new Set(widths).size).toBe(widths.length);
    // …and the top band starts immediately above the last maxWidth band.
    expect(media.xxl.minWidth).toBe((media.xl.maxWidth as number) + 1);
  });

  it('orders the keys so the narrower maxWidth band out-ranks the wider (LS-10095)', () => {
    // Tamagui takes a media key's importance from its POSITION in the config
    // object, never from the query widths:
    //   getMediaKeyImportance = (key) => settings.mediaPropOrder
    //     ? defaultMediaImportance
    //     : Object.keys(media).indexOf(key) + 100;
    // Later key = higher importance = wins. The maxWidth bands are strictly
    // nested, so on a phone several match at once and ONLY this order decides
    // which value renders. Listing them ascending (the LS-9895 shape) made
    // `$sm` out-rank `$xs`, leaving every small-phone `$xs` step-down inert.
    const keys = Object.keys(media);
    const at = (key: string) => {
      const index = keys.indexOf(key);
      expect(index).toBeGreaterThanOrEqual(0); // key must exist to be ordered
      return index;
    };

    // Premise guard: with `mediaPropOrder` set, importance stops coming from
    // key order and this whole assertion would be measuring nothing.
    const settings = (
      tamaguiConfig as unknown as {
        settings: { mediaPropOrder?: unknown };
      }
    ).settings;
    expect(settings.mediaPropOrder).toBeFalsy();

    // maxWidth bands, widest → narrowest: each must appear LATER than the one
    // before it, so the narrower band wins the mobile-first cascade.
    const widestToNarrowest = ['xl', 'lg', 'md', 'sm', 'xs', 'xxs'] as const;
    const maxWidthIndexes = widestToNarrowest.map(at);
    expect(maxWidthIndexes).toEqual([...maxWidthIndexes].sort((a, b) => a - b));
    // The exact regression LS-10095 fixes, pinned on its own so the failure
    // message names it directly.
    expect(at('xs')).toBeGreaterThan(at('sm'));

    // `gt*` keys are minWidth queries, so their nesting runs the other way
    // (gtXl ⊂ gtLg ⊂ … ⊂ gtXs) and the WIDER band is the specific one that
    // should win — ascending is correct for them, and is NOT an inconsistency.
    const narrowestToWidest = ['gtXs', 'gtSm', 'gtMd', 'gtLg', 'gtXl'] as const;
    const gtIndexes = narrowestToWidest.map(at);
    expect(gtIndexes).toEqual([...gtIndexes].sort((a, b) => a - b));

    // Every `gt*` key stays after every maxWidth band, so a `$gtX` still beats
    // a `$X` on the same property. Unchanged by LS-10095 — pinned so the
    // reorder cannot quietly alter it either.
    expect(Math.min(...gtIndexes)).toBeGreaterThan(
      Math.max(...maxWidthIndexes),
    );
  });

  it('makes $X and $gtX exact complements for every migrated pair', () => {
    for (const [band, gt] of [
      ['xs', 'gtXs'],
      ['sm', 'gtSm'],
      ['md', 'gtMd'],
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
