/**
 * Single source of truth for the client-side username rule (LS-7671).
 *
 * Shared by the web (`ProfileSettingsPage`) and native (`profile-settings`)
 * username editors so the accept/reject decision cannot drift between
 * platforms. Mirrors the server rule in `updateUsername`
 * (`lambdas/db/src/schema/users.ts`): trim, length 3-50, then
 * `[a-zA-Z0-9_.-]` only. Pure and Hermes-safe (no `normalize()`, no Node deps).
 */

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 50;
export const USERNAME_CHAR_REGEX = /^[a-zA-Z0-9_.-]+$/;

export type UsernameValidationResult =
  | { valid: true; username: string }
  | { valid: false; reason: 'length' | 'characters' };

/**
 * Validates a raw username input. Trims first, then checks length bounds, then
 * the character class — the same order as the server. Callers map `reason` to
 * their own user-facing copy.
 */
export function validateUsername(raw: string): UsernameValidationResult {
  const username = raw.trim();
  if (
    username.length < USERNAME_MIN_LENGTH ||
    username.length > USERNAME_MAX_LENGTH
  ) {
    return { valid: false, reason: 'length' };
  }
  if (!USERNAME_CHAR_REGEX.test(username)) {
    return { valid: false, reason: 'characters' };
  }
  return { valid: true, username };
}
