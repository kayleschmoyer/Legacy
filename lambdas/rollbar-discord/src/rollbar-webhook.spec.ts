import { parseRollbarPayload, verifyWebhookToken } from './rollbar-webhook';

describe('verifyWebhookToken', () => {
  const secret = 'test-webhook-secret-123';

  it('returns true when token matches secret', () => {
    expect(verifyWebhookToken(secret, secret)).toBe(true);
  });

  it('returns false when token does not match', () => {
    const wrongTokenSameLength = 'x'.repeat(secret.length);
    expect(verifyWebhookToken(wrongTokenSameLength, secret)).toBe(false);
  });

  it('returns false when token is undefined', () => {
    expect(verifyWebhookToken(undefined, secret)).toBe(false);
  });

  it('returns false when token is empty string', () => {
    expect(verifyWebhookToken('', secret)).toBe(false);
  });

  it('returns false when secret is empty string', () => {
    expect(verifyWebhookToken('some-token', '')).toBe(false);
  });

  it('returns false when token and secret have different lengths', () => {
    expect(verifyWebhookToken('short', 'much-longer-secret')).toBe(false);
  });

  it('returns false when token has a space where secret has + (API Gateway URL-decodes + to space)', () => {
    // API Gateway decodes query-param `+` characters to spaces before Lambda
    // receives them. This test documents why index.ts must re-encode spaces to
    // `+` before calling verifyWebhookToken.
    const secretWithPlus = 'abc+def';
    const tokenWithSpace = 'abc def';
    expect(verifyWebhookToken(tokenWithSpace, secretWithPlus)).toBe(false);
  });

  it('returns true when token has + matching secret (after caller re-encodes spaces)', () => {
    const secret = 'abc+def';
    const reEncoded = 'abc def'.replace(/ /g, '+');
    expect(verifyWebhookToken(reEncoded, secret)).toBe(true);
  });
});

describe('parseRollbarPayload', () => {
  it('parses a valid payload', () => {
    const body = JSON.stringify({
      event_name: 'new_item',
      data: { item: { title: 'Test error' } },
    });
    const result = parseRollbarPayload(body);
    expect(result).toEqual({
      event_name: 'new_item',
      data: { item: { title: 'Test error' } },
    });
  });

  it('returns null for invalid JSON', () => {
    expect(parseRollbarPayload('not json')).toBeNull();
  });

  it('returns null when event_name is missing', () => {
    expect(parseRollbarPayload('{"data":{}}')).toBeNull();
  });

  it('returns null when data is missing', () => {
    expect(parseRollbarPayload('{"event_name":"test"}')).toBeNull();
  });
});
