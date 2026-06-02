/**
 * Pure helpers used by jws.ts and covered directly in unit tests.
 * This module must not import `jose` or any other ESM-only dependency so
 * it can be required from both production code and jest specs.
 */
import { z } from 'zod';
import type { JwsTransactionDecodedPayload } from './types';

/**
 * Convert a base64-encoded DER certificate to PEM format.
 */
export function derToPem(der: string): string {
  const pemBody = der.match(/.{1,64}/g)?.join('\n') ?? der;
  return `-----BEGIN CERTIFICATE-----\n${pemBody}\n-----END CERTIFICATE-----`;
}

// Tolerance applied to certificate validity-window boundaries to absorb modest
// server clock drift. Without it, a server whose clock drifts past a cert's
// notBefore/notAfter boundary fails *all* App Store Server Notification
// verifications with a spurious "Certificate expired" / "not yet valid" error
// (LS-5250; sibling fix to LS-5202 in lambdas/db/src/apple-jws.ts). Five
// minutes mirrors the skew tolerance commonly applied to JWT/X.509 time checks
// and is far smaller than Apple's multi-year cert validity windows, so it does
// not meaningfully weaken the validity check.
const CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000;

/**
 * Assert a single cert's validity window covers `now` (epoch ms), allowing a
 * small clock-skew tolerance on both boundaries.
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
  if (now < notBefore - CLOCK_SKEW_TOLERANCE_MS) {
    throw new Error(
      `Certificate not yet valid (validFrom=${cert.validFrom}): subject=${cert.subject}`,
    );
  }
  if (now > notAfter + CLOCK_SKEW_TOLERANCE_MS) {
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

// ---------------------------------------------------------------------------
// Runtime payload validation schemas
// ---------------------------------------------------------------------------

const transactionPayloadSchema = z.object({
  originalTransactionId: z.string().min(1),
  transactionId: z.string().min(1),
  productId: z.string().min(1),
  bundleId: z.string().min(1),
  purchaseDate: z.number().int(),
  expiresDate: z.number().int().optional(),
  appAccountToken: z.string().optional(),
  subscriptionGroupIdentifier: z.string().optional(),
});

const notificationDataSchema = z
  .object({
    bundleId: z.string().min(1),
    bundleVersion: z.string().optional(),
    environment: z.enum(['Sandbox', 'Production']),
  })
  .passthrough();

/**
 * Parse and validate a raw decoded JWS transaction payload against the
 * required fields. Throws a descriptive Error (not a ZodError) if validation
 * fails so callers get a clean rejection message.
 */
export function parseTransactionPayload(
  raw: unknown,
): JwsTransactionDecodedPayload {
  const result = transactionPayloadSchema.safeParse(raw);
  if (!result.success) {
    const fields = result.error.issues
      .map((i) => (i.path.length > 0 ? i.path.join('.') : i.message))
      .join(', ');
    throw new Error(
      `Invalid transaction payload: missing or invalid fields (${fields})`,
    );
  }
  return result.data;
}

/**
 * Parse and validate the outer notification data object. Throws a descriptive
 * Error if required fields (bundleId, environment) are absent or malformed.
 */
export function parseNotificationData(raw: unknown): {
  bundleId: string;
  bundleVersion?: string;
  environment: 'Sandbox' | 'Production';
  [key: string]: unknown;
} {
  const result = notificationDataSchema.safeParse(raw);
  if (!result.success) {
    const fields = result.error.issues
      .map((i) => (i.path.length > 0 ? i.path.join('.') : i.message))
      .join(', ');
    throw new Error(
      `Invalid notification data: missing or invalid fields (${fields})`,
    );
  }
  return result.data;
}
