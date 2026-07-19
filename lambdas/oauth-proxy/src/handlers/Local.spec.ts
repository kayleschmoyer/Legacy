import { APIGatewayEvent } from 'aws-lambda';
import {
  createUser,
  getSubscriptionByUserId,
  getUserByEmail,
  getUserMfa,
  updateLastLoginAt,
} from '@legacy-sports/db-client';
import { authenticator } from 'otplib';
import { handleLogin, handleRegister } from './Local';
import { notifyNewUserSignup } from '../util/discord';
import { hashPassword, testPassword } from '../Users';
import {
  clearFailedLogins,
  isLoginLocked,
  recordFailedLogin,
} from '../util/login-throttle';

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Typed handle on the mocked LOGGER. Pulled via requireMock (rather than a
// module-scope jest.fn() referenced from the factory) to avoid a temporal-dead-
// zone error: importing ./Local triggers the factory before module-scope consts
// initialize. Typing it as a plain object of jest.Mock also sidesteps the
// unbound-method lint rule that fires on the real LOGGER's typed methods.
const { LOGGER: mockLogger }: { LOGGER: { info: jest.Mock; warn: jest.Mock } } =
  jest.requireMock('@legacy-sports/logging');

jest.mock('@legacy-sports/db-client', () => ({
  createUser: jest.fn(),
  getUserByEmail: jest.fn(),
  getUserMfa: jest.fn(),
  getSubscriptionByUserId: jest.fn(),
  updateLastLoginAt: jest.fn(),
}));

jest.mock('otplib', () => ({
  authenticator: { verify: jest.fn() },
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

jest.mock('../util/login-throttle', () => ({
  isLoginLocked: jest
    .fn()
    .mockResolvedValue({ locked: false, retryAfterSeconds: 0 }),
  recordFailedLogin: jest.fn().mockResolvedValue(undefined),
  clearFailedLogins: jest.fn().mockResolvedValue(undefined),
}));

const mockGetUserByEmail = getUserByEmail as jest.MockedFunction<
  typeof getUserByEmail
>;
const mockGetUserMfa = getUserMfa as jest.MockedFunction<typeof getUserMfa>;
const mockAuthenticator = jest.mocked(authenticator);
const mockGetSubscriptionByUserId =
  getSubscriptionByUserId as jest.MockedFunction<
    typeof getSubscriptionByUserId
  >;
const mockUpdateLastLoginAt = updateLastLoginAt as jest.MockedFunction<
  typeof updateLastLoginAt
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
const mockIsLoginLocked = isLoginLocked as jest.MockedFunction<
  typeof isLoginLocked
>;
const mockRecordFailedLogin = recordFailedLogin as jest.MockedFunction<
  typeof recordFailedLogin
>;
const mockClearFailedLogins = clearFailedLogins as jest.MockedFunction<
  typeof clearFailedLogins
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

  it('returns 400 for a password shorter than the login minimum', async () => {
    const result = await handleLogin(
      makeEvent({ email: 'test@example.com', password: 'short' }),
    );
    expect(result.statusCode).toBe(400);
  });

  it('accepts a password at the login minimum length', async () => {
    mockGetUserByEmail.mockResolvedValue({
      id: 7,
      canonicalEmail: 'test@example.com',
      passwordHash: 'stored-hash',
    } as unknown as Awaited<ReturnType<typeof getUserByEmail>>);
    mockTestPassword.mockResolvedValue(true);
    mockGetSubscriptionByUserId.mockResolvedValue(null);

    const result = await handleLogin(
      makeEvent({ email: 'test@example.com', password: '12345678' }),
    );

    expect(result.statusCode).toBe(200);
  });

  it('returns 400 for non-string fields', async () => {
    const result = await handleLogin(
      makeEvent({ email: 123, password: 'password123' }),
    );
    expect(result.statusCode).toBe(400);
  });

  describe('timing-enumeration prevention (LGN-018 / LS-6673)', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockIsLoginLocked.mockResolvedValue({
        locked: false,
        retryAfterSeconds: 0,
      });
    });

    it('always calls testPassword even when the user is not found', async () => {
      mockGetUserByEmail.mockResolvedValue(null);
      // testPassword is mocked — the dummy-hash bcrypt call must still be issued.
      mockTestPassword.mockResolvedValue(false);

      const result = await handleLogin(
        makeEvent({
          email: 'nonexistent@example.com',
          password: 'password123456',
        }),
      );

      expect(result.statusCode).toBe(401);
      // The timing-equalisation call must fire even though the user didn't exist.
      expect(mockTestPassword).toHaveBeenCalledTimes(1);
    });

    it('always calls testPassword when the user has no passwordHash', async () => {
      mockGetUserByEmail.mockResolvedValue({
        id: 9,
        email: 'sso-user@example.com',
        passwordHash: null,
      } as unknown as Awaited<ReturnType<typeof getUserByEmail>>);
      mockTestPassword.mockResolvedValue(false);

      const result = await handleLogin(
        makeEvent({
          email: 'sso-user@example.com',
          password: 'password123456',
        }),
      );

      expect(result.statusCode).toBe(401);
      expect(mockTestPassword).toHaveBeenCalledTimes(1);
    });
  });

  describe('successful login (LGN-029 billing hint)', () => {
    const validBody = { email: 'user@example.com', password: 'correct-pass' };

    beforeEach(() => {
      jest.clearAllMocks();
      mockGetUserByEmail.mockResolvedValue({
        id: 7,
        canonicalEmail: validBody.email,
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

    it('stamps last_login_at and emits a login.success audit event (LGN-019)', async () => {
      mockGetSubscriptionByUserId.mockResolvedValue(null);

      const result = await handleLogin(makeEvent(validBody));

      expect(result.statusCode).toBe(200);
      expect(mockUpdateLastLoginAt).toHaveBeenCalledWith(expect.anything(), 7);
      // ip is null because makeEvent carries no X-Forwarded-For / sourceIp;
      // the email is masked the same way it is on the failure paths.
      expect(mockLogger.info).toHaveBeenCalledWith(
        'login.success',
        expect.objectContaining({
          audit: true,
          userId: 7,
          email: 'u***@example.com',
          ip: null,
        }),
      );
    });
  });

  describe('failed-login audit trail (LGN-019)', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('emits a login.failed audit event with a sanitized email and IP when the user is unknown', async () => {
      mockGetUserByEmail.mockResolvedValue(null);

      const event = {
        body: JSON.stringify({
          email: 'victim@example.com',
          password: 'password123',
        }),
        headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' },
      } as unknown as APIGatewayEvent;

      const result = await handleLogin(event);

      expect(result.statusCode).toBe(401);
      expect(mockUpdateLastLoginAt).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'login.failed',
        expect.objectContaining({
          audit: true,
          email: 'v***@example.com',
          ip: '203.0.113.7',
          reason: 'unknown_user',
        }),
      );
    });

    it('emits a login.failed audit event when the password is incorrect', async () => {
      mockGetUserByEmail.mockResolvedValue({
        id: 7,
        email: 'user@example.com',
        passwordHash: 'stored-hash',
      } as unknown as Awaited<ReturnType<typeof getUserByEmail>>);
      mockTestPassword.mockResolvedValue(false);

      const result = await handleLogin(
        makeEvent({ email: 'user@example.com', password: 'wrong-password' }),
      );

      expect(result.statusCode).toBe(401);
      expect(mockUpdateLastLoginAt).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'login.failed',
        expect.objectContaining({
          audit: true,
          email: 'u***@example.com',
          reason: 'invalid_password',
        }),
      );
    });
  });

  describe('per-email lockout (LGN-020 / LS-6675)', () => {
    const validBody = { email: 'victim@example.com', password: 'correct-pass' };

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('returns 429 with Retry-After and skips the DB when the email is locked', async () => {
      mockIsLoginLocked.mockResolvedValueOnce({
        locked: true,
        retryAfterSeconds: 300,
      });

      const result = await handleLogin(makeEvent(validBody));

      expect(result.statusCode).toBe(429);
      expect(result.headers?.['Retry-After']).toBe('300');
      expect((JSON.parse(result.body) as { error: string }).error).toBe(
        'rate_limited',
      );
      // Locked emails never reach the credential check.
      expect(mockGetUserByEmail).not.toHaveBeenCalled();
      expect(mockRecordFailedLogin).not.toHaveBeenCalled();
    });

    it('records a failed attempt when the password is wrong', async () => {
      mockGetUserByEmail.mockResolvedValue({
        id: 7,
        canonicalEmail: validBody.email,
        passwordHash: 'stored-hash',
      } as unknown as Awaited<ReturnType<typeof getUserByEmail>>);
      mockTestPassword.mockResolvedValue(false);

      const result = await handleLogin(makeEvent(validBody));

      expect(result.statusCode).toBe(401);
      expect(mockRecordFailedLogin).toHaveBeenCalledWith(validBody.email);
      expect(mockClearFailedLogins).not.toHaveBeenCalled();
    });

    it('records a failed attempt when the account does not exist', async () => {
      mockGetUserByEmail.mockResolvedValue(null);

      const result = await handleLogin(makeEvent(validBody));

      expect(result.statusCode).toBe(401);
      expect(mockRecordFailedLogin).toHaveBeenCalledWith(validBody.email);
    });

    it('clears the counter on a successful login', async () => {
      mockGetUserByEmail.mockResolvedValue({
        id: 7,
        canonicalEmail: validBody.email,
        passwordHash: 'stored-hash',
      } as unknown as Awaited<ReturnType<typeof getUserByEmail>>);
      mockTestPassword.mockResolvedValue(true);
      mockGetSubscriptionByUserId.mockResolvedValue(null);

      const result = await handleLogin(makeEvent(validBody));

      expect(result.statusCode).toBe(200);
      expect(mockClearFailedLogins).toHaveBeenCalledWith(validBody.email);
      expect(mockRecordFailedLogin).not.toHaveBeenCalled();
    });
  });

  describe('TOTP second-factor enforcement (LGN-022 / LS-7832)', () => {
    const mfaUser = {
      id: 7,
      email: 'mfa@example.com',
      passwordHash: 'stored-hash',
      mfaEnabled: true,
    };
    const validBody = { email: 'mfa@example.com', password: 'correct-pass' };

    beforeEach(() => {
      jest.clearAllMocks();
      mockIsLoginLocked.mockResolvedValue({
        locked: false,
        retryAfterSeconds: 0,
      });
      mockGetUserByEmail.mockResolvedValue(
        mfaUser as unknown as Awaited<ReturnType<typeof getUserByEmail>>,
      );
      mockTestPassword.mockResolvedValue(true);
    });

    it('returns mfaRequired:true with no JWT when the correct password is submitted without a code', async () => {
      const result = await handleLogin(makeEvent(validBody));

      expect(result.statusCode).toBe(200);
      const parsed = JSON.parse(result.body) as Record<string, unknown>;
      expect(parsed.mfaRequired).toBe(true);
      expect(parsed).not.toHaveProperty('jwt');
      expect(result.multiValueHeaders).toBeUndefined();
      // Partial login — counters are not cleared until the second factor passes.
      expect(mockClearFailedLogins).not.toHaveBeenCalled();
      expect(mockUpdateLastLoginAt).not.toHaveBeenCalled();
    });

    it('issues a JWT when the correct password and valid TOTP code are both provided', async () => {
      mockGetUserMfa.mockResolvedValue({
        mfaEnabled: true,
        totpSecret: 'SECRET123',
      });
      mockAuthenticator.verify.mockReturnValue(true);
      mockGetSubscriptionByUserId.mockResolvedValue(null);

      const result = await handleLogin(
        makeEvent({ ...validBody, code: '123456' }),
      );

      expect(result.statusCode).toBe(200);
      const parsed = JSON.parse(result.body) as { jwt: string };
      expect(parsed.jwt).toBe('mock-jwt');
      expect(mockAuthenticator.verify.mock.calls[0]?.[0]).toEqual({
        token: '123456',
        secret: 'SECRET123',
      });
      expect(mockClearFailedLogins).toHaveBeenCalledWith(validBody.email);
      expect(mockUpdateLastLoginAt).toHaveBeenCalledWith(expect.anything(), 7);
    });

    it('returns 401 and records a failed attempt when the TOTP code is invalid', async () => {
      mockGetUserMfa.mockResolvedValue({
        mfaEnabled: true,
        totpSecret: 'SECRET123',
      });
      mockAuthenticator.verify.mockReturnValue(false);

      const result = await handleLogin(
        makeEvent({ ...validBody, code: '000000' }),
      );

      expect(result.statusCode).toBe(401);
      expect(mockRecordFailedLogin).toHaveBeenCalledWith(validBody.email);
      expect(mockClearFailedLogins).not.toHaveBeenCalled();
      expect(mockUpdateLastLoginAt).not.toHaveBeenCalled();
    });

    it('does not require MFA for users who have not enrolled (mfaEnabled=false)', async () => {
      mockGetUserByEmail.mockResolvedValue({
        id: 8,
        email: 'nomfa@example.com',
        passwordHash: 'stored-hash',
        mfaEnabled: false,
      } as unknown as Awaited<ReturnType<typeof getUserByEmail>>);
      mockTestPassword.mockResolvedValue(true);
      mockGetSubscriptionByUserId.mockResolvedValue(null);

      const result = await handleLogin(
        makeEvent({ email: 'nomfa@example.com', password: 'correct-pass' }),
      );

      expect(result.statusCode).toBe(200);
      const parsed = JSON.parse(result.body) as { jwt: string };
      expect(parsed.jwt).toBe('mock-jwt');
      expect(mockGetUserMfa).not.toHaveBeenCalled();
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
