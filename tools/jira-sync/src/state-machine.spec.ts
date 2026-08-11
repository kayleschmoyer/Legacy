import { decideTarget, isAllowedMove } from './state-machine';

describe('decideTarget', () => {
  it('maps every pull_request action per the RFC table', () => {
    const pr = (action: string, merged?: boolean) =>
      decideTarget({ eventName: 'pull_request', action, merged });

    expect(pr('opened')).toBe('In Review');
    expect(pr('reopened')).toBe('In Review');
    expect(pr('ready_for_review')).toBe('In Review');
    expect(pr('converted_to_draft')).toBe('In Progress');
    expect(pr('closed', true)).toBe('Done');
    expect(pr('closed', false)).toBe('In Progress');
    expect(pr('closed', undefined)).toBe('In Progress');
    expect(pr('synchronize')).toBeNull();
    expect(pr('edited')).toBeNull();
    expect(pr('labeled')).toBeNull();
  });

  it('maps push to In Progress (gate applied by planSync, not here)', () => {
    expect(decideTarget({ eventName: 'push' })).toBe('In Progress');
  });

  it('targets In Progress for opened/reopened draft PRs, In Review otherwise', () => {
    const pr = (action: string, isDraft?: boolean) =>
      decideTarget({ eventName: 'pull_request', action, isDraft });

    expect(pr('opened', true)).toBe('In Progress');
    expect(pr('opened', false)).toBe('In Review');
    expect(pr('opened', undefined)).toBe('In Review');
    expect(pr('reopened', true)).toBe('In Progress');
    expect(pr('reopened', false)).toBe('In Review');
    expect(pr('reopened', undefined)).toBe('In Review');
  });

  it('maps unknown events to null', () => {
    expect(decideTarget({ eventName: 'workflow_dispatch' })).toBeNull();
  });
});

describe('isAllowedMove — full event × current-status matrix', () => {
  const STATUSES = ['Backlog', 'To Do', 'In Progress', 'In Review', 'Done'];

  // Every sync-relevant event with its requested target.
  const EVENTS = [
    {
      name: 'push (no open PR)',
      event: { eventName: 'push' },
      target: 'In Progress',
    },
    {
      name: 'pull_request opened',
      event: { eventName: 'pull_request', action: 'opened' },
      target: 'In Review',
    },
    {
      name: 'pull_request reopened',
      event: { eventName: 'pull_request', action: 'reopened' },
      target: 'In Review',
    },
    {
      name: 'pull_request ready_for_review',
      event: { eventName: 'pull_request', action: 'ready_for_review' },
      target: 'In Review',
    },
    {
      name: 'pull_request converted_to_draft',
      event: { eventName: 'pull_request', action: 'converted_to_draft' },
      target: 'In Progress',
    },
    {
      name: 'pull_request closed merged',
      event: { eventName: 'pull_request', action: 'closed', merged: true },
      target: 'Done',
    },
    {
      name: 'pull_request closed unmerged',
      event: { eventName: 'pull_request', action: 'closed', merged: false },
      target: 'In Progress',
    },
  ] as const;

  // expected[eventName][currentStatus] = 'allow' | 'noop' | 'refuse'
  const expected: Record<
    string,
    Record<string, 'allow' | 'noop' | 'refuse'>
  > = {
    'push (no open PR)': {
      Backlog: 'allow',
      'To Do': 'allow',
      'In Progress': 'noop',
      'In Review': 'refuse', // a push can never demote anything
      Done: 'refuse',
    },
    'pull_request opened': {
      Backlog: 'allow',
      'To Do': 'allow',
      'In Progress': 'allow',
      'In Review': 'noop',
      Done: 'refuse',
    },
    'pull_request reopened': {
      Backlog: 'allow',
      'To Do': 'allow',
      'In Progress': 'allow',
      'In Review': 'noop',
      Done: 'refuse',
    },
    'pull_request ready_for_review': {
      Backlog: 'allow',
      'To Do': 'allow',
      'In Progress': 'allow',
      'In Review': 'noop',
      Done: 'refuse',
    },
    'pull_request converted_to_draft': {
      Backlog: 'allow',
      'To Do': 'allow',
      'In Progress': 'noop',
      'In Review': 'allow', // permitted downgrade
      Done: 'refuse',
    },
    'pull_request closed merged': {
      Backlog: 'allow',
      'To Do': 'allow',
      'In Progress': 'allow',
      'In Review': 'allow',
      Done: 'noop', // a merged PR can never un-Done a ticket
    },
    'pull_request closed unmerged': {
      Backlog: 'allow',
      'To Do': 'allow',
      'In Progress': 'noop',
      'In Review': 'allow', // permitted downgrade
      Done: 'refuse',
    },
  };

  for (const { name, event, target } of EVENTS) {
    for (const current of STATUSES) {
      const want = expected[name][current];
      it(`${name}: ${current} → ${target} = ${want}`, () => {
        const result = isAllowedMove(current, target, event);
        if (want === 'allow') {
          expect(result.allowed).toBe(true);
          expect(result.noop).toBe(false);
        } else if (want === 'noop') {
          expect(result.allowed).toBe(false);
          expect(result.noop).toBe(true);
        } else {
          expect(result.allowed).toBe(false);
          expect(result.noop).toBe(false);
        }
      });
    }
  }

  it('refuses unknown statuses in either position', () => {
    expect(
      isAllowedMove('Weird Status', 'Done', {
        eventName: 'pull_request',
        action: 'closed',
        merged: true,
      }).allowed,
    ).toBe(false);
    expect(
      isAllowedMove('To Do', 'Weird Status', { eventName: 'push' }).allowed,
    ).toBe(false);
  });

  it('refuses In Review → In Progress on a push even though the pair is a permitted-downgrade pair', () => {
    const result = isAllowedMove('In Review', 'In Progress', {
      eventName: 'push',
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('monotonic guard');
  });

  it('treats Backlog → To Do as a refused same-rank move rather than a forward move', () => {
    expect(
      isAllowedMove('Backlog', 'To Do', { eventName: 'push' }).allowed,
    ).toBe(false);
  });
});
