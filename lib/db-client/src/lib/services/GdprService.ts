import { sql } from 'drizzle-orm';
import { DbOptions } from '@legacy-sports/utils';
import { runWithInternalClient, runWithPublicClient } from '../client/Helpers';

export interface UserConsent {
  id: number;
  userId: number;
  consentType: string;
  status: string;
  ipAddress: string | null;
  userAgent: string | null;
  grantedAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DataRequest {
  id: number;
  userId: number;
  requestType: string;
  status: string;
  requestedAt: Date;
  processedAt: Date | null;
  completedAt: Date | null;
  exportUrl: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ConsentType =
  | 'data_processing'
  | 'marketing_emails'
  | 'analytics'
  | 'third_party_sharing';

export type ConsentStatus = 'granted' | 'revoked';

export type DataRequestType = 'export' | 'deletion';

export type DataRequestStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface RecordConsentInput {
  userId: number;
  consentType: ConsentType;
  ipAddress?: string;
  userAgent?: string;
}

export interface UserDataExport {
  user: {
    id: number;
    email: string;
    username: string | null;
    createdAt: Date;
    privacyPolicyAcceptedAt: Date | null;
  };
  consents: UserConsent[];
  leagues: Array<{ id: number | null; name: string | null }>;
  teams: Array<{ id: number | null; name: string | null }>;
  dataRequests: DataRequest[];
}

interface ConsentRow {
  id: number;
  user_id: number;
  consent_type: string;
  status: string;
  ip_address: string | null;
  user_agent: string | null;
  granted_at: Date;
  revoked_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface DataRequestRow {
  id: number;
  user_id: number;
  request_type: string;
  status: string;
  requested_at: Date;
  processed_at: Date | null;
  completed_at: Date | null;
  export_url: string | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * GDPR compliance service for managing user consent, data export, and data deletion
 *
 * Implements:
 * - Art. 6-7: Consent management (record, revoke, query)
 * - Art. 15: Right of access (data export)
 * - Art. 17: Right to erasure (data deletion requests)
 * - Art. 7: Privacy policy acceptance tracking
 */
export class GdprService {
  constructor(private options: DbOptions) {}

  // ─── Consent Management ─────────────────────────────────

  /**
   * Record user consent for a specific processing type.
   * Uses upsert to handle re-granting previously revoked consent.
   */
  async recordConsent(input: RecordConsentInput): Promise<UserConsent> {
    return runWithInternalClient(this.options, async (db) => {
      const result = await db.execute(
        sql`INSERT INTO app_internal.user_consents (user_id, consent_type, status, ip_address, user_agent, granted_at)
            VALUES (${input.userId}, ${input.consentType}::app_internal.consent_type, 'granted', ${input.ipAddress ?? null}, ${input.userAgent ?? null}, NOW())
            ON CONFLICT (user_id, consent_type)
            DO UPDATE SET status = 'granted', ip_address = ${input.ipAddress ?? null}, user_agent = ${input.userAgent ?? null}, granted_at = NOW(), revoked_at = NULL
            RETURNING *`,
      );
      return this.mapConsentRow(result.rows[0] as unknown as ConsentRow);
    });
  }

  /**
   * Revoke a specific consent for a user
   */
  async revokeConsent(
    userId: number,
    consentType: ConsentType,
  ): Promise<UserConsent | null> {
    return runWithInternalClient(this.options, async (db) => {
      const result = await db.execute(
        sql`UPDATE app_internal.user_consents
            SET status = 'revoked', revoked_at = NOW()
            WHERE user_id = ${userId} AND consent_type = ${consentType}::app_internal.consent_type
            RETURNING *`,
      );

      if (result.rows.length === 0) return null;
      return this.mapConsentRow(result.rows[0] as unknown as ConsentRow);
    });
  }

  /**
   * Get all consents for a user
   */
  async getUserConsents(userId: number): Promise<UserConsent[]> {
    return runWithInternalClient(this.options, async (db) => {
      const result = await db.execute(
        sql`SELECT * FROM app_internal.user_consents WHERE user_id = ${userId}`,
      );
      return result.rows.map((row) =>
        this.mapConsentRow(row as unknown as ConsentRow),
      );
    });
  }

  /**
   * Get a specific consent for a user
   */
  async getConsent(
    userId: number,
    consentType: ConsentType,
  ): Promise<UserConsent | null> {
    return runWithInternalClient(this.options, async (db) => {
      const result = await db.execute(
        sql`SELECT * FROM app_internal.user_consents
            WHERE user_id = ${userId} AND consent_type = ${consentType}::app_internal.consent_type
            LIMIT 1`,
      );

      if (result.rows.length === 0) return null;
      return this.mapConsentRow(result.rows[0] as unknown as ConsentRow);
    });
  }

  // ─── Privacy Policy ─────────────────────────────────────

  /**
   * Record that a user accepted the privacy policy
   */
  async acceptPrivacyPolicy(userId: number): Promise<void> {
    return runWithInternalClient(this.options, async (db) => {
      await db.execute(
        sql`UPDATE app_internal.users
            SET privacy_policy_accepted_at = NOW()
            WHERE id = ${userId}`,
      );
    });
  }

  /**
   * Check if user has accepted the privacy policy
   */
  async hasAcceptedPrivacyPolicy(userId: number): Promise<boolean> {
    return runWithInternalClient(this.options, async (db) => {
      const result = await db.execute(
        sql`SELECT privacy_policy_accepted_at FROM app_internal.users
            WHERE id = ${userId} LIMIT 1`,
      );

      if (result.rows.length === 0) return false;
      const row = result.rows[0] as unknown as {
        privacy_policy_accepted_at: Date | null;
      };
      return row.privacy_policy_accepted_at !== null;
    });
  }

  // ─── Data Export (Right of Access) ──────────────────────

  /**
   * Create a data export request
   */
  async requestDataExport(userId: number): Promise<DataRequest> {
    return runWithInternalClient(this.options, async (db) => {
      const result = await db.execute(
        sql`INSERT INTO app_internal.data_requests (user_id, request_type, status, requested_at)
            VALUES (${userId}, 'export', 'pending', NOW())
            RETURNING *`,
      );
      return this.mapDataRequestRow(
        result.rows[0] as unknown as DataRequestRow,
      );
    });
  }

  /**
   * Collect all user data for export (GDPR Art. 15 - Right of Access)
   * Gathers data from all tables that contain user information
   */
  async collectUserData(userId: number): Promise<UserDataExport> {
    // Collect user profile from internal schema
    const userProfile = await runWithInternalClient(
      this.options,
      async (db) => {
        const result = await db.execute(
          sql`SELECT id, email, username, created_at, privacy_policy_accepted_at
              FROM app_internal.users WHERE id = ${userId} LIMIT 1`,
        );
        return result.rows[0] as
          | {
              id: number;
              email: string;
              username: string | null;
              created_at: Date;
              privacy_policy_accepted_at: Date | null;
            }
          | undefined;
      },
    );

    if (!userProfile) {
      throw new Error(`User ${userId} not found`);
    }

    // Collect consents
    const consents = await this.getUserConsents(userId);

    // Collect league memberships from public schema
    const leagues = await runWithPublicClient(this.options, async (db) => {
      const result = await db.execute(
        sql`SELECT l.id, l.name
            FROM public.league_members lm
            JOIN public.leagues l ON lm.league_id = l.id
            WHERE lm.user_id = ${userId}`,
      );
      return result.rows as unknown as Array<{
        id: number | null;
        name: string | null;
      }>;
    });

    // Collect teams from public schema
    const teams = await runWithPublicClient(this.options, async (db) => {
      const result = await db.execute(
        sql`SELECT t.id, t.name
            FROM public.teams t
            JOIN public.league_members lm ON t.league_id = lm.league_id
            WHERE lm.user_id = ${userId}
              AND t.owner_id = ${userId}`,
      );
      return result.rows as unknown as Array<{
        id: number | null;
        name: string | null;
      }>;
    });

    // Collect data requests
    const dataRequests = await this.getUserDataRequests(userId);

    return {
      user: {
        id: userProfile.id,
        email: userProfile.email,
        username: userProfile.username,
        createdAt: userProfile.created_at,
        privacyPolicyAcceptedAt: userProfile.privacy_policy_accepted_at,
      },
      consents,
      leagues,
      teams,
      dataRequests,
    };
  }

  // ─── Data Deletion (Right to Erasure) ───────────────────

  /**
   * Create a data deletion request
   */
  async requestDataDeletion(userId: number): Promise<DataRequest> {
    return runWithInternalClient(this.options, async (db) => {
      const result = await db.execute(
        sql`INSERT INTO app_internal.data_requests (user_id, request_type, status, requested_at)
            VALUES (${userId}, 'deletion', 'pending', NOW())
            RETURNING *`,
      );
      return this.mapDataRequestRow(
        result.rows[0] as unknown as DataRequestRow,
      );
    });
  }

  /**
   * Anonymize user data (GDPR Art. 17 - Right to Erasure)
   * Instead of hard-deleting, this anonymizes PII while preserving
   * referential integrity for league/matchup history
   */
  async anonymizeUserData(userId: number): Promise<void> {
    await runWithInternalClient(this.options, async (db) => {
      const anonymizedEmail = `deleted-${userId}@anonymized.local`;
      const anonymizedUsername = `deleted-user-${userId}`;

      // Anonymize user record
      await db.execute(
        sql`UPDATE app_internal.users
            SET email = ${anonymizedEmail},
                username = ${anonymizedUsername},
                password_hash = NULL,
                privacy_policy_accepted_at = NULL
            WHERE id = ${userId}`,
      );

      // Revoke all consents
      await db.execute(
        sql`UPDATE app_internal.user_consents
            SET status = 'revoked', revoked_at = NOW()
            WHERE user_id = ${userId}`,
      );
    });
  }

  // ─── Data Request Management ────────────────────────────

  /**
   * Get all data requests for a user
   */
  async getUserDataRequests(userId: number): Promise<DataRequest[]> {
    return runWithInternalClient(this.options, async (db) => {
      const result = await db.execute(
        sql`SELECT * FROM app_internal.data_requests WHERE user_id = ${userId}`,
      );
      return result.rows.map((row) =>
        this.mapDataRequestRow(row as unknown as DataRequestRow),
      );
    });
  }

  /**
   * Get a specific data request by ID
   */
  async getDataRequest(requestId: number): Promise<DataRequest | null> {
    return runWithInternalClient(this.options, async (db) => {
      const result = await db.execute(
        sql`SELECT * FROM app_internal.data_requests WHERE id = ${requestId} LIMIT 1`,
      );

      if (result.rows.length === 0) return null;
      return this.mapDataRequestRow(
        result.rows[0] as unknown as DataRequestRow,
      );
    });
  }

  /**
   * Update a data request status
   */
  async updateDataRequestStatus(
    requestId: number,
    status: DataRequestStatus,
    notes?: string,
  ): Promise<DataRequest | null> {
    return runWithInternalClient(this.options, async (db) => {
      let query;

      if (status === 'processing') {
        query = notes
          ? sql`UPDATE app_internal.data_requests SET status = ${status}::app_internal.data_request_status, processed_at = NOW(), notes = ${notes} WHERE id = ${requestId} RETURNING *`
          : sql`UPDATE app_internal.data_requests SET status = ${status}::app_internal.data_request_status, processed_at = NOW() WHERE id = ${requestId} RETURNING *`;
      } else if (status === 'completed') {
        query = notes
          ? sql`UPDATE app_internal.data_requests SET status = ${status}::app_internal.data_request_status, completed_at = NOW(), notes = ${notes} WHERE id = ${requestId} RETURNING *`
          : sql`UPDATE app_internal.data_requests SET status = ${status}::app_internal.data_request_status, completed_at = NOW() WHERE id = ${requestId} RETURNING *`;
      } else {
        query = notes
          ? sql`UPDATE app_internal.data_requests SET status = ${status}::app_internal.data_request_status, notes = ${notes} WHERE id = ${requestId} RETURNING *`
          : sql`UPDATE app_internal.data_requests SET status = ${status}::app_internal.data_request_status WHERE id = ${requestId} RETURNING *`;
      }

      const result = await db.execute(query);

      if (result.rows.length === 0) return null;
      return this.mapDataRequestRow(
        result.rows[0] as unknown as DataRequestRow,
      );
    });
  }

  // ─── Helpers ────────────────────────────────────────────

  private mapConsentRow(row: ConsentRow): UserConsent {
    return {
      id: Number(row.id),
      userId: Number(row.user_id),
      consentType: row.consent_type,
      status: row.status,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      grantedAt: row.granted_at,
      revokedAt: row.revoked_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapDataRequestRow(row: DataRequestRow): DataRequest {
    return {
      id: Number(row.id),
      userId: Number(row.user_id),
      requestType: row.request_type,
      status: row.status,
      requestedAt: row.requested_at,
      processedAt: row.processed_at,
      completedAt: row.completed_at,
      exportUrl: row.export_url,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

/**
 * Factory function to create a GDPR compliance service
 */
export function createGdprService(options: DbOptions): GdprService {
  return new GdprService(options);
}
