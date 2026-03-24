import { timingSafeEqual } from 'crypto';
import type { RollbarEvent } from './types';

/**
 * Verify a webhook request by comparing the `auth` query-parameter token
 * against the stored webhook secret.  Uses constant-time comparison to
 * prevent timing side-channel attacks.
 *
 * @see https://docs.rollbar.com/docs/webhooks — Rollbar recommends passing
 * an auth token in the webhook URL query string.
 */
export function verifyWebhookToken(
  token: string | undefined,
  secret: string,
): boolean {
  if (!token || !secret) {
    return false;
  }
  const tokenBuf = Buffer.from(token);
  const secretBuf = Buffer.from(secret);
  if (tokenBuf.length !== secretBuf.length) {
    return false;
  }
  return timingSafeEqual(tokenBuf, secretBuf);
}

/**
 * Parse and validate the Rollbar webhook JSON payload.
 * Returns the typed event or null if the payload is malformed.
 */
export function parseRollbarPayload(body: string): RollbarEvent | null {
  try {
    const parsed = JSON.parse(body) as RollbarEvent;
    if (!parsed.event_name || !parsed.data) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
