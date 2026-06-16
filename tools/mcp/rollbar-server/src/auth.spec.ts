import {
  ROLLBAR_READ_TOKEN_ENV,
  getRollbarToken,
  tryGetRollbarToken,
} from './auth';

describe('auth', () => {
  const original = process.env[ROLLBAR_READ_TOKEN_ENV];

  afterEach(() => {
    if (original === undefined) {
      delete process.env[ROLLBAR_READ_TOKEN_ENV];
    } else {
      process.env[ROLLBAR_READ_TOKEN_ENV] = original;
    }
  });

  it('getRollbarToken returns the token when set', () => {
    process.env[ROLLBAR_READ_TOKEN_ENV] = 'abc123';
    expect(getRollbarToken()).toBe('abc123');
  });

  it('getRollbarToken throws an actionable error when unset', () => {
    delete process.env[ROLLBAR_READ_TOKEN_ENV];
    expect(() => getRollbarToken()).toThrow(/ROLLBAR_READ_ACCESS_TOKEN/);
    expect(() => getRollbarToken()).toThrow(/read.*scope/i);
  });

  it('tryGetRollbarToken returns null when unset and the token when set', () => {
    delete process.env[ROLLBAR_READ_TOKEN_ENV];
    expect(tryGetRollbarToken()).toBeNull();

    process.env[ROLLBAR_READ_TOKEN_ENV] = 'tok';
    expect(tryGetRollbarToken()).toBe('tok');
  });

  it('tryGetRollbarToken treats an empty string as unconfigured', () => {
    process.env[ROLLBAR_READ_TOKEN_ENV] = '';
    expect(tryGetRollbarToken()).toBeNull();
  });
});
