import { APIGatewayEvent } from 'aws-lambda';
import {
  createUser,
  getSubscriptionByUserId,
  getUserByEmail,
} from '@legacy-sports/db-client';
import { handleLogin, handleRegister } from './Local';
import { notifyNewUserSignup } from '../util/discord';
import { hashPassword, testPassword } from '../Users';

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@legacy-sports/db-client', () => ({
  createUser: jest.fn(),
  getUserByEmail: jest.fn(),
  getSubscriptionByUserId: jest.fn(),
}));

jest.mock('../util/db', () => ({
  withDbClient: jest.fn(
    (
      cb: (db: {
        transaction: (fn: () => Promise<unknown>) => Promise<unknown>;
      }) => Promise<unknown>,
    ) => cb({ transaction: (fn) => fn() }),
  ),
}));

jest.mock('../util/jwt', () => ({
  createJwt: jest.fn().mockResolvedValue('mock-jwt'),
  JWT_COOKIE_NAME: 'legacy-sports-internal-jwt',
}));

jest.mock('../util/cookie', () => ({
  encryptCookies: jest.fn().mockResolvedValue('encrypted-cookie'),
}));

jest.mock('../util/jwt-cookie', () => ({
  buildAuthCookies: jest.fn().mockReturnValue(['auth-cookie']),
  generateCsrfToken: jest.fn().mockReturnValue('csrf-token'),
}));

jest.mock('../util/discord', () => ({
  notifyNewUserSignup: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../Users', () => ({
  hashPassword: jest.fn().mockResolvedValue('hashed-password'),
  testPassword: jest.fn(),
}));

const mockGetUserByEmail = getUserByEmail as jest.MockedFunction<
  typeof getUserByEmail
>;
const mockGetSubscriptionByUserId =
  getSubscriptionByUserId as jest.MockedFunction<
    typeof getSubscriptionByUserId
  >;
const mockCreateUser = createUser as jest.MockedFunction<typeof createUser>;
const mockNotifyNewUserSignup = notifyNewUserSignup as jest.MockedFunction<
  typeof notifyNewUserSignup
>;
const mockHashPassword = hashPassword as jest.MockedFunction<
  typeof hashPassword
>;
const mockTestPassword = testPassword as jest.MockedFunction<
  typeof testPassword
>;

function makeEvent(body: unknown): APIGatewayEvent {
  return { body: JSON.stringify(body) } as APIGatewayEvent;
}

describe('handleLogin', () => {
  it('returns 400 for missing body', async () => {
    const result = await handleLogin({ body: null } as APIGatewayEvent);
    expect(result.statusCode).toBe(400);
  });

  it('returns 400 for invalid email format', async () => {
    const result = await handleLogin(
      makeEvent({ email: 'not-an-email', password: 'password123' }),
    );
    expect(result.statusCode).toBe(400);
  });

  it('returns 400 for missing password', async () => {
    const result = await handleLogin(
      makeEvent({ email: 'test@example.com', password: '' }),
    );
    expect(result.statusCode).toBe(400);
  });

  it('returns 400 for non-string fields', async () => {
    const result = await handleLogin(
      makeEvent({ email: 123, password: 'password123' }),
    );
    expect(result.statusCode).toBe(400);
  });

  describe('successful login (LGN-029 billing hint)', () => {
    const validBody = { email: 'user@example.com', password: 'correct-pass' };

    beforeEach(() => {
      jest.clearAllMocks();
      mockGetUserByEmail.mockResolvedValue({
        id: 7,
        email: validBody.email,
        passwordHash: 'stored-hash',
      } as unknown as Awaited<ReturnType<typeof getUserByEmail>>);
      mockTestPassword.mockResolvedValue(true);
    });

    it("returns 200 with billingStatus 'past_due' when the subscription is past_due", async () => {
      mockGetSubscriptionByUserId.mockResolvedValue({
        userId: 7,
        status: 'past_due',
      } as unknown as Awaited<ReturnType<typeof getSubscriptionByUserId>>);

      const result = await handleLogin(makeEvent(validBody));

      expect(result.statusCode).toBe(200);
      const parsed = JSON.parse(result.body) as {
        jwt: string;
        csrfToken: string;
        billingStatus: string;
      };
      expect(parsed.jwt).toBe('mock-jwt');
      expect(parsed.billingStatus).toBe('past_due');
      expect(mockGetSubscriptionByUserId).toHaveBeenCalledWith(
        expect.anything(),
        7,
      );
    });

    it("returns billingStatus 'ok' when the subscription is active", async () => {
      mockGetSubscriptionByUserId.mockResolvedValue({
        userId: 7,
        status: 'active',
      } as unknown as Awaited<ReturnType<typeof getSubscriptionByUserId>>);

      const result = await handleLogin(makeEvent(validBody));

      const parsed = JSON.parse(result.body) as { billingStatus: string };
      expect(result.statusCode).toBe(200);
      expect(parsed.billingStatus).toBe('ok');
    });

    it("returns billingStatus 'ok' when the user has no subscription row", async () => {
      mockGetSubscriptionByUserId.mockResolvedValue(null);

      const result = await handleLogin(makeEvent(validBody));

      const parsed = JSON.parse(result.body) as { billingStatus: string };
      expect(result.statusCode).toBe(200);
      expect(parsed.billingStatus).toBe('ok');
    });

    it('returns 401 without querying subscription when the password is wrong', async () => {
      mockTestPassword.mockResolvedValue(false);

      const result = await handleLogin(makeEvent(validBody));

      expect(result.statusCode).toBe(401);
      expect(mockGetSubscriptionByUserId).not.toHaveBeenCalled();
    });
  });
});

