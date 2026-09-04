import { markdownTable } from '@legacy-sports/mcp-format';
import { getRepoOwnerName } from '../auth.js';
import { githubRest } from '../github-api.js';
import type { ToolResult } from '../types.js';

// Flat, uniform list → Markdown table (LS-8021 convention).
const TIMELINE_COLUMNS = [
  'event',
  'createdAt',
  'actor',
  'requestedReviewer',
  'label',
] as const;

// Event types returned by default when `events` is omitted — the subset
// this tool exists for (review request history + label forensics, per
// LS-9386) rather than the full chatty timeline (every commit/comment/etc).
const DEFAULT_EVENTS = [
  'review_requested',
  'review_request_removed',
  'labeled',
  'unlabeled',
];

interface PrTimelineParams {
  number: number;
  events?: string[];
  limit?: number;
}

interface GitHubActor {
  login: string;
}

interface GitHubTimelineEvent {
  event: string;
  created_at?: string;
  actor?: GitHubActor | null;
  requested_reviewer?: GitHubActor | null;
  requested_team?: { name: string } | null;
  review_requester?: GitHubActor | null;
  label?: { name: string } | null;
}

interface MappedTimelineEvent {
  [key: string]: unknown;
  event: string;
  createdAt: string;
  actor: string;
  requestedReviewer?: string;
  label?: string;
}

function mapEvent(e: GitHubTimelineEvent): MappedTimelineEvent {
  const requestedReviewer =
    e.requested_reviewer?.login ??
    (e.requested_team ? `team:${e.requested_team.name}` : undefined);

  return {
    event: e.event,
    createdAt: e.created_at ?? '',
    actor: e.actor?.login ?? e.review_requester?.login ?? 'unknown',
    ...(requestedReviewer !== undefined ? { requestedReviewer } : {}),
    ...(e.label ? { label: e.label.name } : {}),
  };
}

export async function prTimeline(
  params: PrTimelineParams,
): Promise<ToolResult> {
  try {
    const repo = await getRepoOwnerName();
    const path = `/repos/${repo.owner}/${repo.name}/issues/${params.number}/timeline`;
    const wantedEvents = new Set(params.events ?? DEFAULT_EVENTS);
    const limit = params.limit ?? 100;

    const events: GitHubTimelineEvent[] = [];
    let page = 1;
    const perPage = 100;
    while (true) {
      const batch = await githubRest<GitHubTimelineEvent[]>({
        method: 'GET',
        path,
        query: { per_page: String(perPage), page: String(page) },
      });
      events.push(...batch);
      if (batch.length < perPage) break;
      page++;
    }

    const filtered = events.filter((e) => wantedEvents.has(e.event));
    const hasMore = filtered.length > limit;
    const limited = filtered.slice(0, limit);
    const mapped = limited.map(mapEvent);

    const eventsDesc =
      params.events && params.events.length > 0
        ? params.events.join(', ')
        : `default (${DEFAULT_EVENTS.join(', ')})`;
    const header = `_PR #${params.number}, events: ${eventsDesc}, total: ${filtered.length}, returned: ${mapped.length}${hasMore ? ', hasMore: true' : ''}_`;

    const text =
      mapped.length === 0
        ? `No matching timeline events found for PR #${params.number}.`
        : `${header}\n\n${markdownTable(mapped, { columns: TIMELINE_COLUMNS })}`;

    return {
      content: [{ type: 'text', text }],
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to get timeline for PR #${params.number}: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}
