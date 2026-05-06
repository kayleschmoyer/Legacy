import { describe, expect, it } from '@jest/globals';
import {
  assertCertValidAt,
  assertChainNameLinkage,
  assertLeafKeyUsageAllowsSigning,
  derToPem,
  parseNotificationData,
  parseTransactionPayload,
  validateNotificationBundleId,
} from './jws.test-helpers';

describe('JWS helpers', () => {
  describe('derToPem', () => {
    it('wraps base64 DER in PEM headers', () => {
      const der = 'AAAA'.repeat(20); // 80 chars of base64
      const result = derToPem(der);
      expect(result).toContain('-----BEGIN CERTIFICATE-----');
      expect(result).toContain('-----END CERTIFICATE-----');
      // Lines should be at most 64 chars wide (plus the header/footer lines)
      const bodyLines = result
        .split('\n')
        .filter((l) => !l.startsWith('-----') && l.length > 0);
      bodyLines.forEach((line) => {
        expect(line.length).toBeLessThanOrEqual(64);
      });
    });
  });

  describe('assertCertValidAt', () => {
    const cert = {
      subject: 'CN=Test Leaf',
      validFrom: 'Jan  1 00:00:00 2025 GMT',
      validTo: 'Jan  1 00:00:00 2027 GMT',
    };
    const mid = Date.parse('2026-01-01T00:00:00Z');

    it('does not throw when now is inside the validity window', () => {
      expect(() => assertCertValidAt(cert, mid)).not.toThrow();
    });

    it('throws when now is before validFrom', () => {
      const before = Date.parse('2024-01-01T00:00:00Z');
      expect(() => assertCertValidAt(cert, before)).toThrow(
        /Certificate not yet valid/,
      );
    });

    it('throws when now is after validTo', () => {
      const after = Date.parse('2028-01-01T00:00:00Z');
      expect(() => assertCertValidAt(cert, after)).toThrow(
        /Certificate expired/,
      );
    });

    it('throws on unparseable validity strings', () => {
      expect(() =>
        assertCertValidAt(
          { subject: 'CN=x', validFrom: 'not-a-date', validTo: 'nope' },
          mid,
        ),
      ).toThrow(/unparseable validity window/);
    });
  });

  describe('assertChainNameLinkage', () => {
    const rootSubject = 'CN=Apple Root CA - G3';

    it('accepts a well-formed chain', () => {
      const chain = [
        { subject: 'CN=Leaf', issuer: 'CN=Intermediate' },
        { subject: 'CN=Intermediate', issuer: rootSubject },
      ];
      expect(() => assertChainNameLinkage(chain, rootSubject)).not.toThrow();
    });

    it('throws when an intermediate issuer does not match the next subject', () => {
      const chain = [
        { subject: 'CN=Leaf', issuer: 'CN=Wrong' },
        { subject: 'CN=Intermediate', issuer: rootSubject },
      ];
      expect(() => assertChainNameLinkage(chain, rootSubject)).toThrow(
        /subject\/issuer mismatch at index 0/,
      );
    });

    it('throws when the terminal cert is not issued by the expected root', () => {
      const chain = [{ subject: 'CN=Intermediate', issuer: 'CN=Rogue Root' }];
      expect(() => assertChainNameLinkage(chain, rootSubject)).toThrow(
        /Last certificate issuer does not match Apple Root CA G3/,
      );
    });
  });

  describe('assertLeafKeyUsageAllowsSigning', () => {
    it('accepts a leaf with digitalSignature usage', () => {
      expect(() =>
        assertLeafKeyUsageAllowsSigning(['digitalSignature']),
      ).not.toThrow();
    });

    it('accepts a leaf with no keyUsage extension (treated as permissive)', () => {
      expect(() => assertLeafKeyUsageAllowsSigning(null)).not.toThrow();
      expect(() => assertLeafKeyUsageAllowsSigning([])).not.toThrow();
    });

    it('throws when keyUsage is present but excludes digitalSignature', () => {
      expect(() =>
        assertLeafKeyUsageAllowsSigning(['keyEncipherment', 'keyAgreement']),
      ).toThrow(/keyUsage does not permit digital signature/);
    });
  });

  describe('validateNotificationBundleId', () => {
    it('throws when bundleId does not match', () => {
      expect(() =>
        validateNotificationBundleId('com.other.app', 'com.my.app'),
      ).toThrow('Bundle ID mismatch');
    });

    it('does not throw when bundleId matches', () => {
      expect(() =>
        validateNotificationBundleId('com.my.app', 'com.my.app'),
      ).not.toThrow();
    });
  });

  describe('parseTransactionPayload', () => {
    const validTransaction = {
      originalTransactionId: 'txn-orig-001',
      transactionId: 'txn-001',
      productId: 'com.my.app.premium',
      bundleId: 'com.my.app',
      purchaseDate: 1700000000000,
    };

    it('accepts a valid transaction payload', () => {
      expect(() => parseTransactionPayload(validTransaction)).not.toThrow();
      const result = parseTransactionPayload(validTransaction);
      expect(result.originalTransactionId).toBe('txn-orig-001');
      expect(result.productId).toBe('com.my.app.premium');
    });

    it('accepts optional fields when present', () => {
      const withOptional = {
        ...validTransaction,
        expiresDate: 1800000000000,
        appAccountToken: 'uuid-token',
        subscriptionGroupIdentifier: 'group-1',
      };
      const result = parseTransactionPayload(withOptional);
      expect(result.expiresDate).toBe(1800000000000);
      expect(result.appAccountToken).toBe('uuid-token');
    });

    it('throws when originalTransactionId is missing', () => {
      const { originalTransactionId: _omit, ...rest } = validTransaction;
      expect(() => parseTransactionPayload(rest)).toThrow(
        /originalTransactionId/,
      );
    });

    it('throws when productId is missing', () => {
      const { productId: _omit, ...rest } = validTransaction;
      expect(() => parseTransactionPayload(rest)).toThrow(/productId/);
    });

    it('throws when bundleId is missing', () => {
      const { bundleId: _omit, ...rest } = validTransaction;
      expect(() => parseTransactionPayload(rest)).toThrow(/bundleId/);
    });

    it('throws when a required string field is empty', () => {
      expect(() =>
        parseTransactionPayload({ ...validTransaction, productId: '' }),
      ).toThrow(/productId/);
    });

    it('throws when the raw value is not an object', () => {
      expect(() => parseTransactionPayload(null)).toThrow(
        /Invalid transaction payload/,
      );
      expect(() => parseTransactionPayload('not-an-object')).toThrow(
        /Invalid transaction payload/,
      );
    });
  });

  describe('parseNotificationData', () => {
    const validData = {
      bundleId: 'com.my.app',
      environment: 'Sandbox' as const,
    };

    it('accepts valid notification data', () => {
      const result = parseNotificationData(validData);
      expect(result.bundleId).toBe('com.my.app');
      expect(result.environment).toBe('Sandbox');
    });

    it('accepts Production environment', () => {
      const result = parseNotificationData({
        ...validData,
        environment: 'Production',
      });
      expect(result.environment).toBe('Production');
    });

    it('accepts optional bundleVersion', () => {
      const result = parseNotificationData({
        ...validData,
        bundleVersion: '1.2.3',
      });
      expect(result.bundleVersion).toBe('1.2.3');
    });

    it('throws when bundleId is missing', () => {
      const { bundleId: _omit, ...rest } = validData;
      expect(() => parseNotificationData(rest)).toThrow(/bundleId/);
    });

    it('throws when environment is an invalid value', () => {
      expect(() =>
        parseNotificationData({ ...validData, environment: 'staging' }),
      ).toThrow(/environment/);
    });

    it('throws when environment is missing', () => {
      const { environment: _omit, ...rest } = validData;
      expect(() => parseNotificationData(rest)).toThrow(/environment/);
    });
  });
});
