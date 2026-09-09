import { PfaRateLimiter } from './RateLimiter';

describe('PfaRateLimiter', () => {
  it('does not delay the first call', async () => {
    const limiter = new PfaRateLimiter(1_000);
    const start = Date.now();
    await limiter.waitForTurn();
    expect(Date.now() - start).toBeLessThan(100);
  });

  it('enforces at least minDelayMs between consecutive calls', async () => {
    const limiter = new PfaRateLimiter(200);
    await limiter.waitForTurn();
    const start = Date.now();
    await limiter.waitForTurn();
    expect(Date.now() - start).toBeGreaterThanOrEqual(190);
  });

  it('does not add extra delay when the caller was already slow enough', async () => {
    const limiter = new PfaRateLimiter(50);
    await limiter.waitForTurn();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const start = Date.now();
    await limiter.waitForTurn();
    expect(Date.now() - start).toBeLessThan(50);
  });

  it('rejects a negative minDelayMs', () => {
    expect(() => new PfaRateLimiter(-1)).toThrow();
  });

  it('reset() clears the last-request timestamp so the next call is immediate', async () => {
    const limiter = new PfaRateLimiter(1_000);
    await limiter.waitForTurn();
    limiter.reset();
    const start = Date.now();
    await limiter.waitForTurn();
    expect(Date.now() - start).toBeLessThan(100);
  });
});
