import { sentry } from './sentry';

describe('sentry', () => {
  it('should work', () => {
    expect(sentry()).toEqual('sentry');
  });
});
