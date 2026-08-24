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
          const parsed: unknown = JSON.parse(v);
          if (Array.isArray(parsed)) return parsed as unknown[];
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

/**
 * Zod schema for the `openPrs` parameter shared by `jira_transition`
 * (action='claim'). Caller-
 * supplied because the jira server has no GitHub credentials of its own and
 * cannot look this up itself (LS-9289).
 */
export const openPrRefSchema = z.object({
  number: z.number(),
  url: z.string().optional(),
  title: z.string().optional(),
});

/** A PR the caller has already found to reference a ticket's key (LS-9289). */
export type OpenPrRef = z.infer<typeof openPrRefSchema>;

export const openPrsSchema = z
  .array(openPrRefSchema)
  .optional()
  .describe(
    "action='claim' only. Open PRs the caller already found for this key (this server has no GitHub " +
      "credentials and cannot look them up). When non-empty, claim returns 'PR_EXISTS' instead of 'PROCEED'. " +
      'See .agents/skills/work-ticket/references/leaf-mode.md.',
  );
