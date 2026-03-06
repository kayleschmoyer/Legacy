import type { DbOptions } from '@legacy-sports/utils/node';
import { GdprService } from './GdprService';

jest.mock('../client/Helpers', () => ({
  runWithInternalClient: jest.fn(),
  runWithPublicClient: jest.fn(),
}));

const mockedHelpers = jest.mocked<typeof import('../client/Helpers')>(
  jest.requireMock('../client/Helpers'),
);

describe('GdprService', () => {
  const options = { type: 'pg-local' } as DbOptions;
  let service: GdprService;

  const mockExecute = jest.fn();
  const mockDb = { execute: mockExecute };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new GdprService(options);

    mockedHelpers.runWithInternalClient.mockImplementation((_opts, handler) =>
      handler(mockDb as never),
    );

    mockedHelpers.runWithPublicClient.mockImplementation((_opts, handler) =>
      handler(mockDb as never),
    );
  });

  describe('constructor', () => {
    it('should create an instance', () => {
      expect(service).toBeInstanceOf(GdprService);
    });
  });

  describe('recordConsent', () => {
    it('should insert consent and return mapped result', async () => {
      const now = new Date();
      mockExecute.mockResolvedValue({
        rows: [
          {
            id: 1,
            user_id: 42,
            consent_type: 'data_processing',
            status: 'granted',
            ip_address: '127.0.0.1',
            user_agent: 'Mozilla/5.0',
            granted_at: now,
            revoked_at: null,
            created_at: now,
            updated_at: now,
          },
        ],
      });

      const result = await service.recordConsent({
        userId: 42,
        consentType: 'data_processing',
        ipAddress: '127.0.0.1',
        userAgent: 'Mozilla/5.0',
      });

      expect(mockedHelpers.runWithInternalClient).toHaveBeenCalledWith(
        options,
        expect.any(Function),
      );
      expect(result.userId).toBe(42);
      expect(result.consentType).toBe('data_processing');
      expect(result.status).toBe('granted');
      expect(result.ipAddress).toBe('127.0.0.1');
    });
  });

  describe('revokeConsent', () => {
    it('should revoke consent and return mapped result', async () => {
      const now = new Date();
      mockExecute.mockResolvedValue({
        rows: [
          {
            id: 1,
            user_id: 42,
            consent_type: 'marketing_emails',
            status: 'revoked',
            ip_address: null,
            user_agent: null,
            granted_at: now,
            revoked_at: now,
            created_at: now,
            updated_at: now,
          },
        ],
      });

      const result = await service.revokeConsent(42, 'marketing_emails');

      expect(result).not.toBeNull();
      expect(result?.status).toBe('revoked');
      expect(result?.revokedAt).toBeDefined();
    });

    it('should return null when no consent record exists', async () => {
      mockExecute.mockResolvedValue({ rows: [] });

      const result = await service.revokeConsent(42, 'analytics');

      expect(result).toBeNull();
    });
  });

  describe('getUserConsents', () => {
    it('should return all consents for a user', async () => {
      const now = new Date();
      mockExecute.mockResolvedValue({
        rows: [
          {
            id: 1,
            user_id: 42,
            consent_type: 'data_processing',
            status: 'granted',
            ip_address: null,
            user_agent: null,
            granted_at: now,
            revoked_at: null,
            created_at: now,
            updated_at: now,
          },
          {
            id: 2,
            user_id: 42,
            consent_type: 'analytics',
            status: 'revoked',
            ip_address: null,
            user_agent: null,
            granted_at: now,
            revoked_at: now,
            created_at: now,
            updated_at: now,
          },
        ],
      });

      const results = await service.getUserConsents(42);

      expect(results).toHaveLength(2);
      expect(results[0].consentType).toBe('data_processing');
      expect(results[1].status).toBe('revoked');
    });

    it('should return empty array when user has no consents', async () => {
      mockExecute.mockResolvedValue({ rows: [] });

      const results = await service.getUserConsents(99);

      expect(results).toHaveLength(0);
    });
  });

  describe('getConsent', () => {
    it('should return a specific consent', async () => {
      const now = new Date();
      mockExecute.mockResolvedValue({
        rows: [
          {
            id: 1,
            user_id: 42,
            consent_type: 'data_processing',
            status: 'granted',
            ip_address: null,
            user_agent: null,
            granted_at: now,
            revoked_at: null,
            created_at: now,
            updated_at: now,
          },
        ],
      });

      const result = await service.getConsent(42, 'data_processing');

      expect(result).not.toBeNull();
      expect(result?.consentType).toBe('data_processing');
    });

    it('should return null when consent not found', async () => {
      mockExecute.mockResolvedValue({ rows: [] });

      const result = await service.getConsent(42, 'third_party_sharing');

      expect(result).toBeNull();
    });
  });

  describe('acceptPrivacyPolicy', () => {
    it('should execute update query', async () => {
      mockExecute.mockResolvedValue({ rows: [] });

      await service.acceptPrivacyPolicy(42);

      expect(mockedHelpers.runWithInternalClient).toHaveBeenCalledWith(
        options,
        expect.any(Function),
      );
      expect(mockExecute).toHaveBeenCalled();
    });
  });

  describe('hasAcceptedPrivacyPolicy', () => {
    it('should return true when privacy policy is accepted', async () => {
      mockExecute.mockResolvedValue({
        rows: [{ privacy_policy_accepted_at: new Date('2026-01-01') }],
      });

      const result = await service.hasAcceptedPrivacyPolicy(42);

      expect(result).toBe(true);
    });

    it('should return false when privacy policy is not accepted', async () => {
      mockExecute.mockResolvedValue({
        rows: [{ privacy_policy_accepted_at: null }],
      });

      const result = await service.hasAcceptedPrivacyPolicy(42);

      expect(result).toBe(false);
    });

    it('should return false when user not found', async () => {
      mockExecute.mockResolvedValue({ rows: [] });

      const result = await service.hasAcceptedPrivacyPolicy(999);

      expect(result).toBe(false);
    });
  });

  describe('requestDataExport', () => {
    it('should create a data export request', async () => {
      const now = new Date();
      mockExecute.mockResolvedValue({
        rows: [
          {
            id: 1,
            user_id: 42,
            request_type: 'export',
            status: 'pending',
            requested_at: now,
            processed_at: null,
            completed_at: null,
            export_url: null,
            notes: null,
            created_at: now,
            updated_at: now,
          },
        ],
      });

      const result = await service.requestDataExport(42);

      expect(result.requestType).toBe('export');
      expect(result.status).toBe('pending');
      expect(result.userId).toBe(42);
    });
  });

  describe('requestDataDeletion', () => {
    it('should create a data deletion request', async () => {
      const now = new Date();
      mockExecute.mockResolvedValue({
        rows: [
          {
            id: 2,
            user_id: 42,
            request_type: 'deletion',
            status: 'pending',
            requested_at: now,
            processed_at: null,
            completed_at: null,
            export_url: null,
            notes: null,
            created_at: now,
            updated_at: now,
          },
        ],
      });

      const result = await service.requestDataDeletion(42);

      expect(result.requestType).toBe('deletion');
      expect(result.status).toBe('pending');
    });
  });

  describe('getDataRequest', () => {
    it('should return a data request by id', async () => {
      const now = new Date();
      mockExecute.mockResolvedValue({
        rows: [
          {
            id: 1,
            user_id: 42,
            request_type: 'export',
            status: 'pending',
            requested_at: now,
            processed_at: null,
            completed_at: null,
            export_url: null,
            notes: null,
            created_at: now,
            updated_at: now,
          },
        ],
      });

      const result = await service.getDataRequest(1);

      expect(result).not.toBeNull();
      expect(result?.id).toBe(1);
    });

    it('should return null when request not found', async () => {
      mockExecute.mockResolvedValue({ rows: [] });

      const result = await service.getDataRequest(999);

      expect(result).toBeNull();
    });
  });

  describe('updateDataRequestStatus', () => {
    it('should update request status to processing', async () => {
      const now = new Date();
      mockExecute.mockResolvedValue({
        rows: [
          {
            id: 1,
            user_id: 42,
            request_type: 'export',
            status: 'processing',
            requested_at: now,
            processed_at: now,
            completed_at: null,
            export_url: null,
            notes: null,
            created_at: now,
            updated_at: now,
          },
        ],
      });

      const result = await service.updateDataRequestStatus(1, 'processing');

      expect(result).not.toBeNull();
      expect(result?.status).toBe('processing');
    });

    it('should update request status to completed', async () => {
      const now = new Date();
      mockExecute.mockResolvedValue({
        rows: [
          {
            id: 1,
            user_id: 42,
            request_type: 'export',
            status: 'completed',
            requested_at: now,
            processed_at: now,
            completed_at: now,
            export_url: null,
            notes: 'Export complete',
            created_at: now,
            updated_at: now,
          },
        ],
      });

      const result = await service.updateDataRequestStatus(
        1,
        'completed',
        'Export complete',
      );

      expect(result?.status).toBe('completed');
      expect(result?.notes).toBe('Export complete');
    });

    it('should return null when request not found', async () => {
      mockExecute.mockResolvedValue({ rows: [] });

      const result = await service.updateDataRequestStatus(999, 'completed');

      expect(result).toBeNull();
    });
  });

  describe('anonymizeUserData', () => {
    it('should anonymize user data and revoke consents', async () => {
      mockExecute.mockResolvedValue({ rows: [] });

      await service.anonymizeUserData(42);

      expect(mockedHelpers.runWithInternalClient).toHaveBeenCalledWith(
        options,
        expect.any(Function),
      );
      // Should execute two queries: user anonymization + consent revocation
      expect(mockExecute).toHaveBeenCalledTimes(2);
    });
  });

  describe('collectUserData', () => {
    it('should collect all user data for export', async () => {
      const now = new Date();

      // Set up sequential mock responses for the different queries
      // 1. User profile (internal)
      // 2. Consents (internal)
      // 3. Leagues (public)
      // 4. Teams (public)
      // 5. Data requests (internal)
      let internalCallCount = 0;
      mockedHelpers.runWithInternalClient.mockImplementation(
        (_opts, handler) => {
          internalCallCount++;
          const mockInternalDb = {
            execute: jest.fn(),
          };

          if (internalCallCount === 1) {
            // User profile query
            mockInternalDb.execute.mockResolvedValue({
              rows: [
                {
                  id: 42,
                  email: 'user@example.com',
                  username: 'testuser',
                  created_at: now,
                  privacy_policy_accepted_at: now,
                },
              ],
            });
          } else if (internalCallCount === 2) {
            // Consents query
            mockInternalDb.execute.mockResolvedValue({
              rows: [
                {
                  id: 1,
                  user_id: 42,
                  consent_type: 'data_processing',
                  status: 'granted',
                  ip_address: null,
                  user_agent: null,
                  granted_at: now,
                  revoked_at: null,
                  created_at: now,
                  updated_at: now,
                },
              ],
            });
          } else {
            // Data requests query
            mockInternalDb.execute.mockResolvedValue({ rows: [] });
          }

          return handler(mockInternalDb as never);
        },
      );

      let publicCallCount = 0;
      mockedHelpers.runWithPublicClient.mockImplementation((_opts, handler) => {
        publicCallCount++;
        const mockPublicDb = {
          execute: jest.fn(),
        };

        if (publicCallCount === 1) {
          // Leagues query
          mockPublicDb.execute.mockResolvedValue({
            rows: [{ id: 1, name: 'Test League' }],
          });
        } else {
          // Teams query
          mockPublicDb.execute.mockResolvedValue({
            rows: [{ id: 10, name: 'Test Team' }],
          });
        }

        return handler(mockPublicDb as never);
      });

      const result = await service.collectUserData(42);

      expect(result.user.email).toBe('user@example.com');
      expect(result.user.username).toBe('testuser');
      expect(result.consents).toHaveLength(1);
      expect(result.leagues).toHaveLength(1);
      expect(result.teams).toHaveLength(1);
      expect(result.dataRequests).toHaveLength(0);
    });

    it('should throw when user not found', async () => {
      mockedHelpers.runWithInternalClient.mockImplementation(
        (_opts, handler) => {
          const mockInternalDb = {
            execute: jest.fn().mockResolvedValue({ rows: [] }),
          };
          return handler(mockInternalDb as never);
        },
      );

      await expect(service.collectUserData(999)).rejects.toThrow(
        'User 999 not found',
      );
    });
  });
});
