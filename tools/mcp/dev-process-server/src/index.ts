import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import {
  isSafeFilePath,
  isSafeGitRef,
  parseTestPlanCases,
  resolveChecked,
  type TestCase,
} from './utils.js';

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function getRepoRoot(): string {
  const thisDir = resolve(fileURLToPath(import.meta.url), '..');
  return resolve(thisDir, '..', '..', '..', '..');
}

function ensureDir(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

function today(): string {
  return new Date().toISOString().split('T')[0]!;
}

interface GitHubConfig {
  token: string;
  owner: string;
  repo: string;
}

function getGitHubConfig(): GitHubConfig | null {
  const token = process.env['GITHUB_TOKEN'];
  if (!token) return null;
  try {
    const remoteUrl = execFileSync('git', ['remote', 'get-url', 'origin'], {
      encoding: 'utf-8',
      timeout: 5_000,
    }).trim();
    const match = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
    if (!match) return null;
    return { token, owner: match[1]!, repo: match[2]! };
  } catch {
    return null;
  }
}

async function ghFetch(
  config: GitHubConfig,
  path: string,
  method = 'GET',
  body?: unknown,
): Promise<unknown> {
  const url = `https://api.github.com${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${config.token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub ${method} ${url}: ${res.status} ${text}`);
  }
  if (method === 'DELETE') return null;
  return res.json() as Promise<unknown>;
}

function ok(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  };
}

function err(message: string) {
  return {
    content: [{ type: 'text' as const, text: message }],
    isError: true,
  };
}

// ---------------------------------------------------------------------------
// RFC content
// ---------------------------------------------------------------------------

const RFC_REQUIRED_SECTIONS = [
  '## Status',
  '## Problem',
  '## Goals',
  '## Non-goals',
  '## Proposal',
  '## Alternatives Considered',
  '## Risks',
  '## Test Plan',
  '## Rollout',
  '## Open Questions',
];

function rfcTemplate(title: string): string {
  return `# ${title}

## Status

Draft

## Problem

<What is broken or missing today, in concrete terms. Avoid solutions in this section.>

## Goals

- <What success looks like, bullet 1>

## Non-goals

- <Things this RFC will NOT solve, even though they are nearby>

## Proposal

<The recommended approach, in enough detail to estimate.>

## Alternatives Considered

### Alternative A: <name>

<Description.>

**Why rejected**: <reason>

### Alternative B: <name>

<Description.>

**Why rejected**: <reason>

## Risks

| Risk     | Likelihood | Impact     | Mitigation             |
| -------- | ---------- | ---------- | ---------------------- |
| <Risk 1> | Low/Med/Hi | Low/Med/Hi | <How we will mitigate> |

## Test Plan

<Embed the test plan here, or link to \`docs/test-plans/LS-####.md\`.>

## Rollout

<Migration / feature flag / staged release plan. Include rollback plan.>

## Open Questions

- <Unresolved item 1>
`;
}

// ---------------------------------------------------------------------------
// ADR content
// ---------------------------------------------------------------------------

function adrTemplate(number: string, title: string): string {
  return `# ${number}. ${title}

Date: ${today()}

## Status

Proposed

## Context

<What forces are at play. What problem is being solved. No prescription yet — describe the world without the decision.>

## Decision

We will <active-voice statement of the chosen approach>.

## Consequences

### Easier

- <What this decision makes easier or possible>

### Harder

- <What this decision makes harder or precludes>

### Now constrained

- <What future choices this decision now constrains>
`;
}

function nextAdrNumber(decisionsDir: string): string {
  if (!existsSync(decisionsDir)) return '0001';
  const files = readdirSync(decisionsDir).filter((f) => /^\d{4}-/.test(f));
  if (files.length === 0) return '0001';
  const max = files
    .map((f) => parseInt(f.slice(0, 4), 10))
    .reduce((a, b) => Math.max(a, b), 0);
  return String(max + 1).padStart(4, '0');
}

// ---------------------------------------------------------------------------
// Postmortem content
// ---------------------------------------------------------------------------

function postmortemTemplate(
  date: string,
  severity: string,
  authors: string[],
): string {
  const authorLine = authors.map((a) => `@${a}`).join(', ');
  return `# Postmortem: <Incident Title>

**Date**: ${date}
**Duration**: <N minutes, from HH:MM UTC to HH:MM UTC>
**Severity**: ${severity}
**Authors**: ${authorLine}

## Summary

<2–4 sentence executive summary. What broke, who was affected, how it was resolved.>

## Impact

- **Users affected**: <number or range, with confidence level>
- **Data integrity**: <preserved | data loss in <area>, <details>>
- **Revenue impact**: <if applicable>
- **External communication sent**: <Discord posts, status page updates — with timestamps>

## Timeline

(All times UTC.)

| Time  | Event                                |
| ----- | ------------------------------------ |
| HH:MM | First user report / monitoring alert |
| HH:MM | Incident commander assigned          |
| HH:MM | Root cause confirmed                 |
| HH:MM | Mitigation deployed                  |
| HH:MM | Recovery confirmed                   |
| HH:MM | All-clear                            |

## Root cause

<Technical root cause in detail. Distinguish symptom from cause.>

## What went well

- <Things that worked>

## What went wrong

- <Things that delayed resolution. No names; focus on systems and decisions.>

## Where we got lucky

- <Things that, if slightly different, would have made this much worse.>

## Action items

| Owner | Action            | Due        | Ticket  |
| ----- | ----------------- | ---------- | ------- |
| @name | <Concrete change> | YYYY-MM-DD | LS-#### |

## Lessons

- <3–5 bullets the rest of the team should remember.>
`;
}

