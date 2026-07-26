import {
  decideReconcileAction,
  decideReconcileBatch,
  DONE_STATUSES,
} from './decide';

describe('decideReconcileAction', () => {
  it('skips items whose linked ticket is not Done/Closed', () => {
    const result = decideReconcileAction({
      jiraStatus: 'In Progress',
      dryRun: false,
    });
    expect(result).toMatchObject({ action: 'skip' });
  });

  it('resolves items whose linked ticket is Done when not dry-run', () => {
    const result = decideReconcileAction({ jiraStatus: 'Done', dryRun: false });
    expect(result).toMatchObject({ action: 'resolve' });
  });

  it('resolves items whose linked ticket is Closed when not dry-run', () => {
    const result = decideReconcileAction({
      jiraStatus: 'Closed',
      dryRun: false,
    });
    expect(result).toMatchObject({ action: 'resolve' });
  });

  it('proposes instead of resolving during dry-run', () => {
    const result = decideReconcileAction({ jiraStatus: 'Done', dryRun: true });
    expect(result).toMatchObject({ action: 'propose' });
    expect(result.reason).toContain('dry-run');
  });

  it('skips a non-Done ticket even during dry-run (never proposes a no-op)', () => {
    const result = decideReconcileAction({ jiraStatus: 'To Do', dryRun: true });
    expect(result).toMatchObject({ action: 'skip' });
  });

  it('exposes the Done-status set for callers that need it', () => {
    expect(DONE_STATUSES.has('Done')).toBe(true);
    expect(DONE_STATUSES.has('Closed')).toBe(true);
    expect(DONE_STATUSES.has('In Review')).toBe(false);
  });
});

describe('decideReconcileBatch', () => {
  it('decides each item independently while applying the same dryRun to all', () => {
    const result = decideReconcileBatch(
      [
        { jiraStatus: 'Done' },
        { jiraStatus: 'In Progress' },
        { jiraStatus: 'Closed' },
      ],
      false,
    );
    expect(result.map((r) => r.action)).toEqual(['resolve', 'skip', 'resolve']);
  });

  it('preserves input order and produces one decision per input', () => {
    const result = decideReconcileBatch(
      [{ jiraStatus: 'To Do' }, { jiraStatus: 'Done' }],
      true,
    );
    expect(result).toHaveLength(2);
    expect(result[0].action).toBe('skip');
    expect(result[1].action).toBe('propose');
  });

  it('returns an empty array for empty input', () => {
    expect(decideReconcileBatch([], false)).toEqual([]);
  });
});
