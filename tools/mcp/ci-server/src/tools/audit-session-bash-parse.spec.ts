import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type BashCall,
  classifyCommand,
  classifyGapType,
  commandPattern,
  extractBashCalls,
  extractBashCallsFromContent,
  extractMcpCalls,
  extractMcpCallsFromContent,
  extractScratchSubprocessCalls,
  findSessionByPid,
  formatAudit,
  formatGapsOnly,
  isRecurringInvestigative,
  NOISE_PATTERNS,
  stripCdPrefix,
} from './audit-session-bash-parse.js';

/** Serialize records to JSONL, one JSON document per line. */
function toJsonl(records: unknown[]): string {
  return records.map((r) => JSON.stringify(r)).join('\n') + '\n';
}

function bashUseRecord(
  command: string,
  options: { description?: string; timestamp?: string; id?: string } = {},
): unknown {
  return {
    timestamp: options.timestamp ?? '2026-07-26T12:00:00.000Z',
    sessionId: 'session-1',
    message: {
      content: [
        {
          type: 'tool_use',
          name: 'Bash',
          id: options.id ?? `toolu_${Math.abs(hash(command))}`,
          input: { command, description: options.description ?? '' },
        },
      ],
    },
  };
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return h;
}

function synthBashCall(
  command: string,
  overrides: Partial<BashCall> = {},
): BashCall {
  return {
    command,
    description: '',
    timestamp: '2026-07-26T12:00:00.000Z',
    source: 'parent',
    session_id: 'session-1',
    tool_use_id: 'toolu_1',
    line: 1,
    ...overrides,
  };
}

