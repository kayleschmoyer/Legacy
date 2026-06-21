import { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';
import { LOGGER } from '@legacy-sports/logging';
import {
  createUser,
  getSubscriptionByUserId,
  getUserByEmail,
  getUserMfa,
  updateLastLoginAt,
} from '@legacy-sports/db-client';
import { authenticator } from 'otplib';
import { z, ZodError } from 'zod';
import { hashPassword, testPassword } from '../Users';
import { createJwt, JWT_COOKIE_NAME } from '../util/jwt';
import { encryptCookies } from '../util/cookie';
import { buildAuthCookies, generateCsrfToken } from '../util/jwt-cookie';
import { parseEventBody } from '../util/lambda';
import { withDbClient } from '../util/db';
import { deriveBillingStatus } from '../util/billing';
import { notifyNewUserSignup } from '../util/discord';
import {
  clearFailedLogins,
  isLoginLocked,
  recordFailedLogin,
} from '../util/login-throttle';
import { getClientIp } from '../util/rate-limit';
import { maskEmail } from '../util/email';

// Minimum password length on registration. New accounts must meet this bar.
export const MIN_PASSWORD_LENGTH = 12;

// Minimum password length accepted on login. Kept below MIN_PASSWORD_LENGTH so
// legacy accounts created before the 12-char rule can still authenticate, but
// raised above 1 so obviously-noise inputs (empty strings, single keystrokes)
// are rejected at the schema layer before touching the database (LGN-021).
export const MIN_LOGIN_PASSWORD_LENGTH = 8;

const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(MIN_LOGIN_PASSWORD_LENGTH),
  // Optional TOTP code for the MFA second-factor step (LGN-022 / LS-7832).
  // Absent on the first call → triggers the MFA challenge response.
  // Present on the follow-up call → validated before a JWT is issued.
  code: z.string().optional(),
});

const RegisterRequestSchema = z.object({
  email: z.string().email(),
  password: z
    .string()
    .min(
      MIN_PASSWORD_LENGTH,
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    ),
  confirmPassword: z.string().min(1),
});

function errorResponse(
  statusCode: number,
  message: string,
): APIGatewayProxyResult {
  return { statusCode, body: JSON.stringify({ error: message }) };
}

function zodErrorToResponse(error: ZodError): APIGatewayProxyResult {
  const first = error.issues[0];
  const message = first?.message ?? 'Invalid request';
  return errorResponse(400, message);
}

// Cache a dummy bcrypt hash at module init to equalize handleLogin timing
// across the user-found and user-not-found branches (LGN-018 / LS-6673).
// Without this the missing-user path returns ~0 ms while the existing-user
// path waits for bcrypt (~250 ms), giving a clean email-enumeration oracle.
const DUMMY_PASSWORD_HASH: Promise<string> = hashPassword('__dummy_timing__');

