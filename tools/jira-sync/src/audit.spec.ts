import { decideAuditAction, planAudit } from './audit';

const MARKER_BODY = [
  '<!-- jira-link',
  'primary: LS-7523',
  'related: LS-7520',
  '-->',
].join('\n');

describe('planAudit — expected status from PR state', () => {
  it('expects Done for a merged PR', () => {
    const result = planAudit({
      merged: true,
      title: 'LS-1 feat: x',
      body: '',
    });
    expect(result).toMatchObject({ skip: false, expected: 'Done' });
  });

  it('expects In Review for an open draft PR (LS-8690: matches jira-branch-sync, which transitions on open regardless of draft state)', () => {
    const result = planAudit({
      merged: false,
      isDraft: true,
      title: 'LS-1 feat: x',
      body: '',
    });
    expect(result).toMatchObject({ skip: false, expected: 'In Review' });
  });

  it('expects In Review for an open ready PR', () => {
    const result = planAudit({
      merged: false,
      isDraft: false,
      title: 'LS-1 feat: x',
      body: '',
    });
    expect(result).toMatchObject({ skip: false, expected: 'In Review' });
  });
});

describe('planAudit — key selection (marker → title → branch)', () => {
  it('uses only the marker primary, never title or decoy keys', () => {
    const result = planAudit({
      merged: false,
      title: 'LS-1111 feat: something',
      body: `mentions LS-2222\n${MARKER_BODY}\ncloses LS-3333`,
      branch: 'LS-4444/feature',
    });
    expect(result).toMatchObject({
      skip: false,
      key: 'LS-7523',
      source: 'marker',
    });
  });

  it('falls back to the first PR-title key when no marker exists', () => {
    const result = planAudit({
      merged: false,
      title: 'LS-1111 feat(auth): add oauth (LS-1112)',
      body: 'no marker here, closes LS-9999',
      branch: 'LS-4444/feature',
    });
    expect(result).toMatchObject({
      skip: false,
      key: 'LS-1111',
      source: 'title',
    });
  });

  it('falls back to branch-name keys when neither marker nor title has one', () => {
    const result = planAudit({
      merged: false,
      title: 'chore: no ticket',
      body: 'no marker',
      branch: 'LS-4444/feature',
    });
    expect(result).toMatchObject({
      skip: false,
      key: 'LS-4444',
      source: 'branch',
    });
  });

  it('skips when no key source yields anything', () => {
    const result = planAudit({
      merged: false,
      title: 'chore: deps',
      body: '',
      branch: 'claude/hopeful-darwin-nt7z6b',
    });
    expect(result.skip).toBe(true);
    expect(result.key).toBeNull();
  });

  it('skips for primary: none', () => {
    const result = planAudit({
      merged: true,
      title: 'LS-1111 chore: deps',
      body: '<!-- jira-link\nprimary: none\n-->',
      branch: 'LS-1111/x',
    });
    expect(result.skip).toBe(true);
    expect(result.reason).toContain('none');
  });

  it('skips for an invalid marker (no silent title fallback)', () => {
    const result = planAudit({
      merged: false,
      title: 'LS-1111 feat: x',
      body: '<!-- jira-link\nprimary: LS-1\nprimary: LS-2\n-->',
    });
    expect(result.skip).toBe(true);
    expect(result.reason).toContain('invalid');
  });
});

describe('decideAuditAction — label + repair decision matrix', () => {
  it('removes a stale jira-mismatch label when the ticket is back in sync', () => {
    const result = decideAuditAction({
      current: 'In Review',
      expected: 'In Review',
      guardAllowed: false,
      autoRepair: false,
      hasLabel: true,
    });
    expect(result).toMatchObject({
      action: 'in-sync',
      addLabel: false,
      removeLabel: true,
    });
  });

  it('does nothing for an in-sync ticket without the label', () => {
    const result = decideAuditAction({
      current: 'Done',
      expected: 'Done',
      guardAllowed: false,
      autoRepair: false,
      hasLabel: false,
    });
    expect(result).toMatchObject({
      action: 'in-sync',
      addLabel: false,
      removeLabel: false,
    });
  });

  it('repairs (and clears the label) when the guard allows and auto-repair is on', () => {
    const result = decideAuditAction({
      current: 'In Progress',
      expected: 'Done',
      guardAllowed: true,
      autoRepair: true,
      hasLabel: true,
    });
    expect(result).toMatchObject({
      action: 'repair',
      addLabel: false,
      removeLabel: true,
    });
  });

  it('proposes via label + comment in dry-run even when the guard allows', () => {
    const result = decideAuditAction({
      current: 'In Progress',
      expected: 'In Review',
      guardAllowed: true,
      autoRepair: false,
      hasLabel: false,
    });
    expect(result).toMatchObject({
      action: 'propose',
      addLabel: true,
      removeLabel: false,
    });
  });

  it('does not re-add the label when a proposed drift is already labeled', () => {
    const result = decideAuditAction({
      current: 'In Progress',
      expected: 'In Review',
      guardAllowed: true,
      autoRepair: false,
      hasLabel: true,
    });
    expect(result).toMatchObject({
      action: 'propose',
      addLabel: false,
      removeLabel: false,
    });
  });

  it('labels guard-refused drift for manual review and never repairs it', () => {
    const result = decideAuditAction({
      current: 'Done',
      expected: 'In Review',
      guardAllowed: false,
      autoRepair: true,
      hasLabel: false,
    });
    expect(result).toMatchObject({
      action: 'refuse',
      addLabel: true,
      removeLabel: false,
    });
  });
});
