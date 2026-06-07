/**
 * Mask an email address for logging / audit output so it never lands in logs
 * or audit events as plaintext PII while remaining useful for incident
 * response (the domain and first local-part character are preserved, which is
 * enough to recognize a targeted account without exposing the full address).
 *
 * Examples:
 *   maskEmail('jane.doe@example.com') === 'j***@example.com'
 *   maskEmail('a@example.com')        === '***@example.com'
 *   maskEmail('not-an-email')         === '***'
 */
export function maskEmail(email: string): string {
  const [localPart, domain] = email.split('@');
  if (!domain || !localPart) return '***';
  const maskedLocal = localPart.length <= 1 ? '***' : `${localPart[0]}***`;
  return `${maskedLocal}@${domain}`;
}
