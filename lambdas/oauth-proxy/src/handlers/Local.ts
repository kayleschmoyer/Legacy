import { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';
import { LOGGER } from '@legacy-sports/logging';
import {
  createUser,
  getSubscriptionByUserId,
  getUserByEmail,
} from '@legacy-sports/db-client';
import { z, ZodError } from 'zod';
import { hashPassword, testPassword } from '../Users';
import { createJwt, JWT_COOKIE_NAME } from '../util/jwt';
import { encryptCookies } from '../util/cookie';
import { buildAuthCookies, generateCsrfToken } from '../util/jwt-cookie';
import { parseEventBody } from '../util/lambda';
import { withDbClient } from '../util/db';
import { deriveBillingStatus } from '../util/billing';
import { notifyNewUserSignup } from '../util/discord';

// Minimum password length on registration. Existing accounts with shorter
// passwords can still log in (LoginRequestSchema deliberately stays at min(1))
// because rejecting them at the schema layer would lock real users out.
export const MIN_PASSWORD_LENGTH = 12;

const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
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

export const handleLogin = async (
  event: APIGatewayEvent,
): Promise<APIGatewayProxyResult> => {
  let email: string;
  let password: string;
  try {
    ({ email, password } = parseEventBody(event, LoginRequestSchema));
  } catch (err) {
    if (err instanceof ZodError) return zodErrorToResponse(err);
    return errorResponse(400, 'Invalid request body');
  }

  LOGGER.debug('Initialize database.');
  return await withDbClient(async (db) => {
    const user = await getUserByEmail(db, email);

    if (!user?.passwordHash) {
      return errorResponse(401, 'Invalid credentials');
    }

    const isCorrect = await testPassword(password, user.passwordHash);

    if (!isCorrect) {
      return errorResponse(401, 'Invalid credentials');
    }

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
