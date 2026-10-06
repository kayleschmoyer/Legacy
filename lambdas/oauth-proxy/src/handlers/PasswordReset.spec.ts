// Standalone mock fn so assertions don't reference an unbound method
// (@typescript-eslint/unbound-method). Declared before the imports — and with
// the `mock` prefix — so the hoisted jest.mock factory can close over it and it
// is initialized before importing ./PasswordReset triggers the logging mock.
const mockLoggerError = jest.fn();

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: mockLoggerError,
  },
}));

import { APIGatewayEvent } from 'aws-lambda';
import {
  consumePasswordResetToken,
  createPasswordResetToken,
  deletePasswordResetTokensForUser,
  getUserByEmail,
  updateUserPassword,
} from '@legacy-sports/db-client';
import {
  handleForgotPassword,
  handleForgotPasswordPage,
  handleResetPassword,
  handleResetPasswordPage,
} from './PasswordReset';
import { sendPasswordResetEmail } from '../util/email';
import { hashPassword } from '../Users';
import { hashResetToken } from '../util/password-reset';

jest.mock('@legacy-sports/db-client', () =>
  mockDbClientModule({
    getUserByEmail: jest.fn(),
    createPasswordResetToken: jest.fn(),
    consumePasswordResetToken: jest.fn(),
    deletePasswordResetTokensForUser: jest.fn(),
    updateUserPassword: jest.fn(),
  }),
);

jest.mock('../util/db', () => ({
  withDbClient: jest.fn((cb: (db: unknown) => Promise<unknown>) => cb({})),
}));

jest.mock('../util/email', () => ({
  sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
}));

jest.mock('../Users', () => ({
  hashPassword: jest.fn().mockResolvedValue('hashed-password'),
}));

const mockGetUserByEmail = getUserByEmail as jest.MockedFunction<
  typeof getUserByEmail
>;
const mockCreateToken = createPasswordResetToken as jest.MockedFunction<
  typeof createPasswordResetToken
>;
const mockConsumeToken = consumePasswordResetToken as jest.MockedFunction<
  typeof consumePasswordResetToken
>;
const mockDeleteTokens =
  deletePasswordResetTokensForUser as jest.MockedFunction<
    typeof deletePasswordResetTokensForUser
  >;
const mockUpdatePassword = updateUserPassword as jest.MockedFunction<
  typeof updateUserPassword
>;
const mockSendEmail = sendPasswordResetEmail as jest.MockedFunction<
  typeof sendPasswordResetEmail
>;
const mockHashPassword = hashPassword as jest.MockedFunction<
  typeof hashPassword
>;

function makeEvent(
  body: unknown,
  queryStringParameters: Record<string, string> | null = null,
): APIGatewayEvent {
  return {
    body: body === undefined ? null : JSON.stringify(body),
    queryStringParameters,
    requestContext: { domainName: 'api.example.com', stage: 'prod' },
  } as unknown as APIGatewayEvent;
}