// ---------------------------------------------------------------------------
// Repro content
// ---------------------------------------------------------------------------

interface ReproData {
  ticket: string;
  environment: {
    buildSha?: string;
    browserOs?: string;
    userAccount?: string;
    dataState?: string;
  };
  steps: string[];
  expected: string;
  actual: string;
  frequency: string;
  firstSeen?: string;
  workaround?: string;
}

function reproTemplate(data: ReproData): string {
  const env = data.environment;
  const stepLines = data.steps.map((s, i) => `${i + 1}. ${s}`).join('\n');
  return `## Repro

**Environment**:

- Build SHA / version: ${env.buildSha ?? '<unknown>'}
- Browser / OS: ${env.browserOs ?? '<unknown>'}
- User account: ${env.userAccount ?? '<unknown>'}
- Data state: ${env.dataState ?? '<unknown>'}

**Steps**:

${stepLines}

**Expected**:
${data.expected}

**Actual**:
${data.actual}

**Frequency**: ${data.frequency}

**First seen**: ${data.firstSeen ?? '<unknown>'}

**Workaround**: ${data.workaround ?? 'none'}
`;
}

function noReproTemplate(
  ticket: string,
  attempted: string[],
  hypotheses: string[],
  recommendation: string,
): string {
  const attemptedLines = attempted.map((a) => `- ${a}`).join('\n');
  const hypothesesLines = hypotheses.map((h) => `- ${h}`).join('\n');
  return `## Repro: Cannot Reproduce

**Ticket**: ${ticket}
**Attempted environments**:
${attemptedLines}

**Attempted steps**: See attached steps in the investigation notes.

**Hypotheses**:
${hypothesesLines}

**Recommendation**: ${recommendation}
`;
}

// ---------------------------------------------------------------------------
// Continuation plan content
// ---------------------------------------------------------------------------

interface ContinuationPlanData {
  pr: number;
  inheritedFrom: string;
  inheritedAtSha: string;
  currentState: {
    branch: string;
    commitsAhead: number;
    baseBranch: string;
    status: 'clean' | 'dirty' | 'rebase in progress';
    ci: string;
    reviews: string;
    testsLocal: string;
  };
  done: string[];
  todo: string[];
  openThreads: Array<{ url: string; description: string }>;
  risks: string[];
  plan: string;
  resumedBy?: string;
}

function continuationPlanBody(data: ContinuationPlanData): string {
  const doneLines = data.done.map((d) => `- ${d}`).join('\n');
  const todoLines = data.todo.map((t) => `- [ ] ${t}`).join('\n');
  const threadLines = data.openThreads
    .map((t) => `- ${t.url}: ${t.description}`)
    .join('\n');
  const riskLines = data.risks.map((r) => `- ${r}`).join('\n');
  const resumedBy = data.resumedBy ?? 'agent';
  const inheritedAt =
    new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  const cs = data.currentState;

  return `<!-- continuation-plan -->

## Continuation Plan

**Inherited from**: @${data.inheritedFrom} at SHA \`${data.inheritedAtSha}\`
**Inherited at**: ${inheritedAt}
**Resumed by**: @${resumedBy}

### Current state

- **Branch**: \`${cs.branch}\`, ${cs.commitsAhead} commits ahead of \`${cs.baseBranch}\`, ${cs.status}
- **CI**: ${cs.ci}
- **Reviews**: ${cs.reviews}
- **Tests local**: ${cs.testsLocal}

### What's done

${doneLines || '- (nothing yet)'}

### What's left

${todoLines || '- [ ] (nothing specified)'}

### Open review threads not yet addressed

${threadLines || '- (none)'}

### Risks / notes for the next reviewer

${riskLines || '- (none)'}

### My plan

${data.plan}`;
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'legacy-sports-dev-process',
  version: '1.0.0',
});

// ==========================================================================
// RFC tools
// ==========================================================================

server.tool(
  'rfc_create',
  'Scaffold a new RFC draft at docs/rfcs/draft-<slug>.md with all required sections. ' +
    'Idempotent — returns the existing path if the file already exists.',
  {
    slug: z
      .string()
      .regex(/^[a-z0-9-]+$/, 'slug must be lowercase kebab-case')
      .describe('Short kebab-case identifier, e.g. "migrate-draft-state"'),
    title: z
      .string()
      .min(1)
      .describe('Verb-phrase title, e.g. "Migrate draft state to Postgres"'),
    ticket: z
      .string()
      .optional()
      .describe('Jira ticket key to embed (optional, e.g. "LS-1234")'),
    worktreePath: z
      .string()
      .optional()
      .describe('Repo or worktree root (default: auto-detected)'),
  },
  async ({ slug, title, ticket, worktreePath }) => {
    const root = worktreePath ?? getRepoRoot();
    const rfcsDir = join(root, 'docs', 'rfcs');
    ensureDir(rfcsDir);

    const filename = `draft-${slug}.md`;
    const filePath = join(rfcsDir, filename);
    const relativePath = `docs/rfcs/${filename}`;

    if (existsSync(filePath)) {
      return ok({ exists: true, path: relativePath, created: false });
    }

    const fullTitle = ticket ? `${title} (${ticket})` : title;
    writeFileSync(filePath, rfcTemplate(fullTitle), 'utf-8');
    return ok({ exists: false, path: relativePath, created: true });
  },
);

