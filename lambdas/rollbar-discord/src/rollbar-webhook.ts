import type { RollbarEvent } from './types';

/**
 * Known Rollbar outbound IP addresses used for webhook delivery.
 * Override via ROLLBAR_OUTBOUND_IPS env var (comma-separated).
 * @see https://docs.rollbar.com/docs/rollbar-ip-addresses
 */
const DEFAULT_ROLLBAR_IPS = ['35.184.69.251'];
const ROLLBAR_OUTBOUND_IPS = new Set(
  process.env['ROLLBAR_OUTBOUND_IPS']
    ? process.env['ROLLBAR_OUTBOUND_IPS'].split(',').map((ip) => ip.trim())
    : DEFAULT_ROLLBAR_IPS,
);

/**
 * Verify that the request originates from a known Rollbar IP address.
 * Returns true if the source IP matches a known Rollbar outbound IP.
 */
export function verifyOrigin(sourceIp: string | undefined): boolean {
  if (!sourceIp) {
    return false;
  }
  return ROLLBAR_OUTBOUND_IPS.has(sourceIp);
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
