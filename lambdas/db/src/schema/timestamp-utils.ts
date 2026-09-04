/**
 * Normalize a PostgreSQL timestamp string to an ISO 8601 UTC string.
 *
 * Handles two formats returned by the `pg` driver:
 *  - TIMESTAMPTZ: "2024-01-15 14:30:00.123456+00" (after LS-474 migration)
 *  - TIMESTAMP:   "2024-01-15 14:30:00.123456"    (pre-migration rows / legacy)
 *
 * In both cases the value is already UTC; we just need to produce a proper
 * ISO 8601 string with a Z suffix so JavaScript's Date constructor treats it
 * as UTC and toLocaleTimeString() converts to the viewer's local timezone.
 *
 * Node.js Date requires timezone offsets in +HH:MM format (ISO 8601 §5.6).
 * PostgreSQL emits bare +HH (e.g. "+00") without the ":MM" minutes component,
 * which causes `new Date(...)` to return Invalid Date (LS-491).  We expand
 * bare offsets to +HH:00 before parsing.
 *
 * Shared by chat-and-tiebreakers.ts and league-messages-helper.ts (LS-9666)
 * so the two never drift.
 */
export function toUtcIso(pgTs: string): string {
  // Replace PostgreSQL space separator with T.
  let normalized = pgTs.replace(' ', 'T');
  // Expand bare +HH / -HH offsets to +HH:00 / -HH:00 so they are valid ISO 8601.
  normalized = normalized.replace(/([+-]\d{2})$/, '$1:00');
  if (normalized.endsWith('Z') || normalized.includes('+')) {
    return new Date(normalized).toISOString();
  }
  return new Date(normalized + 'Z').toISOString();
}
