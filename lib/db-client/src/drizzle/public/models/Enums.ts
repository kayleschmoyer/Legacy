import { pgEnum } from 'drizzle-orm/pg-core';

export const accessLevel = pgEnum('access_level', ['none', 'admin']);
export const draftOrder = pgEnum('draft_order', ['snake', 'linear']);
export const draftMode = pgEnum('draft_mode', ['live', 'automated']);
export const selectionMethod = pgEnum('selection_method', [
  'standard',
  'auction',
  'random',
]);
export const playerPool = pgEnum('player_pool', ['all', 'nl', 'al']);

/**
 * Sport kind — discriminator for multi-sport leagues. Baseball is the
 * historical default; football lands as part of LS-4568 (draft-board sport
 * toggle). Used to gate sport-specific behaviour (positions, era options,
 * stat ingestion, etc.).
 */
export const sportKind = pgEnum('sport_kind', ['baseball', 'football']);

/**
 * Era filter — restricts the available player pool to players whose careers
 * overlapped with the selected historical baseball era.
 *
 * Dead Ball   : pre-1920
 * Golden Age  : 1920-1960
 * Expansion   : 1961-1976
 * Free Agency : 1977-1993
 * Steroid Era : 1994-2005
 * Modern      : 2006+
 * Custom      : commissioner-defined start/end years
 * All         : no restriction (default)
 */
export const eraFilter = pgEnum('era_filter', [
  'all',
  'dead_ball',
  'golden_age',
  'expansion',
  'free_agency',
  'steroid_era',
  'modern',
  'custom',
]);

export const draftStatus = pgEnum('draft_status', [
  'not-started',
  'queued',
  'in-progress',
  'paused',
  'completed',
]);
export const leaguePermissionLevel = pgEnum('league_permission_level', [
  'general_manager',
  'assistant_manager',
  'commissioner',
]);

export const playerPosition = pgEnum('player_position', [
  'SP',
  'RP',
  'C',
  '1B',
  '2B',
  '3B',
  'SS',
  'RF',
  'LF',
  'CF',
  'DH',
]);

export const positionSlot = pgEnum('position_slot', [
  'SP',
  'RP',
  'C',
  '1B',
  '2B',
  '3B',
  'SS',
  'RF',
  'LF',
  'CF',
  'DH',
  'XDH',
  'OF',
  'IF',
]);

export const scoringStatGroup = pgEnum('scoring_stat_group', [
  'batting',
  'pitching',
  'fielding',
]);

export const schedulingStrategy = pgEnum('scheduling_strategy', [
  'round-robin',
  'divisional',
  'random',
]);

export const scoringProfileStatus = pgEnum('scoring_profile_status', [
  'draft',
  'active',
  'archived',
]);

export const scoringChangeAction = pgEnum('scoring_change_action', [
  'created',
  'updated',
  'disabled',
]);

export const emergencySubRule = pgEnum('emergency_sub_rule', [
  'none',
  'injury_only',
  'injury_or_rest',
  'commissioner_approval',
]);

export const rosterLockTiming = pgEnum('roster_lock_timing', [
  'matchup_start',
  'day_before',
  'week_before',
  'custom',
]);

export const leaguePhase = pgEnum('league_phase', [
  'pre-draft',
  'active',
  'offseason',
]);

export const weekAdvanceStatus = pgEnum('week_advance_status', [
  'idle',
  'queued',
  'processing',
  'success',
  'failed',
]);

// Chat system enums
export const matchupChatBlockScope = pgEnum('matchup_chat_block_scope', [
  'matchup',
  'league',
  'global',
]);

export const matchupMessageReactionType = pgEnum(
  'matchup_message_reaction_type',
  ['like', 'fire', 'laugh', 'wow', 'trophy', 'thumbs_down'],
);

export const matchupMessageReportStatus = pgEnum(
  'matchup_message_report_status',
  ['pending', 'reviewing', 'resolved', 'dismissed'],
);

export const tradeOfferStatus = pgEnum('trade_offer_status', [
  'pending',
  'accepted',
  'rejected',
  'cancelled',
  'vetoed',
  'expired',
]);

export const matchupMessageType = pgEnum('matchup_message_type', [
  'text',
  'gif',
  'system',
]);

// Waiver claim system enums
export const waiverClaimStatus = pgEnum('waiver_claim_status', [
  'pending',
  'processing',
  'completed',
  'failed',
  'cancelled',
]);

export const waiverType = pgEnum('waiver_type', ['standard', 'faab']);

// Tiebreaker system enums
export const tiebreakerMethod = pgEnum('tiebreaker_method', [
  'highest_category',
  'total_season_points',
  'head_to_head_record',
  'random',
  'co_champion',
]);
