/**
 * Node-native port of the parsing/classification/formatting logic that
 * previously lived in scripts/audit-session-bash.py (LS-8316).
 *
 * Ported 1:1 so the ci_audit_session_bash MCP tool needs no Python
 * interpreter: extraction (extractBashCalls / extractMcpCalls /
 * extractScratchSubprocessCalls), gap classification (classifyCommand /
 * commandPattern / classifyGapType and the noise filters), and the three
 * output formatters (formatText / formatAudit / formatGapsOnly) all match
 * the Python implementation's behavior — including prefix-table contents,
 * boundary-check semantics, tie-breaking by insertion order, and the exact
 * report string shapes. Output object keys stay snake_case for parity with
 * the Python JSON output consumed by the mcp-gap-audit skill.
 *
 * JSONL discovery lives in ../session-files.ts (the pre-existing TS half).
 */

import { minifiedJson } from '@legacy-sports/mcp-format';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** One Bash tool_use call extracted from a session transcript. */
export interface BashCall {
  command: string;
  description: string;
  timestamp: string;
  source: string;
  session_id: string;
  tool_use_id: string;
  line: number;
}

/** One non-Bash tool call that overflowed or errored. */
export interface McpIssue {
  name: string;
  input: Record<string, unknown>;
  timestamp: string;
  source: string;
  tool_use_id: string;
  line: number;
  is_overflow: boolean;
  is_error: boolean;
  error_snippet: string;
  overflow_snippet: string;
}

/** One subprocess/os.system call found in scratch/*.py. */
export interface ScratchCall {
  file: string;
  line: number;
  command_preview: string;
}

interface JsonRecord {
  [key: string]: unknown;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * Parse raw JSONL text into records, skipping blank and malformed lines
 * (tolerant parse, mirroring the Python json.JSONDecodeError skip).
 * Line numbers are 1-based positions in the original text.
 */
function parseJsonlContent(
  raw: string,
): Array<{ record: JsonRecord; lineNum: number }> {
  const out: Array<{ record: JsonRecord; lineNum: number }> = [];
  const lines = raw.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isRecord(parsed)) continue;
    out.push({ record: parsed, lineNum: i + 1 });
  }
  return out;
}

/** Extract the content blocks of a transcript record, or null when absent. */
function contentBlocks(record: JsonRecord): unknown[] | null {
  const msg = record['message'];
  if (!isRecord(msg)) return null;
  const content = msg['content'];
  if (!Array.isArray(content)) return null;
  return content as unknown[];
}

/**
 * Extract Bash tool_use calls from already-loaded JSONL text.
 *
 * This is the path-agnostic core of extractBashCalls, split out so a caller
 * that already has the transcript content in hand (e.g. a client-supplied
 * `transcriptContent` param, uploaded because the MCP server process cannot
 * see the client's local `~/.claude/projects/` at all — see
 * findClaudeProjectsDir in session-files.ts) can skip filesystem resolution
 * entirely (LS-9362).
 */
export function extractBashCallsFromContent(
  rawContent: string,
  source = 'parent',
): BashCall[] {
  const results: BashCall[] = [];

  for (const { record, lineNum } of parseJsonlContent(rawContent)) {
    const blocks = contentBlocks(record);
    if (!blocks) continue;

    const timestamp = asString(record['timestamp']);
    const sessionId = asString(record['sessionId']);

    for (const block of blocks) {
      if (!isRecord(block)) continue;
      if (block['type'] !== 'tool_use') continue;
      if (block['name'] !== 'Bash') continue;

      const inp = isRecord(block['input']) ? block['input'] : {};
      results.push({
        command: asString(inp['command']),
        description: asString(inp['description']),
        timestamp,
        source,
        session_id: sessionId,
        tool_use_id: asString(block['id']),
        line: lineNum,
      });
    }
  }

  return results;
}

/** Extract Bash tool_use calls from a JSONL file on disk. */
export function extractBashCalls(
  jsonlPath: string,
  source = 'parent',
): BashCall[] {
  if (!existsSync(jsonlPath)) return [];
  let raw: string;
  try {
    raw = readFileSync(jsonlPath, 'utf8');
  } catch {
    return [];
  }
  return extractBashCallsFromContent(raw, source);
}

/**
 * Marker text from the harness's "Auto Mode Active" system-reminder (see
 * AGENTS.md § Tool Usage / .agents/skills/mcp-first/SKILL.md — LS-9755).
 * When this directive is present in a transcript, the session was told to
 * bias toward Bash for plain file read/search operations, so `find`/`grep`/
 * `sed -n`/`tail`/`wc -l` calls are sanctioned behavior for that session,
 * not a tool-awareness gap. Matched as plain substring — the reminder text
 * is stable harness boilerplate, not user-authored content that would need
 * fuzzy matching.
 */
const AUTO_MODE_MARKER = 'Auto Mode Active';

/**
 * Scan already-loaded JSONL text for the auto-mode directive. Checks every
 * text-bearing content block (system-reminders arrive as ordinary `text`
 * blocks in the transcript), not just top-level message text, so the
 * marker is found regardless of which turn introduced it.
 */
export function detectAutoModeFromContent(rawContent: string): boolean {
  for (const { record } of parseJsonlContent(rawContent)) {
    const blocks = contentBlocks(record);
    if (!blocks) continue;
    for (const block of blocks) {
      if (!isRecord(block)) continue;
      if (asString(block['text']).includes(AUTO_MODE_MARKER)) return true;
    }
  }
  return false;
}

