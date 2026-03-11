import { describe, expect, it } from '@jest/globals';
import { derToPem, validateNotificationBundleId } from './jws.test-helpers';

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
});
