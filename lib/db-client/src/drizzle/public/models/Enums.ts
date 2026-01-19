import { pgEnum } from 'drizzle-orm/pg-core';

export const accessLevel = pgEnum('access_level', ['none', 'admin']);
export const draftOrder = pgEnum('draft_order', ['snake', 'normal']);
export const draftType = pgEnum('draft_type', ['blind', 'normal', 'legacy', 'random-draft']);
export const draftStatus = pgEnum('draft_status', ['not-started', 'queued', 'in-progress', 'completed']);
export const leaguePermissionLevel = pgEnum('league_permission_level', [
  'owner',
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
