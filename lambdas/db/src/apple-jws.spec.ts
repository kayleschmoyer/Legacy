import { beforeEach, describe, expect, it, jest } from '@jest/globals';

// Mock jose so tests don't need real crypto/network
jest.mock('jose', () => ({
  decodeProtectedHeader: jest.fn(),
  importX509: jest.fn(),
  jwtVerify: jest.fn(),
}));

jest.mock('crypto', () => {
  const actual = jest.requireActual<typeof import('crypto')>('crypto');
  return {
    ...actual,
    X509Certificate: jest.fn(),
  };
});

import { decodeProtectedHeader, importX509, jwtVerify } from 'jose';
import * as crypto from 'crypto';
import { decodeAndVerifyJwsTransaction } from './apple-jws';

const mockDecodeProtectedHeader = decodeProtectedHeader as jest.MockedFunction<
  typeof decodeProtectedHeader
>;
const mockImportX509 = importX509 as jest.MockedFunction<typeof importX509>;
const mockJwtVerify = jwtVerify as jest.MockedFunction<typeof jwtVerify>;
const MockX509Certificate = crypto.X509Certificate as jest.Mock;

const APPLE_ROOT_SUBJECT =
  'CN=Apple Root CA - G3, OU=Apple Certification Authority, O=Apple Inc., C=US';

function makeLeafCert(issuer: string = APPLE_ROOT_SUBJECT) {
  return {
    subject: 'CN=Leaf',
    issuer,
    validFrom: 'Jan  1 00:00:00 2025 GMT',
    validTo: 'Jan  1 00:00:00 2030 GMT',
    keyUsage: ['digitalSignature'],
    publicKey: {},
    verify: jest.fn().mockReturnValue(true),
    // checkIssued(nextCert) — true means "this cert was issued by nextCert".
    // Name chaining now uses checkIssued instead of raw DN string equality.
    checkIssued: jest.fn().mockReturnValue(true),
  };
}

function makeRootCert() {
  return {
    subject: APPLE_ROOT_SUBJECT,
    issuer: APPLE_ROOT_SUBJECT,
    validFrom: 'Apr 30 18:19:06 2014 GMT',
    validTo: 'Apr 30 18:19:06 2039 GMT',
    keyUsage: ['digitalSignature', 'keyCertSign', 'cRLSign'],
    publicKey: {},
    verify: jest.fn().mockReturnValue(true),
    checkIssued: jest.fn().mockReturnValue(true),
  };
}

const validPayload = {
  originalTransactionId: 'txn-orig-001',
  transactionId: 'txn-001',
  productId: 'com.legacysports.app.premium.monthly',
  bundleId: 'com.legacysports.app',
  purchaseDate: 1700000000000,
  expiresDate: 1800000000000,
};