/** Detect the auto-mode directive in a JSONL file on disk. */
export function detectAutoMode(jsonlPath: string): boolean {
  if (!existsSync(jsonlPath)) return false;
  let raw: string;
  try {
    raw = readFileSync(jsonlPath, 'utf8');
  } catch {
    return false;
  }
  return detectAutoModeFromContent(raw);
}

/**
 * Extract non-Bash tool_use calls that resulted in overflows or errors from
 * already-loaded JSONL text. Calls are matched to their tool_result by
 * tool_use_id; only calls whose result overflowed or errored are returned,
 * in first-seen order. Path-agnostic core of extractMcpCalls — see
 * extractBashCallsFromContent for why this split exists (LS-9362).
 */
export function extractMcpCallsFromContent(
  rawContent: string,
  source = 'parent',
): McpIssue[] {
  const results: McpIssue[] = [];

  const toolCalls = new Map<
    string,
    Omit<
      McpIssue,
      'is_overflow' | 'is_error' | 'error_snippet' | 'overflow_snippet'
    >
  >();
  const toolResults = new Map<string, { text: string; is_error: boolean }>();

  for (const { record, lineNum } of parseJsonlContent(rawContent)) {
    const blocks = contentBlocks(record);
    if (!blocks) continue;

    const timestamp = asString(record['timestamp']);

    for (const block of blocks) {
      if (!isRecord(block)) continue;

      if (block['type'] === 'tool_use' && block['name'] !== 'Bash') {
        const toolId = asString(block['id']);
        if (!toolId) continue;
        toolCalls.set(toolId, {
          name: asString(block['name']),
          input: isRecord(block['input']) ? block['input'] : {},
          timestamp,
          source,
          tool_use_id: toolId,
          line: lineNum,
        });
      }

      if (block['type'] === 'tool_result') {
        const toolId = asString(block['tool_use_id']);
        let text = '';
        const resultContent = block['content'];
        if (typeof resultContent === 'string') {
          text = resultContent;
        } else if (Array.isArray(resultContent)) {
          text = resultContent
            .map((b) => (isRecord(b) ? asString(b['text']) : ''))
            .join(' ');
        }
        toolResults.set(toolId, {
          text: text.slice(0, 500), // Truncate for summary
          is_error: block['is_error'] === true,
        });
      }
    }
  }

  // Match calls with results, flag overflows and errors
  for (const [toolId, call] of toolCalls) {
    const result = toolResults.get(toolId);
    const text = result?.text ?? '';
    const isError = result?.is_error ?? false;

    const isOverflow =
      text.includes('exceeds maximum allowed tokens') ||
      text.includes('Output has been saved to');

    if (isOverflow || isError) {
      results.push({
        ...call,
        is_overflow: isOverflow,
        is_error: isError,
        error_snippet: isError ? text.slice(0, 200) : '',
        overflow_snippet: isOverflow ? text.slice(0, 200) : '',
      });
    }
  }

  return results;
}

/** Extract non-Bash tool_use overflows/failures from a JSONL file on disk. */
export function extractMcpCalls(
  jsonlPath: string,
  source = 'parent',
): McpIssue[] {
  if (!existsSync(jsonlPath)) return [];
  let raw: string;
  try {
    raw = readFileSync(jsonlPath, 'utf8');
  } catch {
    return [];
  }
  return extractMcpCallsFromContent(raw, source);
}