describe('handleRegister', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 400 for missing body', async () => {
    const result = await handleRegister({ body: null } as APIGatewayEvent);
    expect(result.statusCode).toBe(400);
  });

  it('returns 400 for invalid email format', async () => {
    const result = await handleRegister(
      makeEvent({
        email: 'not-an-email',
        password: 'longenoughpassword',
        confirmPassword: 'longenoughpassword',
      }),
    );
    expect(result.statusCode).toBe(400);
  });

  it('returns 400 when password is too short', async () => {
    const result = await handleRegister(
      makeEvent({
        email: 'test@example.com',
        password: 'short',
        confirmPassword: 'short',
      }),
    );
    expect(result.statusCode).toBe(400);
    expect((JSON.parse(result.body) as { error: string }).error).toMatch(
      /at least 12 characters/,
    );
  });

  it('returns 400 when passwords do not match', async () => {
    const result = await handleRegister(
      makeEvent({
        email: 'test@example.com',
        password: 'longenoughpassword',
        confirmPassword: 'differentlongpass',
      }),
    );
    expect(result.statusCode).toBe(400);
    expect((JSON.parse(result.body) as { error: string }).error).toMatch(
      /must match/,
    );
  });

  describe('uniform response (LS-2549)', () => {
    const validBody = {
      email: 'new@example.com',
      password: 'longenoughpassword',
      confirmPassword: 'longenoughpassword',
    };

    it('returns the same status code, body, and headers whether the email is new or already exists', async () => {
      // New email
      mockGetUserByEmail.mockResolvedValueOnce(null);
      mockCreateUser.mockResolvedValueOnce({
        id: 42,
        email: validBody.email,
        passwordHash: 'hashed-password',
      } as unknown as Awaited<ReturnType<typeof createUser>>);
      const newResult = await handleRegister(makeEvent(validBody));

      // Existing email
      mockGetUserByEmail.mockResolvedValueOnce({
        id: 7,
        email: validBody.email,
        passwordHash: 'existing-hash',
      } as unknown as Awaited<ReturnType<typeof getUserByEmail>>);
      const existingResult = await handleRegister(
        makeEvent({ ...validBody, email: 'existing@example.com' }),
      );

      expect(existingResult.statusCode).toBe(newResult.statusCode);
      expect(existingResult.body).toBe(newResult.body);
      expect(existingResult.headers).toEqual(newResult.headers);
      expect(existingResult.multiValueHeaders).toEqual(
        newResult.multiValueHeaders,
      );
    });

    it('does not return a JWT or auth cookies', async () => {
      mockGetUserByEmail.mockResolvedValueOnce(null);
      mockCreateUser.mockResolvedValueOnce({
        id: 1,
        email: validBody.email,
        passwordHash: 'hashed-password',
      } as unknown as Awaited<ReturnType<typeof createUser>>);

      const result = await handleRegister(makeEvent(validBody));

      expect(result.statusCode).toBe(200);
      const parsed = JSON.parse(result.body) as Record<string, unknown>;
      expect(parsed).not.toHaveProperty('jwt');
      expect(parsed).not.toHaveProperty('csrfToken');
      expect(result.multiValueHeaders?.['Set-Cookie']).toBeUndefined();
    });

    it('creates the user when the email is new', async () => {
      mockGetUserByEmail.mockResolvedValueOnce(null);
      mockCreateUser.mockResolvedValueOnce({
        id: 99,
        email: validBody.email,
        passwordHash: 'hashed-password',
      } as unknown as Awaited<ReturnType<typeof createUser>>);

      await handleRegister(makeEvent(validBody));

      expect(mockCreateUser).toHaveBeenCalledTimes(1);
      expect(mockCreateUser).toHaveBeenCalledWith(
        expect.anything(),
        validBody.email,
        'hashed-password',
      );
      expect(mockNotifyNewUserSignup).toHaveBeenCalledWith(
        validBody.email,
        99,
        'local',
      );
    });

    it('does not create a duplicate user when the email already exists', async () => {
      mockGetUserByEmail.mockResolvedValueOnce({
        id: 7,
        email: validBody.email,
        passwordHash: 'existing-hash',
      } as unknown as Awaited<ReturnType<typeof getUserByEmail>>);

      await handleRegister(makeEvent(validBody));

      expect(mockCreateUser).not.toHaveBeenCalled();
      expect(mockNotifyNewUserSignup).not.toHaveBeenCalled();
    });

    it('hashes the password even when the email already exists (timing parity)', async () => {
      mockGetUserByEmail.mockResolvedValueOnce({
        id: 7,
        email: validBody.email,
        passwordHash: 'existing-hash',
      } as unknown as Awaited<ReturnType<typeof getUserByEmail>>);

      await handleRegister(makeEvent(validBody));

      expect(mockHashPassword).toHaveBeenCalledWith(validBody.password);
    });

    it('returns 500 when createUser returns null (db error path)', async () => {
      mockGetUserByEmail.mockResolvedValueOnce(null);
      mockCreateUser.mockResolvedValueOnce(
        null as unknown as Awaited<ReturnType<typeof createUser>>,
      );

      const result = await handleRegister(makeEvent(validBody));

      expect(result.statusCode).toBe(500);
    });
  });
});
