/**
 * Server-side username policy (LS-7240 / PRS-039): reserved/impersonation names
 * and profanity. Applied in `updateUsername` on top of the length/charset rule.
 *
 * Names are compared in a normalized form — lowercased, common leetspeak folded
 * to letters, separators (`_ . -`) and digits stripped — so `Adm1n`, `admin_`,
 * `s.u.p.p.o.r.t` and `legacy_sports` all collapse to their base word.
 */

const LEET_MAP: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  $: 's',
};

/** Names a user must not be able to claim (exact match after normalization). */
const RESERVED_EXACT = new Set([
  'admin',
  'administrator',
  'administrators',
  'support',
  'moderator',
  'moderators',
  'mod',
  'mods',
  'staff',
  'team',
  'official',
  'system',
  'root',
  'sysadmin',
  'superuser',
  'help',
  'helpdesk',
  'security',
  'service',
  'billing',
  'noreply',
  'owner',
  'commissioner',
]);

/** Any name starting with one of these is reserved (brand impersonation). */
const RESERVED_PREFIXES = ['legacy'];

/**
 * Profanity roots, matched as substrings of the normalized name. Kept to
 * unambiguous severe terms to limit false positives on legitimate names.
 */
const PROFANITY_SUBSTRINGS = [
  'fuck',
  'shit',
  'bitch',
  'cunt',
  'nigg',
  'fagg',
  'whore',
  'slut',
  'bastard',
  'dickhead',
  'asshole',
  'cocksuck',
  'motherfuck',
  'rapist',
  'nazi',
];

export type UsernamePolicyViolation = 'reserved' | 'profanity';

export function normalizeUsernameForPolicy(username: string): string {
  // Trailing digits/separators are a suffix (`support123`), not leetspeak.
  const base = username.toLowerCase().replace(/[\d_.-]+$/, '');
  let out = '';
  for (const ch of base) {
    out += LEET_MAP[ch] ?? ch;
  }
  return out.replace(/[^a-z]/g, '');
}

/**
 * Returns the violated rule, or `null` if the username is acceptable. Admins
 * may hold reserved (staff-style) names but are still subject to the
 * profanity filter.
 */
export function checkUsernamePolicy(
  username: string,
  options: { isAdmin?: boolean } = {},
): UsernamePolicyViolation | null {
  const normalized = normalizeUsernameForPolicy(username);

  if (PROFANITY_SUBSTRINGS.some((word) => normalized.includes(word))) {
    return 'profanity';
  }

  if (!options.isAdmin) {
    if (
      RESERVED_EXACT.has(normalized) ||
      RESERVED_PREFIXES.some((prefix) => normalized.startsWith(prefix))
    ) {
      return 'reserved';
    }
  }

  return null;
}
