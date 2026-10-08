import {
  COMMISSIONER_AUDIT_ACTION_LABELS,
  formatCommissionerAuditAction,
} from './commissioner-audit-actions';

describe('formatCommissionerAuditAction (LS-10736)', () => {
  it.each([
    ['force_add', 'Force Add'],
    ['delete_league', 'Delete League'],
    ['update_scoring', 'Update Scoring Rules'],
    ['update_dues_settings', 'Update League Dues'],
    ['process_waivers', 'Process Waivers'],
  ])('labels %s as %s', (action, label) => {
    expect(formatCommissionerAuditAction(action)).toBe(label);
  });

  it('title-cases an unknown action instead of showing snake_case', () => {
    expect(formatCommissionerAuditAction('some_new_action')).toBe(
      'Some New Action',
    );
  });

  it('returns an empty string for a missing action', () => {
    expect(formatCommissionerAuditAction(null)).toBe('');
    expect(formatCommissionerAuditAction(undefined)).toBe('');
  });

  it('has a label for every action the API writes', () => {
    for (const action of [
      'update_league_settings',
      'update_draft_settings',
      'update_scoring',
      'update_scoring_position_bonuses',
      'update_dues_settings',
      'mark_member_paid',
      'mark_member_unpaid',
      'process_waivers',
      'pause_draft',
      'resume_draft',
      'lineup_modified_by_admin',
      'delete_league',
    ]) {
      expect(COMMISSIONER_AUDIT_ACTION_LABELS[action]).toBeDefined();
    }
  });
});
