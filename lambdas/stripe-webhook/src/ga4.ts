import { LOGGER } from '@legacy-sports/logging';

/**
 * Send a GA4 Measurement Protocol event from the server side.
 *
 * Uses the GA4 Measurement Protocol API to track server-side subscription
 * lifecycle events that may not be captured by the client-side gtag.js
 * (e.g., webhook-triggered renewals, cancellations).
 *
 * Requires GA_MEASUREMENT_ID and GA_API_SECRET env vars. If either is absent,
 * the call is silently skipped (non-production or unconfigured environments).
 *
 * Reference: https://developers.google.com/analytics/devguides/collection/protocol/ga4
 */
export async function sendGa4ServerEvent(
  userId: number | null,
  eventName: string,
  params: Record<string, string | number | undefined>,
): Promise<void> {
  const measurementId = process.env['GA_MEASUREMENT_ID'];
  const apiSecret = process.env['GA_API_SECRET'];

  if (!measurementId || !apiSecret) {
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
