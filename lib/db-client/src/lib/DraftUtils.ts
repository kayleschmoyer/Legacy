import { and, eq } from 'drizzle-orm';
import { getDbOptions } from '@legacy-sports/utils';
import { LOGGER } from '@legacy-sports/logging';
import { PublicSchema, runWithPublicClient } from '../index';

/**
 * Shared utilities for draft operations
 * Used by both DraftService (coordinator) and draft-processor lambda (worker)
 */

export const VALID_DRAFT_MODES = ['live', 'automated'] as const;
export type DraftMode = (typeof VALID_DRAFT_MODES)[number];

export const VALID_SELECTION_METHODS = [
  'standard',
  'auction',
  'random',
] as const;
export type SelectionMethod = (typeof VALID_SELECTION_METHODS)[number];

export const VALID_DRAFT_ORDERS = ['snake', 'linear'] as const;
export type DraftOrder = (typeof VALID_DRAFT_ORDERS)[number];

export interface DraftValidationOptions {
  leagueId: number;
  draftMode: string;
  selectionMethod: string;
  draftOrder?: string;
  userId?: number;
  skipUserValidation?: boolean;
}

/**
 * Validate draft mode is supported
 */
export function validateDraftMode(
  draftMode: string,
): asserts draftMode is DraftMode {
  if (!VALID_DRAFT_MODES.includes(draftMode as DraftMode)) {
    throw new Error(
      `Invalid draft mode: ${draftMode}. Valid modes are: ${VALID_DRAFT_MODES.join(', ')}`,
    );
  }
}

/**
 * Validate selection method is supported
 */
export function validateSelectionMethod(
  selectionMethod: string,
): asserts selectionMethod is SelectionMethod {
  if (!VALID_SELECTION_METHODS.includes(selectionMethod as SelectionMethod)) {
    throw new Error(
      `Invalid selection method: ${selectionMethod}. Valid methods are: ${VALID_SELECTION_METHODS.join(', ')}`,
    );
  }
}

/**
 * Validate draft order is supported
 */
export function validateDraftOrder(
  draftOrder: string,
): asserts draftOrder is DraftOrder {
  if (!VALID_DRAFT_ORDERS.includes(draftOrder as DraftOrder)) {
    throw new Error(
      `Invalid draft order: ${draftOrder}. Valid orders are: ${VALID_DRAFT_ORDERS.join(', ')}`,
    );
  }
}

/**
 * Check if user has access to a league
 */
export async function validateUserAccess(
  leagueId: number,
  userId: number,
): Promise<void> {
  const hasAccess = await runWithPublicClient(getDbOptions(), async (db) => {
    const result = await db
      .select()
      .from(PublicSchema.leagueMembers)
      .where(
        and(
          eq(PublicSchema.leagueMembers.leagueId, leagueId),
          eq(PublicSchema.leagueMembers.userId, userId),
        ),
      )
      .limit(1);

    return result.length > 0;
  });

  if (!hasAccess) {
    throw new Error(
      `User ${userId} does not have access to league ${leagueId}`,
    );
  }
}

/**
 * Update league draft status with error handling
 */
export async function updateLeagueDraftStatus(
  leagueId: number,
  status: 'not-started' | 'queued' | 'in-progress' | 'completed',
  context?: string,
): Promise<void> {
  try {
    await runWithPublicClient(getDbOptions(), async (db) => {
      LOGGER.info(
        `🔄 Updating draft status for league ${leagueId} to '${status}'${context ? ` (${context})` : ''}`,
      );

      const updateResult = await db
        .update(PublicSchema.leagues)
        .set({
          draftStatus: status,
        } as Partial<typeof PublicSchema.leagues.$inferInsert>)
        .where(eq(PublicSchema.leagues.id, leagueId))
        .returning();

      LOGGER.info('✅ Database update result:', updateResult);

      // Verify the update by reading it back
      const verificationResult = await db
        .select({
          id: PublicSchema.leagues.id,
          draftStatus: PublicSchema.leagues.draftStatus,
        })
        .from(PublicSchema.leagues)
        .where(eq(PublicSchema.leagues.id, leagueId));

      LOGGER.info('🔍 Verification query result:', verificationResult);
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    LOGGER.error(
      `❌ Failed to update draft status to '${status}' for league ${leagueId}:`,
      errorMessage,
    );
    throw error;
  }
}

/**
 * Fetch league details from database
 */
export async function fetchLeagueDetails(leagueId: number) {
  const league = await runWithPublicClient(getDbOptions(), async (db) => {
    const result = await db
      .select({
        id: PublicSchema.leagues.id,
        name: PublicSchema.leagues.name,
        owner: PublicSchema.leagues.owner,
        maxRosterSize: PublicSchema.leagues.maxRosterSize,
        currentMatchup: PublicSchema.leagues.currentMatchup,
        draftStatus: PublicSchema.leagues.draftStatus,
        inviteCode: PublicSchema.leagues.inviteCode,
        playerPool: PublicSchema.leagues.playerPool,
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

export interface CreateDraftOptions {
  leagueId: number;
  draftMode?: DraftMode;
  selectionMethod?: SelectionMethod;
  draftOrder?: DraftOrder;
}

/**
 * Create a draft record for a league with the given settings.
 * Should be called when a league is created so draft settings are always persisted.
 * Safe to call if a draft already exists — it will skip the insert.
 */
export async function createDraftForLeague(
  options: CreateDraftOptions,
): Promise<void> {
  const {
    leagueId,
    draftMode = 'live',
    selectionMethod = 'standard',
    draftOrder = 'snake',
  } = options;

  try {
    await runWithPublicClient(getDbOptions(), async (db) => {
      // Check if a draft record already exists
      const existing = await db
        .select({ id: PublicSchema.drafts.id })
        .from(PublicSchema.drafts)
        .where(eq(PublicSchema.drafts.leagueId, leagueId))
        .limit(1);

      if (existing.length > 0) {
        LOGGER.debug('Draft record already exists for league', { leagueId });
        return;
      }

      await db.insert(PublicSchema.drafts).values({
        leagueId,
        draftMode,
        selectionMethod,
        draftOrder,
      });

      LOGGER.info('Created draft record for league', {
        leagueId,
        draftMode,
        selectionMethod,
        draftOrder,
      });
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    LOGGER.error(
      `Failed to create draft record for league ${leagueId}:`,
      errorMessage,
    );
    throw error;
  }
}

/**
 * Comprehensive draft validation (used by both coordinator and worker)
 */
export async function validateDraftRequest(
  options: DraftValidationOptions,
): Promise<void> {
  const {
    leagueId,
    draftMode,
    selectionMethod,
    draftOrder,
    userId,
    skipUserValidation = false,
  } = options;

  // Validate draft mode
  validateDraftMode(draftMode);

  // Validate selection method
  validateSelectionMethod(selectionMethod);

  // Validate draft order if provided
  if (draftOrder) {
    validateDraftOrder(draftOrder);
  }

  // Validate user access (if required)
  if (!skipUserValidation && userId) {
    await validateUserAccess(leagueId, userId);
  }

  // Verify league exists
  await fetchLeagueDetails(leagueId);
}
