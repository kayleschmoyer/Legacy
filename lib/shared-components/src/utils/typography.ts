/**
 * Brand typography font stacks for Legacy Sports.
 *
 * Both display and body faces are self-hosted woff2 (apps/web/public/fonts)
 * and loaded via apps/web/public/fonts/fonts.css. JetBrains Mono is loaded
 * from Google Fonts at the web app shell.
 *
 * Use these constants when applying brand fonts via the Tamagui `fontFamily`
 * prop or via inline CSS `style` objects.
 */

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
