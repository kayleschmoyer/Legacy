import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const CLI = join(__dirname, 'cli.js');

function run(
  args: string[],
  input?: string,
): {
  status: number;
  stdout: string;
  stderr: string;
} {
  try {
    const stdout = execFileSync(process.execPath, [CLI, ...args], {
      encoding: 'utf8',
      input,
    });
    return { status: 0, stdout, stderr: '' };
  } catch (error) {
    const e = error as { status: number; stdout: string; stderr: string };
    return { status: e.status, stdout: e.stdout, stderr: e.stderr };
  }
}

describe('cli decide', () => {
  it('resolves a Done-linked item outside dry-run', () => {
    const result = run([
      'decide',
      '--jira-status',
      'Done',
      '--dry-run',
      'false',
    ]);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ action: 'resolve' });
  });

  it('proposes a Done-linked item during dry-run', () => {
    const result = run([
      'decide',
      '--jira-status',
      'Done',
      '--dry-run',
      'true',
    ]);
    expect(JSON.parse(result.stdout)).toMatchObject({ action: 'propose' });
  });

  it('skips a non-Done-linked item', () => {
    const result = run([
      'decide',
      '--jira-status',
      'In Progress',
      '--dry-run',
      'false',
    ]);
    expect(JSON.parse(result.stdout)).toMatchObject({ action: 'skip' });
  });
});

describe('cli decide-batch', () => {
  it('decides every input line in one process, preserving order and passthrough fields', () => {
    const input = [
      JSON.stringify({ counter: '1', key: 'LS-1', jiraStatus: 'Done' }),
      JSON.stringify({ counter: '2', key: 'LS-2', jiraStatus: 'In Progress' }),
      JSON.stringify({ counter: '3', key: 'LS-3', jiraStatus: 'Closed' }),
    ].join('\n');

    const result = run(['decide-batch', '--dry-run', 'false'], input);
    expect(result.status).toBe(0);

    const lines = result.stdout
      .trim()
      .split('\n')
      .map(
        (l): Record<string, unknown> =>
          JSON.parse(l) as Record<string, unknown>,
      );
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatchObject({
      counter: '1',
      key: 'LS-1',
      action: 'resolve',
    });
    expect(lines[1]).toMatchObject({
      counter: '2',
      key: 'LS-2',
      action: 'skip',
    });
    expect(lines[2]).toMatchObject({
      counter: '3',
      key: 'LS-3',
      action: 'resolve',
    });
  });

  it('proposes instead of resolving during dry-run, for every item', () => {
    const input = JSON.stringify({ key: 'LS-1', jiraStatus: 'Done' });
    const result = run(['decide-batch', '--dry-run', 'true'], input);
    const [decision] = result.stdout
      .trim()
      .split('\n')
      .map(
        (l): Record<string, unknown> =>
          JSON.parse(l) as Record<string, unknown>,
      );
    expect(decision).toMatchObject({ action: 'propose' });
  });

  it('handles empty stdin by producing no output', () => {
    const result = run(['decide-batch', '--dry-run', 'false'], '');
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
  });

  it('fails closed when an input line is missing jiraStatus', () => {
    const result = run(
      ['decide-batch', '--dry-run', 'false'],
      JSON.stringify({ key: 'LS-1' }),
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('jiraStatus');
  });

  it('fails closed on a malformed --dry-run instead of silently disabling it', () => {
    const result = run(
      ['decide-batch', '--dry-run', 'nope'],
      JSON.stringify({ key: 'LS-1', jiraStatus: 'Done' }),
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('dry-run');
  });
});

describe('cli errors', () => {
  it('fails with a message on unknown commands and missing flags', () => {
    expect(run(['bogus']).status).toBe(1);
    expect(run(['decide']).status).toBe(1);
    expect(run(['decide', '--jira-status', 'Done']).status).toBe(1);
  });

  it('fails closed on a malformed --dry-run instead of silently disabling it', () => {
    const result = run(['decide', '--jira-status', 'Done', '--dry-run', 'yes']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('dry-run');
  });
});
