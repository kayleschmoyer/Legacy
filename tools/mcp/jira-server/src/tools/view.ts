import { minifiedJson } from '@legacy-sports/mcp-format';
import { jiraRequest } from '../jira-api.js';
import { searchJqlAll } from '../jql-search.js';
import { extractAdfText } from '../adf.js';
import { matchesStatus } from '../locale.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export type ViewParams =
  | { key: string; format?: 'markdown' | 'json' }
  | { keys: string[] };

interface JiraIssueLink {
  type: { name: string; inward: string };
  inwardIssue?: {
    key: string;
    fields?: { summary?: string; status?: { name: string } };
  };
}

interface JiraIssueResponse {
  key: string;
  fields: {
    summary: string;
    status: { name: string };
    issuetype: { name: string };
    description: unknown;
    assignee: { displayName: string } | null;
    reporter: { displayName: string } | null;
    parent?: { key: string; fields?: { summary?: string } };
    issuelinks: JiraIssueLink[];
    labels: string[];
    priority: { name: string } | null;
    created: string;
    updated: string;
  };
}

interface BlockerInfo {
  key: string;
  type: string;
  summary?: string;
  status?: string;
}

interface ChildInfo {
  key: string;
  summary: string;
  status: string;
}

interface ChildCounts {
  total: number;
  toDo: number;
  inProgress: number;
  inReview: number;
  done: number;
}

interface Ticket {
  key: string;
  summary: string;
  status: string;
  type: string;
  priority: string;
  description: string;
  assignee: string;
  reporter: string;
  parent: string;
  parentSummary: string;
  labels: string[];
  created: string;
  updated: string;
  blockers: BlockerInfo[];
  children: ChildInfo[];
}

/** Extract blocker keys (and, when expanded, summary/status) from issue links. */
function extractBlockers(links: JiraIssueLink[]): BlockerInfo[] {
  return links
    .filter(
      (link) =>
        link.inwardIssue &&
        link.type.inward.toLowerCase().includes('is blocked by'),
    )
    .map((link) => ({
      key: link.inwardIssue!.key,
      type: 'blocked-by',
      summary: link.inwardIssue!.fields?.summary,
      status: link.inwardIssue!.fields?.status?.name,
    }));
}

/** Bucket children by status for the JSON shape. */
function summarizeChildren(children: ChildInfo[]): ChildCounts {
  const counts = { toDo: 0, inProgress: 0, inReview: 0, done: 0 };
  for (const child of children) {
    if (matchesStatus(child.status, 'Done')) counts.done++;
    else if (matchesStatus(child.status, 'In Review')) counts.inReview++;
    else if (matchesStatus(child.status, 'In Progress')) counts.inProgress++;
    else counts.toDo++;
  }
  return { total: children.length, ...counts };
}

/** Render the ticket as the markdown card defined in LS-8173. */
export function renderMarkdown(ticket: Ticket): string {
  const lines: string[] = [];
  lines.push(`## [${ticket.key}] ${ticket.summary}`);
  lines.push('');

  const metaParts = [
    `**Status:** ${ticket.status}`,
    `**Type:** ${ticket.type}`,
    `**Priority:** ${ticket.priority || 'None'}`,
    `**Assignee:** ${ticket.assignee || 'Unassigned'}`,
  ];
  lines.push(metaParts.join(' · '));

  if (ticket.parent) {
    const parentLabel = ticket.parentSummary
      ? `${ticket.parent} (${ticket.parentSummary})`
      : ticket.parent;
    lines.push(`**Parent:** ${parentLabel}`);
  }

  if (ticket.labels.length > 0) {
    lines.push(`**Labels:** ${ticket.labels.join(', ')}`);
  }

  lines.push('');
  lines.push('### Description');
  lines.push(ticket.description.trim() || '_No description._');

  lines.push('');
  lines.push('### Blockers');
  if (ticket.blockers.length === 0) {
    lines.push('_None._');
  } else {
    for (const b of ticket.blockers) {
      const summary = b.summary ? ` — ${b.summary}` : '';
      const status = b.status ? ` [${b.status}]` : '';
      lines.push(`- ${b.key}${summary}${status}`);
    }
  }

  lines.push('');
  lines.push('### Children');
  if (ticket.children.length === 0) {
    lines.push('_None._');
  } else {
    for (const c of ticket.children) {
      lines.push(`- ${c.key} — ${c.summary} [${c.status}]`);
    }
  }

  return lines.join('\n');
}

