import { APIGatewayEvent } from 'aws-lambda';
import { verify } from 'jsonwebtoken';
import { authenticator } from 'otplib';
import { getUserById, getUserMfa } from '@legacy-sports/db-client';
import { handleStepUpVerify } from './StepUp';
import { testPassword } from '../Users';

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@legacy-sports/aws-utils', () => ({
  readSecret: jest.fn().mockResolvedValue('test-jwt-secret'),
}));

jest.mock('@legacy-sports/db-client', () => ({
  getUserById: jest.fn(),
  getUserMfa: jest.fn(),
}));

jest.mock('../util/db', () => ({
  withDbClient: jest.fn((cb: (db: Record<string, never>) => Promise<unknown>) =>
    cb({}),
  ),
}));

jest.mock('jsonwebtoken', () => ({
  verify: jest.fn(),
}));

jest.mock('otplib', () => ({
  authenticator: {
    verify: jest.fn(),
  },
}));

jest.mock('../Users', () => ({
  testPassword: jest.fn(),
}));

const mockVerifyJwt = jest.mocked(verify);
const mockGetUserById = jest.mocked(getUserById);
const mockGetUserMfa = jest.mocked(getUserMfa);
const mockAuth = jest.mocked(authenticator);
const mockTestPassword = jest.mocked(testPassword);

function makeEvent(body?: unknown): APIGatewayEvent {
  return {
    httpMethod: 'POST',
    headers: { Authorization: 'Bearer valid-jwt' },
    body: body === undefined ? null : JSON.stringify(body),
  } as unknown as APIGatewayEvent;
}

const mockUser = {
  id: 7,
  email: 'user@example.com',
  passwordHash: 'hashed-password',
  mfaEnabled: false,
} as unknown as Awaited<ReturnType<typeof getUserById>>;

beforeEach(() => {
  jest.clearAllMocks();
  mockVerifyJwt.mockReturnValue({
    id: 7,
    email: 'user@example.com',
  } as unknown as ReturnType<typeof verify>);
  mockGetUserById.mockResolvedValue(mockUser);
});

describe('handleStepUpVerify', () => {
  it('returns 401 when no JWT is present', async () => {
    const result = await handleStepUpVerify({
      httpMethod: 'POST',
      headers: {},
      body: JSON.stringify({ password: 'secret' }),
    } as unknown as APIGatewayEvent);

    expect(result.statusCode).toBe(401);
  });

  it('returns 400 when neither code nor password is provided', async () => {
    const result = await handleStepUpVerify(makeEvent({}));

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toMatchObject({
      error: 'code or password required',
    });
  });

  describe('TOTP path', () => {
    it('returns 400 when user has no MFA enrollment', async () => {
      mockGetUserMfa.mockResolvedValue({
        mfaEnabled: false,
        totpSecret: null,
      });

      const result = await handleStepUpVerify(makeEvent({ code: '123456' }));

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toMatchObject({
        error: 'mfa_not_enrolled',
      });
      expect(mockAuth.verify.mock.calls).toHaveLength(0);
    });

    it('returns 401 when the TOTP code is invalid', async () => {
      mockGetUserMfa.mockResolvedValue({
        mfaEnabled: true,
        totpSecret: 'SECRET123',
      });
      mockAuth.verify.mockReturnValue(false);

      const result = await handleStepUpVerify(makeEvent({ code: '000000' }));

      expect(result.statusCode).toBe(401);
      expect(JSON.parse(result.body)).toMatchObject({
        error: 'invalid_credential',
      });
    });

    it('returns 200 with validUntil when TOTP code is valid', async () => {
      mockGetUserMfa.mockResolvedValue({
        mfaEnabled: true,
        totpSecret: 'SECRET123',
      });
      mockAuth.verify.mockReturnValue(true);

      const before = Math.floor(Date.now() / 1000);
      const result = await handleStepUpVerify(makeEvent({ code: '123456' }));
      const after = Math.floor(Date.now() / 1000);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body) as {
        success: boolean;
        validUntil: number;
      };
      expect(body.success).toBe(true);
      expect(body.validUntil).toBeGreaterThanOrEqual(before + 15 * 60);
      expect(body.validUntil).toBeLessThanOrEqual(after + 15 * 60);
    });
  });

  describe('password path', () => {
    it('returns 400 when user has no password hash', async () => {
      mockGetUserById.mockResolvedValue({
        ...mockUser,
        passwordHash: null,
      } as never);

      const result = await handleStepUpVerify(
        makeEvent({ password: 'secret' }),
      );

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toMatchObject({ error: 'no_password' });
      expect(mockTestPassword).not.toHaveBeenCalled();
    });

    it('returns 401 when the password is incorrect', async () => {
      mockTestPassword.mockResolvedValue(false);

      const result = await handleStepUpVerify(
        makeEvent({ password: 'wrong-password' }),
      );

      expect(result.statusCode).toBe(401);
      expect(JSON.parse(result.body)).toMatchObject({
        error: 'invalid_credential',
      });
    });

    it('returns 200 with validUntil when the password is correct', async () => {
      mockTestPassword.mockResolvedValue(true);

      const before = Math.floor(Date.now() / 1000);
      const result = await handleStepUpVerify(
        makeEvent({ password: 'correct-password' }),
      );
      const after = Math.floor(Date.now() / 1000);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body) as {
        success: boolean;
        validUntil: number;
      };
      expect(body.success).toBe(true);
      expect(body.validUntil).toBeGreaterThanOrEqual(before + 15 * 60);
      expect(body.validUntil).toBeLessThanOrEqual(after + 15 * 60);
    });

    it('returns 401 when the user is not found', async () => {
      mockGetUserById.mockResolvedValue(null);

      const result = await handleStepUpVerify(
        makeEvent({ password: 'any-password' }),
      );

      expect(result.statusCode).toBe(401);
    });
  });
});
