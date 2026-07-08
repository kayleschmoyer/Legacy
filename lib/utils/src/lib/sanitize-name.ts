/**
 * Sanitization helpers for user-supplied display names (e.g. league names).
 *
 * Deliberately regex-based rather than `String.prototype.normalize()` —
 * Hermes (React Native) does not implement `normalize()` (LS-7946), and this
 * module is imported from both web and mobile.
 */

/**
 * C0/C1 control characters, zero-width characters (ZWSP/ZWNJ/ZWJ/BOM/word
 * joiner), and bidi directional-override marks (LRM/RLM, LRE/RLE/PDF/LRO/RLO,
 * LRI/RLI/FSI/PDI — includes U+202E used for right-to-left spoofing).
 * Printable Unicode (accents, emoji, non-Latin scripts) is untouched.
 */
const INVISIBLE_AND_CONTROL_CHARS_REGEX = new RegExp(
  '[' +
    '\\u0000-\\u001F' + // C0 controls
    '\\u007F-\\u009F' + // DEL + C1 controls
    '\\u200B-\\u200F' + // ZWSP, ZWNJ, ZWJ, LRM, RLM
    '\\u2060' + // word joiner
    '\\u2066-\\u2069' + // LRI, RLI, FSI, PDI
    '\\u202A-\\u202E' + // LRE, RLE, PDF, LRO, RLO
    '\\uFEFF' + // BOM / zero-width no-break space
    ']',
  'g',
);

/** Strips control, zero-width, and bidi-override characters from `input`. */
export function stripInvisibleAndControlChars(input: string): string {
  return input.replace(INVISIBLE_AND_CONTROL_CHARS_REGEX, '');
}

/**
 * True if `input` contains an angle bracket — the simplest reliable signal
 * of an attempted HTML/script injection in a plain-text display name.
 */
export function containsHtmlLikeMarkup(input: string): boolean {
  return /[<>]/.test(input);
}

/**
 * Normalizes a user-supplied display name for storage: strips control,
 * zero-width, and bidi-override characters, then trims surrounding
 * whitespace. Callers must separately reject values for which
 * {@link containsHtmlLikeMarkup} is true and enforce their own length bounds
 * on the result.
 */
export function sanitizeDisplayName(raw: string): string {
  return stripInvisibleAndControlChars(raw).trim();
}
