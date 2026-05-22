import { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';
import { LOGGER } from '@legacy-sports/logging';
import { createUser, getUserByEmail } from '@legacy-sports/db-client';
import { z, ZodError } from 'zod';
import { hashPassword, testPassword } from '../Users';
import { createJwt, JWT_COOKIE_NAME } from '../util/jwt';
import { encryptCookies } from '../util/cookie';
import { buildAuthCookies, generateCsrfToken } from '../util/jwt-cookie';
import { parseEventBody } from '../util/lambda';
import { withDbClient } from '../util/db';
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

    const cookies = {
      [JWT_COOKIE_NAME]: internalJwt,
    };

    const cookieHeader = await encryptCookies(cookies);
    const csrfToken = generateCsrfToken();
    const authCookies = buildAuthCookies(internalJwt, csrfToken);

    return {
      body: JSON.stringify({
        jwt: internalJwt,
        csrfToken,
      }),
      multiValueHeaders: {
        'Set-Cookie': [cookieHeader, ...authCookies],
      },
      statusCode: 200,
    };
  });
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

  LOGGER.debug('Initialize database.');
  let newUserId: number | null = null;
  const result = await withDbClient(async (db) => {
    LOGGER.debug('Get User');
    const existingUser = await getUserByEmail(db, email);
    if (existingUser !== null) {
      return errorResponse(409, 'An account with this email already exists');
    }

    const internalJwt = await db.transaction(async () => {
      const hashedPassword = await hashPassword(password);
      const user = await createUser(db, email, hashedPassword);

      if (user === null) {
        throw new Error('Failed to create user.');
      }

      newUserId = user.id;
      return await createJwt(user);
    });

    const cookies = {
      [JWT_COOKIE_NAME]: internalJwt,
    };

    const cookieHeader = await encryptCookies(cookies);
    const csrfToken = generateCsrfToken();
    const authCookies = buildAuthCookies(internalJwt, csrfToken);

    return {
      body: JSON.stringify({
        jwt: internalJwt,
        csrfToken,
      }),
      multiValueHeaders: {
        'Set-Cookie': [cookieHeader, ...authCookies],
      },
      statusCode: 200,
    };
  });

  // Best-effort Discord notification — sent after DB connection is released
  if (newUserId !== null) {
    await notifyNewUserSignup(email, newUserId, 'local');
  }

  return result;
};
