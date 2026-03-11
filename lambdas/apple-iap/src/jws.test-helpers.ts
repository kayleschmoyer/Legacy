/**
 * Exported test helpers for jws.ts internals.
 * Only used in unit tests — do not import in production code.
 */

/**
 * Convert a base64-encoded DER certificate to PEM format.
 * Extracted here for unit-test coverage.
 */
export function derToPem(der: string): string {
  const pemBody = der.match(/.{1,64}/g)?.join('\n') ?? der;
  return `-----BEGIN CERTIFICATE-----\n${pemBody}\n-----END CERTIFICATE-----`;
}

/**
 * Validate that the notification bundleId matches our expected app bundle.
 */
export function validateNotificationBundleId(
  actualBundleId: string,
  expectedBundleId: string,
): void {
  if (actualBundleId !== expectedBundleId) {
    throw new Error(
      `Bundle ID mismatch: expected ${expectedBundleId}, got ${actualBundleId}`,
    );
  }
}
