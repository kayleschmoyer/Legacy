import { LOGGER } from '@legacy-sports/logging';
import { readSecret } from '@legacy-sports/aws-utils';

/**
 * Cached promise for the GA API secret. Resolved on first use and reused for
 * subsequent invocations of the same warm Lambda container. If the fetch
 * rejects, the cache is cleared so the next caller retries (transient
 * Secrets Manager / IAM failures should not permanently poison the container).
 */
let apiSecretPromise: Promise<string> | null = null;

function getApiSecret(): Promise<string> {
  if (!apiSecretPromise) {
    // Treat an empty-string local env var as "unset" so a blank GA_API_SECRET
    // in the environment doesn't short-circuit the Secrets Manager fallback.
    const localApiSecret = process.env['GA_API_SECRET'];
    const pending = readSecret({
      localEnvVar: localApiSecret ? 'GA_API_SECRET' : undefined,
      secretPathEnvVar: 'GA_API_SECRET_SECRET_NAME',
    });
    pending.catch(() => {
      if (apiSecretPromise === pending) {
        apiSecretPromise = null;
      }
    });
    apiSecretPromise = pending;
  }
  return apiSecretPromise;
}

/**
 * Send a GA4 Measurement Protocol event from the server side.
 *
 * Uses the GA4 Measurement Protocol API to track server-side subscription
 * lifecycle events that may not be captured by the client-side gtag.js
 * (e.g., webhook-triggered renewals, cancellations).
 *
 * Requires GA_MEASUREMENT_ID and either GA_API_SECRET (local dev) or
 * GA_API_SECRET_SECRET_NAME (pointing to an AWS Secrets Manager secret). If
 * either piece of configuration is absent, the call is silently skipped.
 *
 * Reference: https://developers.google.com/analytics/devguides/collection/protocol/ga4
 */
export async function sendGa4ServerEvent(
  userId: number | null,
  eventName: string,
  params: Record<string, string | number | undefined>,
): Promise<void> {
  const measurementId = process.env['GA_MEASUREMENT_ID'];

  if (
    !measurementId ||
    (!process.env['GA_API_SECRET'] && !process.env['GA_API_SECRET_SECRET_NAME'])
  ) {
    return;
  }

  let apiSecret: string;
  try {
    apiSecret = await getApiSecret();
  } catch (err) {
    LOGGER.warn('[GA4] Failed to retrieve API secret (non-fatal)', {
      err,
      eventName,
      userId,
    });
    return;
  }
  if (!apiSecret) {
    return;
  }

  const url = `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`;

  // GA4 Measurement Protocol requires a client_id. For server-side events we
  // use a synthetic ID scoped to the userId so events can be stitched together.
  const clientId = userId !== null ? `server.${userId}` : 'server.unknown';
  const payload = {
    client_id: clientId,
    ...(userId !== null && { user_id: String(userId) }),
    events: [{ name: eventName, params }],
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
    if (!response.ok) {
      const bodyText = await response.text().catch(() => '');
      LOGGER.warn('[GA4] Measurement Protocol event returned non-2xx', {
        eventName,
        statusCode: response.status,
        statusText: response.statusText,
        body: bodyText,
        userId,
      });
    } else {
      LOGGER.info('[GA4] Measurement Protocol event sent', {
        eventName,
        statusCode: response.status,
        userId,
      });
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      LOGGER.warn('[GA4] Measurement Protocol event timed out (non-fatal)', {
        eventName,
        userId,
      });
    } else {
      LOGGER.warn('[GA4] Measurement Protocol event failed (non-fatal)', {
        err,
        eventName,
        userId,
      });
    }
  }
}
