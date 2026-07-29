// Structured jira-link marker emission, location, and validation (LS-7895,
// phase 2 of RFC docs/rfcs/draft-declared-ticket-linkage.md). The HTML comment
// is the parse target for jira-branch-sync; the visible **Jira:** line is for
// humans. Validation mirrors `.github/scripts/jira-link-check.mjs` so callers
// can reject a bad marker before CI does (LS-8721).

export const JIRA_BROWSE_URL = 'https://bkrupa.atlassian.net/browse';

const TICKET_KEY_RE = /\bLS-\d+\b/;
const KEY_RE = /^LS-\d+$/;

export interface JiraLinkOptions {
  /** Exactly one ticket key (LS-####) or 'none' for bot/dependabot PRs. */
  primary: string;
  /** Optional related keys — informational only, never auto-transitioned. */
  related?: string[];
}

export function isValidPrimary(value: string): boolean {
  return value === 'none' || KEY_RE.test(value);
}

/** First LS-#### key in the given text (PR title), or null. */
export function extractPrimaryKey(text: string): string | null {
  const match = TICKET_KEY_RE.exec(text);
  return match ? match[0] : null;
}

/**
 * Prepend the primary Jira key to a PR title when it isn't already present.
 * Mirrors the title check in `.github/scripts/jira-link-check.mjs`, which
 * requires the primary key to appear anywhere in the title — not opinionated
 * about a strict prefix, but a leading "LS-#### " is the repo convention.
 */
export function ensureTitleHasPrimaryKey(
  title: string,
  primary: string,
): string {
  if (primary === 'none') return title;
  const titleKeys: string[] = title.match(/\bLS-\d+\b/g) ?? [];
  if (titleKeys.includes(primary)) return title;
  return `${primary} ${title}`;
}

/**
 * Blank out fenced code blocks and inline code spans. Markers quoted in code
 * are documentation, not declarations (LS-7914). Blanking rather than deleting
 * preserves both length and line structure, so match indices map 1:1 back onto
 * the original body — `findJiraLinkBlocks` relies on that to splice accurately.
 */
function maskQuotedCode(body: string): string {
  const blank = (match: string): string => match.replace(/[^\n]/g, ' ');
  return body.replace(/```[\s\S]*?```/g, blank).replace(/`[^`\n]+`/g, blank);
}

/** The marker comment plus its optional trailing visible `**Jira:**` line. */
const JIRA_LINK_BLOCK_SOURCE =
  /<!--\s*jira-link\b[\s\S]*?-->(?:\s*\n\n\*\*Jira:\*\*[^\n]*)?\n*/.source;

/** Half-open [start, end) spans of every declared marker block in `body`. */
function findJiraLinkBlocks(body: string): { start: number; end: number }[] {
  const masked = maskQuotedCode(body);
  const matches = masked.matchAll(new RegExp(JIRA_LINK_BLOCK_SOURCE, 'gi'));
  return [...matches].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
  }));
}

/** The first declared jira-link block in `body`, or null when there is none. */
export function extractJiraLinkBlock(body: string): string | null {
  const [first] = findJiraLinkBlocks(body);
  return first ? body.slice(first.start, first.end).trimEnd() : null;
}

/**
 * Remove every declared jira-link block from `body`, leaving quoted ones
 * intact. Strips all of them, not just the first — a body carrying duplicate
 * markers is itself a Jira Link Check failure, so re-injecting a known-good
 * block only helps if the rest are gone.
 */
export function stripJiraLinkBlocks(body: string): string {
  const spans = findJiraLinkBlocks(body);
  if (spans.length === 0) return body;
  let result = '';
  let cursor = 0;
  for (const { start, end } of spans) {
    result += body.slice(cursor, start);
    cursor = end;
  }
  return (result + body.slice(cursor)).trimStart();
}

export interface JiraLinkMarkerValidation {
  /** A marker block is declared in the body (well-formed or not). */
  present: boolean;
  /** The marker satisfies every structural assertion below. */
  valid: boolean;
  /** Human-readable violations; empty when `valid`. */
  errors: string[];
}

/**
 * Validate a body's jira-link marker against the structural assertions in
 * `.github/scripts/jira-link-check.mjs`: exactly one marker block, declaring
 * exactly one well-formed `primary:` (an LS-#### key or `none`), with any
 * `related:` keys well-formed too.
 *
 * The CI check's remaining assertions — `primary: none` requires the `no-jira`
 * label, the primary key appears in the PR title, the ticket exists in Jira —
 * need the PR's labels, title, and a Jira round-trip, so they are out of scope
 * for a body-only validator and stay CI's job.
 */
export function validateJiraLinkMarker(body: string): JiraLinkMarkerValidation {
  const masked = maskQuotedCode(body);
  const blocks = [...masked.matchAll(/<!--\s*jira-link\b([\s\S]*?)-->/gi)];
  const errors: string[] = [];

  if (blocks.length === 0) {
    return {
      present: false,
      valid: false,
      errors: ['PR body has no `<!-- jira-link -->` marker.'],
    };
  }

  if (blocks.length > 1) {
    errors.push(
      `PR body has ${blocks.length} jira-link markers — exactly one is ` +
        'allowed. Remove the duplicates.',
    );
    return { present: true, valid: false, errors };
  }

  const content = blocks[0][1] ?? '';

  const primaryLines = [...content.matchAll(/^[ \t]*primary:[ \t]*(.*)$/gim)];
  if (primaryLines.length === 0) {
    errors.push(
      'jira-link marker has no `primary:` line. Declare exactly one primary ' +
        'key (LS-####) or `primary: none`.',
    );
  } else if (primaryLines.length > 1) {
    errors.push(
      `jira-link marker has ${primaryLines.length} \`primary:\` lines — ` +
        'exactly one is allowed. One ticket = one PR; move extra keys to ' +
        '`related:`.',
    );
  } else {
    const value = primaryLines[0][1].trim();
    if (!isValidPrimary(value)) {
      errors.push(
        `jira-link \`primary: ${value}\` is not a valid value — expected an ` +
          'uppercase LS-#### key or `none`.',
      );
    }
  }

  for (const line of content.matchAll(/^[ \t]*related:[ \t]*(.*)$/gim)) {
    for (const token of line[1].split(/[,\s]+/).filter(Boolean)) {
      if (!KEY_RE.test(token)) {
        errors.push(
          `jira-link \`related:\` contains "${token}" — expected ` +
            'comma/space-separated uppercase LS-#### keys.',
        );
      }
    }
  }

  return { present: true, valid: errors.length === 0, errors };
}