const SUBPROCESS_RE =
  /subprocess\.(run|Popen|call|check_output|check_call)\s*\(|os\.system\s*\(/;

/** Scan scratch/*.py files for subprocess/os.system calls. */
export function extractScratchSubprocessCalls(repoRoot: string): ScratchCall[] {
  const scratchDir = join(repoRoot, 'scratch');
  let scratchStat;
  try {
    scratchStat = statSync(scratchDir);
  } catch {
    return [];
  }
  if (!scratchStat.isDirectory()) return [];

  const results: ScratchCall[] = [];
  const pyFiles = readdirSync(scratchDir)
    .filter((f) => f.endsWith('.py'))
    .sort();

  for (const pyFile of pyFiles) {
    let content: string;
    try {
      content = readFileSync(join(scratchDir, pyFile), 'utf8');
    } catch {
      continue;
    }
    const lines = content.split(/\r\n|\r|\n/);
    for (let i = 0; i < lines.length; i++) {
      if (SUBPROCESS_RE.test(lines[i])) {
        results.push({
          file: join('scratch', pyFile),
          line: i + 1,
          command_preview: lines[i]
            .trim()
            .replace(/(["']).*?\1/g, '$1...$1')
            .slice(0, 100),
        });
      }
    }
  }
  return results;
}

/**
 * Command prefixes whose functionality is covered by an MCP tool.
 * Format: [prefix_to_match, mcp_tool_name]
 */
export const MCP_COVERED_PREFIXES: ReadonlyArray<readonly [string, string]> = [
  // worktree MCP server
  ['git -c ', 'worktree-mcp'],
  ['git -C ', 'worktree-mcp'],
  ['git --git-dir', 'worktree-mcp'],
  ['git add', 'worktree-mcp'],
  ['git commit', 'worktree-mcp'],
  ['git push', 'worktree-mcp'],
  ['git fetch', 'worktree-mcp'],
  ['git rebase', 'worktree-mcp'],
  ['git status', 'worktree-mcp'],
  ['git log', 'worktree-mcp'],
  ['git diff', 'worktree-mcp'],
  ['git branch', 'worktree-mcp'],
  ['git show', 'worktree-mcp'],
  ['git rev-parse', 'worktree-mcp'],
  ['git merge-base', 'worktree-mcp'],
  ['git stash', 'worktree-mcp'],
  ['git checkout', 'worktree-mcp'],
  ['git worktree', 'worktree-mcp'],
  ['twig ', 'worktree-mcp'],
  // make MCP server
  ['make ', 'make-mcp'],
  // nx MCP server
  ['pnpm exec nx ', 'nx-mcp'],
  ['npx nx ', 'nx-mcp'],
  // github MCP server
  ['gh pr ', 'github-mcp'],
  ['gh api ', 'github-mcp'],
  ['gh run ', 'ci-mcp'],
  ['gh issue ', 'github-mcp'],
  // db MCP server
  ['pnpm --prefix lib/db-client run db:', 'db-mcp'],
];

/** Strip leading 'cd <dir> &&' (or ';') prefix to get the actual command. */
export function stripCdPrefix(cmd: string): string {
  const stripped = cmd.trim();
  // Match: cd <path> && <actual command> or cd <path> ; <actual command>
  // Supports quoted paths (single/double) and unquoted paths.
  const m = /^cd\s+(?:"[^"]*"|'[^']*'|\S+)\s*(?:&&|;)\s*(.*)/.exec(stripped);
  if (m) {
    return m[1].trim();
  }
  return stripped;
}

/**
 * Maps each `MCP_COVERED_PREFIXES` tool label to a pattern matching that
 * server's actual tool names as they appear in a session's tool roster
 * (either the hosted-connector form `mcp__<server>__<tool>` or the bare
 * `<prefix>_...` name most skills call it by). Used to verify a "covered"
 * classification against the session's real roster (LS-9749) — without this,
 * `gh pr *` is classified `covered` by `github-mcp` even in a session where
 * the `legacy-sports-github` MCP server never appeared in the tool list,
 * silently masking exactly that gap from future audits.
 */
const MCP_TOOL_ROSTER_PATTERNS: Readonly<Record<string, RegExp>> = {
  'worktree-mcp': /^(mcp__worktree__|worktree_)/,
  'make-mcp': /^(mcp__legacy-sports-make__|make_)/,
  'nx-mcp': /^(mcp__legacy-sports-nx__|nx_)/,
  'github-mcp': /^(mcp__legacy-sports-github__|github_)/,
  'ci-mcp': /^(mcp__legacy-sports-ci-local__|ci_)/,
  'db-mcp': /^(mcp__legacy-sports-db__|db_)/,
};

/**
 * Whether `tool`'s MCP server was actually present in the session's tool
 * roster. Returns `true` when `sessionToolNames` is not supplied (unknown —
 * preserves prior "assume covered" behavior for callers that don't pass it)
 * so this is opt-in, not a breaking change in classification.
 */
function toolAvailableInRoster(
  tool: string,
  sessionToolNames: readonly string[] | undefined,
): boolean {
  if (sessionToolNames === undefined) return true;
  const pattern = MCP_TOOL_ROSTER_PATTERNS[tool];
  if (!pattern) return true; // unknown label — nothing to cross-check against
  return sessionToolNames.some((name) => pattern.test(name));
}

/**
 * Return `['covered', tool_name]` or `['gap', '']` — or, when `tool_name`'s
 * MCP server is confirmed absent from `sessionToolNames`, `['gap',
 * tool_name]` so the gap is surfaced for review instead of silently
 * classified away (LS-9749). Passing `sessionToolNames` is optional; omitting
 * it preserves the pre-LS-9749 behavior of trusting the static prefix table
 * unconditionally.
 */
export function classifyCommand(
  cmd: string,
  sessionToolNames?: readonly string[],
): readonly [string, string] {
  const stripped = stripCdPrefix(cmd.trim());
  const lowered = stripped.toLowerCase();
  for (const [prefix, tool] of MCP_COVERED_PREFIXES) {
    for (const [candidate, p] of [
      [stripped, prefix],
      [lowered, prefix.toLowerCase()],
    ] as const) {
      if (candidate.startsWith(p)) {
        // Boundary check: the character immediately after the prefix must be
        // a space, a '-', or end-of-string. This prevents "git add" from
        // matching "git address", but deliberately still lets '-'-joined
        // continuations match (e.g. "git diff-index" is covered via the
        // "git diff" prefix) — parity with the Python implementation's
        // actual behavior. Prefixes that already end with a non-word
        // character (space, '-', ':', '/') are exempt from the extra check.
        const after = candidate.slice(p.length);
        if (
          [' ', '-', ':', '/'].includes(p[p.length - 1]) ||
          !after ||
          after[0] === ' ' ||
          after[0] === '-'
        ) {
          if (!toolAvailableInRoster(tool, sessionToolNames)) {
            // The prefix matches, but the tool that's supposed to cover it
            // was not in this session's roster — this is a real gap, not
            // noise. Keep `tool` in the tuple so callers can explain *why*
            // it looked covered.
            return ['gap', tool];
          }
          return ['covered', tool];
        }
      }
    }
  }
  return ['gap', ''];
}

/**
 * Line-range file reads (sed -n 'A,Bp' <file>, tail -N <file>, wc -l <file>)
 * differ only in the range/count and file path they carry, so grouping by
 * first-3-token pattern (below) fragments them into one gap row per
 * invocation instead of one per command family. Detect these up front and
 * collapse them to a single canonical pattern regardless of the specific
 * range or path (LS-8778).
 */
const LINE_RANGE_READ_PATTERNS: ReadonlyArray<{ re: RegExp; pattern: string }> =
  [
    { re: /^sed\s+-n\s+/i, pattern: "sed -n '<range>' <file>" },
    { re: /^tail\s+/i, pattern: 'tail <file>' },
    { re: /^wc\s+-l\s+/i, pattern: 'wc -l <file>' },
  ];

function lineRangeReadPattern(actual: string): string | null {
  for (const { re, pattern } of LINE_RANGE_READ_PATTERNS) {
    if (re.test(actual)) return pattern;
  }
  return null;
}

/** Normalise a command to a short scannable pattern (first 3 tokens max). */
export function commandPattern(cmd: string): string {
  const actual = stripCdPrefix(cmd);
  const lineRangePattern = lineRangeReadPattern(actual);
  if (lineRangePattern) return lineRangePattern;
  const parts = actual.split(/\s+/).filter((t) => t.length > 0);
  if (parts.length === 0) return '(empty)';
  // For pnpm exec nx keep 4 tokens (pnpm exec nx <target>)
  if (
    parts.length > 3 &&
    parts[0] === 'pnpm' &&
    parts[1] === 'exec' &&
    parts[2] === 'nx'
  ) {
    return parts.slice(0, 4).join(' ');
  }
  return parts.slice(0, 3).join(' ');
}

/**
 * Patterns that are almost always one-off investigative commands (noise).
 * Matched against the normalized command pattern (first 3 tokens).
 */
export const NOISE_PATTERNS: ReadonlySet<string> = new Set([
  'ls',
  'ls -la',
  'ls -l',
  'ls -1',
  'dir',
  'pwd',
  'echo',
  'cat',
  'head',
  'tail',
  'wc -l',
  'type',
  'which',
  'where',
  'whoami',
  'hostname',
  'date',
  'env',
  'set',
  'printenv',
]);

interface RecurringInfo {
  gap_type: string;
  server: string;
  reason: string;
  /** Tool name to cite in the missing-awareness draft summary (e.g. "Glob", "Read"). */
  toolHint?: string;
}

/**
 * Patterns that look investigative but are actually recurring workflow gaps.
 * These should NOT be filtered as noise.
 */
export const RECURRING_INVESTIGATIVE: ReadonlyArray<
  readonly [string, RecurringInfo]
> = [
  [
    'git show origin',
    {
      gap_type: 'missing-tool',
      server: 'worktree',
      reason: 'Remote ref:path reads have no MCP equivalent',
    },
  ],
  [
    'git ls-tree',
    {
      gap_type: 'missing-tool',
      server: 'worktree',
      reason: 'Listing files on remote branches has no MCP equivalent',
    },
  ],
  [
    'find .',
    {
      gap_type: 'missing-awareness',
      server: 'n/a',
      reason: 'Should use Glob tool instead of find',
      toolHint: 'Glob',
    },
  ],
  [
    'find $wt',
    {
      gap_type: 'missing-awareness',
      server: 'n/a',
      reason: 'Should use Glob tool instead of find',
      toolHint: 'Glob',
    },
  ],
  [
    'grep -r',
    {
      gap_type: 'missing-awareness',
      server: 'n/a',
      reason: 'Should use Grep tool instead of grep',
      toolHint: 'Grep',
    },
  ],
  [
    'grep -rl',
    {
      gap_type: 'missing-awareness',
      server: 'n/a',
      reason: 'Should use Grep tool instead of grep',
      toolHint: 'Grep',
    },
  ],
  [
    "sed -n '<range>' <file>",
    {
      gap_type: 'missing-awareness',
      server: 'n/a',
      reason:
        'Line-range file reads should use the Read tool with offset/limit instead of sed -n',
      toolHint: 'Read (with offset/limit)',
    },
  ],
  [
    'tail <file>',
    {
      gap_type: 'missing-awareness',
      server: 'n/a',
      reason:
        'Line-range file reads should use the Read tool with offset/limit instead of tail',
      toolHint: 'Read (with offset/limit)',
    },
  ],
  [
    'wc -l <file>',
    {
      gap_type: 'missing-awareness',
      server: 'n/a',
      reason:
        'Line-count checks should use the Read tool with offset/limit instead of wc -l',
      toolHint: 'Read (with offset/limit)',
    },
  ],
];

/** Find the RecurringInfo for a pattern/sample pair, or null if none matches. */
export function matchRecurringInfo(
  pattern: string,
  sample: string,
): RecurringInfo | null {
  const stripped = stripCdPrefix(sample.trim());
  for (const [recPat, info] of RECURRING_INVESTIGATIVE) {
    if (pattern.startsWith(recPat) || stripped.startsWith(recPat)) {
      return info;
    }
  }
  return null;
}

/** Check if a pattern matches any recurring investigative prefix. */
export function isRecurringInvestigative(
  pattern: string,
  sample: string,
): boolean {
  return matchRecurringInfo(pattern, sample) !== null;
}

/**
 * Recurring-investigative entries whose gap_type is `missing-awareness` are
 * exactly the plain file-read/search class (find/grep/sed -n/tail/wc -l)
 * that AGENTS.md's auto-mode carve-out (LS-9755) sanctions Bash for. Other
 * missing-awareness gaps outside this curated list are unaffected.
 */
function isFileReadGrepClassAwarenessGap(info: RecurringInfo): boolean {
  return info.gap_type === 'missing-awareness';
}

/** Gap type to Jira summary prefix mapping. */
const SUMMARY_PREFIX: Readonly<Record<string, string>> = {
  'missing-tool': 'feat(mcp):',
  'missing-feature': 'feat(mcp):',
  // Consolidating a duplicate tool into an existing one and deregistering the
  // superseded tool is a refactor, not a feature (LS-9703).
  'redundant-tool': 'refactor(mcp):',
  'missing-awareness': 'docs(skills):',
};

export interface GapClassification {
  gap_type: string;
  confidence: string;
  server: string;
  reason: string;
  draft_summary: string;
  /**
   * Set on `missing-tool` gaps only. This classifier decides gap_type by
   * whether ANY MCP tool already covers the command — it cannot tell whether an
   * EXISTING tool could absorb the capability as an `action` value or optional
   * param, which is the cheaper fix. That judgment needs the target server's
   * tool inventory, which is not readable here: this module also runs in the
   * hosted Lambda deployment, where the repo (and `docs/mcp/api-reference.json`)
   * is absent. So the report flags the gate instead of applying it, and the
   * reviewing agent answers it against the api-reference. See LS-9703 and
   * `.agents/skills/mcp-first/references/audit-workflow.md` step 3a.
   */
  consolidation_gate?: string;
}

/**
 * The gate prompt attached to every `missing-tool` classification. Filing a new
 * tool re-pays name + description + full input schema (~349 tokens on average,
 * schemas costing roughly 2x descriptions); an `action` value on an existing
 * tool reuses all of it.
 */
const CONSOLIDATION_GATE_PROMPT =
  'REQUIRED before filing: could this be an `action` value or optional param on an ' +
  'existing tool in the same server? Check siblings in docs/mcp/api-reference.html. ' +
  'If yes, reclassify as `missing-feature` and name the tool to extend. If no, record ' +
  'which tools you considered and why the schemas are incompatible. ' +
  'See .agents/skills/mcp-first/references/audit-workflow.md step 3a.';

/**
 * Classify a gap command into a gap type with confidence and draft ticket info.
 *
 * Attaches `consolidation_gate` to `missing-tool` results so the gate travels
 * with the report rather than depending on the reviewing agent remembering it.
 */
export function classifyGapType(
  cmd: string,
  pattern: string,
): GapClassification {
  const classification = classifyGapTypeInner(cmd, pattern);
  return classification.gap_type === 'missing-tool'
    ? { ...classification, consolidation_gate: CONSOLIDATION_GATE_PROMPT }
    : classification;
}

function classifyGapTypeInner(cmd: string, pattern: string): GapClassification {
  const stripped = stripCdPrefix(cmd.trim());

  // Check recurring investigative patterns first (high confidence)
  for (const [recPat, info] of RECURRING_INVESTIGATIVE) {
    if (pattern.startsWith(recPat) || stripped.startsWith(recPat)) {
      const prefix = SUMMARY_PREFIX[info.gap_type] ?? 'feat(mcp):';
      let draft: string;
      if (info.gap_type === 'missing-awareness') {
        const toolName = info.toolHint ?? 'Grep';
        draft = `${prefix} guide agents to use ${toolName} instead of \`${pattern}\``;
      } else {
        draft = `${prefix} add \`${pattern.replace(/ /g, '_')}\` support to ${info.server}`;
      }
      return {
        gap_type: info.gap_type,
        confidence: 'high',
        server: info.server,
        reason: info.reason,
        draft_summary: draft,
      };
    }
  }

  // Heuristic classification based on command structure
  // Commands that invoke tools we have MCP servers for but with uncovered subcommands
  if (stripped.startsWith('gh ')) {
    return {
      gap_type: 'missing-feature',
      confidence: 'medium',
      server: 'legacy-sports-github or legacy-sports-ci',
      reason: `gh subcommand not covered by MCP: \`${pattern}\``,
      draft_summary: `feat(mcp): add support for \`${pattern}\``,
    };
  }

  if (stripped.startsWith('pnpm ') && !stripped.includes('nx')) {
    return {
      gap_type: 'missing-tool',
      confidence: 'medium',
      server: 'legacy-sports-make or legacy-sports-nx',
      reason: `pnpm command not covered by MCP: \`${pattern}\``,
      draft_summary: `feat(mcp): add support for \`${pattern}\``,
    };
  }

  if (stripped.startsWith('terraform ')) {
    return {
      gap_type: 'missing-tool',
      confidence: 'medium',
      server: 'legacy-sports-aws',
      reason: `Terraform command not covered by MCP: \`${pattern}\``,
      draft_summary: 'feat(mcp): add `terraform` support to aws MCP server',
    };
  }

  if (stripped.startsWith('docker ')) {
    return {
      gap_type: 'missing-tool',
      confidence: 'low',
      server: 'new server or legacy-sports-ci',
      reason: `Docker command not covered by MCP: \`${pattern}\``,
      draft_summary: 'feat(mcp): add `docker` support',
    };
  }

  // Generic fallback — low confidence, needs human review
  return {
    gap_type: 'missing-tool',
    confidence: 'low',
    server: 'unknown',
    reason: `Uncategorized Bash command: \`${pattern}\``,
    draft_summary: `feat(mcp): investigate MCP coverage for \`${pattern}\``,
  };
}

/** Format results as human-readable text. */
export function formatText(
  bashCalls: BashCall[],
  mcpIssues: McpIssue[],
  sessionId: string,
  scratchCalls: ScratchCall[] | null = null,
): string {
  const lines: string[] = [];
  lines.push(`Session: ${sessionId}`);
  lines.push(`Total Bash commands: ${bashCalls.length}`);
  lines.push('');

  if (
    bashCalls.length === 0 &&
    mcpIssues.length === 0 &&
    (scratchCalls === null || scratchCalls.length === 0)
  ) {
    if (scratchCalls !== null) {
      lines.push(
        'No Bash commands, MCP issues, or scratch subprocess calls found.',
      );
    } else {
      lines.push('No Bash commands or MCP issues found.');
    }
    return lines.join('\n');
  }

  // Group by source
  const parentCmds = bashCalls.filter((c) => c.source === 'parent');
  const subagentCmds = bashCalls.filter((c) => c.source !== 'parent');

  const renderCmd = (cmd: BashCall, index: number): void => {
    const ts = cmd.timestamp ? cmd.timestamp.slice(0, 19) : '?';
    lines.push(`  [${index}] ${ts}`);
    lines.push(`      $ ${cmd.command}`);
    if (cmd.description) {
      lines.push(`      # ${cmd.description}`);
    }
    lines.push('');
  };

  if (parentCmds.length > 0) {
    lines.push(`=== Parent session (${parentCmds.length} commands) ===`);
    lines.push('');
    parentCmds.forEach((cmd, i) => renderCmd(cmd, i + 1));
  }

  if (subagentCmds.length > 0) {
    // Group by source (subagent file)
    const sources = new Map<string, BashCall[]>();
    for (const cmd of subagentCmds) {
      const existing = sources.get(cmd.source);
      if (existing) {
        existing.push(cmd);
      } else {
        sources.set(cmd.source, [cmd]);
      }
    }

    for (const [sourceName, cmds] of sources) {
      lines.push(`=== Subagent: ${sourceName} (${cmds.length} commands) ===`);
      lines.push('');
      cmds.forEach((cmd, i) => renderCmd(cmd, i + 1));
    }
  }

  if (mcpIssues.length > 0) {
    const overflows = mcpIssues.filter((m) => m.is_overflow);
    const errors = mcpIssues.filter((m) => m.is_error && !m.is_overflow);

    if (overflows.length > 0) {
      lines.push(`=== MCP Overflows (${overflows.length}) ===`);
      lines.push('');
      for (const m of overflows) {
        lines.push(`  Tool: ${m.name}`);
        lines.push(`  Snippet: ${m.overflow_snippet}`);
        lines.push('');
      }
    }

    if (errors.length > 0) {
      lines.push(`=== MCP Failures (${errors.length}) ===`);
      lines.push('');
      for (const m of errors) {
        lines.push(`  Tool: ${m.name}`);
        lines.push(`  Error: ${m.error_snippet}`);
        lines.push('');
      }
    }
  }

  if (scratchCalls !== null) {
    lines.push(
      `=== scratch/*.py subprocess calls (${scratchCalls.length}) ===`,
    );
    lines.push('');
    for (const entry of scratchCalls) {
      lines.push(`  ${entry.file}:${entry.line}`);
      lines.push(`      ${entry.command_preview}`);
      lines.push('');
    }
  }

  // Summary
  lines.push('=== Summary ===');
  lines.push(`  Parent Bash commands:   ${parentCmds.length}`);
  lines.push(`  Subagent Bash commands: ${subagentCmds.length}`);
  if (mcpIssues.length > 0) {
    lines.push(
      `  MCP overflows:          ${mcpIssues.filter((m) => m.is_overflow).length}`,
    );
    lines.push(
      `  MCP failures:           ${mcpIssues.filter((m) => m.is_error && !m.is_overflow).length}`,
    );
  }
  if (scratchCalls !== null) {
    lines.push(`  scratch subprocess calls: ${scratchCalls.length}`);
  }
  lines.push(`  Total Bash commands:    ${bashCalls.length}`);

  return lines.join('\n');
}

interface PatternStats {
  counts: Map<string, number>;
  samples: Map<string, string>;
  classifications: Map<string, readonly [string, string]>;
}

/** Group Bash calls by normalised pattern with counts, samples, and classifications. */
function collectPatternStats(
  bashCalls: BashCall[],
  sessionToolNames?: readonly string[],
): PatternStats {
  const counts = new Map<string, number>();
  const samples = new Map<string, string>();
  const classifications = new Map<string, readonly [string, string]>();

  for (const call of bashCalls) {
    const cmd = call.command;
    const pat = commandPattern(cmd);
    counts.set(pat, (counts.get(pat) ?? 0) + 1);
    if (!samples.has(pat)) samples.set(pat, cmd);
    if (!classifications.has(pat)) {
      classifications.set(pat, classifyCommand(cmd, sessionToolNames));
    }
  }

  return { counts, samples, classifications };
}

/**
 * Order patterns by count descending, insertion order on ties — mirrors
 * Python's Counter.most_common() (heapq-backed sort is stable on insertion
 * order because Array.prototype.sort is stable).
 */
function mostCommon(counts: Map<string, number>): Array<[string, number]> {
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

/**
 * Render a JSON-shaped value the way Python's str() would, so the params
 * summary matches the Python implementation byte-for-byte (True/False/None,
 * single-quoted strings inside containers, ', ' / ': ' separators).
 */
function pythonStr(value: unknown, nested = false): string {
  if (value === null || value === undefined) return 'None';
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  if (typeof value === 'string') return nested ? `'${value}'` : value;
  if (Array.isArray(value)) {
    return `[${value.map((v) => pythonStr(v, true)).join(', ')}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).map(
      ([k, v]) => `'${k}': ${pythonStr(v, true)}`,
    );
    return `{${entries.join(', ')}}`;
  }
  // Only `number` remains for a JSON-shaped value once null/boolean/string/
  // array/object have all been handled above.
  const remaining: number = value as number;
  return String(remaining);
}

/** Produce a compact one-line summary of tool parameters. */
export function summarizeParams(params: Record<string, unknown>): string {
  const keys = Object.keys(params);
  if (keys.length === 0) return '(none)';
  const parts: string[] = [];
  for (const k of keys) {
    let valStr = pythonStr(params[k]);
    if (valStr.length > 40) {
      valStr = valStr.slice(0, 37) + '...';
    }
    parts.push(`${k}=${valStr}`);
  }
  return parts.join(', ');
}

/**
 * Produce a structured JSON audit report with pre-classifications.
 *
 * The output is designed to minimize LLM reasoning — the agent only needs to
 * review items flagged as uncertain and approve/reject proposed tickets.
 */
export function formatAudit(
  bashCalls: BashCall[],
  mcpIssues: McpIssue[],
  sessionId: string,
  scratchCalls: ScratchCall[] | null = null,
  sessionToolNames?: readonly string[],
  autoModeActive = false,
): string {
  const { counts, samples, classifications } = collectPatternStats(
    bashCalls,
    sessionToolNames,
  );

  // Build gap items with full classification
  const gaps: Array<Record<string, unknown>> = [];
  const covered: Array<Record<string, unknown>> = [];
  const noise: Array<Record<string, unknown>> = [];
  const autoModeExcluded: Array<Record<string, unknown>> = [];

  for (const [pat, count] of mostCommon(counts)) {
    const [status, tool] = classifications.get(pat) ?? ['gap', ''];
    const sample = samples.get(pat) ?? '';

    if (status === 'covered') {
      covered.push({
        pattern: pat,
        count,
        mcp_tool: tool,
        sample: sample.slice(0, 120),
      });
      continue;
    }

    // Check if this is a known noise pattern (curated allowlist only).
    // Singletons (count==1) are NOT auto-filtered — they become low-confidence
    // gaps so the reviewer can decide. Recurring investigative patterns are
    // always promoted to gaps regardless of count.
    const recurringInfo = matchRecurringInfo(pat, sample);
    const isRecurring = recurringInfo !== null;

    if (NOISE_PATTERNS.has(pat) && !isRecurring) {
      noise.push({
        pattern: pat,
        count,
        sample: sample.slice(0, 120),
        reason: 'known noise pattern',
      });
      continue;
    }

    // The auto-mode directive (LS-9755) sanctions Bash for plain file
    // read/search operations — the exact class the FILE-READ/GREP recurring
    // patterns (find/grep/sed -n/tail/wc -l) flag as missing-awareness.
    // When that directive is active in this transcript, these are expected
    // behavior, not real gaps: exclude them from action_required so they
    // don't get filed as docs(skills) tickets, but keep them visible under
    // informational for auditability. MCP-first for domain operations
    // (make/nx/jira/github/worktree/db/...) is unaffected — those gap
    // classes never match RECURRING_INVESTIGATIVE's missing-awareness rows.
    if (
      autoModeActive &&
      recurringInfo !== null &&
      isFileReadGrepClassAwarenessGap(recurringInfo)
    ) {
      autoModeExcluded.push({
        pattern: pat,
        count,
        sample: sample.slice(0, 120),
        reason:
          'auto-mode directive active this session: plain file read/search via Bash ' +
          `(${recurringInfo.reason}) is sanctioned, not a tool-awareness gap — see AGENTS.md Tool Usage`,
      });
      continue;
    }

    // Classify the gap
    const gapInfo = classifyGapType(sample, pat);
    gaps.push({
      pattern: pat,
      count,
      sample: sample.slice(0, 120),
      ...gapInfo,
      // Non-empty only when the prefix table would normally call this
      // "covered", but sessionToolNames confirmed that MCP server's tools
      // were absent from this session's roster (LS-9749) — flags it as a
      // real gap instead of silently filtering it out.
      ...(tool
        ? {
            expected_mcp_tool: tool,
            note: `Would normally be classified 'covered' by ${tool}, but that server's tools were not found in this session's roster — treat as a real gap, not noise.`,
          }
        : {}),
    });
  }

  // Classify MCP overflows and failures
  const overflowItems: Array<Record<string, unknown>> = [];
  const failureItems: Array<Record<string, unknown>> = [];

  for (const issue of mcpIssues) {
    if (issue.is_overflow) {
      overflowItems.push({
        tool: issue.name,
        snippet: issue.overflow_snippet.slice(0, 200),
        params: summarizeParams(issue.input),
        fix_type: 'needs-review',
        note: 'Check if agent should have used limiting params (agent-error) or if tool lacks them (missing-parameter/bad-default)',
      });
    } else if (issue.is_error) {
      failureItems.push({
        tool: issue.name,
        error: issue.error_snippet.slice(0, 200),
        params: summarizeParams(issue.input),
        fix_type: 'needs-review',
        note: 'Classify as permission-gap, bug, config-issue, or expected-limitation',
      });
    }
  }

  let totalBashCommands = 0;
  for (const count of counts.values()) totalBashCommands += count;

  // `gaps` is already frequency-descending (built from mostCommon(counts)).
  // Soft-cap the medium/low-confidence review list so a session with many
  // one-off gap patterns can't blow the report past the tool-result token
  // cap (LS-8778) — the reviewer sees the highest-frequency patterns first
  // and an overflow note for the rest.
  const GAPS_TO_REVIEW_CAP = 30;
  const gapsToReviewAll = gaps.filter((g) => g['confidence'] !== 'high');
  const gapsToReview = gapsToReviewAll.slice(0, GAPS_TO_REVIEW_CAP);
  const gapsToReviewOmitted = gapsToReviewAll.length - gapsToReview.length;

  const actionRequired: Record<string, unknown> = {
    gaps_to_review: gapsToReview,
    gaps_auto_classified: gaps.filter((g) => g['confidence'] === 'high'),
    overflows: overflowItems,
    failures: failureItems,
  };
  if (gapsToReviewOmitted > 0) {
    actionRequired['gaps_to_review_overflow'] = {
      omitted: gapsToReviewOmitted,
      note: `Showing the top ${GAPS_TO_REVIEW_CAP} gap_to_review patterns by frequency; ${gapsToReviewOmitted} lower-frequency pattern(s) omitted. Re-run with gapsOnly:true for the full frequency table.`,
    };
  }

  const report: Record<string, unknown> = {
    session_id: sessionId,
    summary: {
      total_bash_commands: totalBashCommands,
      unique_patterns: counts.size,
      gaps_found: gaps.length,
      noise_filtered: noise.length,
      covered_patterns: covered.length,
      mcp_overflows: overflowItems.length,
      mcp_failures: failureItems.length,
      auto_mode_active: autoModeActive,
      auto_mode_excluded: autoModeExcluded.length,
    },
    action_required: actionRequired,
    informational: {
      noise_filtered: noise,
      covered_commands: covered,
      auto_mode_excluded: autoModeExcluded,
    },
  };

  if (scratchCalls !== null) {
    report['scratch_subprocess_calls'] = scratchCalls;
  }

  // Add instructions for the reviewing agent
  report['instructions'] =
    "Review 'action_required' section. For 'gaps_to_review' (medium/low confidence): " +
    'verify the gap_type and draft_summary, then approve or skip. ' +
    "For 'gaps_auto_classified' (high confidence): these are pre-approved unless you disagree. " +
    'For overflows/failures: classify the fix_type. ' +
    'Then create Jira tickets for approved gaps under the current MCP gaps bucket epic. ' +
    (autoModeActive
      ? "'informational.auto_mode_excluded' lists file-read/search Bash calls held out of " +
        'action_required because the auto-mode directive was active this session (LS-9755) — ' +
        'no ticket needed for those.'
      : '');

  return minifiedJson(report);
}

/**
 * Compact gap-focused output: one line per unique command pattern.
 *
 * Groups all Bash commands by normalised pattern, separates MCP-covered
 * commands from genuine gaps, and emits a frequency table that fits in
 * well under 5 KB for a typical 30–60 minute session.
 */
export function formatGapsOnly(
  bashCalls: BashCall[],
  sessionId: string,
  scratchCalls: ScratchCall[] | null = null,
  sessionToolNames?: readonly string[],
): string {
  const { counts, samples, classifications } = collectPatternStats(
    bashCalls,
    sessionToolNames,
  );

  const gaps: Array<[string, number, string]> = [];
  const covered: Array<[string, number, string]> = [];

  for (const [pat, count] of mostCommon(counts)) {
    const [status, tool] = classifications.get(pat) ?? ['gap', ''];
    const sample = (samples.get(pat) ?? '').slice(0, 80).replace(/\n/g, ' ');
    if (status === 'gap') {
      gaps.push([pat, count, sample]);
    } else {
      covered.push([pat, count, tool]);
    }
  }

  let totalBashCommands = 0;
  for (const count of counts.values()) totalBashCommands += count;

  const countCol = (count: number): string => String(count).padStart(3);

  const lines: string[] = [
    `Session: ${sessionId}`,
    `Total Bash commands: ${totalBashCommands}  |  ` +
      `Unique patterns: ${counts.size}  |  ` +
      `Gap patterns: ${gaps.length}`,
    '',
  ];

  if (gaps.length > 0) {
    lines.push(`=== Potential MCP gaps (${gaps.length} patterns) ===`);
    for (const [pat, count, sample] of gaps) {
      lines.push(`  ${countCol(count)}x  ${pat.padEnd(40)}  e.g.: ${sample}`);
    }
    lines.push('');
  }

  if (covered.length > 0) {
    lines.push(`=== MCP-covered (${covered.length} patterns) ===`);
    for (const [pat, count, tool] of covered) {
      lines.push(`  ${countCol(count)}x  ${pat.padEnd(40)}  [${tool}]`);
    }
    lines.push('');
  }

  if (scratchCalls !== null) {
    lines.push(
      `=== scratch/*.py subprocess calls (${scratchCalls.length}) ===`,
    );
    for (const entry of scratchCalls) {
      lines.push(`  ${entry.file}:${entry.line}  ${entry.command_preview}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Find the most recently modified JSONL file in a project directory and
 * return its session ID. Throws when the directory holds no JSONL files.
 */
export function findLatestSession(projectDir: string): string {
  let best: { sessionId: string; mtime: number } | null = null;
  for (const entry of readdirSync(projectDir)) {
    if (!entry.endsWith('.jsonl')) continue;
    let mtime: number;
    try {
      const stat = statSync(join(projectDir, entry));
      if (!stat.isFile()) continue;
      mtime = stat.mtimeMs;
    } catch {
      continue;
    }
    if (best === null || mtime > best.mtime) {
      best = { sessionId: entry.replace(/\.jsonl$/, ''), mtime };
    }
  }
  if (best === null) {
    throw new Error(`Error: no JSONL files found in ${projectDir}`);
  }
  return best.sessionId;
}

/**
 * Look up a session ID from ~/.claude/sessions/{PID}.json.
 * Returns null when the file is missing, unreadable, or has no sessionId.
 *
 * Resolves the base directory the same way findClaudeProjectsDir() does
 * (../session-files.ts): prefer $HOME over os.homedir(), since some
 * hosted/CCR server processes carry a stale $HOME baked into their launch
 * environment (e.g. /home/sbx_user1051) that no longer matches the
 * container's actual home (LS-8867). This function was missed when that
 * fix landed, so the `pid` lookup path in ci_audit_session_bash kept
 * resolving the wrong home even after the shared projects-dir path was
 * fixed (LS-8687).
 */
export function findSessionByPid(pid: number): string | null {
  const home = process.env['HOME'] || homedir();
  const pidFile = join(home, '.claude', 'sessions', `${pid}.json`);
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(pidFile, 'utf8'));
  } catch {
    return null;
  }
  if (!isRecord(data)) return null;
  const sessionId = data['sessionId'];
  return typeof sessionId === 'string' && sessionId ? sessionId : null;
}
