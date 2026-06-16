import { truncate } from '@legacy-sports/mcp-format';

/**
 * Rollbar's list endpoints paginate and default to 20 results per page. We
 * expose `perPage` to let agents widen a page, and use this default to detect a
 * full page (more results likely exist) when the caller didn't specify one.
 */
export const ROLLBAR_DEFAULT_PER_PAGE = 20;

/**
 * Append a hint when a page came back full, so an agent knows the list is
 * paginated and more results may exist on the next page. Returns the table
 * unchanged when the page wasn't full.
 */
export function withPageFullHint(
  table: string,
  rowCount: number,
  perPage: number | undefined,
  nextPage: number,
): string {
  const pageSize = perPage ?? ROLLBAR_DEFAULT_PER_PAGE;
  if (rowCount < pageSize) return table;
  return `${table}\n\n_Page full (${rowCount} results) — more may exist. Request page ${nextPage}${perPage === undefined ? ' or raise perPage' : ''}._`;
}

/** Subset of a Rollbar item we surface; the API returns many more fields. */
export interface RollbarItem {
  // Index signature lets items flow into @legacy-sports/mcp-format's FlatRecord
  // helpers (pickFields/markdownTable) while keeping the named fields typed.
  [key: string]: unknown;
  id?: number;
  counter?: number;
  title?: string;
  level?: string;
  status?: string;
  environment?: string;
  framework?: string;
  total_occurrences?: number;
  unique_occurrences?: number;
  first_occurrence_timestamp?: number;
  last_occurrence_timestamp?: number;
}

/** Columns surfaced for item lists (flat → Markdown table). */
export const ITEM_LIST_COLUMNS = [
  'counter',
  'title',
  'level',
  'status',
  'environment',
  'total_occurrences',
  'last_occurrence_timestamp',
] as const;

/** A single Rollbar occurrence ("instance"). `data` holds the full payload. */
export interface RollbarInstance {
  id?: number;
  timestamp?: number;
  version?: number;
  data?: {
    body?: {
      message?: { body?: string };
      trace?: { exception?: { class?: string; message?: string } };
      trace_chain?: Array<{ exception?: { class?: string; message?: string } }>;
    };
  };
}

/**
 * Extract a concise one-line summary from an occurrence payload — the message
 * body or the exception class/message — truncated so a single occurrence can't
 * dominate the response.
 */
export function occurrenceSummary(instance: RollbarInstance): string {
  const body = instance.data?.body;
  const exception =
    body?.trace?.exception ?? body?.trace_chain?.[0]?.exception ?? undefined;
  let summary = '';
  if (body?.message?.body) {
    summary = body.message.body;
  } else if (exception) {
    summary = [exception.class, exception.message].filter(Boolean).join(': ');
  }
  return truncate(summary, 200);
}
