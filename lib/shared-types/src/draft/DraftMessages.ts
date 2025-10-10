// Draft processing message types for SQS queue
// These messages are sent to the automatic drafts SQS queue for processing

export interface StartDraftMessage {
  leagueId: number;
  draftType: 'random-draft' | 'snake-draft' | 'auction';
  requestedBy: number; // User ID who requested the draft
  timestamp: string;
}

// Message wrapper for SQS compatibility
export interface SqsDraftMessage {
  messageType: 'START_DRAFT';
  payload: StartDraftMessage;
}

// Response types for draft processing
export interface DraftProcessingResult {
  success: boolean;
  leagueId: number;
  message: string;
  error?: string;
}