export const handleLogin = async (
  event: APIGatewayEvent,
): Promise<APIGatewayProxyResult> => {
  let email: string;
  let password: string;
  let code: string | undefined;
  try {
    ({ email, password, code } = parseEventBody(event, LoginRequestSchema));
  } catch (err) {
    if (err instanceof ZodError) return zodErrorToResponse(err);
    return errorResponse(400, 'Invalid request body');
  }

  // Sanitized identifiers for the audit trail (LGN-019). The masked email and
  // client IP let incident response answer "is someone brute-forcing user X?"
  // without writing plaintext PII into logs.
  const ip = getClientIp(event);
  const maskedEmail = maskEmail(email);

  // Per-email lockout (LGN-020 / LS-6675). The IP limiter in util/rate-limit.ts
  // is per-instance and per-IP only, so credential-stuffing against a single
  // email from many IPs slips past it. This counter is keyed by the target
  // email and shared across containers, so a locked email stays locked
  // regardless of source IP. Fail-open: a storage outage degrades to allow.
  const lock = await isLoginLocked(email);
  if (lock.locked) {
    LOGGER.warn('Login locked: too many failed attempts for target email', {
      retryAfterSeconds: lock.retryAfterSeconds,
    });
    return {
      statusCode: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(lock.retryAfterSeconds),
      },
      body: JSON.stringify({
        error: 'rate_limited',
        message: 'Too many failed login attempts. Please try again later.',
      }),
    };
  }

  LOGGER.debug('Initialize database.');
  return await withDbClient(async (db) => {
    const user = await getUserByEmail(db, email);

    if (!user?.passwordHash) {
      // Always run bcrypt to prevent user-enumeration via response timing
      // (LGN-018). The result is discarded — the branch always returns 401.
      await testPassword(password, await DUMMY_PASSWORD_HASH);
      await recordFailedLogin(email);
      LOGGER.warn('login.failed', {
        audit: true,
        email: maskedEmail,
        ip,
        reason: 'unknown_user',
      });
      return errorResponse(401, 'Invalid credentials');
    }

    const isCorrect = await testPassword(password, user.passwordHash);

    if (!isCorrect) {
      await recordFailedLogin(email);
      LOGGER.warn('login.failed', {
        audit: true,
        email: maskedEmail,
        ip,
        reason: 'invalid_password',
      });
      return errorResponse(401, 'Invalid credentials');
    }

    // MFA second-factor enforcement (LGN-022 / LS-7832). Password is correct at
    // this point. If the user has enrolled TOTP, they must also supply a valid
    // code before a JWT is issued. Users who have not enrolled (mfaEnabled=false)
    // are never affected — 2FA remains strictly optional (LGN-029 invariant).
    if (user.mfaEnabled) {
      if (!code) {
        // First factor passed — signal that a second factor is required.
        // No JWT or auth cookies are set; the caller must re-POST with a code.
        LOGGER.debug('login.mfa_challenge', { userId: user.id });
        return {
          statusCode: 200,
          body: JSON.stringify({ mfaRequired: true }),
        };
      }

      const mfa = await getUserMfa(db, user.id);
      if (!mfa?.totpSecret) {
        LOGGER.error(
          'login.mfa_state_inconsistent: mfa_enabled but no TOTP secret',
          new Error('MFA state inconsistent: mfa_enabled but no TOTP secret'),
          { userId: user.id },
        );
        return errorResponse(500, 'Internal server error');
      }

      if (!authenticator.verify({ token: code, secret: mfa.totpSecret })) {
        await recordFailedLogin(email);
        LOGGER.warn('login.failed', {
          audit: true,
          email: maskedEmail,
          ip,
          reason: 'invalid_totp',
        });
        return errorResponse(401, 'Invalid credentials');
      }
    }

    // Successful login: clear the failed-attempt counter (LGN-020), stamp
    // last_login_at for account-security UX, and emit a structured audit event
    // for observability / incident response (LGN-019). The audit email is
    // deliberately masked here too — userId already gives full traceability for
    // incident response, so there is no need to write plaintext email PII into
    // CloudWatch on every successful login.
    await clearFailedLogins(email);
    await updateLastLoginAt(db, user.id);
    LOGGER.info('login.success', {
      audit: true,
      userId: user.id,
      email: maskedEmail,
      ip,
    });

    const internalJwt = await createJwt(user);

    // Advisory billing-standing hint so the client can route past-due premium
    // users to billing after login (LGN-029). This never gates login — a
    // missing subscription row simply degrades to 'ok'.
    const subscription = await getSubscriptionByUserId(db, user.id);
    const billingStatus = deriveBillingStatus(subscription?.status);

    const cookies = {
      [JWT_COOKIE_NAME]: internalJwt,
    };

    const encryptedCookies = await encryptCookies(cookies);
    const csrfToken = generateCsrfToken();
    const authCookies = buildAuthCookies(internalJwt, csrfToken);

    return {
      body: JSON.stringify({
        jwt: internalJwt,
        csrfToken,
        billingStatus,
      }),
      multiValueHeaders: {
        'Set-Cookie': [...encryptedCookies, ...authCookies],
      },
      statusCode: 200,
    };
  });
};

/**
 * Uniform response returned by /oauth/register regardless of whether the
 * email is already registered. The body and status code MUST be identical
 * for the new-user and existing-user branches — any observable difference
 * (status, body, headers) would re-introduce the account-enumeration leak
 * this endpoint is hardened against (LS-2549).
 *
 * Note: no JWT or auth cookies are issued here. Once email verification
 * is in place the verification email will deliver the appropriate path
 * (welcome vs. "you already have an account, here is a password reset").
 * Until then callers must log in separately via /oauth/login after
 * registering — see apps/web-e2e/src/utils/test-user-auth.ts.
 */
const REGISTER_UNIFORM_RESPONSE: APIGatewayProxyResult = {
  statusCode: 200,
  body: JSON.stringify({ status: 'pending' }),
};

export const handleRegister = async (
  event: APIGatewayEvent,
): Promise<APIGatewayProxyResult> => {
  let email: string;
  let password: string;
  let confirmPassword: string;
  try {
    ({ email, password, confirmPassword } = parseEventBody(
      event,
      RegisterRequestSchema,
    ));
  } catch (err) {
    if (err instanceof ZodError) return zodErrorToResponse(err);
    return errorResponse(400, 'Invalid request body');
  }

  if (password !== confirmPassword) {
    return errorResponse(400, 'Password and confirm password must match');
  }

  // Always hash the password — even if the user already exists — so the
  // existing-email and new-email branches do roughly the same amount of
  // work. Without this, an attacker could distinguish the two branches
  // by timing (hashing dominates the new-user path).
  const hashedPassword = await hashPassword(password);

  LOGGER.debug('Initialize database.');
  let newUserId: number | null = null;
  let userCreateFailed = false;
  await withDbClient(async (db) => {
    LOGGER.debug('Get User');
    const existingUser = await getUserByEmail(db, email);
    if (existingUser !== null) {
      // Existing email: log internally but return the uniform response so
      // the API does not confirm account existence to the caller. Email is
      // intentionally omitted from the log to avoid PII exposure.
      LOGGER.info(
        'Register called for existing email; returning uniform response',
      );
      return;
    }

    await db.transaction(async () => {
      const user = await createUser(db, email, hashedPassword);

      if (user === null) {
        userCreateFailed = true;
        return;
      }

      newUserId = user.id;
    });
  });

  if (userCreateFailed) {
    LOGGER.error(
      'createUser returned null for a new email; cannot create user',
    );
    return errorResponse(500, 'Internal server error');
  }

  // Best-effort Discord notification — sent after DB connection is released
  if (newUserId !== null) {
    await notifyNewUserSignup(email, newUserId, 'local');
  }

  return REGISTER_UNIFORM_RESPONSE;
};