describe('audit-session-bash-parse', () => {
  let fixtureDir: string;

  beforeEach(() => {
    fixtureDir = mkdtempSync(join(tmpdir(), 'audit-parse-'));
  });

  afterEach(() => {
    rmSync(fixtureDir, { recursive: true, force: true });
  });

  describe('extractBashCalls', () => {
    it('extracts Bash tool_use blocks with command, description, and metadata', () => {
      const jsonlPath = join(fixtureDir, 'session.jsonl');
      writeFileSync(
        jsonlPath,
        toJsonl([
          bashUseRecord('git status', { description: 'Check tree state' }),
          bashUseRecord('pnpm exec nx run ci-server:test'),
        ]),
      );

      const calls = extractBashCalls(jsonlPath, 'parent');
      expect(calls).toHaveLength(2);
      expect(calls[0]).toMatchObject({
        command: 'git status',
        description: 'Check tree state',
        source: 'parent',
        session_id: 'session-1',
        line: 1,
      });
      expect(calls[1].command).toBe('pnpm exec nx run ci-server:test');
      expect(calls[1].line).toBe(2);
    });

    it('skips malformed lines, blank lines, non-Bash tools, and non-object records', () => {
      const jsonlPath = join(fixtureDir, 'session.jsonl');
      const lines = [
        'not json at all {{{',
        '',
        JSON.stringify([1, 2, 3]),
        JSON.stringify({
          timestamp: '2026-07-26T12:00:00.000Z',
          message: {
            content: [
              { type: 'tool_use', name: 'Read', id: 't1', input: {} },
              { type: 'text', text: 'hello' },
            ],
          },
        }),
        JSON.stringify(bashUseRecord('echo hi')),
      ];
      writeFileSync(jsonlPath, lines.join('\n'));

      const calls = extractBashCalls(jsonlPath);
      expect(calls).toHaveLength(1);
      expect(calls[0].command).toBe('echo hi');
      // Line numbers count original file lines including skipped ones
      expect(calls[0].line).toBe(5);
    });

    it('returns an empty array for a missing file', () => {
      expect(extractBashCalls(join(fixtureDir, 'nope.jsonl'))).toEqual([]);
    });
  });

  describe('extractBashCallsFromContent (LS-9362)', () => {
    // extractBashCalls (file path) is a thin wrapper over this; assert the
    // content-based entry point works standalone, with no filesystem access,
    // for the caller-uploads-the-transcript flow (a hosted MCP server process
    // with no shared filesystem with the client at all cannot resolve any
    // path — see findClaudeProjectsDir in session-files.ts).
    it('extracts Bash calls directly from in-memory JSONL text', () => {
      const content = toJsonl([
        bashUseRecord('git status', { description: 'Check tree state' }),
        bashUseRecord('pnpm exec nx run ci-server:test'),
      ]);

      const calls = extractBashCallsFromContent(content, 'parent');
      expect(calls).toHaveLength(2);
      expect(calls[0]).toMatchObject({
        command: 'git status',
        description: 'Check tree state',
        source: 'parent',
        session_id: 'session-1',
        line: 1,
      });
      expect(calls[1].command).toBe('pnpm exec nx run ci-server:test');
    });

    it('produces the same result as extractBashCalls for the same content', () => {
      const jsonlPath = join(fixtureDir, 'session.jsonl');
      const content = toJsonl([
        bashUseRecord('echo hi'),
        bashUseRecord('ls -la'),
      ]);
      writeFileSync(jsonlPath, content);

      expect(extractBashCallsFromContent(content, 'parent')).toEqual(
        extractBashCalls(jsonlPath, 'parent'),
      );
    });
  });

  describe('extractMcpCalls', () => {
    it('returns only non-Bash tool calls whose results overflowed or errored', () => {
      const jsonlPath = join(fixtureDir, 'session.jsonl');
      writeFileSync(
        jsonlPath,
        toJsonl([
          {
            timestamp: '2026-07-26T12:00:00.000Z',
            message: {
              content: [
                {
                  type: 'tool_use',
                  name: 'ci_get_logs',
                  id: 'ok',
                  input: { runId: 1 },
                },
                {
                  type: 'tool_use',
                  name: 'ci_view_run',
                  id: 'ovf',
                  input: { runId: 2 },
                },
                {
                  type: 'tool_use',
                  name: 'jira_view',
                  id: 'err',
                  input: { key: 'LS-1' },
                },
                {
                  type: 'tool_use',
                  name: 'Bash',
                  id: 'bash',
                  input: { command: 'ls' },
                },
              ],
            },
          },
          {
            timestamp: '2026-07-26T12:00:01.000Z',
            message: {
              content: [
                { type: 'tool_result', tool_use_id: 'ok', content: 'all good' },
                {
                  type: 'tool_result',
                  tool_use_id: 'ovf',
                  content: 'result exceeds maximum allowed tokens (25000)',
                },
                {
                  type: 'tool_result',
                  tool_use_id: 'err',
                  is_error: true,
                  content: [{ type: 'text', text: 'Jira API 401' }],
                },
              ],
            },
          },
        ]),
      );

      const issues = extractMcpCalls(jsonlPath, 'parent');
      expect(issues).toHaveLength(2);

      const overflow = issues.find((i) => i.tool_use_id === 'ovf');
      expect(overflow).toMatchObject({
        name: 'ci_view_run',
        is_overflow: true,
        is_error: false,
        error_snippet: '',
      });
      expect(overflow?.overflow_snippet).toContain(
        'exceeds maximum allowed tokens',
      );

      const error = issues.find((i) => i.tool_use_id === 'err');
      expect(error).toMatchObject({
        name: 'jira_view',
        is_overflow: false,
        is_error: true,
        error_snippet: 'Jira API 401',
        overflow_snippet: '',
      });
    });

    it('flags "Output has been saved to" results as overflows', () => {
      const jsonlPath = join(fixtureDir, 'session.jsonl');
      writeFileSync(
        jsonlPath,
        toJsonl([
          {
            timestamp: '2026-07-26T12:00:00.000Z',
            message: {
              content: [
                { type: 'tool_use', name: 'ci_get_logs', id: 'x', input: {} },
                {
                  type: 'tool_result',
                  tool_use_id: 'x',
                  content: 'Output has been saved to /tmp/overflow.txt',
                },
              ],
            },
          },
        ]),
      );

      const issues = extractMcpCalls(jsonlPath);
      expect(issues).toHaveLength(1);
      expect(issues[0].is_overflow).toBe(true);
    });
  });

  describe('extractMcpCallsFromContent (LS-9362)', () => {
    it('produces the same result as extractMcpCalls for the same content', () => {
      const jsonlPath = join(fixtureDir, 'session.jsonl');
      const content = toJsonl([
        {
          timestamp: '2026-07-26T12:00:00.000Z',
          message: {
            content: [
              { type: 'tool_use', name: 'ci_get_logs', id: 'ovf', input: {} },
            ],
          },
        },
        {
          timestamp: '2026-07-26T12:00:01.000Z',
          message: {
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'ovf',
                content: 'result exceeds maximum allowed tokens (25000)',
              },
            ],
          },
        },
      ]);
      writeFileSync(jsonlPath, content);

      expect(extractMcpCallsFromContent(content, 'parent')).toEqual(
        extractMcpCalls(jsonlPath, 'parent'),
      );
      expect(extractMcpCallsFromContent(content, 'parent')).toHaveLength(1);
    });
  });

  describe('extractScratchSubprocessCalls', () => {
    it('finds subprocess/os.system calls in scratch/*.py and masks string literals', () => {
      mkdirSync(join(fixtureDir, 'scratch'));
      writeFileSync(
        join(fixtureDir, 'scratch', 'runner.py'),
        [
          'import subprocess',
          'subprocess.run(["git", "status"])',
          'os.system("rm -rf /tmp/x")',
          'print("no shell here")',
        ].join('\n'),
      );

      const calls = extractScratchSubprocessCalls(fixtureDir);
      expect(calls).toHaveLength(2);
      expect(calls[0]).toMatchObject({
        file: join('scratch', 'runner.py'),
        line: 2,
      });
      // String literals are masked in the preview
      expect(calls[1].command_preview).toBe('os.system("...")');
    });

    it('returns an empty array when scratch/ does not exist', () => {
      expect(extractScratchSubprocessCalls(fixtureDir)).toEqual([]);
    });
  });

  describe('stripCdPrefix', () => {
    it('strips cd-and-chain prefixes with quoted and unquoted paths', () => {
      expect(stripCdPrefix('cd /repo && git status')).toBe('git status');
      expect(stripCdPrefix('cd "/my repo" && make test')).toBe('make test');
      expect(stripCdPrefix("cd '/my repo' ; ls -la")).toBe('ls -la');
      expect(stripCdPrefix('git log')).toBe('git log');
    });
  });

  describe('classifyCommand', () => {
    it('covers exact MCP-covered prefixes', () => {
      expect(classifyCommand('git add -A')).toEqual([
        'covered',
        'worktree-mcp',
      ]);
      expect(classifyCommand('make pc-typecheck')).toEqual([
        'covered',
        'make-mcp',
      ]);
      expect(classifyCommand('gh run view 123')).toEqual(['covered', 'ci-mcp']);
      expect(
        classifyCommand('pnpm --prefix lib/db-client run db:status'),
      ).toEqual(['covered', 'db-mcp']);
    });

    it('enforces the prefix boundary check ("git add" must not match "git address")', () => {
      expect(classifyCommand('git address')).toEqual(['gap', '']);
      expect(classifyCommand('git diff HEAD~1')).toEqual([
        'covered',
        'worktree-mcp',
      ]);
      expect(classifyCommand('git add')).toEqual(['covered', 'worktree-mcp']);
      // Python parity: the boundary check allows '-' after the prefix (for
      // flag-like continuations), so "git diff-index" is covered — matching
      // the Python implementation's actual behavior, not its comment.
      expect(classifyCommand('git diff-index HEAD')).toEqual([
        'covered',
        'worktree-mcp',
      ]);
      expect(classifyCommand('git add--weird')).toEqual([
        'covered',
        'worktree-mcp',
      ]);
    });

    it('classifies after stripping a cd prefix and matches case-insensitively', () => {
      expect(classifyCommand('cd /repo && git commit -m "x"')).toEqual([
        'covered',
        'worktree-mcp',
      ]);
      expect(classifyCommand('GIT STATUS')).toEqual([
        'covered',
        'worktree-mcp',
      ]);
    });

    it('returns gap for uncovered commands', () => {
      expect(classifyCommand('curl https://example.com')).toEqual(['gap', '']);
    });
  });

  describe('commandPattern', () => {
    it('normalises to the first 3 tokens (4 for pnpm exec nx)', () => {
      expect(commandPattern('git log --oneline -5 --graph')).toBe(
        'git log --oneline',
      );
      expect(commandPattern('pnpm exec nx run ci-server:test')).toBe(
        'pnpm exec nx run',
      );
      expect(commandPattern('   ')).toBe('(empty)');
      expect(commandPattern('cd /repo && terraform plan -out x')).toBe(
        'terraform plan -out',
      );
    });

    it('collapses line-range file reads to a canonical pattern regardless of range/path (LS-8778)', () => {
      expect(commandPattern("sed -n '10,50p' foo.txt")).toBe(
        "sed -n '<range>' <file>",
      );
      expect(commandPattern("sed -n '200,250p' bar/baz.ts")).toBe(
        "sed -n '<range>' <file>",
      );
      expect(commandPattern('tail -50 /tmp/task-output-1.txt')).toBe(
        'tail <file>',
      );
      expect(commandPattern('tail -n 20 other-file.log')).toBe('tail <file>');
      expect(commandPattern('wc -l some/deep/path/file.ts')).toBe(
        'wc -l <file>',
      );
      expect(commandPattern("cd /repo && sed -n '1,5p' README.md")).toBe(
        "sed -n '<range>' <file>",
      );
    });
  });

  describe('noise filtering', () => {
    it('keeps the curated noise allowlist intact', () => {
      for (const pattern of ['ls', 'pwd', 'echo', 'wc -l', 'printenv']) {
        expect(NOISE_PATTERNS.has(pattern)).toBe(true);
      }
      expect(NOISE_PATTERNS.has('git status')).toBe(false);
    });

    it('promotes recurring investigative patterns over noise', () => {
      expect(isRecurringInvestigative('grep -r', 'grep -r foo src/')).toBe(
        true,
      );
      expect(isRecurringInvestigative('find .', 'find . -name "*.ts"')).toBe(
        true,
      );
      expect(isRecurringInvestigative('ls', 'ls -la')).toBe(false);
    });
  });

  describe('classifyGapType', () => {
    it('classifies recurring investigative git reads as high-confidence missing-tool', () => {
      const result = classifyGapType(
        'git show origin/main:package.json',
        'git show origin/main:package.json',
      );
      expect(result).toMatchObject({
        gap_type: 'missing-tool',
        confidence: 'high',
        server: 'worktree',
      });
      expect(result.draft_summary).toContain('feat(mcp):');
    });

    it('attaches the consolidation gate to every missing-tool classification (LS-9703)', () => {
      // High-confidence path (RECURRING_INVESTIGATIVE table).
      const recurring = classifyGapType(
        'git show origin/main:package.json',
        'git show origin/main:package.json',
      );
      expect(recurring.gap_type).toBe('missing-tool');
      expect(recurring.consolidation_gate).toContain('REQUIRED before filing');
      expect(recurring.consolidation_gate).toContain('`action` value');

      // Low-confidence generic fallback path — the one that produced most of
      // the historical missing-tool backlog, so it must carry the gate too.
      const fallback = classifyGapType(
        'some-unknown-binary --flag',
        'some-unknown-binary',
      );
      expect(fallback.gap_type).toBe('missing-tool');
      expect(fallback.confidence).toBe('low');
      expect(fallback.consolidation_gate).toContain('REQUIRED before filing');
    });

    it('omits the consolidation gate on non-missing-tool classifications', () => {
      const awareness = classifyGapType('grep -r "foo" src/', 'grep -r "foo"');
      expect(awareness.gap_type).toBe('missing-awareness');
      expect(awareness.consolidation_gate).toBeUndefined();

      const feature = classifyGapType('gh workflow list', 'gh workflow list');
      expect(feature.gap_type).toBe('missing-feature');
      expect(feature.consolidation_gate).toBeUndefined();
    });

    it('classifies grep usage as high-confidence missing-awareness with a docs draft', () => {
      const result = classifyGapType('grep -r "foo" src/', 'grep -r "foo"');
      expect(result).toMatchObject({
        gap_type: 'missing-awareness',
        confidence: 'high',
        server: 'n/a',
      });
      expect(result.draft_summary).toBe(
        'docs(skills): guide agents to use Grep instead of `grep -r "foo"`',
      );
    });

    it('classifies uncovered gh subcommands as medium-confidence missing-feature', () => {
      const result = classifyGapType('gh workflow list', 'gh workflow list');
      expect(result).toMatchObject({
        gap_type: 'missing-feature',
        confidence: 'medium',
        server: 'legacy-sports-github or legacy-sports-ci',
        draft_summary: 'feat(mcp): add support for `gh workflow list`',
      });
    });

    it('classifies line-range file reads as high-confidence missing-awareness pointing at Read (LS-8778)', () => {
      const sedResult = classifyGapType(
        "sed -n '10,50p' foo.txt",
        "sed -n '<range>' <file>",
      );
      expect(sedResult).toMatchObject({
        gap_type: 'missing-awareness',
        confidence: 'high',
        server: 'n/a',
      });
      expect(sedResult.draft_summary).toBe(
        "docs(skills): guide agents to use Read (with offset/limit) instead of `sed -n '<range>' <file>`",
      );

      const tailResult = classifyGapType('tail -50 output.txt', 'tail <file>');
      expect(tailResult).toMatchObject({
        gap_type: 'missing-awareness',
        confidence: 'high',
      });
      expect(tailResult.draft_summary).toContain('Read (with offset/limit)');

      const wcResult = classifyGapType('wc -l foo.txt', 'wc -l <file>');
      expect(wcResult).toMatchObject({
        gap_type: 'missing-awareness',
        confidence: 'high',
      });
      expect(wcResult.draft_summary).toContain('Read (with offset/limit)');
    });

    it('falls back to low-confidence missing-tool for uncategorized commands', () => {
      const result = classifyGapType(
        'curl -s https://example.com',
        'curl -s https://example.com',
      );
      expect(result).toMatchObject({
        gap_type: 'missing-tool',
        confidence: 'low',
        server: 'unknown',
        draft_summary:
          'feat(mcp): investigate MCP coverage for `curl -s https://example.com`',
      });
    });
  });

  describe('formatGapsOnly', () => {
    it('renders a frequency table separating gaps from covered patterns', () => {
      const calls = [
        synthBashCall('git status'),
        synthBashCall('git status --short'),
        synthBashCall('curl -s https://example.com'),
      ];

      const output = formatGapsOnly(calls, 'session-1');
      expect(output).toContain('Session: session-1');
      expect(output).toContain(
        'Total Bash commands: 3  |  Unique patterns: 3  |  Gap patterns: 1',
      );
      expect(output).toContain('=== Potential MCP gaps (1 patterns) ===');
      expect(output).toContain('=== MCP-covered (2 patterns) ===');
      expect(output).toContain('[worktree-mcp]');
      expect(output).toMatch(/ {2} {2}1x {2}curl -s https:\/\/example\.com/);
    });

    it('appends a scratch section only when scratch scanning ran', () => {
      const withScratch = formatGapsOnly([], 'session-1', [
        { file: 'scratch/x.py', line: 3, command_preview: 'os.system("...")' },
      ]);
      expect(withScratch).toContain(
        '=== scratch/*.py subprocess calls (1) ===',
      );
      expect(withScratch).toContain('scratch/x.py:3');

      const withoutScratch = formatGapsOnly([], 'session-1', null);
      expect(withoutScratch).not.toContain('scratch/*.py');
    });
  });

  describe('formatAudit', () => {
    it('produces the structured report with noise filtered and gaps split by confidence', () => {
      const calls = [
        synthBashCall('ls -la'),
        synthBashCall('ls -la'),
        synthBashCall('grep -r "foo" src/'),
        synthBashCall('gh workflow list'),
        synthBashCall('git status'),
      ];

      const report = JSON.parse(formatAudit(calls, [], 'session-1')) as {
        session_id: string;
        summary: Record<string, number>;
        action_required: {
          gaps_to_review: Array<Record<string, unknown>>;
          gaps_auto_classified: Array<Record<string, unknown>>;
          overflows: unknown[];
          failures: unknown[];
        };
        informational: {
          noise_filtered: Array<Record<string, unknown>>;
          covered_commands: Array<Record<string, unknown>>;
        };
        instructions: string;
      };

      expect(report.session_id).toBe('session-1');
      expect(report.summary).toEqual({
        total_bash_commands: 5,
        unique_patterns: 4,
        gaps_found: 2,
        noise_filtered: 1,
        covered_patterns: 1,
        mcp_overflows: 0,
        mcp_failures: 0,
      });
      // grep -r is high confidence (auto-classified); gh workflow is medium (to review)
      expect(report.action_required.gaps_auto_classified).toHaveLength(1);
      expect(report.action_required.gaps_auto_classified[0]).toMatchObject({
        gap_type: 'missing-awareness',
        confidence: 'high',
      });
      expect(report.action_required.gaps_to_review).toHaveLength(1);
      expect(report.action_required.gaps_to_review[0]).toMatchObject({
        pattern: 'gh workflow list',
        confidence: 'medium',
      });
      expect(report.informational.noise_filtered[0]).toMatchObject({
        pattern: 'ls -la',
        count: 2,
        reason: 'known noise pattern',
      });
      expect(report.informational.covered_commands[0]).toMatchObject({
        pattern: 'git status',
        mcp_tool: 'worktree-mcp',
      });
      expect(report.instructions).toContain(
        "Review 'action_required' section.",
      );
    });

    it('summarizes overflow and failure params with truncation', () => {
      const report = JSON.parse(
        formatAudit(
          [],
          [
            {
              name: 'ci_get_logs',
              input: { runId: 42, verbose: true, note: 'x'.repeat(60) },
              timestamp: '',
              source: 'parent',
              tool_use_id: 't1',
              line: 1,
              is_overflow: true,
              is_error: false,
              error_snippet: '',
              overflow_snippet: 'exceeds maximum allowed tokens',
            },
            {
              name: 'jira_view',
              input: {},
              timestamp: '',
              source: 'parent',
              tool_use_id: 't2',
              line: 2,
              is_overflow: false,
              is_error: true,
              error_snippet: '401 unauthorized',
              overflow_snippet: '',
            },
          ],
          'session-1',
        ),
      ) as {
        action_required: {
          overflows: Array<Record<string, string>>;
          failures: Array<Record<string, string>>;
        };
      };

      expect(report.action_required.overflows).toHaveLength(1);
      const params = report.action_required.overflows[0].params;
      expect(params).toContain('runId=42');
      expect(params).toContain('verbose=True');
      expect(params).toContain(`note=${'x'.repeat(37)}...`);
      expect(report.action_required.failures).toHaveLength(1);
      expect(report.action_required.failures[0].params).toBe('(none)');
      expect(report.action_required.failures[0].error).toBe('401 unauthorized');
    });

    it('collapses repeated line-range reads into one auto-classified gap instead of one per invocation (LS-8778)', () => {
      const calls = [
        synthBashCall("sed -n '10,50p' foo.txt"),
        synthBashCall("sed -n '60,90p' bar.txt"),
        synthBashCall("sed -n '1,5p' baz/qux.ts"),
        synthBashCall('tail -50 /tmp/task-1.txt'),
        synthBashCall('tail -20 /tmp/task-2.txt'),
        synthBashCall('wc -l foo.txt'),
      ];

      const report = JSON.parse(formatAudit(calls, [], 'session-1')) as {
        summary: Record<string, number>;
        action_required: {
          gaps_to_review: Array<Record<string, unknown>>;
          gaps_auto_classified: Array<Record<string, unknown>>;
        };
      };

      // 6 invocations collapse to 3 unique patterns (sed / tail / wc), not 6.
      expect(report.summary.unique_patterns).toBe(3);
      expect(report.summary.gaps_found).toBe(3);
      expect(report.action_required.gaps_to_review).toHaveLength(0);
      expect(report.action_required.gaps_auto_classified).toHaveLength(3);
      const sedGap = report.action_required.gaps_auto_classified.find(
        (g) => g['pattern'] === "sed -n '<range>' <file>",
      );
      expect(sedGap).toMatchObject({ count: 3, confidence: 'high' });
    });

    it('soft-caps gaps_to_review at 30 patterns and notes the overflow (LS-8778)', () => {
      const calls = Array.from({ length: 40 }, (_, i) =>
        synthBashCall(`curl -s https://example.com/endpoint-${i}`),
      );

      const report = JSON.parse(formatAudit(calls, [], 'session-1')) as {
        summary: Record<string, number>;
        action_required: {
          gaps_to_review: unknown[];
          gaps_to_review_overflow?: { omitted: number; note: string };
        };
      };

      expect(report.summary.gaps_found).toBe(40);
      expect(report.action_required.gaps_to_review).toHaveLength(30);
      expect(report.action_required.gaps_to_review_overflow).toMatchObject({
        omitted: 10,
      });
      expect(report.action_required.gaps_to_review_overflow?.note).toContain(
        'gapsOnly:true',
      );
    });
  });

  describe('findSessionByPid', () => {
    let savedHome: string | undefined;

    beforeEach(() => {
      savedHome = process.env['HOME'];
    });

    afterEach(() => {
      if (savedHome === undefined) {
        delete process.env['HOME'];
      } else {
        process.env['HOME'] = savedHome;
      }
    });

    it('resolves ~/.claude/sessions/{pid}.json from $HOME, not just os.homedir() (LS-8687)', () => {
      // Mirrors the LS-8867 fix in findClaudeProjectsDir: a hosted/CCR server
      // process can carry a stale $HOME baked into its launch environment
      // (os.homedir() reading /home/sbx_user1051-shaped defaults) while the
      // real session lives under a different $HOME. findSessionByPid must
      // prefer $HOME the same way, or the two resolution paths diverge.
      process.env['HOME'] = fixtureDir;
      const sessionsDir = join(fixtureDir, '.claude', 'sessions');
      mkdirSync(sessionsDir, { recursive: true });
      writeFileSync(
        join(sessionsDir, '4242.json'),
        JSON.stringify({ sessionId: 'session-abc-123' }),
      );

      expect(findSessionByPid(4242)).toBe('session-abc-123');
    });

    it('returns null when no PID file exists under the resolved home', () => {
      process.env['HOME'] = fixtureDir;
      expect(findSessionByPid(99999)).toBeNull();
    });
  });
});
