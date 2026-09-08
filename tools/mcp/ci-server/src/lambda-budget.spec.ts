import { afterEach, describe, expect, it } from '@jest/globals';
import type { Context } from 'aws-lambda';

import { getRemainingLambdaMs, setLambdaContext } from './lambda-budget.js';

function fakeContext(remainingMs: number): Context {
  return {
    getRemainingTimeInMillis: () => remainingMs,
  } as unknown as Context;
}

describe('lambda-budget (LS-8429)', () => {
  afterEach(() => {
    setLambdaContext(undefined);
  });

  it('returns Infinity when no Lambda context has been set (local/stdio transport, tests)', () => {
    expect(getRemainingLambdaMs()).toBe(Infinity);
  });

  it('returns the real remaining time once a Lambda context is set', () => {
    setLambdaContext(fakeContext(12_345));
    expect(getRemainingLambdaMs()).toBe(12_345);
  });

  it('reflects the latest context after it is updated on a subsequent invocation', () => {
    setLambdaContext(fakeContext(20_000));
    expect(getRemainingLambdaMs()).toBe(20_000);
    setLambdaContext(fakeContext(5_000));
    expect(getRemainingLambdaMs()).toBe(5_000);
  });

  it('falls back to Infinity again once the context is cleared', () => {
    setLambdaContext(fakeContext(1_000));
    setLambdaContext(undefined);
    expect(getRemainingLambdaMs()).toBe(Infinity);
  });
});
