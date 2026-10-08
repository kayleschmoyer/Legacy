/** League and mock-draft invite codes are exactly this many characters. */
export const INVITE_CODE_LENGTH = 8;

/**
 * Canonical form of user-entered invite-code text (LS-10652).
 *
 * Codes are pasted from chat and email with surrounding whitespace, and
 * sometimes grouped with spaces or dashes ("LHTC-J9ZZ"). Strip everything
 * that isn't a letter or digit, upper-case, then cap at
 * {@link INVITE_CODE_LENGTH}. Inputs must apply this in their change handler
 * instead of a native `maxLength`: the browser truncates a paste to
 * `maxLength` *before* the handler sees it, so leading spaces would eat the
 * code's last characters.
 */
export function normalizeInviteCode(raw: string): string {
  return raw
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
    .slice(0, INVITE_CODE_LENGTH);
}
