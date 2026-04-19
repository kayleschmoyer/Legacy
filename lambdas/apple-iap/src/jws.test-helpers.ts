/**
 * Pure helpers used by jws.ts and covered directly in unit tests.
 * This module must not import `jose` or any other ESM-only dependency so
 * it can be required from both production code and jest specs.
 */

/**
 * Convert a base64-encoded DER certificate to PEM format.
 */
export function derToPem(der: string): string {
  const pemBody = der.match(/.{1,64}/g)?.join('\n') ?? der;
  return `-----BEGIN CERTIFICATE-----\n${pemBody}\n-----END CERTIFICATE-----`;
}

/**
 * Assert a single cert's validity window covers `now` (epoch ms).
 */
export function assertCertValidAt(
  cert: { subject: string; validFrom: string; validTo: string },
  now: number,
): void {
  const notBefore = Date.parse(cert.validFrom);
  const notAfter = Date.parse(cert.validTo);
  if (Number.isNaN(notBefore) || Number.isNaN(notAfter)) {
    throw new Error(
      `Certificate has unparseable validity window: validFrom=${cert.validFrom} validTo=${cert.validTo}`,
    );
  }
  if (now < notBefore) {
    throw new Error(
      `Certificate not yet valid (validFrom=${cert.validFrom}): subject=${cert.subject}`,
    );
  }
  if (now > notAfter) {
    throw new Error(
      `Certificate expired (validTo=${cert.validTo}): subject=${cert.subject}`,
    );
  }
}

/**
 * Assert that each cert's `issuer` matches the next cert's `subject` (RFC 5280
 * name chaining). The terminal cert's issuer must equal `expectedRootSubject`.
 */
export function assertChainNameLinkage(
  certs: ReadonlyArray<{ subject: string; issuer: string }>,
  expectedRootSubject: string,
): void {
  for (let i = 0; i < certs.length - 1; i++) {
    if (certs[i].issuer !== certs[i + 1].subject) {
      throw new Error(
        `Certificate chain subject/issuer mismatch at index ${i}: cert.issuer=${certs[i].issuer} != nextCert.subject=${certs[i + 1].subject}`,
      );
    }
  }
  const last = certs[certs.length - 1];
  if (last.issuer !== expectedRootSubject) {
    throw new Error(
      `Last certificate issuer does not match Apple Root CA G3 subject: cert.issuer=${last.issuer}`,
    );
  }
}

/**
 * Assert the leaf certificate's keyUsage permits JWS signing. A missing
 * keyUsage extension is permissive per RFC 5280 §4.2.1.3.
 */
export function assertLeafKeyUsageAllowsSigning(
  keyUsage: readonly string[] | null | undefined,
): void {
  if (
    keyUsage &&
    keyUsage.length > 0 &&
    !keyUsage.includes('digitalSignature')
  ) {
    throw new Error(
      `Leaf certificate keyUsage does not permit digital signature: keyUsage=${JSON.stringify(keyUsage)}`,
    );
  }
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
