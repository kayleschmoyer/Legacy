import { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';
import { authenticator } from 'otplib';
import { LOGGER } from '@legacy-sports/logging';
import { getUserById, getUserMfa } from '@legacy-sports/db-client';
import { testPassword } from '../Users';
import { withDbClient } from '../util/db';
import { getAuthenticatedUser } from '../util/authenticated-request';

/** Step-up verification is valid for 15 minutes (LGN-022 / LS-7834). */
const STEP_UP_VALIDITY_SECONDS = 15 * 60;

const jsonResponse = (
  statusCode: number,
  body: unknown,
): APIGatewayProxyResult => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

/**
 * POST /oauth/step-up/verify
 *
 * Re-authenticates the current session before sensitive billing or commissioner
 * actions. For MFA-enabled users the challenge is a TOTP code; users with a
 * local password use a password re-entry instead (LGN-022 / LS-7834).
 *
 * OAuth-only accounts (Google/Discord) have neither a password nor MFA, so there
 * is no second factor to challenge. Rather than dead-ending those users, an
 * empty-credential request acts as a session-only probe: when the caller has no
 * password and no MFA, the active session is itself the sole factor and step-up
 * is granted. Callers that DO have a credential must still present it.
 *
 * Auth: ls_jwt cookie (+ CSRF) or Authorization: Bearer <jwt>.
 * Request body: `{ code: string }` for TOTP, `{ password: string }`, or `{}`
 *               (session-only probe).
 * Response 200: `{ success: true, validUntil: number }` — Unix timestamp (s)
 *               marking the end of the freshness window.
 * Response 400: `{ error: "mfa_not_enrolled" }`, `{ error: "no_password" }`,
 *               `{ error: "password_required" }`, or `{ error: "mfa_required" }`.
 * Response 401: `{ error: "invalid_credential" }`.
 */
export const handleStepUpVerify = async (
  event: APIGatewayEvent,
): Promise<APIGatewayProxyResult> => {
  LOGGER.debug('handleStepUpVerify: starting');

  const auth = await getAuthenticatedUser(event);
  if (!auth.ok) return auth.response;
  const { id: userId } = auth.user;

  let code: string | undefined;
  let password: string | undefined;
  try {
    const body = JSON.parse(event.body ?? '{}') as {
      code?: unknown;
      password?: unknown;
    };
    if (typeof body.code === 'string' && body.code.trim() !== '') {
      code = body.code.trim();
    }
    if (typeof body.password === 'string' && body.password !== '') {
      password = body.password;
    }
  } catch {
    return jsonResponse(400, { error: 'Invalid request body' });
  }

  return withDbClient(async (db) => {
    const user = await getUserById(db, userId);
    if (!user) {
      LOGGER.warn('handleStepUpVerify: user not found', { userId });
      return jsonResponse(401, { error: 'invalid_credential' });
    }

    if (code === undefined && password === undefined) {
      // Session-only probe. Grant step-up only when there is genuinely no
      // second factor to challenge (OAuth-only account). If the user does have
      // a credential, tell the client which one to prompt for so it can present
      // the correct challenge instead of dead-ending.
      const mfa = await getUserMfa(db, userId);
      if (mfa?.mfaEnabled && mfa.totpSecret) {
        return jsonResponse(400, { error: 'mfa_required' });
      }
      if (user.passwordHash) {
        return jsonResponse(400, { error: 'password_required' });
      }
      const validUntil =
        Math.floor(Date.now() / 1000) + STEP_UP_VALIDITY_SECONDS;
      LOGGER.info(
        'handleStepUpVerify: session-only step-up granted (no second factor)',
        { userId, validUntil },
      );
      return jsonResponse(200, { success: true, validUntil });
    }

    if (code !== undefined) {
      // TOTP path — validate the submitted code against the enrolled secret.
      const mfa = await getUserMfa(db, userId);
      if (!mfa?.mfaEnabled || !mfa.totpSecret) {
        LOGGER.warn(
          'handleStepUpVerify: TOTP code submitted but user has no MFA enrollment',
          { userId },
        );
        return jsonResponse(400, { error: 'mfa_not_enrolled' });
      }
      const isValid = authenticator.verify({
        token: code,
        secret: mfa.totpSecret,
      });
      if (!isValid) {
        LOGGER.warn('handleStepUpVerify: invalid TOTP code', { userId });
        return jsonResponse(401, { error: 'invalid_credential' });
      }
    } else {
      // Password path — validate the submitted password against the stored hash.
      if (!user.passwordHash) {
        LOGGER.warn(
          'handleStepUpVerify: password submitted but user has no password hash',
          { userId },
        );
        return jsonResponse(400, { error: 'no_password' });
      }
      const isCorrect = await testPassword(
        password as string,
        user.passwordHash,
      );
      if (!isCorrect) {
        LOGGER.warn('handleStepUpVerify: invalid password', { userId });
        return jsonResponse(401, { error: 'invalid_credential' });
      }
    }

    const validUntil = Math.floor(Date.now() / 1000) + STEP_UP_VALIDITY_SECONDS;
    LOGGER.info('handleStepUpVerify: step-up verified', { userId, validUntil });
    return jsonResponse(200, { success: true, validUntil });
  });
};
