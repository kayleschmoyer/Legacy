/**
 * Gated Android APK download (LS-9455, parent LS-9452).
 *
 * `GET /oauth/download/android` is the authenticated front door for the app.
 * A tester scanning the QR code lands here with no session, gets bounced
 * through Google, and comes back to a 302 pointing at a short-lived presigned
 * S3 URL — or to a page telling them which address was refused.
 *
 * Authorization is two ordered checks:
 *   1. Admins are served unconditionally, with no allowlist row required.
 *   2. Everyone else needs an unrevoked row matching their verified email.
 *
 * Every outcome is audited, and a grant records *which* of the two paths
 * allowed it, so the log can answer "who actually needed to be on the list".
 */

import { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { LOGGER } from '@legacy-sports/logging';
import {
  type AppDownloadOutcome,
  isEmailAllowlisted,
  recordDownloadAttempt,
} from '@legacy-sports/db-client';
import { getNavigationUser } from '../util/authenticated-request';
import { withDbClient } from '../util/db';
import { htmlEscape } from '../util/html';

/**
 * Marker carried in the OAuth `state` extra slot so the Google callback knows
 * to return the browser here instead of rendering its JSON result. The slot is
 * otherwise used by the CLI device flow to carry a device code; the two are
 * distinguished by this literal, which no device code can collide with.
 */
export const DOWNLOAD_RETURN_STATE = 'download:android';

/** The route the callback sends the browser back to once a session exists. */
export const ANDROID_DOWNLOAD_PATH = '/oauth/download/android';

/**
 * Presigned URL lifetime. Short on purpose: the URL is a bearer credential —
 * anyone holding it can fetch the APK until it expires — so it is scoped to
 * about as long as one redirect plus one download start.
 */
const PRESIGN_TTL_SECONDS = 300;

let s3Client: S3Client | undefined;

function getS3Client(): S3Client {
  s3Client ??= new S3Client({});
  return s3Client;
}

/** Reset the memoised client. Test seam only. */
export function resetS3ClientForTests(): void {
  s3Client = undefined;
}

function htmlResponse(
  statusCode: number,
  title: string,
  bodyHtml: string,
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    body: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${htmlEscape(title)}</title>
</head>
<body style="font-family: system-ui, sans-serif; max-width: 32rem; margin: 3rem auto; padding: 0 1rem; line-height: 1.5;">
${bodyHtml}
</body>
</html>`,
  };
}

/**
 * Audit an attempt. Never allowed to fail the request: a download that worked
 * must not 500 because the log write did, and a denial must still render its
 * page. The write is best-effort and its failure is logged instead.
 */
async function audit(
  email: string,
  outcome: AppDownloadOutcome,
  userAgent: string | null,
  apkVersion: string | null,
): Promise<void> {
  try {
    await withDbClient((db) =>
      recordDownloadAttempt(db, { email, outcome, apkVersion, userAgent }),
    );
  } catch (error) {
    LOGGER.error(
      'Failed to record app download audit row',
      error instanceof Error ? error : new Error(String(error)),
      { outcome },
    );
  }
}

/**
 * GET /oauth/download/android
 */
export const handleAndroidDownload = async (
  event: APIGatewayEvent,
): Promise<APIGatewayProxyResult> => {
  const bucket = process.env['APP_DOWNLOAD_BUCKET'];
  const key = process.env['APP_DOWNLOAD_ANDROID_CURRENT_KEY'];
  const userAgent =
    event.headers?.['User-Agent'] ?? event.headers?.['user-agent'] ?? null;

  if (!bucket || !key) {
    LOGGER.error(
      'App download route is misconfigured',
      new Error(
        'APP_DOWNLOAD_BUCKET or APP_DOWNLOAD_ANDROID_CURRENT_KEY unset',
      ),
    );
    return htmlResponse(
      500,
      'Download unavailable',
      `<h1>Download unavailable</h1>
       <p>The download service is not configured. Please let the team know.</p>`,
    );
  }

  const user = await getNavigationUser(event);

  // No session — the usual case for a phone that just scanned the QR code.
  // Hand off to the existing Google flow and let its callback bring the
  // browser back here once the session cookie is set.
  if (!user) {
    LOGGER.info('App download: no session, redirecting to Google sign-in');
    return {
      statusCode: 302,
      headers: {
        Location: `/oauth/google/authorize?state=${encodeURIComponent(
          DOWNLOAD_RETURN_STATE,
        )}`,
      },
      body: '',
    };
  }

  const allowed = user.isAdmin
    ? true
    : await withDbClient((db) => isEmailAllowlisted(db, user.email));

  if (!allowed) {
    LOGGER.info('App download denied: address not on the allowlist');
    await audit(user.email, 'denied', userAgent, null);
    return htmlResponse(
      403,
      'Not on the tester list',
      `<h1>Not on the tester list</h1>
       <p>You are signed in as <strong>${htmlEscape(user.email)}</strong>, which is not approved to download the app.</p>
       <p>If that is the wrong account, sign out and try again with the address you gave the team. Otherwise, send them that address and ask to be added.</p>`,
    );
  }

  const outcome: AppDownloadOutcome = user.isAdmin
    ? 'allowed_admin'
    : 'allowed_listed';

  try {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseContentDisposition:
        'attachment; filename="legacy-sports-latest.apk"',
    });
    // @aws-sdk/s3-request-presigner ships its own nested copy of
    // @smithy/types, structurally identical to but nominally distinct from
    // the one @aws-sdk/client-s3 uses — a package-manager dual-package
    // hazard, not a real type mismatch. Assert through the presigner's own
    // parameter types (not `any`) to bridge the two copies, matching the
    // existing workaround in tools/mcp/ci-server/src/s3-artifacts.ts.
    const url = await getSignedUrl(
      getS3Client() as unknown as Parameters<typeof getSignedUrl>[0],
      command as unknown as Parameters<typeof getSignedUrl>[1],
      { expiresIn: PRESIGN_TTL_SECONDS },
    );

    await audit(user.email, outcome, userAgent, key);

    LOGGER.info('App download granted', { outcome });
    return {
      statusCode: 302,
      headers: {
        Location: url,
        // The redirect target is a credential with a short life; keep it out
        // of any shared cache.
        'Cache-Control': 'no-store, private',
      },
      body: '',
    };
  } catch (error) {
    LOGGER.error(
      'Failed to presign the Android APK',
      error instanceof Error ? error : new Error(String(error)),
    );
    return htmlResponse(
      500,
      'Download unavailable',
      `<h1>Download unavailable</h1>
       <p>Your access is approved, but the download could not be prepared. Please try again shortly.</p>`,
    );
  }
};
