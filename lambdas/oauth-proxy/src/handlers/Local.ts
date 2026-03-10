import { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';
import { LOGGER } from '@legacy-sports/logging';
import { createUser, getUserByEmail } from '@legacy-sports/db-client';
import { hashPassword, testPassword } from '../Users';
import { createJwt, JWT_COOKIE_NAME } from '../util/jwt';
import { encryptCookies } from '../util/cookie';
import { withDbClient } from '../util/db';

interface LoginRequest {
  email: string;
  password: string;
}

interface RegisterRequest {
  email: string;
  password: string;
  confirmPassword: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

function errorResponse(
  statusCode: number,
  message: string,
): APIGatewayProxyResult {
  return { statusCode, body: JSON.stringify({ error: message }) };
}

function parseBody<T>(body: string | null): T | null {
  if (!body) return null;
  try {
    return JSON.parse(body) as T;
  } catch {
    return null;
  }
}

export const handleLogin = async (
  event: APIGatewayEvent,
): Promise<APIGatewayProxyResult> => {
  const body = parseBody<LoginRequest>(event.body);

  if (
    !body ||
    typeof body.email !== 'string' ||
    typeof body.password !== 'string'
  ) {
    return errorResponse(400, 'Invalid request body');
  }

  const { email, password } = body;

  if (!EMAIL_REGEX.test(email)) {
    return errorResponse(400, 'Invalid email format');
  }

  if (!password) {
    return errorResponse(400, 'Password is required');
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

    return {
      body: JSON.stringify({
        jwt: internalJwt,
      }),
      headers: {
        'Set-Cookie': cookieHeader,
      },
      statusCode: 200,
    };
  });
};

export const handleRegister = async (
  event: APIGatewayEvent,
): Promise<APIGatewayProxyResult> => {
  const body = parseBody<RegisterRequest>(event.body);

  if (
    !body ||
    typeof body.email !== 'string' ||
    typeof body.password !== 'string' ||
    typeof body.confirmPassword !== 'string'
  ) {
    return errorResponse(400, 'Invalid request body');
  }

  const { email, password, confirmPassword } = body;

  if (!EMAIL_REGEX.test(email)) {
    return errorResponse(400, 'Invalid email format');
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return errorResponse(
      400,
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    );
  }

  if (password !== confirmPassword) {
    return errorResponse(400, 'Password and confirm password must match');
  }

  LOGGER.debug('Initialize database.');
  return await withDbClient(async (db) => {
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

      return await createJwt(user);
    });

    const cookies = {
      [JWT_COOKIE_NAME]: internalJwt,
    };

    const cookieHeader = await encryptCookies(cookies);

    return {
      body: JSON.stringify({
        jwt: internalJwt,
      }),
      headers: {
        'Set-Cookie': cookieHeader,
      },
      statusCode: 200,
    };
  });
};
