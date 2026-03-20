import { createHmac, timingSafeEqual } from 'crypto';
import type { RollbarEvent } from './types';

/**
 * Verify the HMAC-SHA256 signature from a Rollbar webhook request.
 * Returns true if valid, false otherwise.
 */
export function verifySignature(
  body: string,
  signature: string | undefined,
  secret: string,
): boolean {
  if (!signature) {
    return false;
  }

  const expected = createHmac('sha256', secret).update(body).digest('hex');

  // Constant-time comparison to prevent timing attacks
  try {
    return timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expected, 'hex'),
    );
  } catch {
    // Buffers different length → invalid
    return false;
  }
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
