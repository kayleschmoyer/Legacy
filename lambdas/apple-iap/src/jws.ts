/**
 * JWS verification for App Store Server Notifications v2
 *
 * Apple signs notifications using a certificate chain rooted at the Apple
 * Root CA. We verify:
 * 1. The JWS structure (three base64url parts)
 * 2. The x5c certificate chain in the header terminates at a trusted Apple root
 * 3. The payload bundleId matches our expected bundle ID
 *
 * We use the `jose` library for JWT/JWS operations and the built-in `crypto`
 * module for certificate chain validation.
 *
 * Docs: https://developer.apple.com/documentation/appstoreservernotifications/enabling_app_store_server_notifications
 */
import { decodeProtectedHeader, importX509, jwtVerify } from 'jose';
import * as crypto from 'crypto';
import type {
  AppStoreNotification,
  AppStoreNotificationData,
  JwsTransactionDecodedPayload,
} from './types';

// Apple Root CA G3 — the root that signs App Store certificates.
// Downloaded from: https://www.apple.com/certificateauthority/
// This is the public certificate (DER-encoded, base64), valid until 2043.
const APPLE_ROOT_CA_G3_PEM = `-----BEGIN CERTIFICATE-----
MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAxMS
QXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLEx1BcHBsZSBDZXJ0aWZpY2F0aW9u
IEF1dGhvcml0eTETMBEGA1UEChMKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcN
MTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDExJBcHBsZSBS
b290IENBIC0gRzMxJjAkBgNVBAsTHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9y
aXR5MRMwEQYDVQQKEwpBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49
AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygnnTMQa5F9JKZaKPuwoC//ZqO3bSobD1
I+TLVLpX7Ax+VFe16W0OI3G8MfJFBGCaolkNkzXMBqKg9p9eMamGBloxnPpFaQd1
sPGUvC9JFxbC3F8ZhaNjMGEwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6shibqq8ai
MB8GA1UdIwQYMBaAFLuw3qFYM4iapIqZ3r6shibqq8aiMA8GA1UdEwEB/wQFMAMB
Af8wDgYDVR0PAQH/BAQDAgGGMAoGCCqGSM49BAMDA2gAMGUCMQCD6cHEFl4aXTQY
2e3v9GwOAEZLuN/yxl/fD0HtyTiykhBtn2ufYX8/XpdNCxaFmkUCMH+bpPFj09G
UOgGQEKRCLb4GKlAoH7pveXD5Wr1R8GagEAvQ0LzQDHB9rLELfwGig==
-----END CERTIFICATE-----`;

/**
 * Decode and verify a JWS App Store Server Notification.
 *
 * @param signedPayload - The JWS string from Apple's notification body
 * @param expectedBundleId - Our app's bundle identifier
 * @returns Decoded and verified AppStoreNotification payload
 * @throws If signature is invalid, certificate chain is untrusted, or bundleId mismatches
 */
