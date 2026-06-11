// Structured jira-link marker emission (LS-7895, phase 2 of RFC
// docs/rfcs/draft-declared-ticket-linkage.md). The HTML comment is the parse
// target for jira-branch-sync; the visible **Jira:** line is for humans.

export const JIRA_BROWSE_URL = 'https://bkrupa.atlassian.net/browse';

const TICKET_KEY_RE = /\bLS-\d+\b/;
const MARKER_RE = /<!--\s*jira-link\b/i;

export interface JiraLinkOptions {
  /** Exactly one ticket key (LS-####) or 'none' for bot/dependabot PRs. */
  primary: string;
  /** Optional related keys — informational only, never auto-transitioned. */
  related?: string[];
}

export function isValidPrimary(value: string): boolean {
  return value === 'none' || /^LS-\d+$/.test(value);
}

/** First LS-#### key in the given text (PR title), or null. */
export function extractPrimaryKey(text: string): string | null {
  const match = TICKET_KEY_RE.exec(text);
  return match ? match[0] : null;
}

export function hasJiraLinkMarker(body: string): boolean {
  return MARKER_RE.test(body);
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
    if (!/^LS-\d+$/.test(token)) {
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
