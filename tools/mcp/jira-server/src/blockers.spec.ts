import {
  activeBlockers,
  blockerColumns,
  blockerRefs,
  evaluateBlockers,
  type JiraIssueLink,
} from './blockers';

function blockedBy(key: string, status: string): JiraIssueLink {
  return {
    type: { name: 'Blocks', inward: 'is blocked by' },
    inwardIssue: { key, fields: { status: { name: status } } },
  };
}

/**
 * The outward direction of a Blocks link: this issue blocks another, so Jira
 * populates outwardIssue and leaves inwardIssue absent. It must never count as
 * a blocker on this issue.
 */
const outwardBlocks: JiraIssueLink = {
  type: { name: 'Blocks', inward: 'is blocked by' },
};

describe('blockerRefs', () => {
  it('returns every "is blocked by" link regardless of status', () => {
    expect(
      blockerRefs([blockedBy('LS-1', 'Done'), blockedBy('LS-2', 'To Do')]),
    ).toEqual([
      { key: 'LS-1', status: 'Done' },
      { key: 'LS-2', status: 'To Do' },
    ]);
  });

  it('ignores non-blocking link types and links with no inward issue', () => {
    const relates: JiraIssueLink = {
      type: { name: 'Relates', inward: 'relates to' },
      inwardIssue: { key: 'LS-9', fields: { status: { name: 'To Do' } } },
    };
    expect(blockerRefs([relates, outwardBlocks])).toEqual([]);
  });

  it('treats a missing issuelinks field as no blockers', () => {
    expect(blockerRefs()).toEqual([]);
    expect(blockerRefs([])).toEqual([]);
  });
});

describe('activeBlockers', () => {
  it('drops Done and In Review blockers — only these stop work', () => {
    expect(
      activeBlockers([
        blockedBy('LS-1', 'Done'),
        blockedBy('LS-2', 'In Review'),
        blockedBy('LS-3', 'In Progress'),
        blockedBy('LS-4', 'To Do'),
      ]),
    ).toEqual([
      { key: 'LS-3', status: 'In Progress' },
      { key: 'LS-4', status: 'To Do' },
    ]);
  });

  it('matches localized status names', () => {
    // Chinese-locale Jira renders Done as 已完成.
    expect(activeBlockers([blockedBy('LS-1', '已完成')])).toEqual([]);
  });
});

describe('evaluateBlockers', () => {
  it('recommends main when there are no blockers', () => {
    expect(evaluateBlockers([])).toEqual({
      canProceed: true,
      blockers: [],
      recommendation: 'base off main',
    });
  });

  it('recommends main when every blocker is Done', () => {
    const verdict = evaluateBlockers([blockedBy('LS-1', 'Done')]);
    expect(verdict.canProceed).toBe(true);
    expect(verdict.recommendation).toBe('base off main');
    expect(verdict.blockers).toEqual([
      { key: 'LS-1', status: 'Done', reason: 'Resolved — no longer blocking' },
    ]);
  });

  it('STOPs on a blocker that has not reached In Review', () => {
    const verdict = evaluateBlockers([
      blockedBy('LS-1', 'Done'),
      blockedBy('LS-2', 'In Progress'),
    ]);
    expect(verdict.canProceed).toBe(false);
    expect(verdict.recommendation).toBe(
      'STOP — blocker(s) not ready: LS-2 (In Progress)',
    );
  });

  it('bases off the blocker branch when exactly one blocker is In Review', () => {
    const verdict = evaluateBlockers([
      blockedBy('LS-1', 'Done'),
      blockedBy('LS-2', 'In Review'),
    ]);
    expect(verdict.canProceed).toBe(true);
    expect(verdict.recommendation).toBe('base off LS-2 branch');
  });

  it('escalates to a human when several blockers are In Review', () => {
    const verdict = evaluateBlockers([
      blockedBy('LS-2', 'In Review'),
      blockedBy('LS-3', 'In Review'),
    ]);
    expect(verdict.canProceed).toBe(false);
    expect(verdict.recommendation).toContain('multiple blockers are In Review');
    expect(verdict.recommendation).toContain('LS-2, LS-3');
  });
});

describe('blockerColumns', () => {
  it('renders no/empty when nothing blocks', () => {
    expect(blockerColumns([])).toEqual({ blocked: 'no', blockers: '' });
  });

  it('omits Done blockers as noise but keeps In Review ones as a branch hint', () => {
    expect(
      blockerColumns([
        blockedBy('LS-1', 'Done'),
        blockedBy('LS-2', 'In Review'),
      ]),
    ).toEqual({ blocked: 'no', blockers: 'LS-2(In Review)' });
  });

  it('marks blocked=yes and lists each active blocker with its status', () => {
    expect(
      blockerColumns([
        blockedBy('LS-2', 'To Do'),
        blockedBy('LS-3', 'Backlog'),
      ]),
    ).toEqual({ blocked: 'yes', blockers: 'LS-2(To Do); LS-3(Backlog)' });
  });
});
