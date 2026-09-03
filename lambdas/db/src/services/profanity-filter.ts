/**
 * Profanity Filter Service (LS-6296)
 *
 * Minimal word-list based profanity/slur detector. Gives league chat
 * moderation parity with matchup chat's `containsProfanity` flag (FLD-044) —
 * league chat previously had no check at all.
 *
 * Word-boundary matched and case-insensitive so short entries don't flag
 * substrings inside unrelated words (the "Scunthorpe problem" — e.g. "ass"
 * must not match inside "class" or "assessment").
 */

const PROFANE_WORDS = [
  'fuck',
  'fucking',
  'fucked',
  'fucker',
  'shit',
  'shitty',
  'bullshit',
  'bitch',
  'bitches',
  'bastard',
  'cunt',
  'dick',
  'piss',
  'slut',
  'whore',
  'douche',
  'cock',
  'pussy',
  'asshole',
  'motherfucker',
  'nigger',
  'nigga',
  'faggot',
  'retard',
  'spic',
  'chink',
  'kike',
] as const;

const PROFANITY_PATTERN = new RegExp(`\\b(${PROFANE_WORDS.join('|')})\\b`, 'i');

/**
 * Returns true if `text` contains a profane or slur term as a whole word.
 * Not a comprehensive moderation solution (no leetspeak/obfuscation
 * detection) — the floor required to close the FLD-044 moderation gap.
 */
export function detectProfanity(text: string): boolean {
  if (!text) return false;
  return PROFANITY_PATTERN.test(text);
}
