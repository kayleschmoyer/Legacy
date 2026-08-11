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
 * (action='claim') and the deprecated `jira_claim_ticket` alias. Caller-
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
    "Only used when action='claim'. Open PRs the caller has already found to reference this ticket key — e.g. " +
      "github_pr_dashboard(state: 'open') filtered by key. The jira server has no GitHub credentials of its own " +
      "(LS-9289) and cannot check this itself. When non-empty, claim returns action: 'PR_EXISTS' (instead of " +
      "'PROCEED') with the PR list attached, to prevent duplicate work on a ticket someone else already opened a " +
      'PR for. Omit (or pass []) when no open PR was found or the check was skipped.',
  );
