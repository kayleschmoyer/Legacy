/**
 * Brand typography font stacks for Legacy Sports.
 *
 * Both fonts are loaded in index.html via Google Fonts (Big Shoulders Display
 * wght@600;700;800 and Literata ital,opsz,wght@0,7..72,400;0,7..72,600).
 *
 * Use these constants when applying brand fonts via the Tamagui `fontFamily`
 * prop or via inline CSS `style` objects.
 */

/**
 * Big Shoulders Display — condensed grotesque with scoreboard / pennant DNA.
 * Use for: display text, page headings, scores, team abbreviations, status
 * badges, section labels.
 */
export const FONT_DISPLAY =
  "'Big Shoulders Display', system-ui, sans-serif" as const;

/**
 * Literata — warm, editorial-quality optical-size serif.
 * Use for: body copy, descriptions, date / timestamp metadata, captions,
 * and any prose that needs reading comfort.
 */
export const FONT_BODY =
  "'Literata', Georgia, 'Times New Roman', serif" as const;
