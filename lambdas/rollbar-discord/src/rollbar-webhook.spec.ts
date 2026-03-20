import { createHmac } from 'crypto';
import { parseRollbarPayload, verifySignature } from './rollbar-webhook';

const TEST_SECRET = 'test-webhook-secret';

function sign(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

describe('verifySignature', () => {
  const body = '{"event_name":"new_item","data":{}}';

  it('returns true for a valid signature', () => {
    const sig = sign(body, TEST_SECRET);
    expect(verifySignature(body, sig, TEST_SECRET)).toBe(true);
  });

  it('returns false when signature is undefined', () => {
    expect(verifySignature(body, undefined, TEST_SECRET)).toBe(false);
  });

  it('returns false for an invalid signature', () => {
    expect(verifySignature(body, 'deadbeef', TEST_SECRET)).toBe(false);
  });

  it('returns false when body is tampered', () => {
    const sig = sign(body, TEST_SECRET);
    const tampered = body.replace('new_item', 'hacked');
    expect(verifySignature(tampered, sig, TEST_SECRET)).toBe(false);
  });

  it('returns false when signed with wrong secret', () => {
    const sig = sign(body, 'wrong-secret');
    expect(verifySignature(body, sig, TEST_SECRET)).toBe(false);
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
