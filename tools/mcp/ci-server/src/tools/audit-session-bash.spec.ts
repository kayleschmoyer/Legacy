import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

jest.mock('../github-api.js', () => ({
  getRepoRoot: jest.fn(() => '/repo'),
}));

// The tool must never touch child_process (LS-8316): the Python shell-out was
// replaced with a native TypeScript implementation. Any accidental call
// through these mocks fails the test loudly.
jest.mock('node:child_process', () => ({
  execFile: jest.fn(() => {
    throw new Error(
      'unexpected execFile call — the TS port must not shell out',
    );
  }),
  execFileSync: jest.fn(() => {
    throw new Error(
      'unexpected execFileSync call — the TS port must not shell out',
    );
  }),
}));

import { execFile, execFileSync } from 'node:child_process';
import { auditSessionBash } from './audit-session-bash.js';

const SLUG = '-home-user-fixture-project';
const SESSION_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const SUBAGENT_ID = 'ffffffff-1111-2222-3333-444444444444';

const ORIGINAL_PROJECTS_DIR = process.env.CLAUDE_PROJECTS_DIR;
const ORIGINAL_PATH = process.env.PATH;

function bashRecord(command: string, timestamp: string, id: string): string {
  return JSON.stringify({
    timestamp,
    sessionId: SESSION_ID,
    message: {
      content: [
        {
          type: 'tool_use',
          name: 'Bash',
          id,
          input: { command, description: '' },
        },
      ],
    },
  });
}

function resultText(
  result: Awaited<ReturnType<typeof auditSessionBash>>,
): string {
  return result.content.map((c) => c.text).join('\n');
}

