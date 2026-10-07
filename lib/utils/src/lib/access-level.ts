/**
 * Display label for a user's `access_level` role (DB enum: `'none' | 'admin'`).
 *
 * This is the account role, not the subscription tier: every non-admin user,
 * free or Premium, is a "Member" (LS-10650). Shared by the web and mobile
 * profile settings screens so the two labels can't drift apart.
 */
export function getAccessLevelLabel(level: string | null | undefined): string {
  return level === 'admin' ? 'Administrator' : 'Member';
}
