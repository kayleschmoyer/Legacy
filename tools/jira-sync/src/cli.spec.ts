import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CLI = join(__dirname, 'cli.js');

function run(args: string[]): {
  status: number;
  stdout: string;
  stderr: string;
} {
  try {
    const stdout = execFileSync(process.execPath, [CLI, ...args], {
      encoding: 'utf8',
    });
    return { status: 0, stdout, stderr: '' };
  } catch (error) {
    const e = error as { status: number; stdout: string; stderr: string };
    return { status: e.status, stdout: e.stdout, stderr: e.stderr };
  }
}

function writeEvent(event: object): string {
  const dir = mkdtempSync(join(tmpdir(), 'jira-sync-'));
  const path = join(dir, 'event.json');
  writeFileSync(path, JSON.stringify(event));
  return path;
}

describe('cli plan', () => {
  it('plans a push event from the payload ref, honoring the open-PR gate', () => {
    const eventPath = writeEvent({ ref: 'refs/heads/LS-42/feature' });

    const gated = run([
      'plan',
      '--event-name',
      'push',
      '--event-path',
      eventPath,
      '--open-pr-count',
      '2',
    ]);
    expect(gated.status).toBe(0);
    expect(JSON.parse(gated.stdout)).toMatchObject({ skip: true });

    const ungated = run([
      'plan',
      '--event-name',
      'push',
      '--event-path',
      eventPath,
    ]);
    expect(JSON.parse(ungated.stdout)).toMatchObject({
      skip: false,
      keys: ['LS-42'],
      target: 'In Progress',
    });
  });

  it('plans a pull_request event from the payload', () => {
    const eventPath = writeEvent({
      action: 'opened',
      pull_request: {
        merged: false,
        title: 'LS-7894 feat(jira-sync): extract transition engine',
        body: '<!-- jira-link\nprimary: LS-7894\n-->',
        head: { ref: 'claude/charming-mendel' },
      },
    });
    const result = run([
      'plan',
      '--event-name',
      'pull_request',
      '--event-path',
      eventPath,
    ]);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      skip: false,
      keys: ['LS-7894'],
      target: 'In Review',
    });
  });
});

describe('cli guard', () => {
  it('allows forward moves and refuses backward moves', () => {
    const forward = run([
      'guard',
      '--current',
      'To Do',
      '--target',
      'In Review',
      '--event-name',
      'pull_request',
      '--action',
      'opened',
    ]);
    expect(JSON.parse(forward.stdout)).toMatchObject({ allowed: true });

    const backward = run([
      'guard',
      '--current',
      'In Review',
      '--target',
      'In Progress',
      '--event-name',
      'push',
    ]);
    expect(JSON.parse(backward.stdout)).toMatchObject({
      allowed: false,
      noop: false,
    });
  });

  it('reports noop when already at the target status', () => {
    const result = run([
      'guard',
      '--current',
      'Done',
      '--target',
      'Done',
      '--event-name',
      'pull_request',
      '--action',
      'closed',
      '--merged',
      'true',
    ]);
    expect(JSON.parse(result.stdout)).toMatchObject({
      allowed: false,
      noop: true,
    });
  });
});

describe('cli audit', () => {
  it('audits a merged PR from a gh pr JSON file (marker-first)', () => {
    const prPath = writeEvent({
      number: 5000,
      title: 'LS-1111 feat: x',
      body: '<!-- jira-link\nprimary: LS-7523\n-->',
      isDraft: false,
      headRefName: 'claude/some-branch',
      state: 'MERGED',
    });
    const result = run(['audit', '--pr-file', prPath]);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      skip: false,
      key: 'LS-7523',
      source: 'marker',
      expected: 'Done',
    });
  });

  it('decides label/repair actions via audit-action', () => {
    const result = run([
      'audit-action',
      '--current',
      'In Review',
      '--expected',
      'In Review',
      '--guard-allowed',
      'false',
      '--auto-repair',
      'false',
      '--has-label',
      'true',
    ]);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      action: 'in-sync',
      removeLabel: true,
    });
  });

  it('fails closed on malformed audit-action booleans', () => {
    const result = run([
      'audit-action',
      '--current',
      'To Do',
      '--expected',
      'Done',
      '--guard-allowed',
      'yes',
      '--auto-repair',
      'false',
      '--has-label',
      'false',
    ]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('guard-allowed');
  });

  it('audits an open draft PR with title fallback', () => {
    const prPath = writeEvent({
      number: 5001,
      title: 'LS-1111 feat: x',
      body: 'no marker',
      isDraft: true,
      headRefName: 'claude/some-branch',
      state: 'OPEN',
    });
    const result = run(['audit', '--pr-file', prPath]);
    expect(JSON.parse(result.stdout)).toMatchObject({
      skip: false,
      key: 'LS-1111',
      source: 'title',
      expected: 'In Progress',
    });
  });
});

describe('cli errors', () => {
  it('fails with a message on unknown commands and missing flags', () => {
    expect(run(['bogus']).status).toBe(1);
    expect(run(['plan']).status).toBe(1);
    expect(run(['guard', '--current', 'To Do']).status).toBe(1);
    expect(run(['audit']).status).toBe(1);
  });

  it('fails closed on a malformed --open-pr-count instead of bypassing the gate', () => {
    const eventPath = writeEvent({ ref: 'refs/heads/LS-42/feature' });
    const result = run([
      'plan',
      '--event-name',
      'push',
      '--event-path',
      eventPath,
      '--open-pr-count',
      'not-a-number',
    ]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('open-pr-count');
  });
});
