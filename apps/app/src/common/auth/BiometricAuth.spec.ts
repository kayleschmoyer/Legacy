// Unit coverage for the biometric gate (LS-8454, AC3). `BiometricAuth.ts` decides
// whether the `biometric-login-button` can appear (`hasStoredToken`) and drives
// the on-device unlock prompt. `login.spec.tsx` already asserts the button
// renders when `checkBiometricState` reports `hasStoredToken: true`; these tests
// cover the *real* logic that produces that flag — in particular that a stored
// session only counts when its JWT is present and unexpired. The emulator-level
// fingerprint assertion (adb emu finger touch) is deferred to the AppiumNativeDriver
// (LS-8447); see apps/app-e2e/SESSION-LIFECYCLE-E2E.md.

import {
  BIOMETRIC_JWT_KEY,
  checkBiometricState,
  getStoredJwtIfValid,
  promptBiometric,
  storeJwtForBiometric,
} from './BiometricAuth';
import { buildTestJwt } from './testHarness/sessionInjection';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockHasHardwareAsync = jest.fn<Promise<boolean>, []>();
const mockIsEnrolledAsync = jest.fn<Promise<boolean>, []>();
const mockAuthenticateAsync = jest.fn<
  Promise<{ success: boolean }>,
  [unknown]
>();
jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: (): unknown => mockHasHardwareAsync(),
  isEnrolledAsync: (): unknown => mockIsEnrolledAsync(),
  authenticateAsync: (opts: unknown): unknown => mockAuthenticateAsync(opts),
}));

// Mock AuthHooks so we control the stored token without loading the hook's heavy
// native transitive imports. `Secret` is passed through as its literal values.
const mockReadKeychainValue = jest.fn<Promise<string | null>, [string]>();
jest.mock('./AuthHooks', () => ({
  readKeychainValue: (secret: string): unknown => mockReadKeychainValue(secret),
  Secret: { GOOGLE_JWT: 'GOOGLE_JWT', INTERNAL_JWT: 'INTERNAL_JWT' },
}));

const mockSetItem = jest.fn<Promise<void>, [string, string]>();
jest.mock('@legacy-sports/shared-components', () => ({
  SecureStorageProvider: {
    setItem: (key: string, value: string): unknown => mockSetItem(key, value),
  },
}));

const mockLoggerWarn = jest.fn();
jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    warn: (...args: unknown[]): unknown => mockLoggerWarn(...args),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// ── Fixtures ─────────────────────────────────────────────────────────────────

const VALID_JWT = buildTestJwt({ id: 42, username: 'testuser' });
const EXPIRED_JWT = buildTestJwt(
  { id: 42, username: 'testuser' },
  { expiresInMs: -60_000 },
);

beforeEach(() => {
  jest.clearAllMocks();
  mockHasHardwareAsync.mockResolvedValue(true);
  mockIsEnrolledAsync.mockResolvedValue(true);
  mockReadKeychainValue.mockResolvedValue(null);
  mockAuthenticateAsync.mockResolvedValue({ success: true });
  mockSetItem.mockResolvedValue(undefined);
});

// ── checkBiometricState ──────────────────────────────────────────────────────

describe('checkBiometricState', () => {
  it('reports a usable biometric session when hardware, enrollment, and a valid stored token are present', async () => {
    mockReadKeychainValue.mockResolvedValue(VALID_JWT);

    const state = await checkBiometricState();

    expect(state).toEqual({
      hasHardware: true,
      isEnrolled: true,
      hasStoredToken: true,
    });
    expect(mockReadKeychainValue).toHaveBeenCalledWith(BIOMETRIC_JWT_KEY);
  });

  it('reports hasStoredToken=false when no token is stored (cleared session)', async () => {
    mockReadKeychainValue.mockResolvedValue(null);

    const state = await checkBiometricState();

    expect(state.hasStoredToken).toBe(false);
  });

  it('reports hasStoredToken=false when the stored token is expired', async () => {
    mockReadKeychainValue.mockResolvedValue(EXPIRED_JWT);

    const state = await checkBiometricState();

    expect(state.hasStoredToken).toBe(false);
  });

  it('reports hasStoredToken=false when the stored token is malformed', async () => {
    mockReadKeychainValue.mockResolvedValue('not-a-jwt');

    const state = await checkBiometricState();

    expect(state.hasStoredToken).toBe(false);
  });

  it('reports hasStoredToken=false when a token has no exp claim', async () => {
    const header = Buffer.from(
      JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
    ).toString('base64url');
    const payloadNoExp = Buffer.from(
      JSON.stringify({ id: 1, username: 'x' }),
    ).toString('base64url');
    mockReadKeychainValue.mockResolvedValue(`${header}.${payloadNoExp}.sig`);

    const state = await checkBiometricState();

    expect(state.hasStoredToken).toBe(false);
  });

  it('surfaces missing hardware / enrollment independently of the stored token', async () => {
    mockHasHardwareAsync.mockResolvedValue(false);
    mockIsEnrolledAsync.mockResolvedValue(false);
    mockReadKeychainValue.mockResolvedValue(VALID_JWT);

    const state = await checkBiometricState();

    expect(state).toEqual({
      hasHardware: false,
      isEnrolled: false,
      hasStoredToken: true,
    });
  });
});

// ── promptBiometric ──────────────────────────────────────────────────────────

describe('promptBiometric', () => {
  it('returns true when the native prompt succeeds', async () => {
    mockAuthenticateAsync.mockResolvedValue({ success: true });

    await expect(promptBiometric()).resolves.toBe(true);
    expect(mockAuthenticateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ promptMessage: 'Sign in to Legacy Sports' }),
    );
  });

  it('returns false when the user cancels or fails the prompt', async () => {
    mockAuthenticateAsync.mockResolvedValue({ success: false });

    await expect(promptBiometric()).resolves.toBe(false);
  });

  it('returns false and warns when the native prompt throws', async () => {
    mockAuthenticateAsync.mockRejectedValue(new Error('sensor busy'));

    await expect(promptBiometric()).resolves.toBe(false);
    expect(mockLoggerWarn).toHaveBeenCalled();
  });
});

// ── getStoredJwtIfValid ──────────────────────────────────────────────────────

describe('getStoredJwtIfValid', () => {
  it('returns the stored token when it is valid', async () => {
    mockReadKeychainValue.mockResolvedValue(VALID_JWT);

    await expect(getStoredJwtIfValid()).resolves.toBe(VALID_JWT);
  });

  it('returns null when no token is stored', async () => {
    mockReadKeychainValue.mockResolvedValue(null);

    await expect(getStoredJwtIfValid()).resolves.toBeNull();
  });

  it('returns null when the stored token is expired', async () => {
    mockReadKeychainValue.mockResolvedValue(EXPIRED_JWT);

    await expect(getStoredJwtIfValid()).resolves.toBeNull();
  });
});

// ── storeJwtForBiometric ─────────────────────────────────────────────────────

describe('storeJwtForBiometric', () => {
  it('persists the JWT under the biometric key', async () => {
    await storeJwtForBiometric(VALID_JWT);

    expect(mockSetItem).toHaveBeenCalledWith(BIOMETRIC_JWT_KEY, VALID_JWT);
  });

  it('swallows and warns when secure storage rejects', async () => {
    mockSetItem.mockRejectedValue(new Error('keystore unavailable'));

    await expect(storeJwtForBiometric(VALID_JWT)).resolves.toBeUndefined();
    expect(mockLoggerWarn).toHaveBeenCalled();
  });
});
