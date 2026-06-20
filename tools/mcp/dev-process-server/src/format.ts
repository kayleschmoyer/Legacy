// Token-efficient formatting for dev-process-server's list-shaped tools
// (rfc_list_open, adr_list, postmortem_recent, postmortem_action_items,
// testplan_extract). The cross-server standard and helper live in
// `@legacy-sports/mcp-format` (epic LS-8018 / LS-8019); this module only pins
// the per-tool column sets — the first-order field-selection lever — and a tiny
// table-or-empty wrapper so every list tool renders identically.

import { markdownTable, type FlatRecord } from '@legacy-sports/mcp-format';

/** rfc_list_open: the title identifies the RFC, the file path is how it's opened. */
export const RFC_LIST_COLUMNS = ['title', 'file'] as const;

/** adr_list: number/status/title are the triage fields; file is how it's opened. */
export const ADR_LIST_COLUMNS = ['number', 'status', 'title', 'file'] as const;

/** postmortem_recent: date/severity/title triage an incident; file is how it's opened. */
export const POSTMORTEM_RECENT_COLUMNS = [
  'date',
  'severity',
  'title',
  'file',
] as const;

/** postmortem_action_items: every column is consumed when chasing follow-ups. */
export const ACTION_ITEM_COLUMNS = [
  'ticket',
  'owner',
  'action',
  'due',
  'postmortem',
] as const;

/** testplan_extract: the parsed TestCase fields agents read off each case. */
export const TESTPLAN_CASE_COLUMNS = [
  'text',
  'completed',
  'isAutomated',
  'isManual',
  'testFile',
] as const;

/**
 * Render a flat, uniform record list as a compact Markdown table (column
 * headers written once instead of repeating JSON keys per row), or a short
 * human-readable message when there are no rows — `markdownTable` returns `''`
 * for an empty array, so the caller owns the "no results" signal.
 */
export function tableText<T extends FlatRecord>(
  rows: readonly T[],
  columns: readonly (keyof T)[],
  emptyMessage: string,
): string {
  return rows.length === 0 ? emptyMessage : markdownTable(rows, { columns });
}
