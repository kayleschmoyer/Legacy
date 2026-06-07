import {
  _resetLoginThrottleForTests,
  clearFailedLogins,
  isLoginLocked,
  LOCKOUT_WINDOW_MS,
  MAX_FAILED_ATTEMPTS,
  recordFailedLogin,
} from './login-throttle';

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const EMAIL = 'victim@example.com';

async function failNTimes(email: string, n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    await recordFailedLogin(email);
  }
}

describe('login-throttle (in-memory backend)', () => {
  beforeEach(() => {
    _resetLoginThrottleForTests();
    // The module reads LOGIN_THROTTLE_TABLE_NAME at import time; it is unset in
    // the test env, so these cases exercise the in-memory fallback.
    expect(process.env.LOGIN_THROTTLE_TABLE_NAME).toBeUndefined();
  });

  it('does not lock below the failed-attempt threshold', async () => {
    await failNTimes(EMAIL, MAX_FAILED_ATTEMPTS - 1);
    const state = await isLoginLocked(EMAIL);
    expect(state.locked).toBe(false);
  });

  it('locks once the failed-attempt threshold is reached', async () => {
    await failNTimes(EMAIL, MAX_FAILED_ATTEMPTS);
    const state = await isLoginLocked(EMAIL);
    expect(state.locked).toBe(true);
    expect(state.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('locks an email regardless of source IP (per-email, not per-IP)', async () => {
    // recordFailedLogin takes no IP — failures accumulate purely by email, so
    // attempts spread across many IPs all land in the same bucket.
    await failNTimes(EMAIL, MAX_FAILED_ATTEMPTS);
    expect((await isLoginLocked(EMAIL)).locked).toBe(true);
  });

  it('a successful login clears the counter', async () => {
    await failNTimes(EMAIL, MAX_FAILED_ATTEMPTS);
    expect((await isLoginLocked(EMAIL)).locked).toBe(true);

    await clearFailedLogins(EMAIL);
    expect((await isLoginLocked(EMAIL)).locked).toBe(false);
  });

  it('isolates counters between different emails', async () => {
    await failNTimes(EMAIL, MAX_FAILED_ATTEMPTS);
    expect((await isLoginLocked('other@example.com')).locked).toBe(false);
  });

  it('normalises case and whitespace to a single bucket', async () => {
    await failNTimes('  Victim@Example.com  ', MAX_FAILED_ATTEMPTS);
    expect((await isLoginLocked(EMAIL)).locked).toBe(true);
  });

  it('resets after the window elapses', async () => {
    await failNTimes(EMAIL, MAX_FAILED_ATTEMPTS);
    expect((await isLoginLocked(EMAIL)).locked).toBe(true);

    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now + LOCKOUT_WINDOW_MS + 1);
    try {
      expect((await isLoginLocked(EMAIL)).locked).toBe(false);
    } finally {
      jest.restoreAllMocks();
    }
  });
});