const user = {
  id: 7,
  canonicalEmail: 'user@example.com',
  passwordHash: 'hash',
} as unknown as NonNullable<Awaited<ReturnType<typeof getUserByEmail>>>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('handleForgotPassword', () => {
  it('returns 400 for a missing body', async () => {
    const result = await handleForgotPassword(makeEvent(undefined));
    expect(result.statusCode).toBe(400);
  });

  it('returns 400 for an invalid email format', async () => {
    const result = await handleForgotPassword(makeEvent({ email: 'nope' }));
    expect(result.statusCode).toBe(400);
  });

  it('returns a uniform 200 and issues no token for an unknown email', async () => {
    mockGetUserByEmail.mockResolvedValueOnce(null);

    const result = await handleForgotPassword(
      makeEvent({ email: 'ghost@example.com' }),
    );

    expect(result.statusCode).toBe(200);
    expect(mockCreateToken).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('issues a token and emails a reset link for a known email', async () => {
    mockGetUserByEmail.mockResolvedValueOnce(user);

    const result = await handleForgotPassword(
      makeEvent({ email: user.canonicalEmail }),
    );

    expect(result.statusCode).toBe(200);
    expect(mockDeleteTokens).toHaveBeenCalledWith(expect.anything(), 7);
    expect(mockCreateToken).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);

    const [, sentUrl] = mockSendEmail.mock.calls[0];
    // api.example.com is a custom domain, so the stage segment is omitted
    // (see getRequestBaseUrl) — a /prod prefix there would not route.
    expect(sentUrl).toContain(
      'https://api.example.com/oauth/reset-password?token=',
    );
  });

  it('returns an identical response body whether the email exists or not', async () => {
    mockGetUserByEmail.mockResolvedValueOnce(null);
    const unknown = await handleForgotPassword(
      makeEvent({ email: 'ghost@example.com' }),
    );

    mockGetUserByEmail.mockResolvedValueOnce(user);
    const known = await handleForgotPassword(
      makeEvent({ email: user.canonicalEmail }),
    );

    expect(unknown.statusCode).toBe(known.statusCode);
    expect(unknown.body).toBe(known.body);
  });

  it('still returns a uniform 200 when token issuance throws', async () => {
    mockGetUserByEmail.mockResolvedValueOnce(user);
    mockCreateToken.mockRejectedValueOnce(new Error('db down'));

    const result = await handleForgotPassword(
      makeEvent({ email: user.canonicalEmail }),
    );

    expect(result.statusCode).toBe(200);
    // The uniform 200 must not swallow the failure silently — operators still
    // need the error logged (with the Error instance for the Rollbar stack).
    expect(mockLoggerError).toHaveBeenCalledWith(
      'Forgot-password processing failed',
      expect.any(Error),
    );
  });
});

describe('handleResetPassword', () => {
  const validBody = {
    token: 'raw-token',
    password: 'longenoughpassword',
    confirmPassword: 'longenoughpassword',
  };

  it('returns 400 for a missing body', async () => {
    const result = await handleResetPassword(makeEvent(undefined));
    expect(result.statusCode).toBe(400);
  });

  it('returns 400 when the password is too short', async () => {
    const result = await handleResetPassword(
      makeEvent({ token: 't', password: 'short', confirmPassword: 'short' }),
    );
    expect(result.statusCode).toBe(400);
    expect((JSON.parse(result.body) as { error: string }).error).toMatch(
      /at least 12 characters/,
    );
  });

  it('returns 400 when the passwords do not match', async () => {
    const result = await handleResetPassword(
      makeEvent({ ...validBody, confirmPassword: 'differentlongpass' }),
    );
    expect(result.statusCode).toBe(400);
    expect((JSON.parse(result.body) as { error: string }).error).toMatch(
      /must match/,
    );
  });

  it('returns 400 and does not change the password for an invalid/expired token', async () => {
    mockConsumeToken.mockResolvedValueOnce(null);

    const result = await handleResetPassword(makeEvent(validBody));

    expect(result.statusCode).toBe(400);
    expect(mockUpdatePassword).not.toHaveBeenCalled();
  });

  it('consumes the hashed token and updates the password on success', async () => {
    mockConsumeToken.mockResolvedValueOnce({
      id: 1,
      userId: 7,
    } as unknown as Awaited<ReturnType<typeof consumePasswordResetToken>>);

    const result = await handleResetPassword(makeEvent(validBody));

    expect(result.statusCode).toBe(200);
    // The raw token is hashed before lookup — the raw value is never queried.
    expect(mockConsumeToken).toHaveBeenCalledWith(
      expect.anything(),
      hashResetToken(validBody.token),
    );
    expect(mockHashPassword).toHaveBeenCalledWith(validBody.password);
    expect(mockUpdatePassword).toHaveBeenCalledWith(
      expect.anything(),
      7,
      'hashed-password',
    );
    expect(mockDeleteTokens).toHaveBeenCalledWith(expect.anything(), 7);
  });
});

describe('password-reset pages', () => {
  it('renders the forgot-password request page', () => {
    const result = handleForgotPasswordPage(makeEvent(undefined));
    expect(result.statusCode).toBe(200);
    expect(result.headers?.['Content-Type']).toContain('text/html');
    expect(result.body).toContain('Forgot your password?');
  });

  it('renders the choose-a-password page when a token is present', () => {
    const result = handleResetPasswordPage(
      makeEvent(undefined, { token: 'abc' }),
    );
    expect(result.statusCode).toBe(200);
    expect(result.body).toContain('Choose a new password');
  });

  it('renders an error when the reset token is missing', () => {
    const result = handleResetPasswordPage(makeEvent(undefined, null));
    expect(result.body).toContain('invalid');
  });
});
