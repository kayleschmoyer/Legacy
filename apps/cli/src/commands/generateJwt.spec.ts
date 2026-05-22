import { LOGGER } from '@legacy-sports/logging';
import { Writable } from 'stream';
import { handleGenerateJwt } from './generateJwt';
import type { CLIAuthService } from '../services/AuthService';

// Build a real, decodable JWT. Header/signature segments can be opaque — the
// command only base64-decodes the middle (payload) segment.
function makeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(
    JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
  ).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = 'sig-' + Math.random().toString(36).slice(2);
  return `${header}.${body}.${signature}`;
}

function makeAuthService(
  token: string,
): Pick<CLIAuthService, 'isAuthenticated' | 'authenticate' | 'getAuthToken'> {
  return {
    isAuthenticated: jest.fn().mockResolvedValue(true),
    authenticate: jest.fn().mockResolvedValue(undefined),
    getAuthToken: jest.fn().mockResolvedValue(token),
  };
}

function makeStdoutCapture(): { stream: Writable; buffer: () => string } {
  let captured = '';
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      captured += String(chunk);
      callback();
    },
  });
  return { stream, buffer: () => captured };
}

describe('generate-jwt', () => {
  const validPayload = {
    id: 42,
    email: 'test@example.com',
    username: 'tester',
    accessLevel: 'admin',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  };

  let loggerInfoSpy: jest.SpyInstance;
  let loggerErrorSpy: jest.SpyInstance;
  let loggedLines: string[];

  beforeEach(() => {
    loggedLines = [];
    loggerInfoSpy = jest
      .spyOn(LOGGER, 'info')
      .mockImplementation((...args: unknown[]) => {
        loggedLines.push(args.map(String).join(' '));
      });
    loggerErrorSpy = jest
      .spyOn(LOGGER, 'error')
      .mockImplementation((...args: unknown[]) => {
        loggedLines.push(args.map(String).join(' '));
      });
  });

  afterEach(() => {
    loggerInfoSpy.mockRestore();
    loggerErrorSpy.mockRestore();
  });

  it('default mode does NOT print the JWT on stdout', async () => {
    const jwt = makeJwt(validPayload);
    const { stream, buffer } = makeStdoutCapture();
    const exit = jest.fn() as unknown as (code: number) => never;

    await handleGenerateJwt(
      {},
      { authService: makeAuthService(jwt), stdout: stream, exit },
    );

    expect(buffer()).not.toContain(jwt);
    expect(buffer()).toBe('');
    expect(exit).not.toHaveBeenCalled();
  });

  it('default mode does NOT include the JWT in any LOGGER output (would land in --log-file)', async () => {
    const jwt = makeJwt(validPayload);
    const { stream } = makeStdoutCapture();
    const exit = jest.fn() as unknown as (code: number) => never;

    await handleGenerateJwt(
      {},
      { authService: makeAuthService(jwt), stdout: stream, exit },
    );

    const allLogs = loggedLines.join('\n');
    expect(allLogs).not.toContain(jwt);
    // Also assert no token-shaped substring (three base64url segments) appears
    expect(allLogs).not.toMatch(
      /[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{4,}/,
    );
  });

  it('default mode prints metadata (user, expiration, access level)', async () => {
    const jwt = makeJwt(validPayload);
    const { stream } = makeStdoutCapture();
    const exit = jest.fn() as unknown as (code: number) => never;

    await handleGenerateJwt(
      {},
      { authService: makeAuthService(jwt), stdout: stream, exit },
    );

    const allLogs = loggedLines.join('\n');
    expect(allLogs).toContain('test@example.com');
    expect(allLogs).toContain('admin');
    expect(allLogs).toMatch(/Expires:/);
  });

  it('--reveal prints the JWT exactly once on stdout', async () => {
    const jwt = makeJwt(validPayload);
    const { stream, buffer } = makeStdoutCapture();
    const exit = jest.fn() as unknown as (code: number) => never;

    await handleGenerateJwt(
      { reveal: true },
      { authService: makeAuthService(jwt), stdout: stream, exit },
    );

    const out = buffer();
    expect(out).toBe(`${jwt}\n`);
    // Token must appear in stdout exactly once
    const occurrences = out.split(jwt).length - 1;
    expect(occurrences).toBe(1);
    expect(exit).not.toHaveBeenCalled();
  });

  it('--reveal does NOT leak the JWT through LOGGER (so --log-file stays clean)', async () => {
    const jwt = makeJwt(validPayload);
    const { stream } = makeStdoutCapture();
    const exit = jest.fn() as unknown as (code: number) => never;

    await handleGenerateJwt(
      { reveal: true },
      { authService: makeAuthService(jwt), stdout: stream, exit },
    );

    const allLogs = loggedLines.join('\n');
    expect(allLogs).not.toContain(jwt);
  });

  it('refuses to run when --reveal is combined with --log-file', async () => {
    const jwt = makeJwt(validPayload);
    const { stream, buffer } = makeStdoutCapture();
    const exit = jest.fn() as unknown as (code: number) => never;
    const authService = makeAuthService(jwt);

    await handleGenerateJwt(
      { reveal: true, logFile: '/tmp/cli.log' },
      { authService, stdout: stream, exit },
    );

    expect(exit).toHaveBeenCalledWith(1);
    expect(buffer()).not.toContain(jwt);
    // Auth flow must not run at all when the combination is refused
    expect(authService.isAuthenticated).not.toHaveBeenCalled();
    expect(authService.getAuthToken).not.toHaveBeenCalled();
    const allLogs = loggedLines.join('\n');
    expect(allLogs).toMatch(/--reveal cannot be combined with --log-file/);
  });
});