server.tool(
  'rfc_validate',
  'Validate an RFC file for required sections and return { valid, missingSections, brokenLinks }.',
  {
    path: z
      .string()
      .describe(
        'Path to the RFC file (relative to repo root or absolute), e.g. "docs/rfcs/draft-my-rfc.md"',
      ),
    worktreePath: z
      .string()
      .optional()
      .describe('Repo or worktree root (default: auto-detected)'),
  },
  async ({ path: rfcPath, worktreePath }) => {
    const root = worktreePath ?? getRepoRoot();
    const absPath = resolveChecked(rfcPath, root, 'docs/rfcs');
    if (!absPath) {
      return err(
        `Invalid path: ${rfcPath} — must be a relative path within docs/rfcs/`,
      );
    }

    if (!existsSync(absPath)) {
      return err(`RFC file not found: ${rfcPath}`);
    }

    const content = readFileSync(absPath, 'utf-8');
    const missingSections = RFC_REQUIRED_SECTIONS.filter(
      (s) => !content.includes(s),
    );

    // Basic broken-link check: markdown links to local files
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    const brokenLinks: string[] = [];
    let match;
    while ((match = linkRegex.exec(content)) !== null) {
      const href = match[2]!;
      if (href.startsWith('http') || href.startsWith('#')) continue;
      const linkedPath = join(dirname(absPath), href);
      if (!existsSync(linkedPath)) {
        brokenLinks.push(href);
      }
    }

    return ok({
      valid: missingSections.length === 0 && brokenLinks.length === 0,
      missingSections,
      brokenLinks,
    });
  },
);

