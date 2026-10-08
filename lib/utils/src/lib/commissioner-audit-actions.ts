/**
 * Human-readable labels for commissioner_audit_log.action values.
 *
 * Single source for every Audit Log renderer (web Commish tab, web
 * CommissionerToolsControl, shared CommissionerAuditLog). Lives in utils so
 * renderers can import it without pulling in any UI module graph. Keep in sync with
 * the `action` strings passed to writeAuditLog in lambdas/db (LS-10736).
 */
export const COMMISSIONER_AUDIT_ACTION_LABELS: Readonly<
  Record<string, string>
> = {
  // Roster / matchup tools
  force_add: 'Force Add',
  force_drop: 'Force Drop',
  edit_score: 'Edit Score',
  swap_matchup_teams: 'Swap Matchup',
  update_lm_note: 'Update Note',
  lock_team: 'Lock Team',
  unlock_team: 'Unlock Team',
  bulk_drop_players: 'Bulk Drop',
  recalculate_scores: 'Recalculate Scores',
  lineup_modified_by_admin: 'Edit Lineup',
  // Draft controls
  pause_draft: 'Pause Draft',
  resume_draft: 'Resume Draft',
  update_draft_settings: 'Update Draft Settings',
  // League settings & scoring
  update_league_settings: 'Update League Settings',
  update_scoring: 'Update Scoring Rules',
  update_scoring_position_bonuses: 'Update Position Bonuses',
  // Dues
  update_dues_settings: 'Update League Dues',
  mark_member_paid: 'Mark Dues Paid',
  mark_member_unpaid: 'Mark Dues Unpaid',
  // Waivers
  process_waivers: 'Process Waivers',
  // League lifecycle
  delete_league: 'Delete League',
};

/**
 * Label for an audit action. Unknown actions fall back to a title-cased
 * version of the raw value so a newly added action never renders as
 * snake_case.
 */
export function formatCommissionerAuditAction(
  action: string | null | undefined,
): string {
  if (!action) return '';
  return (
    COMMISSIONER_AUDIT_ACTION_LABELS[action] ??
    action
      .split('_')
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  );
}
