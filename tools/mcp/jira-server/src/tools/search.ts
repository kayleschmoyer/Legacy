import {
  type FlatRecord,
  markdownTable,
  pickFields,
} from '@legacy-sports/mcp-format';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  BLOCKER_COLUMNS,
  BLOCKER_FIELD,
  blockerColumns,
  type JiraIssueLink,
} from '../blockers.js';
import { searchJql } from '../jql-search.js';
import {
  SEARCH_COLUMNS,
  SEARCH_COMPACT_COLUMNS,
  withNextPageHint,
} from '../format.js';

interface SearchParams {
  jql: string;
  maxResults?: number;
  compact?: boolean;
  pageToken?: string;
  fields?: string[];
  includeBlockers?: boolean;
}

interface SearchFields {
  summary: string;
  status: { name: string };
  issuetype: { name: string };
  assignee: { displayName: string; emailAddress?: string } | null;
  priority: { name: string } | null;
  issuelinks?: JiraIssueLink[];
}

const DEFAULT_FIELDS = [
  'summary',
  'status',
  'issuetype',
  'assignee',
  'priority',
];
const COMPACT_FIELDS = ['summary', 'status'];

/** Best-effort scalar rendering of a raw Jira field value for the custom-fields table. */
function renderFieldValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (typeof obj.name === 'string') return obj.name;
    if (typeof obj.displayName === 'string') return obj.displayName;
    if (typeof obj.value === 'string') return obj.value;
  }
  return value;
}

/** Search Jira issues using JQL via the v3 search/jql endpoint. */
export async function search(params: SearchParams): Promise<CallToolResult> {
  const {
    jql,
    maxResults: rawMax = 15,
    compact = false,
    pageToken,
    fields: customFields,
    includeBlockers = false,
  } = params;
  const maxResults = Math.max(1, Math.min(50, Math.floor(rawMax)));

  // `issuelinks` rides along in the same JQL response, so blocker annotation
  // costs no extra request — see ../blockers.ts.
  const withBlockers = (
    row: FlatRecord,
    issuelinks?: JiraIssueLink[],
  ): FlatRecord =>
    includeBlockers ? { ...row, ...blockerColumns(issuelinks) } : row;
  const columnsWith = (base: readonly string[]): string[] =>
    includeBlockers ? [...base, ...BLOCKER_COLUMNS] : [...base];
  const requestFields = (base: string[]): string[] =>
    includeBlockers ? [...base, BLOCKER_FIELD] : base;

  try {
    if (customFields && customFields.length > 0) {
      const result = await searchJql<Record<string, unknown>>({
        jql,
        fields: requestFields(customFields),
        maxResults,
        pageToken,
      });

      const issues: FlatRecord[] = result.issues.map((issue) => {
        const row: Record<string, unknown> = { key: issue.key };
        for (const field of customFields) {
          row[field] = renderFieldValue(issue.fields[field]);
        }
        return withBlockers(
          row,
          issue.fields[BLOCKER_FIELD] as JiraIssueLink[] | undefined,
        );
      });
      const columns = columnsWith(['key', ...customFields]);
      const text =
        issues.length === 0
          ? 'No issues match this query.'
          : withNextPageHint(
              markdownTable(issues, { columns }),
              result.nextPageToken,
            );
      return { content: [{ type: 'text', text }] };
    }

    const result = await searchJql<SearchFields>({
      jql,
      fields: requestFields(compact ? COMPACT_FIELDS : DEFAULT_FIELDS),
      maxResults,
      pageToken,
    });

    if (compact) {
      const columns = columnsWith(SEARCH_COMPACT_COLUMNS);
      const issues = result.issues.map((issue) =>
        withBlockers(
          {
            key: issue.key,
            summary: issue.fields.summary,
            status: issue.fields.status.name,
          },
          issue.fields.issuelinks,
        ),
      );
      const text =
        issues.length === 0
          ? 'No issues match this query.'
          : withNextPageHint(
              markdownTable(pickFields(issues, columns), { columns }),
              result.nextPageToken,
            );
      return { content: [{ type: 'text', text }] };
    }

    const columns = columnsWith(SEARCH_COLUMNS);
    const issues: FlatRecord[] = result.issues.map((issue) =>
      withBlockers(
        {
          key: issue.key,
          summary: issue.fields.summary,
          status: issue.fields.status.name,
          type: issue.fields.issuetype.name,
          assignee: issue.fields.assignee?.displayName ?? '',
          priority: issue.fields.priority?.name ?? '',
        },
        issue.fields.issuelinks,
      ),
    );

    const text =
      issues.length === 0
        ? 'No issues match this query.'
        : withNextPageHint(
            markdownTable(pickFields(issues, columns), { columns }),
            result.nextPageToken,
          );

    return { content: [{ type: 'text', text }] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Jira search failed: ${message}`,
        },
      ],
    };
  }
}
