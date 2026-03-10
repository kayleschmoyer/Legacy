import { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';
import { LOGGER } from '@legacy-sports/logging';
import { createUser, getUserByEmail } from '@legacy-sports/db-client';
import { hashPassword, testPassword } from '../Users';
import { createJwt, JWT_COOKIE_NAME } from '../util/jwt';
import { encryptCookies } from '../util/cookie';
import { parseEventBody } from '../util/lambda';
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

export const handleLogin = async (event: APIGatewayEvent) => {
  const { email, password } = parseEventBody<LoginRequest>(event);

  LOGGER.debug('Initialize database.');
  return await withDbClient(async (db) => {
    const user = await getUserByEmail(db, email);

    if (!user?.passwordHash) {
      throw new Error('Invalid email or password');
    }

    const isCorrect = await testPassword(password, user.passwordHash);

    if (!isCorrect) {
      throw new Error('Invalid email or password');
    }

    const internalJwt = await createJwt(user);

    const cookies = {
      [JWT_COOKIE_NAME]: internalJwt,
    };

    const cookieHeader = await encryptCookies(cookies);

    const result: APIGatewayProxyResult = {
      body: JSON.stringify({
        jwt: internalJwt,
      }),
      headers: {
        'Set-Cookie': cookieHeader,
      },
      statusCode: 200,
    };

    return result;
  });
};

export const handleRegister = async (event: APIGatewayEvent) => {
  const { email, password, confirmPassword } =
    parseEventBody<RegisterRequest>(event);

  if (password !== confirmPassword) {
    throw new Error('Password and ConfirmPassword must match!');
  }

  LOGGER.debug('Initialize database.');
  return await withDbClient(async (db) => {
    const internalJwt = await db.transaction(async () => {
      LOGGER.debug('Get User');
      let user = await getUserByEmail(db, email);
      if (user !== null) {
        throw new Error('An account with this email already exists');
      }

      const hashedPassword = await hashPassword(password);
      user = await createUser(db, email, hashedPassword);

      if (user === null) {
        throw new Error('Failed to create user.');
      }

      return await createJwt(user);
    });

    const cookies = {
      [JWT_COOKIE_NAME]: internalJwt,
    };

    const cookieHeader = await encryptCookies(cookies);

    const result: APIGatewayProxyResult = {
      body: JSON.stringify({
        jwt: internalJwt,
      }),
      headers: {
        'Set-Cookie': cookieHeader,
      },
      statusCode: 200,
    };

    return result;
  });
};
