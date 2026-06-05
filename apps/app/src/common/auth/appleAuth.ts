import * as AppleAuthentication from 'expo-apple-authentication';
import type { AppleAuthPayload } from '@legacy-sports/shared-components';
import { LOGGER } from '@legacy-sports/logging';

/**
 * Error code surfaced by `expo-apple-authentication` when the user dismisses
 * the native Sign in with Apple sheet. Callers treat this as a non-error
 * cancellation rather than a failure to report.
 */
export const APPLE_SIGN_IN_CANCELLED = 'ERR_REQUEST_CANCELED';

/**
 * Whether native Sign in with Apple is available on this device. Always false
 * on Android and on iOS simulators/devices below iOS 13. The login screen uses
 * this to decide whether to render the Apple button (App Store guideline 4.8
 * only mandates the button where the framework is actually available — i.e.
 * iOS).
 */
export async function isAppleAuthAvailable(): Promise<boolean> {
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch (error) {
    LOGGER.warn(
      'Apple authentication availability check failed:',
      String(error),
    );
    return false;
  }
}

/**
 * Build a single display name from Apple's `fullName` components. Apple only
 * returns the name on the very first authorization for a given Apple ID, so this
 * may legitimately yield `undefined` on subsequent sign-ins.
 */
function formatFullName(
  fullName: AppleAuthentication.AppleAuthenticationCredential['fullName'],
): string | undefined {
  if (!fullName) {
    return undefined;
  }
  const parts = [fullName.givenName, fullName.familyName].filter(
    (part): part is string => !!part && part.trim().length > 0,
  );
  return parts.length > 0 ? parts.join(' ') : undefined;
}

/**
 * Run the native Sign in with Apple flow (AuthenticationServices via
 * `expo-apple-authentication`) and return the payload the oauth-proxy `/apple`
 * endpoint expects. The returned `identityToken` is the Apple-signed JWT the
 * server verifies and exchanges for a Legacy Sports JWT.
 *
 * Throws if Apple does not return an identity token (the server cannot
 * authenticate the user without it) or if the native flow itself fails. The
 * `ERR_REQUEST_CANCELED` error is re-thrown unchanged so callers can detect a
 * user cancellation.
 */
export async function signInWithApple(): Promise<AppleAuthPayload> {
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });

  if (!credential.identityToken) {
    throw new Error('Apple sign-in did not return an identity token');
  }

  return {
    identityToken: credential.identityToken,
    fullName: formatFullName(credential.fullName),
  };
}