export function hasJiraLinkMarker(body: string): boolean {
  return validateJiraLinkMarker(body).present;
}

/**
 * Parse a related-keys input (array or comma/space-separated string) into a
 * deduplicated list of LS-#### keys. Throws on any token that is not a key.
 */
export function parseRelatedKeys(
  input: string | string[] | undefined,
): string[] {
  if (!input) return [];
  const tokens = (Array.isArray(input) ? input : input.split(/[,\s]+/))
    .map((t) => t.trim())
    .filter(Boolean);
  const keys: string[] = [];
  for (const token of tokens) {
    if (!KEY_RE.test(token)) {
      throw new Error(
        `Invalid related Jira key "${token}" — expected LS-#### format.`,
      );
    }
    if (!keys.includes(token)) keys.push(token);
  }
  return keys;
}

/** The HTML comment alone — the machine parse target. */
export function buildJiraLinkComment(options: JiraLinkOptions): string {
  const { primary, related = [] } = options;
  const lines = ['<!-- jira-link', `primary: ${primary}`];
  if (related.length > 0) {
    lines.push(`related: ${related.join(', ')}`);
  }
  lines.push('-->');
  return lines.join('\n');
}

/**
 * Build the marker block: HTML comment (parse target) plus the visible
 * **Jira:** line. `primary: none` emits the comment only — there is no
 * ticket to link for humans.
 */
export function buildJiraLinkBlock(options: JiraLinkOptions): string {
  const comment = buildJiraLinkComment(options);
  if (options.primary === 'none') return comment;
  return `${comment}\n\n**Jira:** [${options.primary}](${JIRA_BROWSE_URL}/${options.primary})`;
}

/**
 * Prepend the jira-link marker to a PR body. No-op when the body already
 * carries a marker (caller templated it). When the body already has a visible
 * **Jira:** line (the standard PR body template does), only the HTML comment
 * is prepended to avoid duplicating the human-facing link.
 */
export function ensureJiraLinkMarker(
  body: string,
  options: JiraLinkOptions,
): string {
  if (hasJiraLinkMarker(body)) return body;
  const block = body.includes('**Jira:**')
    ? buildJiraLinkComment(options)
    : buildJiraLinkBlock(options);
  return `${block}\n\n${body}`;
}
