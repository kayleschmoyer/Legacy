import { getDbOptions, DraftSqsService, StartDraftMessage } from '@legacy-sports/utils';
import { 
  validateDraftType, 
  validateUserAccess, 
  updateLeagueDraftStatus, 
  fetchLeagueDetails,
  validateDraftRequest,
  VALID_DRAFT_TYPES,
  DraftType
} from './DraftUtils';
import { LOGGER } from '@legacy-sports/logging';

export interface DraftTriggerResult {
  success: boolean;
  league: {
    id: number;
    name: string;
    owner: number;
    maxRosterSize: number;
    currentMatchup: number | null;
    draftStatus: string;
  };
  message: string;
  error?: string;
}

export interface DraftServiceOptions {
  leagueId: number;
  draftType: 'random-draft' | 'snake-draft' | 'auction';
  requestedBy: number;
  validateUserAccess?: boolean; // Allow bypassing user access check for admin operations
}

/**
 * Shared service for managing draft operations
 * Extracted from GraphQL resolvers to enable reuse across CLI, GraphQL, and tests
 */
export class DraftService {
  private queueUrl: string | undefined;
  private sqsService: DraftSqsService | null = null;

  constructor() {
    this.queueUrl = process.env.SQS_AUTOMATIC_DRAFTS_URL;
    if (this.queueUrl) {
      this.sqsService = new DraftSqsService(this.queueUrl);
    }
  }

  // Note: All validation and status update methods are now in DraftUtils for reuse

  /**
   * Send draft message to SQS queue
   */
  private async sendDraftMessage(message: StartDraftMessage): Promise<void> {
    if (!this.sqsService) {
      throw new Error('Draft queue URL not configured');
    }

    LOGGER.info('📨 Sending draft message to SQS queue');
    await this.sqsService.sendStartDraftMessage(message);
    LOGGER.info('✅ SQS message sent successfully');
  }

  /**
   * Start a draft for a league
   * This is the main entry point for triggering drafts
   */
  async startDraft(options: DraftServiceOptions): Promise<DraftTriggerResult> {
    const { leagueId, draftType, requestedBy, validateUserAccess = true } = options;

    try {
      // Validate draft request using shared utilities
      await validateDraftRequest({
        leagueId,
        draftType,
        userId: requestedBy,
        skipUserValidation: !validateUserAccess
      });

      // Ensure SQS service is available
      if (!this.sqsService) {
        throw new Error('Draft queue URL not configured');
      }

      // Update league draft status to 'queued' AND send SQS message in sequence
      // If SQS fails, we need to rollback the database change
      let dbUpdateSuccessful = false;
      
      try {
        // Update league draft status to 'queued'
        await updateLeagueDraftStatus(leagueId, 'queued', 'draft queued by coordinator');
        dbUpdateSuccessful = true;

        // Create and send draft message to SQS
        const message: StartDraftMessage = {
          leagueId,
          draftType: draftType as DraftType,
          requestedBy,
          timestamp: new Date().toISOString(),
        };

        await this.sendDraftMessage(message);

      } catch (sqsError) {
        // If SQS fails after DB update succeeded, rollback the DB change
        if (dbUpdateSuccessful) {
          LOGGER.error('❌ SQS message failed, rolling back database update');
          try {
            await updateLeagueDraftStatus(leagueId, 'not-started', 'rollback after SQS failure');
            LOGGER.info('✅ Database rollback completed');
          } catch (rollbackError) {
            LOGGER.error('❌ Failed to rollback database update:', rollbackError);
          }
        }
        throw sqsError;
      }

      // Fetch and return the updated league object
      const updatedLeague = await fetchLeagueDetails(leagueId);

      LOGGER.info('✅ Draft queued successfully, returning updated league:', updatedLeague);
      
      return {
        success: true,
        league: updatedLeague,
        message: 'Draft queued successfully and processing started'
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      LOGGER.error('❌ Failed to start draft:', errorMessage);
      
      // Try to get league details even in error case (if league exists)
      let league;
      try {
        league = await fetchLeagueDetails(leagueId);
      } catch {
        // If we can't get league details, create minimal structure
        league = {
          id: leagueId,
          name: 'Unknown League',
          owner: requestedBy,
          maxRosterSize: 0,
          currentMatchup: null,
          draftStatus: 'not-started'
        };
      }

      return {
        success: false,
        league,
        message: 'Failed to start draft',
        error: errorMessage
      };
    }
  }

  /**
   * Get the current draft status of a league
   */
  async getDraftStatus(leagueId: number): Promise<{ leagueId: number; draftStatus: string }> {
    const league = await fetchLeagueDetails(leagueId);
    
    return {
      leagueId: league.id,
      draftStatus: league.draftStatus || 'not-started'
    };
  }

  /**
   * Check if draft queue is configured and accessible
   */
  isDraftQueueConfigured(): boolean {
    return !!this.queueUrl;
  }

  /**
   * Get configuration info for debugging
   */
  getConfiguration(): { queueUrl: string | undefined; sqsServiceAvailable: boolean } {
    return {
      queueUrl: this.queueUrl,
      sqsServiceAvailable: !!this.sqsService
    };
  }
}

// Export a singleton instance for convenience
export const draftService = new DraftService();