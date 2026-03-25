export function utils(): string {
  return 'utils';
}

/**
 * Return a cryptographically-secure random integer in [0, max).
 * Uses the Web Crypto API (works in Node.js, browsers, and React Native).
 * Rejection sampling eliminates modulo bias.
 */
export function cryptoRandomInt(max: number): number {
  if (max <= 1) return 0;
  const array = new Uint32Array(1);
  const limit = 0x100000000 - (0x100000000 % max);
  let value: number;
  do {
    globalThis.crypto.getRandomValues(array);
    value = array[0];
  } while (value >= limit);
  return value % max;
}

/**
 * Return a cryptographically-secure random float in [0, 1).
 * Uses the Web Crypto API for 53-bit mantissa precision.
 */
export function cryptoRandomFloat(): number {
  const array = new Uint32Array(2);
  globalThis.crypto.getRandomValues(array);
  // Use 53 bits (JS double mantissa precision) for an unbiased float in [0, 1)
  const upper = array[0] & 0x001fffff; // 21 bits
  const lower = array[1]; // 32 bits
  return (upper * 2 ** 32 + lower) / 2 ** 53;
}

/**
 * Canonical Fisher-Yates shuffle — returns a new shuffled array.
 *
 * This is the single source of truth for array shuffling in the codebase.
 * All other copies have been removed in favour of this implementation.
 * Uses cryptographically-secure randomness via the Web Crypto API.
 */
export function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = cryptoRandomInt(i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Strip trailing junk from MLB API descriptions.
 * The API sometimes returns descriptions ending with ",  and." or ", , , ,  and."
 * when optional fields are empty.
 */
export function cleanDescription(desc: string): string {
  return desc.replace(/(?:,\s*)+and\.\s*$/, '.');
}

// ─── Player name extraction ─────────────────────────────────────────────────

/**
 * Position abbreviations recognised in MLB transaction descriptions.
 * Used by {@link extractPlayerNameFromDescription} to locate the player name
 * that follows a position token.
 */
const POSITIONS = 'C|1B|2B|3B|SS|OF|LF|CF|RF|P|SP|RP|DH|IF|INF|UTIL|RHP|LHP';

const PLAYER_NAME_RE = new RegExp(
  `(?:traded|signed(?:\\s+free\\s+agent)?)\\s+(?:${POSITIONS})\\s+(.+?)(?:\\s+to\\s+|\\s+for\\s+|\\.|,|$)`,
  'i',
);

/**
 * Extract a player name from an MLB transaction description when the
 * structured `person` / `playerName` field is missing.
 *
 * Common patterns:
 *   "Team traded POS Name to …"
 *   "Team signed free agent POS Name"
 *
 * Returns `null` when no name can be extracted.
 */
export function extractPlayerNameFromDescription(
  description: string,
): string | null {
  return PLAYER_NAME_RE.exec(description)?.[1]?.trim() || null;
}
