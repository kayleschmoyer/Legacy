/**
 * JWS verification for StoreKit 2 transaction tokens.
 *
 * Apple signs StoreKit 2 transaction JWS tokens using ES256 (ECDSA/P-256)
 * with an x5c certificate chain rooted at Apple Root CA - G3. We verify:
 * 1. The x5c chain terminates at the pinned Apple Root CA G3
 * 2. Each cert is within its validity window
 * 3. Each cert's issuer DN matches the next cert's subject DN
 * 4. Each cert is cryptographically signed by the next in the chain
 * 5. The leaf certificate's ES256 signature over the JWS payload is valid
 *
 * Revocation (OCSP/CRL) is not checked; residual risk accepted per LS-2617.
 */
import { decodeProtectedHeader, importX509, jwtVerify } from 'jose';
import { z } from 'zod';
import * as crypto from 'crypto';

// Apple Root CA - G3. Downloaded from https://www.apple.com/certificateauthority/
// Valid until 2039-04-30. Subject: Apple Root CA - G3
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

/** Convert a base64-encoded DER certificate to PEM format. */
function derToPem(der: string): string {
  const pemBody = der.match(/.{1,64}/g)?.join('\n') ?? der;
  return `-----BEGIN CERTIFICATE-----\n${pemBody}\n-----END CERTIFICATE-----`;
}

function assertCertValidAt(
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

function validateCertificateChain(pemCerts: string[]): void {
  if (pemCerts.length === 0) {
    throw new Error('Empty certificate chain');
  }

  const certObjects = pemCerts.map((pem) => new crypto.X509Certificate(pem));
  const rootCert = new crypto.X509Certificate(APPLE_ROOT_CA_G3_PEM);
  const now = Date.now();

  for (const cert of [...certObjects, rootCert]) {
    assertCertValidAt(cert, now);
  }

  // Verify name chaining: each cert's issuer must match the next cert's subject
  for (let i = 0; i < certObjects.length - 1; i++) {
    if (certObjects[i].issuer !== certObjects[i + 1].subject) {
      throw new Error(
        `Certificate chain subject/issuer mismatch at index ${i}: cert.issuer=${certObjects[i].issuer} != nextCert.subject=${certObjects[i + 1].subject}`,
      );
    }
  }
  const last = certObjects[certObjects.length - 1];
  if (last.issuer !== rootCert.subject) {
    throw new Error(
      `Last certificate issuer does not match Apple Root CA G3 subject: cert.issuer=${last.issuer}`,
    );
  }

  // Verify each cert is cryptographically signed by the next
  for (let i = 0; i < certObjects.length - 1; i++) {
    if (!certObjects[i].verify(certObjects[i + 1].publicKey)) {
      throw new Error(
        `Certificate chain validation failed at index ${i}: cert not signed by next issuer`,
      );
    }
  }
  if (!last.verify(rootCert.publicKey)) {
    throw new Error('Certificate chain does not terminate at Apple Root CA G3');
  }

  // Verify leaf key usage permits signing (absent extension = permissive)
  const leafKeyUsage = certObjects[0].keyUsage;
  if (
    leafKeyUsage &&
    leafKeyUsage.length > 0 &&
    !leafKeyUsage.includes('digitalSignature')
  ) {
    throw new Error(
      `Leaf certificate keyUsage does not permit digital signature: keyUsage=${JSON.stringify(leafKeyUsage)}`,
    );
  }
}

const transactionPayloadSchema = z.object({
  originalTransactionId: z.string().min(1),
  transactionId: z.string().min(1),
  productId: z.string().min(1),
  bundleId: z.string().min(1),
  purchaseDate: z.number().int(),
  expiresDate: z.number().int().optional(),
  appAccountToken: z.string().optional(),
});

export interface VerifiedAppleTransactionPayload {
  originalTransactionId: string;
  transactionId: string;
  productId: string;
  bundleId: string;
  purchaseDate: number;
  expiresDate?: number;
  appAccountToken?: string;
}

/**
 * Decode and cryptographically verify a StoreKit 2 JWS transaction token.
 *
 * Validates the x5c certificate chain against Apple Root CA G3 and verifies
 * the ES256 signature before returning the payload. Throws if the JWS is
 * malformed, the certificate chain is untrusted, or the signature is invalid.
 */
export async function decodeAndVerifyJwsTransaction(
  jwsTransaction: string,
): Promise<VerifiedAppleTransactionPayload> {
  const header = decodeProtectedHeader(jwsTransaction);
  const x5c = header['x5c'];

  if (!x5c || x5c.length === 0) {
    throw new Error('JWS header missing x5c certificate chain');
  }

  const certs = x5c.map(derToPem);
  validateCertificateChain(certs);

  const publicKey = await importX509(certs[0], 'ES256');
  const { payload } = await jwtVerify(jwsTransaction, publicKey, {
    algorithms: ['ES256'],
  });

  const result = transactionPayloadSchema.safeParse(payload);
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
