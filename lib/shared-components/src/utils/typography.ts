/**
 * Brand typography tokens for Legacy Sports.
 *
 * Mirror of the design-system bundle at
 * docs/design/7SRWFMj3a6khIhwLuWkSKA/legacy-sports-design-system/project/colors_and_type.css
 * (sections "Typography" and "Semantic type recipes").
 *
 * Both display and body faces are self-hosted woff2 (apps/web/public/fonts)
 * and loaded via apps/web/public/fonts/fonts.css. JetBrains Mono is loaded
 * from Google Fonts at the web app shell.
 *
 * Use these constants when applying brand fonts via the Tamagui `fontFamily`
 * prop, via inline CSS `style` objects, or when composing a heading / score
 * recipe outside of a Tamagui surface.
 */

/* ── Font stacks ──────────────────────────────────────────────── */

/**
 * Big Shoulders Display — condensed grotesque with scoreboard / pennant DNA.
 * Use for: display text, page headings, scores, team abbreviations, status
 * badges, section labels. Weights available: 600, 700, 800.
 */
export const FONT_DISPLAY =
  "'Big Shoulders Display', system-ui, sans-serif" as const;

/**
 * Literata — warm, editorial-quality optical-size serif.
 * Use for: body copy, descriptions, date / timestamp metadata, captions,
 * and any prose that needs reading comfort. Weights available: 400, 600
 * (plus 400 italic).
 */
export const FONT_BODY =
  "'Literata', Georgia, 'Times New Roman', serif" as const;

/**
 * JetBrains Mono — tabular figures for stat columns and code.
 * Pair with `font-variant-numeric: tabular-nums` (or the `.tabular-nums`
 * utility class in apps/web/src/styles.css) for column-aligned digits.
 */
export const FONT_MONO =
  "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace" as const;

/* ── Type scale (px) ──────────────────────────────────────────────
   Step ratios match the foundation bundle and the Tamagui $1–$10
   scale. Use these literals (or the recipes below) so the values
   never drift between the design bundle, the web app, and the
   shared component library. */

export const TYPE_SCALE = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 22,
  '2xl': 28,
  '3xl': 36,
  '4xl': 48,
  '5xl': 64,
  '6xl': 80,
} as const;

export type TypeScaleKey = keyof typeof TYPE_SCALE;

/* ── Leading (unit-less line-height) ───────────────────────────── */

export const LINE_HEIGHT = {
  tight: 1.1,
  snug: 1.3,
  body: 1.55,
  loose: 1.8,
} as const;

export type LineHeightKey = keyof typeof LINE_HEIGHT;

/* ── Semantic recipes ────────────────────────────────────────────
   Drop-in style objects mirroring the preview pages at
   docs/design/7SRWFMj3a6khIhwLuWkSKA/.../preview/{type-display,
   type-body, type-score, components-typography}.html. */

export const TYPE_DISPLAY = {
  h1: {
    fontFamily: FONT_DISPLAY,
    fontWeight: 800,
    fontSize: TYPE_SCALE['4xl'],
    lineHeight: 1,
    letterSpacing: '-0.02em',
  },
  h2: {
    fontFamily: FONT_DISPLAY,
    fontWeight: 800,
    fontSize: TYPE_SCALE['3xl'],
    lineHeight: LINE_HEIGHT.tight,
    letterSpacing: '-0.01em',
  },
  h3: {
    fontFamily: FONT_DISPLAY,
    fontWeight: 700,
    fontSize: TYPE_SCALE['2xl'],
    lineHeight: LINE_HEIGHT.tight,
    letterSpacing: 0,
  },
  h4: {
    fontFamily: FONT_DISPLAY,
    fontWeight: 700,
    fontSize: TYPE_SCALE.xl,
    lineHeight: 1.2,
    letterSpacing: 0,
  },
} as const;

export const TYPE_BODY = {
  lede: {
    fontFamily: FONT_BODY,
    fontWeight: 400,
    fontSize: TYPE_SCALE.lg,
    lineHeight: 1.6,
  },
  body: {
    fontFamily: FONT_BODY,
    fontWeight: 400,
    fontSize: TYPE_SCALE.md,
    lineHeight: LINE_HEIGHT.body,
  },
  caption: {
    fontFamily: FONT_BODY,
    fontWeight: 400,
    fontSize: TYPE_SCALE.sm,
    lineHeight: LINE_HEIGHT.body,
  },
  eyebrow: {
    fontFamily: FONT_DISPLAY,
    fontWeight: 700,
    fontSize: TYPE_SCALE.xs,
    lineHeight: 1,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
  },
} as const;

/**
 * Score / stat recipes. All scores use Big Shoulders 800 with tabular
 * figures so digits align in columns. Apply `fontVariantNumeric:
 * 'tabular-nums'` (RN-friendly) or the `.tabular-nums` utility class
 * (web) alongside the recipe.
 */
export const TYPE_SCORE = {
  lg: {
    fontFamily: FONT_DISPLAY,
    fontWeight: 800,
    fontSize: TYPE_SCALE['5xl'],
    lineHeight: 1,
  },
  md: {
    fontFamily: FONT_DISPLAY,
    fontWeight: 800,
    fontSize: TYPE_SCALE['3xl'],
    lineHeight: 1,
  },
  sm: {
    fontFamily: FONT_DISPLAY,
    fontWeight: 800,
    fontSize: TYPE_SCALE.xl,
    lineHeight: 1,
  },
  teamAbbr: {
    fontFamily: FONT_DISPLAY,
    fontWeight: 700,
    fontSize: TYPE_SCALE.xl,
    lineHeight: 1,
    letterSpacing: '0.04em',
  },
} as const;

/**
 * Turn on tabular figures so stat digits align column-to-column (e.g.
 * AVG .342 vs .298). Spread onto a Tamagui or React Native `Text` via
 * `<Text {...TABULAR_NUMS} />`; the array is mutable to match RN's
 * `FontVariant[]` so this stays type-safe without casts. On web,
 * Tamagui falls through to the equivalent
 * `font-variant-numeric: tabular-nums` CSS — same effect as the
 * `.tabular-nums` utility class in apps/web/src/styles.css.
 */
export const TABULAR_NUMS: { fontVariant: Array<'tabular-nums'> } = {
  fontVariant: ['tabular-nums'],
};