/** Project the internal Ticket into the legacy JSON output shape. */
function ticketToJson(ticket: Ticket): Record<string, unknown> {
  const json: Record<string, unknown> = {
    key: ticket.key,
    summary: ticket.summary,
    status: ticket.status,
    type: ticket.type,
    priority: ticket.priority,
    description: ticket.description,
    assignee: ticket.assignee,
    reporter: ticket.reporter,
    parent: ticket.parent,
    labels: ticket.labels,
    created: ticket.created,
    updated: ticket.updated,
    blockers: ticket.blockers.map((b) => ({ key: b.key, type: b.type })),
  };
  if (ticket.children.length > 0) {
    json.children = summarizeChildren(ticket.children);
  }
  return json;
}

/** Fetch and assemble a single ticket. Throws on failure. */
async function fetchTicket(key: string): Promise<Ticket> {
  // Fetch issue details and child issues concurrently to reduce latency.
  // Child search materializes full issue objects but only summary + status
  // are used. Epics rarely exceed 100 children and the Jira search API does
  // not support returning only aggregated counts.
  const [issue, childResult] = await Promise.all([
    jiraRequest<JiraIssueResponse>({
      method: 'GET',
      path: `/rest/api/3/issue/${key}`,
      query: {
        fields:
          'summary,status,issuetype,description,assignee,reporter,parent,issuelinks,labels,priority,created,updated',
      },
    }),
    searchJqlAll<{ summary: string; status: { name: string } }>({
      jql: `parent = ${JSON.stringify(key)}`,
      fields: ['summary', 'status'],
      maxResults: 100,
    }).catch(() => undefined as undefined), // Non-critical — omit on error
  ]);

  const children: ChildInfo[] = (childResult ?? []).map((c) => ({
    key: c.key,
    summary: c.fields.summary,
    status: c.fields.status.name,
  }));

  return {
    key: issue.key,
    summary: issue.fields.summary,
    status: issue.fields.status.name,
    type: issue.fields.issuetype.name,
    priority: issue.fields.priority?.name ?? '',
    description: extractAdfText(issue.fields.description),
    assignee: issue.fields.assignee?.displayName ?? '',
    reporter: issue.fields.reporter?.displayName ?? '',
    parent: issue.fields.parent?.key ?? '',
    parentSummary: issue.fields.parent?.fields?.summary ?? '',
    labels: issue.fields.labels,
    created: issue.fields.created,
    updated: issue.fields.updated,
    blockers: extractBlockers(issue.fields.issuelinks),
    children,
  };
}

/**
 * View ticket details via REST API.
 *
 * Single-key mode (`{ key, format? }`): returns the markdown card by default,
 * or the legacy JSON shape when `format: 'json'`.
 * Batch mode (`{ keys }`): fetches up to 50 tickets in parallel and returns
 * `{ tickets: { [key]: <ticket-json> }, missing: [key, ...] }`. Per-key
 * failures (404, transient errors) are isolated to `missing[]`; the call as a
 * whole still succeeds so partial results are not lost. Batch always emits
 * the JSON shape per ticket — markdown is reserved for single-ticket reads.
 */
export async function view(params: ViewParams): Promise<CallToolResult> {
  if ('keys' in params) {
    const { keys } = params;
    const results = await Promise.allSettled(keys.map((k) => fetchTicket(k)));
    const tickets: Record<string, Record<string, unknown>> = {};
    const missing: string[] = [];
    keys.forEach((key, i) => {
      const r = results[i]!;
      if (r.status === 'fulfilled') {
        tickets[key] = ticketToJson(r.value);
      } else {
        missing.push(key);
      }
    });
    return {
      content: [
        {
          type: 'text',
          text: minifiedJson({ tickets, missing }),
        },
      ],
    };
  }

  const { key, format = 'markdown' } = params;
  try {
    const ticket = await fetchTicket(key);
    const text =
      format === 'json'
        ? minifiedJson(ticketToJson(ticket))
        : renderMarkdown(ticket);
    return { content: [{ type: 'text', text }] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to fetch Jira issue ${key}: ${message}`,
        },
      ],
    };
  }
}
