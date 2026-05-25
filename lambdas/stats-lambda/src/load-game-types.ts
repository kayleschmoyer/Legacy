/**
 * Message format for matchup stats loading
 * Contains a batch of players for a matchup to process sequentially
 * Supports batching to avoid Lambda timeouts
 */
export interface LoadMatchupStatsMessage {
  matchupId: number;
  batchIndex?: number; // Optional: which batch this is (0-indexed)
  totalBatches?: number; // Optional: total number of batches for this matchup
  players: Array<{
    matchupPlayerId: number;
    playerId: number;
    brefId: string;
    season: number;
    fieldingGamePos: string;
  }>;
}

/**
 * Maximum milliseconds to spend processing players within a single Lambda invocation.
 * Sized to leave ~60s headroom against the tightest Lambda timeout (prod = 300s).
 * With batch_size=1, the baseline load is ~96s (8 players × 3 BBRef requests × 4s spacing)
 * so this budget comfortably covers several 429 retries before ejecting gracefully.
 * When the budget is exceeded the message is returned as a batchItemFailure so SQS
 * re-delivers it cleanly; already-completed players are DB cache hits on re-delivery.
 */
export const PLAYER_PROCESSING_BUDGET_MS = 240_000; // 4 minutes

export interface RetryableError extends Error {
  originalError: unknown;
  isRetryableTimeout: boolean;
  isRateLimit: boolean;
}

export interface LoadFootballMatchupStatsMessage {
  type: 'football-game-stats';
  matchupId: number;
  batchIndex?: number;
  totalBatches?: number;
  players: Array<{
    matchupPlayerId: number;
    playerId: number;
    pfrId: string;
    season: number;
    isDst: boolean;
    position: string;
    nflTeam?: string | null;
  }>;
}

export interface LoadFootballSeasonStatsMessage {
  type: 'football-season-stats';
  players: Array<{
    playerId: number;
    pfrId: string;
    season: number;
    isDst: boolean;
    position: string;
    nflTeam?: string | null;
  }>;
}

export interface CalculateFootballScoresMessage {
  type: 'football-calculate-scores';
  matchupId: number;
}
