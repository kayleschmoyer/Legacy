import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Verify a GitHub webhook request using the HMAC-SHA256 signature in the
 * `X-Hub-Signature-256` header.
 *
 * GitHub signs the raw request body with the webhook secret and includes the
 * digest as `sha256=<hex>`. Using timingSafeEqual prevents timing side-channel
 * attacks.
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
