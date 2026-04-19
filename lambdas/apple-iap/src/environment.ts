/**
 * Apple environment validation.
 *
 * App Store Server Notifications include an `environment` field
 * ('Sandbox' | 'Production') in their decoded payload. The production lambda
 * must reject sandbox-signed notifications (and vice versa) — otherwise an
 * attacker with a sandbox Apple account could trigger SUBSCRIBED / REFUND /
 * REVOKE events against real user originalTransactionIds.
 */

export type AppleEnvironment = 'Sandbox' | 'Production';

/**
 * Parse the EXPECTED_APPLE_ENVIRONMENT env var.
 *
 * Defaults to 'Production' when unset so an unconfigured prod deployment
 * fails closed against sandbox traffic. Any value other than the two valid
 * Apple environments throws so a misconfigured deployment fails fast at
 * boot rather than silently accepting either environment.
 */
export function parseExpectedAppleEnvironment(
  raw: string | undefined,
): AppleEnvironment {
  if (raw === undefined || raw === '') return 'Production';
  if (raw !== 'Sandbox' && raw !== 'Production') {
    throw new Error(
      `EXPECTED_APPLE_ENVIRONMENT must be "Sandbox" or "Production", got "${raw}"`,
    );
  }
  return raw;
}

/**
 * Throw when the notification environment does not match the lambda's
 * configured environment.
 */
export function assertNotificationEnvironment(
  actual: string,
  expected: AppleEnvironment,
): void {
  if (actual !== expected) {
    throw new Error(
      `Environment mismatch: expected ${expected}, got ${actual}`,
    );
  }
}
