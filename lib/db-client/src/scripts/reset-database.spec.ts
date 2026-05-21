import { assertResetAllowed } from './reset-database';

describe('assertResetAllowed', () => {
  it('throws when ALLOW_DB_RESET is not set', () => {
    expect(() => assertResetAllowed({})).toThrow(/ALLOW_DB_RESET=true/);
  });

  it('throws when ALLOW_DB_RESET is set to something other than "true"', () => {
    expect(() => assertResetAllowed({ ALLOW_DB_RESET: 'yes' })).toThrow(
      /ALLOW_DB_RESET=true/,
    );
    expect(() => assertResetAllowed({ ALLOW_DB_RESET: '1' })).toThrow(
      /ALLOW_DB_RESET=true/,
    );
  });

  it('throws when NODE_ENV=production even if ALLOW_DB_RESET=true', () => {
    expect(() =>
      assertResetAllowed({ ALLOW_DB_RESET: 'true', NODE_ENV: 'production' }),
    ).toThrow(/NODE_ENV=production/);
  });

  it('does not throw when ALLOW_DB_RESET=true and NODE_ENV is not production', () => {
    expect(() =>
      assertResetAllowed({ ALLOW_DB_RESET: 'true', NODE_ENV: 'development' }),
    ).not.toThrow();
    expect(() => assertResetAllowed({ ALLOW_DB_RESET: 'true' })).not.toThrow();
  });
});