server.tool(
  'rfc_list_open',
  'List all open (Status: Draft) RFCs under docs/rfcs/.',
  {
    worktreePath: z
      .string()
      .optional()
      .describe('Repo or worktree root (default: auto-detected)'),
  },
  async ({ worktreePath }) => {
    const root = worktreePath ?? getRepoRoot();
    const rfcsDir = join(root, 'docs', 'rfcs');

    if (!existsSync(rfcsDir)) {
      return ok({ rfcs: [] });
    }

    const files = readdirSync(rfcsDir).filter((f) => f.endsWith('.md'));
    const drafts = files
      .map((f) => {
        const content = readFileSync(join(rfcsDir, f), 'utf-8');
        const isDraft = /^## Status\s*\n+Draft/m.test(content);
        const titleMatch = content.match(/^#\s+(.+)$/m);
        return {
          file: `docs/rfcs/${f}`,
          title: titleMatch ? titleMatch[1]!.trim() : f,
          isDraft,
        };
      })
      .filter((r) => r.isDraft)
      .map(({ file, title }) => ({ file, title }));

    return ok({ rfcs: drafts });
  },
);

server.tool(
  'rfc_accept',
  'Accept an RFC: rename docs/rfcs/draft-<slug>.md → docs/rfcs/<ticket>-<slug>.md and set Status: Accepted.',
  {
    path: z
      .string()
      .describe(
        'Current RFC path, e.g. "docs/rfcs/draft-my-rfc.md" (relative to repo root)',
      ),
    ticket: z
      .string()
      .regex(/^LS-\d+$/, 'ticket must be in the form LS-####')
      .describe('Jira ticket key, e.g. "LS-1234"'),
    worktreePath: z
      .string()
      .optional()
      .describe('Repo or worktree root (default: auto-detected)'),
  },
  async ({ path: rfcPath, ticket, worktreePath }) => {
    const root = worktreePath ?? getRepoRoot();
    const absPath = resolveChecked(rfcPath, root, 'docs/rfcs');
    if (!absPath) {
      return err(
        `Invalid path: ${rfcPath} — must be a relative path within docs/rfcs/`,
      );
    }

    if (!existsSync(absPath)) {
      return err(`RFC file not found: ${rfcPath}`);
    }

    // Validate the file is actually a draft
    const basename = absPath.split(/[\\/]/).pop()!;
    if (!basename.startsWith('draft-')) {
      return err(
        `Expected a draft RFC — filename must start with "draft-". Got: ${basename}`,
      );
    }
    const slug = basename.replace(/^draft-/, '').replace(/\.md$/, '');
    const newFilename = `${ticket}-${slug}.md`;
    const newPath = join(dirname(absPath), newFilename);
    const newRelativePath = `docs/rfcs/${newFilename}`;

    if (existsSync(newPath)) {
      return err(
        `Target path already exists: ${newRelativePath}. ` +
          'Did you already accept this RFC?',
      );
    }

    let content = readFileSync(absPath, 'utf-8');
    content = content.replace(/^(## Status\s*\n+)Draft/m, `$1Accepted`);
    writeFileSync(newPath, content, 'utf-8');
    unlinkSync(absPath);

    return ok({
      oldPath: rfcPath,
      newPath: newRelativePath,
      ticket,
    });
  },
);

// ==========================================================================
// ADR tools
// ==========================================================================

server.tool(
  'adr_create',
  'Scaffold the next-numbered ADR at docs/decisions/NNNN-<slug>.md. Idempotent — returns the existing path if it already exists.',
  {
    title: z
      .string()
      .min(1)
      .describe(
        'Noun-phrase title, e.g. "Use Apollo Client cache for normalized state"',
      ),
    slug: z
      .string()
      .regex(/^[a-z0-9-]+$/, 'slug must be lowercase kebab-case')
      .describe('Short kebab-case slug, e.g. "apollo-cache"'),
    worktreePath: z
      .string()
      .optional()
      .describe('Repo or worktree root (default: auto-detected)'),
  },
  async ({ title, slug, worktreePath }) => {
    const root = worktreePath ?? getRepoRoot();
    const decisionsDir = join(root, 'docs', 'decisions');
    ensureDir(decisionsDir);

    const number = nextAdrNumber(decisionsDir);
    const filename = `${number}-${slug}.md`;
    const filePath = join(decisionsDir, filename);
    const relativePath = `docs/decisions/${filename}`;

    if (existsSync(filePath)) {
      return ok({ exists: true, path: relativePath, created: false, number });
    }

    writeFileSync(filePath, adrTemplate(number, title), 'utf-8');
    return ok({ exists: false, path: relativePath, created: true, number });
  },
);

server.tool(
  'adr_supersede',
  'Atomically supersede an ADR: update the old ADR status to "Superseded by ADR-<newNumber>" and link the new ADR.',
  {
    oldNumber: z
      .string()
      .regex(/^\d{1,4}$/, 'must be a 1-4 digit number')
      .describe('Number of the ADR being superseded, e.g. "0001" or "1"'),
    newNumber: z
      .string()
      .regex(/^\d{1,4}$/, 'must be a 1-4 digit number')
      .describe('Number of the new superseding ADR'),
    worktreePath: z
      .string()
      .optional()
      .describe('Repo or worktree root (default: auto-detected)'),
  },
  async ({ oldNumber, newNumber, worktreePath }) => {
    const root = worktreePath ?? getRepoRoot();
    const decisionsDir = join(root, 'docs', 'decisions');

    if (!existsSync(decisionsDir)) {
      return err('docs/decisions/ directory not found');
    }

    const oldPadded = oldNumber.padStart(4, '0');
    const newPadded = newNumber.padStart(4, '0');

    const allFiles = readdirSync(decisionsDir);
    const oldFile = allFiles.find((f) => f.startsWith(oldPadded + '-'));
    const newFile = allFiles.find((f) => f.startsWith(newPadded + '-'));

    if (!oldFile) {
      return err(`No ADR found with number ${oldPadded}`);
    }
    if (!newFile) {
      return err(
        `No ADR found with number ${newPadded}. Create it first with adr_create.`,
      );
    }

    const oldPath = join(decisionsDir, oldFile);
    let oldContent = readFileSync(oldPath, 'utf-8');
    oldContent = oldContent.replace(
      /^(## Status\s*\n+).+$/m,
      `$1Superseded by ADR-${newPadded} (docs/decisions/${newFile})`,
    );
    writeFileSync(oldPath, oldContent, 'utf-8');

    return ok({
      updated: `docs/decisions/${oldFile}`,
      supersededBy: `docs/decisions/${newFile}`,
    });
  },
);

server.tool(
  'adr_list',
  'List ADRs under docs/decisions/, optionally filtered by status.',
  {
    status: z
      .enum(['Proposed', 'Accepted', 'Deprecated', 'Superseded'])
      .optional()
      .describe('Filter by status (omit to list all)'),
    worktreePath: z
      .string()
      .optional()
      .describe('Repo or worktree root (default: auto-detected)'),
  },
  async ({ status, worktreePath }) => {
    const root = worktreePath ?? getRepoRoot();
    const decisionsDir = join(root, 'docs', 'decisions');

    if (!existsSync(decisionsDir)) {
      return ok({ adrs: [] });
    }

    const files = readdirSync(decisionsDir)
      .filter((f) => /^\d{4}-/.test(f) && f.endsWith('.md'))
      .sort();

    const adrs = files.map((f) => {
      const content = readFileSync(join(decisionsDir, f), 'utf-8');
      const statusMatch = content.match(/^## Status\s*\n+(.+)$/m);
      const titleMatch = content.match(/^#\s+(.+)$/m);
      const fileStatus = statusMatch ? statusMatch[1]!.trim() : 'Unknown';
      return {
        file: `docs/decisions/${f}`,
        number: f.slice(0, 4),
        title: titleMatch ? titleMatch[1]!.trim() : f,
        status: fileStatus,
      };
    });

    const filtered = status
      ? adrs.filter((a) => a.status.startsWith(status))
      : adrs;

    return ok({ adrs: filtered });
  },
);

// ==========================================================================
// Test plan tools
// ==========================================================================

server.tool(
  'testplan_extract',
  'Extract structured test cases from a PR body or a test-plan file. ' +
    'Provide either pr (GitHub PR number) or path (local file path) — not both.',
  {
    pr: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('GitHub PR number to read the body from'),
    path: z
      .string()
      .optional()
      .describe(
        'Local test-plan file path (relative to repo root or absolute), e.g. "docs/test-plans/LS-1234.md"',
      ),
    worktreePath: z
      .string()
      .optional()
      .describe('Repo or worktree root (default: auto-detected)'),
  },
  async ({ pr, path: filePath, worktreePath }) => {
    if (!pr && !filePath) {
      return err('Provide either pr or path');
    }
    if (pr && filePath) {
      return err('Provide either pr or path, not both');
    }

    let content: string;

    if (filePath) {
      const root = worktreePath ?? getRepoRoot();
      const absPath = resolveChecked(filePath, root, 'docs/test-plans');
      if (!absPath) {
        return err(
          `Invalid path: ${filePath} — must be a relative path within docs/test-plans/`,
        );
      }
      if (!existsSync(absPath)) {
        return err(`Test plan file not found: ${filePath}`);
      }
      content = readFileSync(absPath, 'utf-8');
    } else {
      const ghConfig = getGitHubConfig();
      if (!ghConfig) {
        return err(
          'GITHUB_TOKEN not set — cannot fetch PR body. ' +
            'Provide path instead, or set GITHUB_TOKEN.',
        );
      }
      const prData = (await ghFetch(
        ghConfig,
        `/repos/${ghConfig.owner}/${ghConfig.repo}/pulls/${pr}`,
      )) as { body: string | null };
      content = prData.body ?? '';
    }

    const cases = parseTestPlanCases(content);
    return ok({ cases, total: cases.length });
  },
);

server.tool(
  'testplan_coverage_check',
  'Check test plan coverage for a PR: returns { totalCases, automatedCases, manualCases, missingCases }. ' +
    'A "missing" case has no test file reference and no manual marker.',
  {
    pr: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('GitHub PR number to read the body from'),
    path: z
      .string()
      .optional()
      .describe(
        'Local test-plan file path (relative to repo root or absolute)',
      ),
    worktreePath: z
      .string()
      .optional()
      .describe('Repo or worktree root (default: auto-detected)'),
  },
  async ({ pr, path: filePath, worktreePath }) => {
    if (!pr && !filePath) {
      return err('Provide either pr or path');
    }

    let content: string;

    if (filePath) {
      const root = worktreePath ?? getRepoRoot();
      const absPath = resolveChecked(filePath, root, 'docs/test-plans');
      if (!absPath) {
        return err(
          `Invalid path: ${filePath} — must be a relative path within docs/test-plans/`,
        );
      }
      if (!existsSync(absPath)) {
        return err(`Test plan file not found: ${filePath}`);
      }
      content = readFileSync(absPath, 'utf-8');
    } else if (pr) {
      const ghConfig = getGitHubConfig();
      if (!ghConfig) {
        return err('GITHUB_TOKEN not set — cannot fetch PR body.');
      }
      const prData = (await ghFetch(
        ghConfig,
        `/repos/${ghConfig.owner}/${ghConfig.repo}/pulls/${pr}`,
      )) as { body: string | null };
      content = prData.body ?? '';
    } else {
      return err('Provide either pr or path');
    }

    const cases = parseTestPlanCases(content);
    const automated = cases.filter((c) => c.isAutomated);
    const manual = cases.filter((c) => c.isManual);
    const missing = cases.filter((c) => !c.isAutomated && !c.isManual);

    return ok({
      totalCases: cases.length,
      automatedCases: automated.length,
      manualCases: manual.length,
      missingCases: missing.length,
      missing: missing.map((c) => c.text),
    });
  },
);

server.tool(
  'testplan_diff',
  'Show test cases added or removed between two test-plan files or refs. ' +
    'Provide either two file paths (basePath / headPath) or two git refs (baseRef / headRef) and a common filePath.',
  {
    basePath: z
      .string()
      .optional()
      .describe('Base test-plan file path (relative to repo root)'),
    headPath: z
      .string()
      .optional()
      .describe('Head test-plan file path (relative to repo root)'),
    baseRef: z
      .string()
      .optional()
      .describe('Base git ref (e.g. "main", "HEAD~1")'),
    headRef: z.string().optional().describe('Head git ref (e.g. "HEAD")'),
    filePath: z
      .string()
      .optional()
      .describe(
        'File path relative to repo root, used when baseRef/headRef are provided',
      ),
    worktreePath: z
      .string()
      .optional()
      .describe('Repo or worktree root (default: auto-detected)'),
  },
  async ({ basePath, headPath, baseRef, headRef, filePath, worktreePath }) => {
    const root = worktreePath ?? getRepoRoot();

    let baseContent: string;
    let headContent: string;

    if (basePath && headPath) {
      const baseAbs = resolveChecked(basePath, root, 'docs/test-plans');
      const headAbs = resolveChecked(headPath, root, 'docs/test-plans');
      if (!baseAbs)
        return err(
          `Invalid path: ${basePath} — must be within docs/test-plans/`,
        );
      if (!headAbs)
        return err(
          `Invalid path: ${headPath} — must be within docs/test-plans/`,
        );
      if (!existsSync(baseAbs)) return err(`Base file not found: ${basePath}`);
      if (!existsSync(headAbs)) return err(`Head file not found: ${headPath}`);
      baseContent = readFileSync(baseAbs, 'utf-8');
      headContent = readFileSync(headAbs, 'utf-8');
    } else if (baseRef && headRef && filePath) {
      if (!isSafeGitRef(baseRef)) return err(`Invalid baseRef: ${baseRef}`);
      if (!isSafeGitRef(headRef)) return err(`Invalid headRef: ${headRef}`);
      if (!isSafeFilePath(filePath))
        return err(`Invalid filePath: ${filePath}`);
      try {
        baseContent = execFileSync('git', ['show', `${baseRef}:${filePath}`], {
          encoding: 'utf-8',
          cwd: root,
          timeout: 10_000,
        });
      } catch {
        baseContent = '';
      }
      try {
        headContent = execFileSync('git', ['show', `${headRef}:${filePath}`], {
          encoding: 'utf-8',
          cwd: root,
          timeout: 10_000,
        });
      } catch {
        headContent = '';
      }
    } else {
      return err(
        'Provide either (basePath + headPath) or (baseRef + headRef + filePath)',
      );
    }

    const baseCases = parseTestPlanCases(baseContent).map((c) => c.text);
    const headCases = parseTestPlanCases(headContent).map((c) => c.text);
    const baseSet = new Set(baseCases);
    const headSet = new Set(headCases);

    return ok({
      added: headCases.filter((c) => !baseSet.has(c)),
      removed: baseCases.filter((c) => !headSet.has(c)),
      total: { base: baseCases.length, head: headCases.length },
    });
  },
);

// ==========================================================================
// Repro tools
// ==========================================================================

server.tool(
  'repro_capture',
  'Write a structured repro report to docs/repros/<ticket>.md and return the formatted content. ' +
    'Idempotent — overwrites any existing repro for the same ticket.',
  {
    ticket: z
      .string()
      .regex(/^LS-\d+$/, 'ticket must be in the form LS-####')
      .describe('Jira ticket key, e.g. "LS-1234"'),
    environment: z
      .object({
        buildSha: z.string().optional().describe('Build SHA or version'),
        browserOs: z.string().optional().describe('Browser and OS'),
        userAccount: z.string().optional().describe('User account / role'),
        dataState: z.string().optional().describe('Required data state'),
      })
      .describe('Environment details'),
    steps: z.array(z.string()).min(1).describe('Ordered reproduction steps'),
    expected: z.string().describe('Expected behavior'),
    actual: z
      .string()
      .describe('Actual behavior (include error message or log line)'),
    frequency: z
      .string()
      .describe(
        'Reproduction frequency, e.g. "Always", "Sometimes (~30%)", "Once"',
      ),
    firstSeen: z
      .string()
      .optional()
      .describe('SHA, date, or version where first observed'),
    workaround: z
      .string()
      .optional()
      .describe('Known workaround, or omit for "none"'),
    worktreePath: z
      .string()
      .optional()
      .describe('Repo or worktree root (default: auto-detected)'),
  },
  async ({
    ticket,
    environment,
    steps,
    expected,
    actual,
    frequency,
    firstSeen,
    workaround,
    worktreePath,
  }) => {
    const root = worktreePath ?? getRepoRoot();
    const reprosDir = join(root, 'docs', 'repros');
    ensureDir(reprosDir);

    const data: ReproData = {
      ticket,
      environment,
      steps,
      expected,
      actual,
      frequency,
      firstSeen,
      workaround,
    };
    const content = reproTemplate(data);
    const filename = `${ticket}.md`;
    const filePath = join(reprosDir, filename);
    writeFileSync(filePath, content, 'utf-8');

    return ok({
      path: `docs/repros/${filename}`,
      content,
    });
  },
);

server.tool(
  'repro_replay',
  'Print the reproduction steps for a ticket in copy-pasteable form. Reads from docs/repros/<ticket>.md.',
  {
    ticket: z
      .string()
      .regex(/^LS-\d+$/, 'ticket must be in the form LS-####')
      .describe('Jira ticket key, e.g. "LS-1234"'),
    worktreePath: z
      .string()
      .optional()
      .describe('Repo or worktree root (default: auto-detected)'),
  },
  async ({ ticket, worktreePath }) => {
    const root = worktreePath ?? getRepoRoot();
    const filePath = join(root, 'docs', 'repros', `${ticket}.md`);

    if (!existsSync(filePath)) {
      return err(
        `No repro report found for ${ticket}. ` +
          'Run repro_capture first to create one.',
      );
    }

    const content = readFileSync(filePath, 'utf-8');
    return ok({ ticket, content });
  },
);

server.tool(
  'repro_close_no_repro',
  'Write a structured "cannot reproduce" report to docs/repros/<ticket>.md.',
  {
    ticket: z
      .string()
      .regex(/^LS-\d+$/, 'ticket must be in the form LS-####')
      .describe('Jira ticket key, e.g. "LS-1234"'),
    attempted: z
      .array(z.string())
      .min(1)
      .describe('Environments and configurations attempted'),
    hypotheses: z
      .array(z.string())
      .describe('Hypotheses about why the original report might be real'),
    recommendation: z
      .string()
      .describe(
        'Next step, e.g. "request logs from reporter", "add observability and reopen", "close as not reproducible"',
      ),
    worktreePath: z
      .string()
      .optional()
      .describe('Repo or worktree root (default: auto-detected)'),
  },
  async ({ ticket, attempted, hypotheses, recommendation, worktreePath }) => {
    const root = worktreePath ?? getRepoRoot();
    const reprosDir = join(root, 'docs', 'repros');
    ensureDir(reprosDir);

    const content = noReproTemplate(
      ticket,
      attempted,
      hypotheses,
      recommendation,
    );
    const filename = `${ticket}.md`;
    const filePath = join(reprosDir, filename);
    writeFileSync(filePath, content, 'utf-8');

    return ok({
      path: `docs/repros/${filename}`,
      content,
    });
  },
);

// ==========================================================================
// Continuation plan tools
// ==========================================================================

server.tool(
  'continuation_post',
  'Post a structured continuation plan as a PR comment (requires GITHUB_TOKEN). ' +
    'Returns the formatted body and, if posted, the comment URL.',
  {
    pr: z.number().int().positive().describe('GitHub PR number'),
    inheritedFrom: z
      .string()
      .describe('GitHub username of the previous author'),
    inheritedAtSha: z
      .string()
      .describe('SHA of the last commit by the previous author'),
    currentState: z
      .object({
        branch: z.string(),
        commitsAhead: z.number().int().nonnegative(),
        baseBranch: z.string().default('main'),
        status: z.enum(['clean', 'dirty', 'rebase in progress']),
        ci: z.string().describe('e.g. "pass", "fail (lint-check)"'),
        reviews: z.string().describe('e.g. "2 open threads, 1 resolved"'),
        testsLocal: z
          .string()
          .describe('e.g. "pass", "fail (unit: auth.test.ts)", "not run"'),
      })
      .describe('Current branch / CI / review state'),
    done: z.array(z.string()).describe('Bullets of finished work'),
    todo: z.array(z.string()).describe('Concrete remaining tasks'),
    openThreads: z
      .array(
        z.object({
          url: z.string(),
          description: z.string(),
        }),
      )
      .describe('Open review threads not yet addressed'),
    risks: z.array(z.string()).describe('Risks or notes for the next reviewer'),
    plan: z
      .string()
      .describe('2–4 sentence narrative of how you will finish this'),
    resumedBy: z
      .string()
      .optional()
      .describe('GitHub username of the new author (default: "agent")'),
  },
  async (params) => {
    const body = continuationPlanBody(params as ContinuationPlanData);
    const ghConfig = getGitHubConfig();

    if (!ghConfig) {
      return ok({
        posted: false,
        reason: 'GITHUB_TOKEN not set — copy the body and post manually',
        body,
      });
    }

    try {
      const comment = (await ghFetch(
        ghConfig,
        `/repos/${ghConfig.owner}/${ghConfig.repo}/issues/${params.pr}/comments`,
        'POST',
        { body },
      )) as { html_url: string; id: number };

      return ok({
        posted: true,
        commentUrl: comment.html_url,
        commentId: comment.id,
        body,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return ok({
        posted: false,
        reason: `GitHub API error: ${message}`,
        body,
      });
    }
  },
);

server.tool(
  'continuation_status',
  'Return the most recent continuation plan for a PR. ' +
    'Reads from GitHub PR comments (requires GITHUB_TOKEN). ' +
    'Returns { found, body, commentUrl, commentId }.',
  {
    pr: z.number().int().positive().describe('GitHub PR number'),
  },
  async ({ pr }) => {
    const ghConfig = getGitHubConfig();
    if (!ghConfig) {
      return ok({
        found: false,
        pr,
        reason: 'GITHUB_TOKEN not set — cannot fetch PR comments.',
      });
    }

    type Comment = {
      id: number;
      html_url: string;
      body: string;
      created_at: string;
    };
    const allComments: Comment[] = [];
    let page = 1;
    for (;;) {
      const batch = (await ghFetch(
        ghConfig,
        `/repos/${ghConfig.owner}/${ghConfig.repo}/issues/${pr}/comments?per_page=100&page=${page}`,
      )) as Comment[];
      allComments.push(...batch);
      if (batch.length < 100) break;
      page++;
    }

    const planComments = allComments.filter((c) =>
      c.body.includes('<!-- continuation-plan -->'),
    );

    if (planComments.length === 0) {
      return ok({ found: false, pr });
    }

    const latest = planComments[planComments.length - 1]!;
    return ok({
      found: true,
      commentUrl: latest.html_url,
      commentId: latest.id,
      createdAt: latest.created_at,
      body: latest.body,
      totalPlans: planComments.length,
    });
  },
);

// ==========================================================================
// Postmortem tools
// ==========================================================================

server.tool(
  'postmortem_create',
  'Scaffold a postmortem at docs/postmortems/YYYY-MM-DD-<slug>.md. Idempotent.',
  {
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD')
      .describe('Incident start date, e.g. "2025-05-10"'),
    slug: z
      .string()
      .regex(/^[a-z0-9-]+$/, 'slug must be lowercase kebab-case')
      .describe('Short slug, e.g. "graphql-timeout"'),
    severity: z.enum(['SEV1', 'SEV2', 'SEV3']).describe('Incident severity'),
    authors: z
      .array(z.string())
      .min(1)
      .describe('GitHub usernames of authors (incident commander first)'),
    worktreePath: z
      .string()
      .optional()
      .describe('Repo or worktree root (default: auto-detected)'),
  },
  async ({ date, slug, severity, authors, worktreePath }) => {
    const root = worktreePath ?? getRepoRoot();
    const postmortemsDir = join(root, 'docs', 'postmortems');
    ensureDir(postmortemsDir);

    const filename = `${date}-${slug}.md`;
    const filePath = join(postmortemsDir, filename);
    const relativePath = `docs/postmortems/${filename}`;

    if (existsSync(filePath)) {
      return ok({ exists: true, path: relativePath, created: false });
    }

    writeFileSync(
      filePath,
      postmortemTemplate(date, severity, authors),
      'utf-8',
    );
    return ok({ exists: false, path: relativePath, created: true });
  },
);

server.tool(
  'postmortem_action_items',
  'Extract action items from one postmortem or all postmortems in docs/postmortems/. ' +
    'Returns rows from every "## Action items" table with owner, action, due date, and ticket.',
  {
    path: z
      .string()
      .optional()
      .describe(
        'Path to a single postmortem file (relative to repo root). ' +
          'Omit to scan all postmortems.',
      ),
    worktreePath: z
      .string()
      .optional()
      .describe('Repo or worktree root (default: auto-detected)'),
  },
  async ({ path: filePath, worktreePath }) => {
    const root = worktreePath ?? getRepoRoot();
    const postmortemsDir = join(root, 'docs', 'postmortems');

    const filesToScan: string[] = [];

    if (filePath) {
      const absPath = resolveChecked(filePath, root, 'docs/postmortems');
      if (!absPath) {
        return err(
          `Invalid path: ${filePath} — must be a relative path within docs/postmortems/`,
        );
      }
      if (!existsSync(absPath)) {
        return err(`Postmortem file not found: ${filePath}`);
      }
      filesToScan.push(absPath);
    } else {
      if (!existsSync(postmortemsDir)) {
        return ok({ actionItems: [] });
      }
      const files = readdirSync(postmortemsDir).filter((f) =>
        f.endsWith('.md'),
      );
      filesToScan.push(...files.map((f) => join(postmortemsDir, f)));
    }

    interface ActionItem {
      postmortem: string;
      owner: string;
      action: string;
      due: string;
      ticket: string;
    }

    const actionItems: ActionItem[] = [];

    for (const absPath of filesToScan) {
      const content = readFileSync(absPath, 'utf-8');
      const postmortemName = absPath.split(/[\\/]/).pop()!;
      let inActionItems = false;
      let colOwner = 0,
        colAction = 1,
        colDue = 2,
        colTicket = 3;
      let headerParsed = false;

      for (const line of content.split('\n')) {
        if (/^#{2,3}\s+Action items/i.test(line)) {
          inActionItems = true;
          headerParsed = false;
          continue;
        }
        if (inActionItems && /^#{1,3}\s+/.test(line)) {
          inActionItems = false;
        }
        if (inActionItems && /^\|/.test(line)) {
          const cells = line
            .split('|')
            .map((c) => c.trim())
            .filter(Boolean);
          // Skip separator rows (contain ---)
          if (cells.some((c) => /^-+$/.test(c))) continue;
          // First non-separator row is the header — use it to locate columns
          if (!headerParsed) {
            const norm = cells.map((c) => c.toLowerCase());
            const oIdx = norm.findIndex((c) => c === 'owner');
            const aIdx = norm.findIndex((c) => c === 'action');
            const dIdx = norm.findIndex((c) => c.startsWith('due'));
            const tIdx = norm.findIndex((c) => c === 'ticket');
            if (oIdx >= 0) colOwner = oIdx;
            if (aIdx >= 0) colAction = aIdx;
            if (dIdx >= 0) colDue = dIdx;
            if (tIdx >= 0) colTicket = tIdx;
            headerParsed = true;
            continue;
          }
          if (cells.length > Math.max(colOwner, colAction, colDue, colTicket)) {
            actionItems.push({
              postmortem: `docs/postmortems/${postmortemName}`,
              owner: cells[colOwner]!,
              action: cells[colAction]!,
              due: cells[colDue]!,
              ticket: cells[colTicket]!,
            });
          }
        }
      }
    }

    return ok({ actionItems, total: actionItems.length });
  },
);

server.tool(
  'postmortem_recent',
  'List postmortems from the last N days.',
  {
    days: z.number().int().positive().describe('Number of days to look back'),
    worktreePath: z
      .string()
      .optional()
      .describe('Repo or worktree root (default: auto-detected)'),
  },
  async ({ days, worktreePath }) => {
    const root = worktreePath ?? getRepoRoot();
    const postmortemsDir = join(root, 'docs', 'postmortems');

    if (!existsSync(postmortemsDir)) {
      return ok({ postmortems: [] });
    }

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().split('T')[0]!;

    const files = readdirSync(postmortemsDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}-/.test(f) && f.endsWith('.md'))
      .filter((f) => f.slice(0, 10) >= cutoffStr)
      .sort()
      .reverse();

    const postmortems = files.map((f) => {
      const content = readFileSync(join(postmortemsDir, f), 'utf-8');
      const severityMatch = content.match(/\*\*Severity\*\*:\s*(\S+)/);
      const titleMatch = content.match(/^#\s+Postmortem:\s+(.+)$/m);
      return {
        file: `docs/postmortems/${f}`,
        date: f.slice(0, 10),
        severity: severityMatch ? severityMatch[1] : 'Unknown',
        title: titleMatch ? titleMatch[1]!.trim() : f,
      };
    });

    return ok({ postmortems, daysBack: days });
  },
);

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

const transport = new StdioServerTransport();
await server.connect(transport);
