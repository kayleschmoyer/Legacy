import { minifiedJson } from '@legacy-sports/mcp-format';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  BLOCKER_FIELD,
  type BlockerVerdict,
  evaluateBlockers,
  type JiraIssueLink,
} from '../blockers.js';
import { searchJqlAll } from '../jql-search.js';

interface CheckBlockersParams {
  key?: string | string[];
  keys?: string | string[];
}

interface BlockerFields {
  issuelinks?: JiraIssueLink[];
}

interface KeyedVerdict extends BlockerVerdict {
  key: string;
}

const JIRA_KEY_RE = /^[A-Z][A-Z0-9_]+-\d+$/;
const MAX_KEYS = 50;

/**
 * Check whether a ticket's blockers are resolved, for one ticket or up to 50 in
 * a single call.
 *
 * A single key returns the flat { canProceed, blockers, recommendation } shape
 * callers have always received. Multiple keys resolve through one `key IN (...)`
 * JQL search rather than N per-issue GETs, so batch dispatch flows can filter
 * blocked tickets inline instead of delegating the sweep to a sub-agent.
 */
export async function checkBlockers(
  params: CheckBlockersParams,
): Promise<CallToolResult> {
  const requested = normalizeKeys(params);

  if (requested.length === 0) {
    return errorResult('No ticket key provided. Pass key or keys (1-50).');
  }
  if (requested.length > MAX_KEYS) {
    return errorResult(
      `Too many keys: ${requested.length}. Pass at most ${MAX_KEYS} per call.`,
    );
  }

  const invalid = requested.filter((key) => !JIRA_KEY_RE.test(key));
  if (invalid.length > 0) {
    return errorResult(
      `Invalid Jira issue key(s): ${invalid.join(', ')}. Expected format like LS-123.`,
    );
  }

  const single = isSingleKey(params) ? requested[0] : null;

  try {
    const issues = await searchJqlAll<BlockerFields>({
      jql: `key IN (${requested.join(', ')})`,
      fields: [BLOCKER_FIELD],
    });

    const verdicts = new Map<string, BlockerVerdict>(
      issues.map((issue) => [
        issue.key,
        evaluateBlockers(issue.fields.issuelinks),
      ]),
    );

    if (single) {
      const verdict = verdicts.get(single);
      if (!verdict) {
        return errorResult(
          `Failed to check blockers for ${single}: not found.`,
        );
      }
      return { content: [{ type: 'text', text: minifiedJson(verdict) }] };
    }

    const results: KeyedVerdict[] = [];
    const notFound: string[] = [];

    for (const key of requested) {
      const verdict = verdicts.get(key);
      if (verdict) results.push({ key, ...verdict });
      else notFound.push(key);
    }

    const payload: Record<string, unknown> = {
      total: results.length,
      unblocked: results.filter((r) => r.canProceed).map((r) => r.key),
      blocked: results.filter((r) => !r.canProceed).map((r) => r.key),
      results,
    };
    if (notFound.length > 0) payload.notFound = notFound;

    return { content: [{ type: 'text', text: minifiedJson(payload) }] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return errorResult(
      `Failed to check blockers for ${requested.join(', ')}: ${message}`,
    );
  }
}

/** Accept key/keys as a single string, a comma-separated string, or an array. */
function normalizeKeys(params: CheckBlockersParams): string[] {
  const raw = [params.key, params.keys].flatMap((value) => {
    if (value === undefined) return [];
    return Array.isArray(value) ? value : value.split(',');
  });

  const seen = new Set<string>();
  for (const value of raw) {
    const key = value.trim();
    if (key.length > 0) seen.add(key);
  }
  return [...seen];
}

/** Only the legacy single-`key` form gets the flat, unwrapped response. */
function isSingleKey(params: CheckBlockersParams): boolean {
  return (
    params.keys === undefined &&
    typeof params.key === 'string' &&
    !params.key.includes(',')
  );
}

function errorResult(message: string): CallToolResult {
  return {
    isError: true,
    content: [{ type: 'text', text: message }],
  };
}
