import { z } from 'zod';

/**
 * Zod schema for the `keys` / `key` parameter shared by `jira_transition` and
 * its deprecated aliases. Accepts a single Jira key string, a JSON-encoded
 * array of keys (as agents sometimes send), or a real array of keys (1-50).
 */
export const jiraKeysSchema = z
  .preprocess(
    (v) => {
      if (typeof v === 'string') {
        try {
          const parsed = JSON.parse(v);
          if (Array.isArray(parsed)) return parsed;
        } catch {
          // not JSON — treat as single key string
        }
      }
      return v;
    },
    z.union([
      z
        .string()
        .regex(
          /^[A-Z][A-Z0-9_]+-\d+$/,
          'Must be a valid Jira issue key (e.g., LS-1137)',
        ),
      z
        .array(
          z
            .string()
            .regex(
              /^[A-Z][A-Z0-9_]+-\d+$/,
              'Each key must be a valid Jira issue key (e.g., LS-1137)',
            ),
        )
        .min(1)
        .max(50),
    ]),
  )
  .describe('Ticket key (string) or array of ticket keys');
