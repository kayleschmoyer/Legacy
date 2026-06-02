// Mock the registry to include a required key so the throw path can be tested.
// The real v1 keys are all optional (required: false).
jest.mock('./registry', () => ({
  CONFIG_KEYS: {
    optionalKey: {
      clientSafe: true,
      web: 'VITE_OPTIONAL',
      mobile: 'EXPO_PUBLIC_OPTIONAL',
      required: false,
    },
    requiredKeyA: {
      clientSafe: false,
      node: 'REQUIRED_VAR_A',
      required: true,
    },
    requiredKeyB: {
      clientSafe: false,
      node: 'REQUIRED_VAR_B',
      required: true,
    },
  },
}));

import { validateConfig } from './validation';

describe('validateConfig', () => {
  it('returns config object with all passed values', () => {
    const result = validateConfig({
      optionalKey: 'hello',
      requiredKeyA: 'secret-a',
      requiredKeyB: 'secret-b',
    }) as Record<string, string | undefined>;
    expect(result['optionalKey']).toBe('hello');
    expect(result['requiredKeyA']).toBe('secret-a');
  });

  it('returns undefined for absent optional keys', () => {
    const result = validateConfig({
      requiredKeyA: 'a',
      requiredKeyB: 'b',
    }) as Record<string, string | undefined>;
    expect(result['optionalKey']).toBeUndefined();
  });

  it('throws when a required key is missing', () => {
    expect(() => validateConfig({ requiredKeyA: 'a' })).toThrow('requiredKeyB');
  });

  it('aggregates all missing required keys in one error (AC2)', () => {
    expect(() => validateConfig({})).toThrow(
      /requiredKeyA.*requiredKeyB|requiredKeyB.*requiredKeyA/,
    );
    expect(() => validateConfig({})).toThrow(
      'required keys are not configured',
    );
  });

  it('does not throw when all required keys are present', () => {
    expect(() =>
      validateConfig({ requiredKeyA: 'a', requiredKeyB: 'b' }),
    ).not.toThrow();
  });
});