export async function decodeAndVerifyJws(
  signedPayload: string,
  expectedBundleId: string,
): Promise<AppStoreNotification> {
  // Step 1: Decode the protected header to extract x5c certificate chain
  const header = decodeProtectedHeader(signedPayload);
  const x5c = header['x5c'];

  if (!x5c || x5c.length === 0) {
    throw new Error('JWS header missing x5c certificate chain');
  }

  // Step 2: Build PEM certs from the x5c chain
  const certs = x5c.map((der) => derToPem(der));

  // Step 3: Validate certificate chain — leaf must chain to Apple Root CA
  validateCertificateChain(certs);

  // Step 4: Import the leaf certificate's public key to verify the JWS signature
  const leafCertPem = certs[0];
  const publicKey = await importX509(leafCertPem, 'ES256');

  // Step 5: Verify signature and decode the outer notification payload
  const { payload: outerPayloadBytes } = await jwtVerify(
    signedPayload,
    publicKey,
    {
      algorithms: ['ES256'],
    },
  );
  const outerPayload = outerPayloadBytes as Record<string, unknown>;

  // Step 6: Decode signedTransactionInfo (nested JWS)
  const transactionInfo = await decodeNestedJws(
    outerPayload['data'] as Record<string, unknown>,
    'signedTransactionInfo',
  );

  // Step 7: Build the notification object
  const data = outerPayload['data'] as Record<string, unknown>;
  const notificationData: AppStoreNotificationData = {
    bundleId: (data['bundleId'] as string) ?? '',
    bundleVersion: data['bundleVersion'] as string | undefined,
    environment:
      (data['environment'] as 'Sandbox' | 'Production') ?? 'Production',
    signedTransactionInfo:
      transactionInfo as unknown as JwsTransactionDecodedPayload,
  };

  // Verify bundle ID matches
  if (notificationData.bundleId !== expectedBundleId) {
    throw new Error(
      `Bundle ID mismatch: expected ${expectedBundleId}, got ${notificationData.bundleId}`,
    );
  }

  const notification: AppStoreNotification = {
    notificationUUID: (outerPayload['notificationUUID'] as string) ?? '',
    notificationType: outerPayload[
      'notificationType'
    ] as AppStoreNotification['notificationType'],
    subtype: outerPayload['subtype'] as string | undefined,
    version: outerPayload['version'] as string | undefined,
    signedDate: (outerPayload['signedDate'] as number) ?? Date.now(),
    data: notificationData,
  };

  return notification;
}

/**
 * Decode a nested JWS field (e.g. signedTransactionInfo) inside a notification.
 */
async function decodeNestedJws(
  data: Record<string, unknown>,
  field: string,
): Promise<Record<string, unknown>> {
  const jwsString = data[field] as string | undefined;
  if (!jwsString) {
    throw new Error(`Missing nested JWS field: ${field}`);
  }

  // Verify the nested JWS using the same certificate chain approach
  const header = decodeProtectedHeader(jwsString);
  const x5c = header['x5c'];
  if (!x5c || x5c.length === 0) {
    throw new Error(`Nested JWS ${field} missing x5c certificate chain`);
  }

  const certs = x5c.map(derToPem);
  validateCertificateChain(certs);

  const publicKey = await importX509(certs[0], 'ES256');
  const { payload } = await jwtVerify(jwsString, publicKey, {
    algorithms: ['ES256'],
  });

  return payload as Record<string, unknown>;
}

/**
 * Convert a base64-encoded DER certificate to PEM format.
 */
function derToPem(der: string): string {
  const pemBody = der.match(/.{1,64}/g)?.join('\n') ?? der;
  return `-----BEGIN CERTIFICATE-----\n${pemBody}\n-----END CERTIFICATE-----`;
}

/**
 * Validate that the certificate chain:
 * 1. Each cert (except the last) is signed by the next cert in the chain
 * 2. The last cert in the chain is signed by the Apple Root CA G3
 *
 * This prevents accepting notifications signed with arbitrary certificates.
 */
function validateCertificateChain(pemCerts: string[]): void {
  if (pemCerts.length === 0) {
    throw new Error('Empty certificate chain');
  }

  // Build X509Certificate objects
  const certObjects = pemCerts.map((pem) => new crypto.X509Certificate(pem));

  // Verify each cert is issued by the next one in the chain
  for (let i = 0; i < certObjects.length - 1; i++) {
    const cert = certObjects[i];
    const issuer = certObjects[i + 1];
    if (!cert.verify(issuer.publicKey)) {
      throw new Error(
        `Certificate chain validation failed at index ${i}: cert not signed by next issuer`,
      );
    }
  }

  // Verify the last cert in the chain is signed by Apple Root CA G3
  const rootCert = new crypto.X509Certificate(APPLE_ROOT_CA_G3_PEM);
  const lastCert = certObjects[certObjects.length - 1];
  if (!lastCert.verify(rootCert.publicKey)) {
    throw new Error('Certificate chain does not terminate at Apple Root CA G3');
  }
}
