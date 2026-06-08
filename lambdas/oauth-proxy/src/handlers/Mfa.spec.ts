import { APIGatewayEvent } from 'aws-lambda';
import { verify } from 'jsonwebtoken';
import { authenticator } from 'otplib';
import { getUserMfa, setUserMfa } from '@legacy-sports/db-client';
import { handleMfaEnroll, handleMfaVerifySetup } from './Mfa';

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
  getUserMfa: jest.fn(),
  setUserMfa: jest.fn(),
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
    generateSecret: jest.fn(),
    keyuri: jest.fn(),
    verify: jest.fn(),
  },
}));

const mockVerifyJwt = jest.mocked(verify);
const mockGetUserMfa = jest.mocked(getUserMfa);
const mockSetUserMfa = jest.mocked(setUserMfa);
// Wrap the whole object so property accesses are typed as MockedFunction
// (not unbound class methods), avoiding @typescript-eslint/unbound-method.
const mockAuth = jest.mocked(authenticator);

/** Build a Bearer-authenticated event with the given JSON body. */
function makeEvent(body?: unknown): APIGatewayEvent {
  return {
    httpMethod: 'POST',
    headers: { Authorization: 'Bearer valid-jwt' },
    body: body === undefined ? null : JSON.stringify(body),
  } as unknown as APIGatewayEvent;
}

beforeEach(() => {
  jest.clearAllMocks();
  // Default: a valid, authenticated user.
  mockVerifyJwt.mockReturnValue({
    id: 7,
    email: 'user@example.com',
  } as unknown as ReturnType<typeof verify>);
});

describe('handleMfaEnroll', () => {
  it('returns a TOTP secret + otpauth URI and stores the secret with mfa disabled', async () => {
    mockAuth.generateSecret.mockReturnValue('SECRET123');
    mockAuth.keyuri.mockReturnValue(
      'otpauth://totp/Legacy%20Sports:user@example.com?secret=SECRET123&issuer=Legacy%20Sports',
    );

    const result = await handleMfaEnroll(makeEvent());

    expect(result.statusCode).toBe(200);
    const parsed = JSON.parse(result.body) as {
      secret: string;
      otpauthUri: string;
    };
    expect(parsed.secret).toBe('SECRET123');
    expect(parsed.otpauthUri).toContain('otpauth://totp/');
    expect(mockAuth.keyuri.mock.calls[0]).toEqual([
      'user@example.com',
      'Legacy Sports',
      'SECRET123',
    ]);
    // Secret stored as pending — mfa NOT enabled yet.
    expect(mockSetUserMfa).toHaveBeenCalledWith(expect.anything(), 7, {
      mfaEnabled: false,
      totpSecret: 'SECRET123',
    });
  });

  it('returns 401 when no JWT is present', async () => {
    const result = await handleMfaEnroll({
      httpMethod: 'POST',
      headers: {},
      body: null,
    } as unknown as APIGatewayEvent);

    expect(result.statusCode).toBe(401);
    expect(mockSetUserMfa).not.toHaveBeenCalled();
  });

  it('returns 401 when the JWT fails verification', async () => {
    mockVerifyJwt.mockImplementation(() => {
      throw new Error('bad signature');
    });

    const result = await handleMfaEnroll(makeEvent());

    expect(result.statusCode).toBe(401);
    expect(mockSetUserMfa).not.toHaveBeenCalled();
  });
});

describe('handleMfaVerifySetup', () => {
  it('enables MFA when the submitted code is valid', async () => {
    mockGetUserMfa.mockResolvedValue({
      mfaEnabled: false,
      totpSecret: 'SECRET123',
    });
    mockAuth.verify.mockReturnValue(true);

    const result = await handleMfaVerifySetup(makeEvent({ code: '123456' }));

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ success: true });
    expect(mockAuth.verify.mock.calls[0][0]).toEqual({
      token: '123456',
      secret: 'SECRET123',
    });
    expect(mockSetUserMfa).toHaveBeenCalledWith(expect.anything(), 7, {
      mfaEnabled: true,
      totpSecret: 'SECRET123',
    });
  });

  it('does NOT enable MFA when the submitted code is invalid', async () => {
    mockGetUserMfa.mockResolvedValue({
      mfaEnabled: false,
      totpSecret: 'SECRET123',
    });
    mockAuth.verify.mockReturnValue(false);

    const result = await handleMfaVerifySetup(makeEvent({ code: '000000' }));

    expect(result.statusCode).toBe(401);
    expect(mockSetUserMfa).not.toHaveBeenCalled();
  });

  it('returns 400 when there is no pending enrollment', async () => {
    mockGetUserMfa.mockResolvedValue({ mfaEnabled: false, totpSecret: null });

    const result = await handleMfaVerifySetup(makeEvent({ code: '123456' }));

    expect(result.statusCode).toBe(400);
    expect(mockAuth.verify.mock.calls).toHaveLength(0);
    expect(mockSetUserMfa).not.toHaveBeenCalled();
  });

  it('returns 400 when the code is missing', async () => {
    const result = await handleMfaVerifySetup(makeEvent({}));

    expect(result.statusCode).toBe(400);
    expect(mockGetUserMfa).not.toHaveBeenCalled();
    expect(mockSetUserMfa).not.toHaveBeenCalled();
  });

  it('returns 401 when the request is unauthenticated', async () => {
    const result = await handleMfaVerifySetup({
      httpMethod: 'POST',
      headers: {},
      body: JSON.stringify({ code: '123456' }),
    } as unknown as APIGatewayEvent);

    expect(result.statusCode).toBe(401);
    expect(mockSetUserMfa).not.toHaveBeenCalled();
  });
});
