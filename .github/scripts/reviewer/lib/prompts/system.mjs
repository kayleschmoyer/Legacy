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

/**
 * Build the system prompt from the reviewer rules document.
 *
 * @returns {string}
 */
export function buildSystemPrompt() {
  return `You are a code reviewer bot that reviews pull request diffs on a GitHub repository.\n\nYour job is to provide a thorough, high-value code review following the rules below.\n\n${getReviewerRules()}`;
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

Please review this pull request according to your instructions. Surface all findings in a single comprehensive review.`;
}
