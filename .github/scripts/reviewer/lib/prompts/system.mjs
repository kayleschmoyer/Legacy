import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// reviewer-rules.md lives at .github/reviewer-rules.md; this script is at
// .github/scripts/reviewer/lib/prompts/system.mjs — four directories up.
// Primary: .github/reviewer-rules.md (added by T5); fallback to
// copilot-instructions.md so the reviewer can run before T5 merges.
const RULES_PATH = resolve(__dirname, '../../../../reviewer-rules.md');
const FALLBACK_RULES_PATH = resolve(
  __dirname,
  '../../../../copilot-instructions.md',
);

let _rules;
function getReviewerRules() {
  if (!_rules) {
    try {
      _rules = readFileSync(RULES_PATH, 'utf8').trim();
    } catch {
      _rules = readFileSync(FALLBACK_RULES_PATH, 'utf8').trim();
    }
  }
  return _rules;
}

const SEVERITY_AND_CRITIQUE_ADDENDUM = `
## Severity Classification

Assign one of these severity levels to every finding:

- **critical**: severe bugs, security vulnerabilities, or breaking changes with catastrophic impact
- **high**: bugs, broken API/type contracts, missing tests for new behavior, breaking changes for callers, or performance regressions with measurable impact
- **medium**: substantive correctness, maintainability, or reliability issues that are important but not release-blocking
- **low**: minor improvements with a clear rationale, including non-blocking clarity or refactor suggestions
- **trivia**: bikeshedding, purely aesthetic preferences, anything that would not prevent a bug, security issue, broken test, or contract violation

NEVER produce findings about formatting or import ordering — ESLint and Prettier own those.

## Self-Critique Pass

Before producing your final output, silently critique every finding you have identified:

> For each finding: would addressing this prevent a real bug, security issue, broken test, or contract violation? If no, discard it. Be ruthless. Confidence < 0.7 is removal. Only surviving findings appear in the output.

Apply these rules:
- Drop findings where the answer is "no", including speculative concerns ("could happen if…")
- Drop findings with confidence below 0.7
- Drop findings that are only about code style, formatting, or naming when ESLint/Prettier would catch them
- Keep findings that prevent real defects or violations

## Output Format

Output ONLY a JSON array of surviving findings — no prose outside the JSON.

Each finding MUST include these fields:
- \`"severity"\`: one of \`"critical"\`, \`"high"\`, \`"medium"\`, \`"low"\`, \`"trivia"\`
- \`"file"\`: the file path (or \`null\` for PR-level comments)
- \`"line"\`: the line number (or \`null\` for file-level or PR-level)
- \`"title"\`: a short one-line summary (under 80 characters)
- \`"body"\`: detailed explanation with a concrete fix suggestion

If there are no findings after the self-critique pass, output an empty JSON array: \`[]\`

Example output:
\`\`\`json
[
  {
    "severity": "high",
    "file": "src/auth/login.ts",
    "line": 42,
    "title": "SQL injection via unescaped user input",
    "body": "The \`userId\` parameter is interpolated directly into the SQL query string without escaping. Use a parameterised query instead."
  }
]
\`\`\``;

/**
 * Build the system prompt from the reviewer rules document.
 *
 * @param {string} [cycleRoleSection] Role-specific section from cycle-protocol.mjs.
 *   When provided it is injected between the reviewer rules and the severity/output
 *   addendum so the model sees its current cycle role before output instructions.
 * @returns {string}
 */
export function buildSystemPrompt(cycleRoleSection = '') {
  const cycleBlock = cycleRoleSection ? `\n\n${cycleRoleSection}` : '';
  return `You are a code reviewer bot that reviews pull request diffs on a GitHub repository.\n\nYour job is to provide a thorough, high-value code review following the rules below.\n\n${getReviewerRules()}${cycleBlock}${SEVERITY_AND_CRITIQUE_ADDENDUM}`;
}

/**
 * Build the user prompt from the PR context.
 *
 * @param {{ title: string, body: string, headRefName: string, baseRefName: string, diff: string }} ctx
 * @returns {string}
 */
export function buildUserPrompt(ctx) {
  const { title, body, headRefName, baseRefName, diff } = ctx;

  return `## Pull Request: ${title}

**Branch**: \`${headRefName}\` → \`${baseRefName}\`

**Description**:
${body?.trim() || '_No description provided._'}

## Diff

\`\`\`diff
${diff?.trim() || '_No diff available._'}
\`\`\`

Review this pull request according to your instructions. Apply the self-critique pass, then output your findings as a JSON array.`;
}
