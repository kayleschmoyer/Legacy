import * as LocalAuthentication from 'expo-local-authentication';
import { jwtDecode } from 'jwt-decode';
import { LOGGER } from '@legacy-sports/logging';
import { SecureStorageProvider } from '@legacy-sports/shared-components';
import { readKeychainValue, Secret } from './AuthHooks';

/** SecureStore key used to persist the JWT for biometric unlock. */
export const BIOMETRIC_JWT_KEY = Secret.INTERNAL_JWT;

export interface BiometricState {
  /** Device has biometric hardware (Face ID / fingerprint sensor). */
  hasHardware: boolean;
  /** At least one biometric credential is enrolled. */
  isEnrolled: boolean;
  /** A non-expired JWT is present in secure storage. */
  hasStoredToken: boolean;
}

// Signature verification is intentionally omitted: the signing key cannot be
// safely embedded in a mobile app bundle. The token was obtained via a full
// OAuth server flow and stored in hardware-backed secure storage (iOS Keychain /
// Android Keystore). The server re-validates every API call, so a locally-forged
// token only affects client-side state — not API access. Rooted-device attacks
// that bypass secure storage are out of scope per the mobile threat model.
function isJwtValid(jwt: string): boolean {
  try {
    const decoded = jwtDecode<{ exp?: number }>(jwt);
    if (!decoded.exp) return false;
    return decoded.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

export async function checkBiometricState(): Promise<BiometricState> {
  const [hasHardware, isEnrolled, storedToken] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
    readKeychainValue(BIOMETRIC_JWT_KEY),
  ]);
  return {
    hasHardware,
    isEnrolled,
    hasStoredToken: storedToken !== null && isJwtValid(storedToken),
  };
}

/**
 * Trigger the native biometric prompt. Returns true if the user authenticated
 * successfully, false if they cancelled or failed.
 */
export async function promptBiometric(): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Sign in to Legacy Sports',
      fallbackLabel: 'Use password',
      disableDeviceFallback: false,
    });
    return result.success;
  } catch (error) {
    LOGGER.warn(
      'Biometric prompt failed:',
      error instanceof Error ? error : new Error(String(error)),
    );
    return false;
  }
}

/**
 * Return the stored JWT if it is valid (not expired), otherwise null.
 * Returns null on any read error.
 */
export async function getStoredJwtIfValid(): Promise<string | null> {
  const token = await readKeychainValue(BIOMETRIC_JWT_KEY);
  if (!token) return null;
  return isJwtValid(token) ? token : null;
}

/**
 * Persist a JWT to secure storage for biometric unlock on the next cold start.
 */
export async function storeJwtForBiometric(jwt: string): Promise<void> {
  try {
    await SecureStorageProvider.setItem(BIOMETRIC_JWT_KEY, jwt);
  } catch (error) {
    LOGGER.warn(
      'Failed to store JWT for biometric unlock:',
      error instanceof Error ? error : new Error(String(error)),
    );
  }
}