describe('auditSessionBash (node-native)', () => {
  let projectsDir: string;

  beforeEach(() => {
    projectsDir = mkdtempSync(join(tmpdir(), 'audit-tool-'));
    const projectDir = join(projectsDir, SLUG);
    mkdirSync(projectDir, { recursive: true });

    writeFileSync(
      join(projectDir, `${SESSION_ID}.jsonl`),
      [
        bashRecord('git status', '2026-07-26T12:00:00.000Z', 't1'),
        bashRecord(
          'curl -s https://example.com',
          '2026-07-26T12:00:01.000Z',
          't2',
        ),
        JSON.stringify({
          timestamp: '2026-07-26T12:00:02.000Z',
          message: {
            content: [
              {
                type: 'tool_use',
                name: 'ci_get_logs',
                id: 'mcp1',
                input: { runId: 7 },
              },
              {
                type: 'tool_result',
                tool_use_id: 'mcp1',
                content: 'result exceeds maximum allowed tokens (25000)',
              },
            ],
          },
        }),
      ].join('\n'),
    );

    const subagentDir = join(projectDir, SESSION_ID, 'subagents');
    mkdirSync(subagentDir, { recursive: true });
    writeFileSync(
      join(subagentDir, `${SUBAGENT_ID}.jsonl`),
      bashRecord('grep -r "foo" src/', '2026-07-26T12:00:03.000Z', 't3'),
    );

    process.env.CLAUDE_PROJECTS_DIR = projectsDir;
  });

  afterEach(() => {
    rmSync(projectsDir, { recursive: true, force: true });
    if (ORIGINAL_PROJECTS_DIR === undefined) {
      delete process.env.CLAUDE_PROJECTS_DIR;
    } else {
      process.env.CLAUDE_PROJECTS_DIR = ORIGINAL_PROJECTS_DIR;
    }
    process.env.PATH = ORIGINAL_PATH;
    jest.clearAllMocks();
  });

  it('honors an explicit projectsDir param, overriding CLAUDE_PROJECTS_DIR (LS-8867)', () => {
    // Simulates a CCR session where the server process's auto-detected home
    // doesn't match the real session location: the caller passes the actual
    // directory explicitly rather than relying on env-var/homedir detection.
    delete process.env.CLAUDE_PROJECTS_DIR;

    const result = auditSessionBash({
      projectsDir,
      project: SLUG,
      sessionId: SESSION_ID,
      gapsOnly: true,
    });

    expect(result.isError).toBeUndefined();
    expect(resultText(result)).toContain(`Session: ${SESSION_ID}`);
  });

  it('returns a gaps report without any Python interpreter (gapsOnly)', () => {
    // Simulate an environment with no python/python3 anywhere: an empty PATH.
    process.env.PATH = '';

    const result = auditSessionBash({
      project: SLUG,
      sessionId: SESSION_ID,
      gapsOnly: true,
    });

    expect(result.isError).toBeUndefined();
    const text = resultText(result);
    expect(text).not.toContain('no Python interpreter found on PATH');
    expect(text).toContain(`Session: ${SESSION_ID}`);
    expect(text).toContain('=== Potential MCP gaps');
    expect(text).toContain('=== MCP-covered');
    // Subagent commands are included in the frequency table
    expect(text).toContain('grep -r "foo"');
    // The tool never shells out
    expect(execFile).not.toHaveBeenCalled();
    expect(execFileSync).not.toHaveBeenCalled();
  });

  it('returns the structured JSON report by default, including subagent calls', () => {
    const result = auditSessionBash({
      project: SLUG,
      sessionId: SESSION_ID,
    });

    expect(result.isError).toBeUndefined();
    const report = JSON.parse(resultText(result)) as {
      session_id: string;
      project: string;
      bash_commands: Array<Record<string, unknown>>;
      total: number;
      mcp_issues?: unknown[];
    };
    expect(report.session_id).toBe(SESSION_ID);
    expect(report.project).toBe(SLUG);
    expect(report.total).toBe(3);
    expect(report.bash_commands.map((c) => c.command)).toEqual([
      'git status',
      'curl -s https://example.com',
      'grep -r "foo" src/',
    ]);
    expect(report.bash_commands[2].source).toBe(SUBAGENT_ID);
    // includeMcp defaults to false in default mode
    expect(report.mcp_issues).toBeUndefined();
    expect(execFile).not.toHaveBeenCalled();
  });

  it('includes MCP overflow issues when includeMcp is set', () => {
    const result = auditSessionBash({
      project: SLUG,
      sessionId: SESSION_ID,
      includeMcp: true,
    });

    const report = JSON.parse(resultText(result)) as {
      mcp_issues: Array<Record<string, unknown>>;
    };
    expect(report.mcp_issues).toHaveLength(1);
    expect(report.mcp_issues[0]).toMatchObject({
      name: 'ci_get_logs',
      is_overflow: true,
      is_error: false,
    });
  });

  it('produces the pre-classified audit report in auditMode (implies includeMcp)', () => {
    const result = auditSessionBash({
      project: SLUG,
      sessionId: SESSION_ID,
      auditMode: true,
    });

    expect(result.isError).toBeUndefined();
    const report = JSON.parse(resultText(result)) as {
      session_id: string;
      summary: Record<string, number>;
      action_required: Record<string, unknown[]>;
      instructions: string;
    };
    expect(report.session_id).toBe(SESSION_ID);
    expect(report.summary.total_bash_commands).toBe(3);
    expect(report.summary.mcp_overflows).toBe(1);
    // grep -r from the subagent is a high-confidence, auto-classified gap
    expect(report.action_required.gaps_auto_classified).toHaveLength(1);
    expect(report.instructions).toContain('action_required');
    expect(execFile).not.toHaveBeenCalled();
    expect(execFileSync).not.toHaveBeenCalled();
  });

  it('auto-detects the most recently modified session when sessionId is omitted', () => {
    const result = auditSessionBash({ project: SLUG, gapsOnly: true });
    expect(result.isError).toBeUndefined();
    expect(resultText(result)).toContain(`Session: ${SESSION_ID}`);
  });

  it('rejects invalid project slugs with the established error message', () => {
    const result = auditSessionBash({ project: '../escape' });
    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain('Invalid project slug');
    expect(resultText(result)).toContain('Must match /^[A-Za-z0-9._-]+$/');
  });

  it('reports a missing project directory as an error', () => {
    const result = auditSessionBash({ project: 'does-not-exist' });
    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain('project directory not found');
  });

  it('reports an empty project directory (no JSONL files) as an error', () => {
    mkdirSync(join(projectsDir, 'empty-project'));
    const result = auditSessionBash({ project: 'empty-project' });
    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain('no JSONL files found');
  });
});
