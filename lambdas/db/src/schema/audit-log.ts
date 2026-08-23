/**
 * Commissioner audit log — shared write helper
 *
 * Split out of commissioner-tools.ts (LS-6308) so leagues/mutations.ts can
 * audit-log deleteLeague without creating a leagues <-> commissioner-tools
 * import cycle (commissioner-tools.ts depends on leagues/types.ts for the
 * CommissionerAuditLog GraphQL type). This module has no dependency on
 * leagues or commissioner-tools, so both can depend on it safely.
 */

import { PublicDb, PublicSchema } from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';

/** Insert a row into commissioner_audit_log. Never throws — errors are logged. */
export async function writeAuditLog(
  db: PublicDb,
  params: {
    leagueId: number;
    userId: number;
    action: string;
    targetType?: string;
    targetId?: number;
    details?: Record<string, unknown>;
    reason?: string | null;
  },
): Promise<void> {
  try {
    await db.insert(PublicSchema.commissionerAuditLog).values({
      leagueId: params.leagueId,
      userId: params.userId,
      action: params.action,
      targetType: params.targetType ?? null,
      targetId: params.targetId ?? null,
      details: params.details ?? null,
      reason: params.reason ?? null,
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    LOGGER.error('Failed to write commissioner audit log', error, { params });
  }
}
