import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Verify a webhook HMAC-SHA256 signature.
 *
 * Both GitHub (`X-Hub-Signature-256`) and Jira (`X-Hub-Signature`) sign the
 * raw request body with the webhook secret and include the digest as
 * `sha256=<hex>`. Using timingSafeEqual prevents timing side-channel attacks.
 */
export function verifyGitHubSignature(
  rawBody: string,
  signatureHeader: string | undefined,
  secret: string,
): boolean {
  if (!signatureHeader || !secret) {
    return false;
  }

  const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;

  try {
    return timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
  } catch {
    // Buffer lengths differ — signatures can't match
    return false;
  }
}
