import { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';
import { LOGGER } from '@legacy-sports/logging';
import {
  consumePasswordResetToken,
  createPasswordResetToken,
  deletePasswordResetTokensForUser,
  getUserByEmail,
  updateUserPassword,
} from '@legacy-sports/db-client';
import { z, ZodError } from 'zod';
import { MIN_PASSWORD_LENGTH } from './Local';
import { hashPassword } from '../Users';
import { getRequestBaseUrl, parseEventBody } from '../util/lambda';
import { withDbClient } from '../util/db';
import {
  generateResetToken,
  hashResetToken,
  resetTokenExpiry,
} from '../util/password-reset';
import { sendPasswordResetEmail } from '../util/email';
import {
  forgotPasswordPageHtml,
  resetPasswordPageHtml,
} from '../util/password-reset-html';

const ForgotPasswordRequestSchema = z.object({
  email: z.string().email(),
});

const ResetPasswordRequestSchema = z.object({
  token: z.string().min(1),
  password: z
    .string()
    .min(
      MIN_PASSWORD_LENGTH,
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    ),
  confirmPassword: z.string().min(1),
});

function jsonError(statusCode: number, message: string): APIGatewayProxyResult {
  return { statusCode, body: JSON.stringify({ error: message }) };
}

function zodErrorToResponse(error: ZodError): APIGatewayProxyResult {
  const first = error.issues[0];
  return jsonError(400, first?.message ?? 'Invalid request');
}

function htmlResponse(body: string): APIGatewayProxyResult {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    body,
  };
}

/**
 * Uniform success body for POST /oauth/forgot-password. The response is
 * identical whether or not an account exists for the email, so the endpoint
 * never reveals which addresses are registered (no account enumeration).
 */
const FORGOT_PASSWORD_UNIFORM_RESPONSE: APIGatewayProxyResult = {
  statusCode: 200,
  body: JSON.stringify({ status: 'sent' }),
};

/**
 * POST /oauth/forgot-password — request a password-reset link.
 *
 * Always returns a uniform 200 for any well-formed email. When the email maps
 * to a real account, a single-use, expiring, hashed-at-rest token is issued and
 * a reset link is emailed; otherwise nothing happens. Issuing a new token first
 * deletes any outstanding tokens for the user so old links stop working.
 */
export const handleForgotPassword = async (
  event: APIGatewayEvent,
): Promise<APIGatewayProxyResult> => {
  let email: string;
  try {
    ({ email } = parseEventBody(event, ForgotPasswordRequestSchema));
  } catch (err) {
    if (err instanceof ZodError) return zodErrorToResponse(err);
    return jsonError(400, 'Invalid request body');
  }

  const resetUrl = `${getRequestBaseUrl(event)}/oauth/reset-password`;

  try {
    await withDbClient(async (db) => {
      const user = await getUserByEmail(db, email);
      if (!user) {
        // Unknown email: do nothing but fall through to the uniform response.
        LOGGER.info('Forgot-password requested for unknown email');
        return;
      }

      const { rawToken, tokenHash } = generateResetToken();
      await deletePasswordResetTokensForUser(db, user.id);
      await createPasswordResetToken(
        db,
        user.id,
        tokenHash,
        resetTokenExpiry(),
      );

      await sendPasswordResetEmail(
        user.email,
        `${resetUrl}?token=${encodeURIComponent(rawToken)}`,
      );
    });
  } catch (error) {
    // Never surface internal failures to the caller — doing so could leak
    // account existence. Log for operators and still return the uniform 200.
    // Pass the Error instance directly so Rollbar can extract the stack trace.
    LOGGER.error(
      'Forgot-password processing failed',
      error instanceof Error ? error : new Error(String(error)),
    );
  }

  return FORGOT_PASSWORD_UNIFORM_RESPONSE;
};

/**
 * POST /oauth/reset-password — consume a reset token and set a new password.
 *
 * Validates the new password before touching the token so a validation error
 * never burns a single-use token. The token is consumed atomically (marked used
 * only if currently unused and unexpired); a missing/used/expired token yields a
 * generic 400 with no detail about why.
 */
export const handleResetPassword = async (
  event: APIGatewayEvent,
): Promise<APIGatewayProxyResult> => {
  let token: string;
  let password: string;
  let confirmPassword: string;
  try {
    ({ token, password, confirmPassword } = parseEventBody(
      event,
      ResetPasswordRequestSchema,
    ));
  } catch (err) {
    if (err instanceof ZodError) return zodErrorToResponse(err);
    return jsonError(400, 'Invalid request body');
  }

  if (password !== confirmPassword) {
    return jsonError(400, 'Password and confirm password must match');
  }

  // Hash before consuming the token: the work is independent of validity, so
  // doing it first keeps timing uniform and avoids burning a single-use token
  // on a slow hash.
  const passwordHash = await hashPassword(password);
  const tokenHash = hashResetToken(token);

  return await withDbClient(async (db) => {
    // Atomic single-use consume: marks the token used only if it is currently
    // unused and unexpired, returning the row only on success.
    const consumed = await consumePasswordResetToken(db, tokenHash);
    if (!consumed) {
      return jsonError(400, 'This reset link is invalid or has expired');
    }

    await updateUserPassword(db, consumed.userId, passwordHash);
    // Invalidate any other outstanding tokens for this user.
    await deletePasswordResetTokensForUser(db, consumed.userId);

    LOGGER.info('Password reset completed', { userId: consumed.userId });
    return { statusCode: 200, body: JSON.stringify({ status: 'reset' }) };
  });
};

/** GET /oauth/forgot-password — render the request-a-link page. */
export const handleForgotPasswordPage = (
  _event: APIGatewayEvent,
): APIGatewayProxyResult => {
  return htmlResponse(forgotPasswordPageHtml());
};

/** GET /oauth/reset-password?token=... — render the choose-a-password page. */
export const handleResetPasswordPage = (
  event: APIGatewayEvent,
): APIGatewayProxyResult => {
  const token = event.queryStringParameters?.token;
  return htmlResponse(
    resetPasswordPageHtml(Boolean(token), MIN_PASSWORD_LENGTH),
  );
};