// Stub DER (base64) — content irrelevant since X509Certificate is mocked
const STUB_DER = Buffer.from('stub cert').toString('base64');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('decodeAndVerifyJwsTransaction', () => {
  it('throws when the JWS header has no x5c field', async () => {
    mockDecodeProtectedHeader.mockReturnValue({ alg: 'ES256' } as ReturnType<
      typeof decodeProtectedHeader
    >);

    await expect(
      decodeAndVerifyJwsTransaction('header.payload.sig'),
    ).rejects.toThrow('JWS header missing x5c certificate chain');
  });

  it('throws when the x5c array is empty', async () => {
    mockDecodeProtectedHeader.mockReturnValue({
      alg: 'ES256',
      x5c: [],
    } as unknown as ReturnType<typeof decodeProtectedHeader>);

    await expect(
      decodeAndVerifyJwsTransaction('header.payload.sig'),
    ).rejects.toThrow('JWS header missing x5c certificate chain');
  });

  it('throws when the certificate chain does not terminate at Apple Root CA G3', async () => {
    mockDecodeProtectedHeader.mockReturnValue({
      alg: 'ES256',
      x5c: [STUB_DER],
    } as unknown as ReturnType<typeof decodeProtectedHeader>);

    const leafCert = makeLeafCert('CN=Rogue Root');
    leafCert.checkIssued.mockReturnValue(false);
    const rootCert = makeRootCert();
    MockX509Certificate.mockReturnValueOnce(leafCert).mockReturnValueOnce(
      rootCert,
    );

    await expect(
      decodeAndVerifyJwsTransaction('header.payload.sig'),
    ).rejects.toThrow(/Last certificate is not issued by Apple Root CA G3/);
  });

  it('throws when signature verification fails', async () => {
    mockDecodeProtectedHeader.mockReturnValue({
      alg: 'ES256',
      x5c: [STUB_DER],
    } as unknown as ReturnType<typeof decodeProtectedHeader>);

    const leafCert = makeLeafCert();
    (leafCert.verify as jest.Mock).mockReturnValue(false);
    const rootCert = makeRootCert();
    MockX509Certificate.mockReturnValueOnce(leafCert).mockReturnValueOnce(
      rootCert,
    );

    await expect(
      decodeAndVerifyJwsTransaction('header.payload.sig'),
    ).rejects.toThrow(
      /Certificate chain does not terminate at Apple Root CA G3/,
    );
  });

  it('throws when jwtVerify rejects (invalid ES256 signature)', async () => {
    mockDecodeProtectedHeader.mockReturnValue({
      alg: 'ES256',
      x5c: [STUB_DER],
    } as unknown as ReturnType<typeof decodeProtectedHeader>);

    const leafCert = makeLeafCert();
    const rootCert = makeRootCert();
    MockX509Certificate.mockReturnValueOnce(leafCert).mockReturnValueOnce(
      rootCert,
    );

    mockImportX509.mockResolvedValue(
      {} as Awaited<ReturnType<typeof importX509>>,
    );
    mockJwtVerify.mockRejectedValue(
      new Error('JWSSignatureVerificationFailed'),
    );

    await expect(
      decodeAndVerifyJwsTransaction('header.payload.sig'),
    ).rejects.toThrow('JWSSignatureVerificationFailed');
  });

  it('throws when the verified payload is missing required fields', async () => {
    mockDecodeProtectedHeader.mockReturnValue({
      alg: 'ES256',
      x5c: [STUB_DER],
    } as unknown as ReturnType<typeof decodeProtectedHeader>);

    const leafCert = makeLeafCert();
    const rootCert = makeRootCert();
    MockX509Certificate.mockReturnValueOnce(leafCert).mockReturnValueOnce(
      rootCert,
    );

    mockImportX509.mockResolvedValue(
      {} as Awaited<ReturnType<typeof importX509>>,
    );
    // Payload missing originalTransactionId
    mockJwtVerify.mockResolvedValue({
      payload: {
        transactionId: 'txn',
        productId: 'prod',
        bundleId: 'bundle',
        purchaseDate: 0,
      },
      protectedHeader: { alg: 'ES256' },
    } as unknown as Awaited<ReturnType<typeof jwtVerify>>);

    await expect(
      decodeAndVerifyJwsTransaction('header.payload.sig'),
    ).rejects.toThrow(/originalTransactionId/);
  });

  it('returns verified payload on success', async () => {
    mockDecodeProtectedHeader.mockReturnValue({
      alg: 'ES256',
      x5c: [STUB_DER],
    } as unknown as ReturnType<typeof decodeProtectedHeader>);

    const leafCert = makeLeafCert();
    const rootCert = makeRootCert();
    MockX509Certificate.mockReturnValueOnce(leafCert).mockReturnValueOnce(
      rootCert,
    );

    mockImportX509.mockResolvedValue(
      {} as Awaited<ReturnType<typeof importX509>>,
    );
    mockJwtVerify.mockResolvedValue({
      payload: validPayload,
      protectedHeader: { alg: 'ES256' },
    } as unknown as Awaited<ReturnType<typeof jwtVerify>>);

    const result = await decodeAndVerifyJwsTransaction('header.payload.sig');

    expect(result.originalTransactionId).toBe('txn-orig-001');
    expect(result.productId).toBe('com.legacysports.app.premium.monthly');
    expect(result.bundleId).toBe('com.legacysports.app');
    expect(result.expiresDate).toBe(1800000000000);
  });

  it('rejects a crafted JWS (attacker cannot forge Apple certificate chain)', async () => {
    mockDecodeProtectedHeader.mockReturnValue({
      alg: 'ES256',
      x5c: [STUB_DER],
    } as unknown as ReturnType<typeof decodeProtectedHeader>);

    const rogueLeafCert = makeLeafCert('CN=Rogue Issuer');
    rogueLeafCert.checkIssued.mockReturnValue(false);
    const rootCert = makeRootCert();
    MockX509Certificate.mockReturnValueOnce(rogueLeafCert).mockReturnValueOnce(
      rootCert,
    );

    await expect(
      decodeAndVerifyJwsTransaction('forged.jws.token'),
    ).rejects.toThrow(/Last certificate is not issued by Apple Root CA G3/);
  });

  it('accepts a valid chain whose DN strings differ in formatting (LS-5194 regression)', async () => {
    // Regression for LS-5194: a legitimate chain where the leaf's issuer DN
    // string is formatted differently from the intermediate's subject DN string
    // (e.g. attribute ordering / spacing differences across Node.js versions and
    // Apple cert issuances). Raw string comparison would have falsely rejected
    // this; checkIssued correctly accepts it.
    mockDecodeProtectedHeader.mockReturnValue({
      alg: 'ES256',
      x5c: [STUB_DER, STUB_DER],
    } as unknown as ReturnType<typeof decodeProtectedHeader>);

    const leafCert = makeLeafCert(
      'CN=Apple Worldwide Developer Relations CA, O=Apple Inc., C=US',
    );
    const intermediateCert = {
      // Same entity as the leaf's issuer, but the DN string is formatted
      // differently — raw string equality (leaf.issuer === intermediate.subject)
      // would be false here, yet the chain is genuinely valid.
      subject: 'C=US, O=Apple Inc., CN=Apple Worldwide Developer Relations CA',
      issuer: APPLE_ROOT_SUBJECT,
      validFrom: 'Jan  1 00:00:00 2025 GMT',
      validTo: 'Jan  1 00:00:00 2030 GMT',
      keyUsage: ['keyCertSign', 'cRLSign'],
      publicKey: {},
      verify: jest.fn().mockReturnValue(true),
      checkIssued: jest.fn().mockReturnValue(true),
    };
    const rootCert = makeRootCert();
    MockX509Certificate.mockReturnValueOnce(leafCert)
      .mockReturnValueOnce(intermediateCert)
      .mockReturnValueOnce(rootCert);

    mockImportX509.mockResolvedValue(
      {} as Awaited<ReturnType<typeof importX509>>,
    );
    mockJwtVerify.mockResolvedValue({
      payload: validPayload,
      protectedHeader: { alg: 'ES256' },
    } as unknown as Awaited<ReturnType<typeof jwtVerify>>);

    const result = await decodeAndVerifyJwsTransaction('header.payload.sig');

    expect(result.transactionId).toBe('txn-001');
    // The leaf was checked against the intermediate, and the intermediate
    // against the pinned root — name chaining succeeded despite DN string
    // formatting differences.
    expect(leafCert.checkIssued).toHaveBeenCalledWith(intermediateCert);
    expect(intermediateCert.checkIssued).toHaveBeenCalledWith(rootCert);
  });
});
