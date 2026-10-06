import { APIGatewayEvent } from 'aws-lambda';
import { sign } from 'jsonwebtoken';
import { getUserById } from '@legacy-sports/db-client';
import { handleRefreshJwt } from './RefreshJwt';
import { generateCsrfToken } from '../util/jwt-cookie';

const JWT_KEY = 'test-jwt-secret';

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

jest.mock('@legacy-sports/db-client', () =>
  mockDbClientModule({ getUserById: jest.fn() }),
);

jest.mock('../util/db', () => ({
  withDbClient: jest.fn((cb: (db: object) => Promise<unknown>) => cb({})),
}));

jest.mock('../util/jwt', () => ({
  ...jest.requireActual<object>('../util/jwt'),
  createJwt: jest.fn().mockResolvedValue('new-jwt'),
}));

jest.mock('../util/jwt-cookie', () => ({
  ...jest.requireActual<object>('../util/jwt-cookie'),
  generateCsrfToken: jest.fn().mockReturnValue('fresh-csrf'),
}));

const mockGetUserById = getUserById as jest.Mock;
const mockGenerateCsrfToken = generateCsrfToken as jest.Mock;

function mintJwt(): string {
  return sign({ id: 42, username: 'tester' }, JWT_KEY, {
    algorithm: 'HS256',
    expiresIn: 60 * 60,
    issuer: 'legacy-sports-oauth-proxy',
    audience: 'legacy-sports',
  });
}

function makeEvent(headers: Record<string, string>): APIGatewayEvent {
  return { headers } as unknown as APIGatewayEvent;
}

function parseBody(body: string): { jwt?: string; csrfToken?: string } {
  return JSON.parse(body) as { jwt?: string; csrfToken?: string };
}

describe('handleRefreshJwt — CSRF token handling (LS-10447)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUserById.mockResolvedValue({ id: 42, accessLevel: 'user' });
  });

  it('carries the validated CSRF token forward instead of rotating it', async () => {
    const jwt = mintJwt();
    const result = await handleRefreshJwt(
      makeEvent({
        cookie: `ls_jwt=${jwt}; ls_csrf=existing-csrf`,
        'x-csrf-token': 'existing-csrf',
      }),
    );

    expect(result.statusCode).toBe(200);
    expect(parseBody(result.body).csrfToken).toBe('existing-csrf');
    expect(mockGenerateCsrfToken).not.toHaveBeenCalled();
    const cookies = result.multiValueHeaders?.['Set-Cookie'] as string[];
    expect(cookies.some((c) => c.startsWith('ls_csrf=existing-csrf;'))).toBe(
      true,
    );
  });

  it('accepts a second refresh that read the header before a sibling refresh completed', async () => {
    const jwt = mintJwt();
    const headers = {
      cookie: `ls_jwt=${jwt}; ls_csrf=existing-csrf`,
      'x-csrf-token': 'existing-csrf',
    };

    const first = await handleRefreshJwt(makeEvent(headers));
    const firstCsrf = parseBody(first.body).csrfToken;

    // The racing request still carries the original header; with the cookie
    // value unchanged by the first refresh, the double-submit still matches.
    const second = await handleRefreshJwt(
      makeEvent({
        cookie: `ls_jwt=${jwt}; ls_csrf=${firstCsrf}`,
        'x-csrf-token': 'existing-csrf',
      }),
    );

    expect(second.statusCode).toBe(200);
  });

  it('still rejects a cookie-auth refresh whose header does not match', async () => {
    const jwt = mintJwt();
    const result = await handleRefreshJwt(
      makeEvent({
        cookie: `ls_jwt=${jwt}; ls_csrf=existing-csrf`,
        'x-csrf-token': 'wrong-csrf',
      }),
    );

    expect(result.statusCode).toBe(403);
  });

  it('mints a fresh CSRF token for Bearer-auth refreshes', async () => {
    const jwt = mintJwt();
    const result = await handleRefreshJwt(
      makeEvent({ authorization: `Bearer ${jwt}` }),
    );

    expect(result.statusCode).toBe(200);
    expect(parseBody(result.body).csrfToken).toBe('fresh-csrf');
    expect(mockGenerateCsrfToken).toHaveBeenCalledTimes(1);
  });
});
