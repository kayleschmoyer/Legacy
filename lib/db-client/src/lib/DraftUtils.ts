import { and, eq } from 'drizzle-orm';
import { getDbOptions } from '@legacy-sports/utils';
import { LOGGER } from '@legacy-sports/logging';
import { PublicSchema, runWithPublicClient } from '../index';

/**
 * Shared utilities for draft operations
 * Used by both DraftService (coordinator) and draft-processor lambda (worker)
 */

export const VALID_DRAFT_TYPES = ['random-draft', 'snake-draft', 'auction'] as const;
export type DraftType = typeof VALID_DRAFT_TYPES[number];

export interface DraftValidationOptions {
  leagueId: number;
  draftType: string;
  userId?: number;
  skipUserValidation?: boolean;
}

/**
 * Validate draft type is supported
 */
export function validateDraftType(draftType: string): asserts draftType is DraftType {
  if (!VALID_DRAFT_TYPES.includes(draftType as DraftType)) {
    throw new Error(`Invalid draft type: ${draftType}. Valid types are: ${VALID_DRAFT_TYPES.join(', ')}`);
  }
}

/**
 * Check if user has access to a league
 */
export async function validateUserAccess(leagueId: number, userId: number): Promise<void> {
  const hasAccess = await runWithPublicClient(getDbOptions(), async (db) => {
    const result = await db.select()
      .from(PublicSchema.leagueMembers)
      .where(and(
        eq(PublicSchema.leagueMembers.leagueId, leagueId),
        eq(PublicSchema.leagueMembers.userId, userId)
      ))
      .limit(1);

    return result.length > 0;
  });

  if (!hasAccess) {
    throw new Error(`User ${userId} does not have access to league ${leagueId}`);
  }
}

/**
 * Update league draft status with error handling
 */
export async function updateLeagueDraftStatus(
  leagueId: number, 
  status: 'not-started' | 'queued' | 'in-progress' | 'completed',
  context?: string
): Promise<void> {
  try {
    await runWithPublicClient(getDbOptions(), async (db) => {
      LOGGER.info(`🔄 Updating draft status for league ${leagueId} to '${status}'${context ? ` (${context})` : ''}`);
      
      const updateResult = await db.update(PublicSchema.leagues)
        .set({
          draftStatus: status
        } as Partial<typeof PublicSchema.leagues.$inferInsert>)
        .where(eq(PublicSchema.leagues.id, leagueId))
        .returning();
      
      LOGGER.info('✅ Database update result:', updateResult);
      
      // Verify the update by reading it back
      const verificationResult = await db.select({ 
        id: PublicSchema.leagues.id, 
        draftStatus: PublicSchema.leagues.draftStatus 
      })
        .from(PublicSchema.leagues)
        .where(eq(PublicSchema.leagues.id, leagueId));
      
      LOGGER.info('🔍 Verification query result:', verificationResult);
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    LOGGER.error(`❌ Failed to update draft status to '${status}' for league ${leagueId}:`, errorMessage);
    throw error;
  }
}

/**
 * Fetch league details from database
 */
export async function fetchLeagueDetails(leagueId: number) {
  const league = await runWithPublicClient(getDbOptions(), async (db) => {
    const result = await db.select({
      id: PublicSchema.leagues.id,
      name: PublicSchema.leagues.name,
      owner: PublicSchema.leagues.owner,
      maxRosterSize: PublicSchema.leagues.maxRosterSize,
      currentMatchup: PublicSchema.leagues.currentMatchup,
      draftStatus: PublicSchema.leagues.draftStatus,
      inviteCode: PublicSchema.leagues.inviteCode,
    })
      .from(PublicSchema.leagues)
      .where(eq(PublicSchema.leagues.id, leagueId))
      .limit(1);
    
    if (result.length === 0) {
      throw new Error(`League ${leagueId} not found`);
    }
    
    return result[0];
  });

  return league;
}

/**
 * Comprehensive draft validation (used by both coordinator and worker)
 */
export async function validateDraftRequest(options: DraftValidationOptions): Promise<void> {
  const { leagueId, draftType, userId, skipUserValidation = false } = options;
  
  // Validate draft type
  validateDraftType(draftType);
  
  // Validate user access (if required)
  if (!skipUserValidation && userId) {
    await validateUserAccess(leagueId, userId);
  }
  
  // Verify league exists
  await fetchLeagueDetails(leagueId);
}
