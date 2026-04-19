import { describe, expect, it } from '@jest/globals';
import {
  assertNotificationEnvironment,
  parseExpectedAppleEnvironment,
} from './environment';

describe('parseExpectedAppleEnvironment', () => {
  it('defaults to Production when unset', () => {
    expect(parseExpectedAppleEnvironment(undefined)).toBe('Production');
    expect(parseExpectedAppleEnvironment('')).toBe('Production');
  });

  it('returns the value when valid', () => {
    expect(parseExpectedAppleEnvironment('Sandbox')).toBe('Sandbox');
    expect(parseExpectedAppleEnvironment('Production')).toBe('Production');
  });

  it('throws on any other value', () => {
    expect(() => parseExpectedAppleEnvironment('production')).toThrow(
      /must be "Sandbox" or "Production"/,
    );
    expect(() => parseExpectedAppleEnvironment('staging')).toThrow();
  });
});

describe('assertNotificationEnvironment', () => {
  it('throws when actual does not match expected', () => {
    expect(() =>
      assertNotificationEnvironment('Sandbox', 'Production'),
    ).toThrow(/Environment mismatch: expected Production, got Sandbox/);
    expect(() =>
      assertNotificationEnvironment('Production', 'Sandbox'),
    ).toThrow(/Environment mismatch: expected Sandbox, got Production/);
  });

  it('does not throw when environments match', () => {
    expect(() =>
      assertNotificationEnvironment('Production', 'Production'),
    ).not.toThrow();
    expect(() =>
      assertNotificationEnvironment('Sandbox', 'Sandbox'),
    ).not.toThrow();
  });
});
