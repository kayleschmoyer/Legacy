import { planSync } from './plan';

const MARKER_BODY = [
  '<!-- jira-link',
  'primary: LS-7523',
  'related: LS-7520',
  '-->',
].join('\n');

describe('planSync — push events (open-PR gate)', () => {
  it('is a no-op when the branch has an open PR (the headline regression)', () => {
    const result = planSync({
      eventName: 'push',
      branch: 'LS-7523/review-fixes',
      openPrCount: 1,
    });
    expect(result.skip).toBe(true);
    expect(result.reason).toContain('open PR');
    expect(result.keys).toEqual([]);
  });

  it('transitions branch-name keys only when no PR is open', () => {
    const result = planSync({
      eventName: 'push',
      branch: 'LS-1234/add-oauth',
      openPrCount: 0,
    });
    expect(result).toMatchObject({
      skip: false,
      keys: ['LS-1234'],
      target: 'In Progress',
    });
  });

  it('skips keyless agent branches — no commit-message sweeping fallback exists', () => {
    const result = planSync({
      eventName: 'push',
      branch: 'claude/hopeful-darwin-nt7z6b',
      openPrCount: 0,
    });
    expect(result.skip).toBe(true);
    expect(result.reason).toContain('branch-name keys only');
  });
});

describe('planSync — pull_request events', () => {
  it('uses only the marker primary, never title or decoy keys', () => {
    const result = planSync({
      eventName: 'pull_request',
      action: 'opened',
      branch: 'claude/x',
      prTitle: 'LS-1111 feat: something',
      prBody: `mentions LS-2222\n${MARKER_BODY}\ncloses LS-3333`,
    });
    expect(result).toMatchObject({
      skip: false,
      keys: ['LS-7523'],
      target: 'In Review',
    });
  });

  it('falls back to PR-title keys when no marker exists', () => {
    const result = planSync({
      eventName: 'pull_request',
      action: 'opened',
      prTitle: 'LS-1111 feat(auth): add oauth (LS-1112)',
      prBody: 'no marker here, closes LS-9999',
    });
    expect(result).toMatchObject({
      skip: false,
      keys: ['LS-1111', 'LS-1112'],
      target: 'In Review',
    });
  });

  it('transitions nothing for primary: none', () => {
    const result = planSync({
      eventName: 'pull_request',
      action: 'opened',
      prTitle: 'LS-1111 chore: deps',
      prBody: '<!-- jira-link\nprimary: none\n-->',
    });
    expect(result.skip).toBe(true);
    expect(result.reason).toContain('none');
  });

  it('transitions nothing for an invalid marker (no silent title fallback)', () => {
    const result = planSync({
      eventName: 'pull_request',
      action: 'opened',
      prTitle: 'LS-1111 feat: x',
      prBody: '<!-- jira-link\nprimary: LS-1\nprimary: LS-2\n-->',
    });
    expect(result.skip).toBe(true);
    expect(result.reason).toContain('invalid');
  });

  it('skips actions with no transition defined', () => {
    for (const action of ['synchronize', 'edited', 'labeled']) {
      expect(
        planSync({
          eventName: 'pull_request',
          action,
          prTitle: 'LS-1 x',
          prBody: '',
        }).skip,
      ).toBe(true);
    }
  });

  it('maps merged and unmerged closes correctly', () => {
    const base = {
      eventName: 'pull_request',
      action: 'closed',
      prTitle: 'LS-1 x',
      prBody: '',
    };
    expect(planSync({ ...base, merged: true })).toMatchObject({
      keys: ['LS-1'],
      target: 'Done',
    });
    expect(planSync({ ...base, merged: false })).toMatchObject({
      keys: ['LS-1'],
      target: 'In Progress',
    });
  });

  it('skips when neither marker nor title yields keys', () => {
    const result = planSync({
      eventName: 'pull_request',
      action: 'opened',
      prTitle: 'chore: no ticket',
      prBody: '',
    });
    expect(result.skip).toBe(true);
  });
});

describe('planSync — other events', () => {
  it('skips unsupported events', () => {
    expect(planSync({ eventName: 'workflow_dispatch' }).skip).toBe(true);
  });
});
