import { parseRollbarPayload, verifyOrigin } from './rollbar-webhook';

describe('verifyOrigin', () => {
  it('returns true for known Rollbar IP', () => {
    expect(verifyOrigin('35.184.69.251')).toBe(true);
  });

  it('returns false for unknown IP', () => {
    expect(verifyOrigin('1.2.3.4')).toBe(false);
  });

  it('returns false when sourceIp is undefined', () => {
    expect(verifyOrigin(undefined)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(verifyOrigin('')).toBe(false);
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
