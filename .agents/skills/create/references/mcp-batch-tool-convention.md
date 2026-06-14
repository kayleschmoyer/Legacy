# MCP Batch-Tool Convention

> **Scope**: the 10 in-repo MCP servers under `tools/mcp/*`. Out of scope: third-party servers (Atlassian, Chrome, computer-use).
>
> **Why**: any operation an agent routinely calls N times in a row (create N tickets, transition N tickets, merge N PRs, rerun N CI runs) should have a batch variant. One batch call replaces N round-trips — fewer tool-call/permission cycles, less token overhead, and atomic-ish reporting of partial failures. This is the convention every batch ticket under epic LS-8031 implements. New batch tools follow it by default.

## When a batch variant is warranted

Add a batch variant when **all** of the following hold:

- **Loop-shaped usage**: agents (or skills/workflows) call the single-item tool N times in a direct loop — MCP gap audits filing many tickets, sweeping many PRs, rerunning many CI runs, tailing logs across many resources.
- **Independent items**: each item's success/failure is independent. One item erroring should not invalidate the others.
- **Round-trip cost dominates**: the per-call overhead (network, auth, permission prompt, token framing) is a meaningful fraction of the work, so collapsing N calls into one is a real win.

Do **not** add a batch variant when:

- The operation is almost always called once (e.g. `jira_claim_ticket` at the start of a single ticket workflow).
- Items are interdependent or ordered such that a partial result is meaningless (a true all-or-nothing transaction — model that explicitly, not as a batch).
- A single underlying API call already accepts multiple items cheaply and exposes no per-item failure detail worth surfacing — wrap that API directly instead of layering this convention on top.

**The single-item tool is always retained.** A batch variant is additive, never a replacement — one-off calls stay ergonomic.

## Naming

Pick one of two equivalent forms and stay consistent within a server:

- A `bulk_*` prefix — `jira_bulk_create_tickets`.
- A `*_batch` suffix — `github_pr_batch_status`, `worktree_remove_batch`.

The batch tool accepts an **array** parameter named for the item it operates on: `keys: [...]`, `numbers: [...]`, `items: [...]`, `tickets: [...]`. Existing servers already mix both forms; either is fine — match the neighbors in the server you're editing.

> **Single tool that accepts both** (alternative): a single-item tool may instead accept _either_ a scalar or an array (see `jira_transition`, which takes `key: string | string[]` and dispatches to `bulkTransition` internally). Use this only when the single and batch paths share almost all logic; otherwise prefer a distinct batch tool so each description stays focused.

## Result shape (partial failure)

A batch call **never fails the whole call because one item errored.** It returns a structured summary with per-item outcomes:

```jsonc
{
  "success": true, // false when failed.length > 0
  "total": 5, // number of input items
  "succeeded": [
    /* per-item success objects, each carrying its index or key */
  ],
  "failed": [
    {
      "index": 3,
      "key": "LS-42",
      "error": "No transition to \"Done\" available",
    },
  ],
}
```

Rules:

- **`total`** = number of input items.
- **`succeeded`** = array of per-item success objects. Each carries enough identity to map back to its input — an `index` (position in the input array) and/or the natural `key`/`number`/`id`. Include whatever the caller needs (created `key`, `url`, warnings).
- **`failed`** = array of `{ index | key, error }`. `error` is a human-readable string. Always identify the item by `index` (and natural key when available) so the caller can retry just the failures.
- One item's error is captured in `failed[]` — it does **not** throw or short-circuit the others.
- **`isError`**: set `isError: true` on the `CallToolResult` when `failed.length > 0` (or on a whole-call failure such as over-limit / invalid input), so the agent notices. The structured body still lists every success and failure. A fully-successful batch omits `isError`.

This mirrors the shape `jira_bulk_create_tickets` already returns (`{ success, total, created, failed }`). New tools should prefer the generic key name **`succeeded`** over a domain-specific one like `created`; existing tools keep their current names for back-compat.

### Whole-call failures (still structured)

Some failures are about the call itself, not an item — return `isError: true` with a structured `{ success: false, error }` body and no partial results:

- Empty array.
- Over the max batch size (see below).
- Invalid input that fails schema validation before any work runs (e.g. malformed keys).

## Max batch size

Cap each batch at a **sensible maximum (default 50)** and reject over-limit calls with a clear, actionable error before doing any work. Enforce the cap in **both** places:

1. **Zod schema** — `z.array(itemSchema).min(1).max(50)` — gives an early, declarative rejection.
2. **Handler guard** — defense in depth, and lets you return the standard structured error shape with remediation text.

Over-limit error text should name the count and tell the agent what to do:

```
Too many items (73). Maximum per call is 50. Split into batches.
```

50 is the established cap (`jira_bulk_create_tickets`, `jira_transition`). Raise it only with a concrete reason (e.g. a read-only fan-out that batches cheaply, like `github_pr_batch_status` chunking 30 PRs per GraphQL query under the hood). Document any deviation in the tool description.

## Reference helper

Per the **self-contained server doctrine** ([create-mcp-server.md → Shared Utilities](create-mcp-server.md#shared-utilities)), MCP servers do not import across each other — they **copy and adapt** small utilities. Copy this helper into `src/batch.ts` (or inline it) in the server you're adding a batch tool to, and adapt the success type to your domain.

```ts
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export const MAX_BATCH_SIZE = 50;

/** A per-item failure. Identify by array index and, when available, a natural key. */
export interface BatchFailure {
  index: number;
  key?: string;
  error: string;
}

/** Validate batch size up front. Returns a structured error result, or null to proceed. */
export function checkBatchSize(
  count: number,
  max = MAX_BATCH_SIZE,
): CallToolResult | null {
  if (count === 0) {
    return batchError('Input array is empty. Provide at least one item.');
  }
  if (count > max) {
    return batchError(
      `Too many items (${count}). Maximum per call is ${max}. Split into batches.`,
    );
  }
  return null;
}

/** Whole-call failure (over-limit, empty, pre-flight validation). */
export function batchError(message: string): CallToolResult {
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: JSON.stringify({ success: false, error: message }),
      },
    ],
  };
}

/**
 * Assemble the standard partial-failure result. `succeeded` items should each
 * carry their own index/key so the caller can map them back to the input.
 */
export function assembleBatchResult<T>(
  total: number,
  succeeded: T[],
  failed: BatchFailure[],
  extra: Record<string, unknown> = {},
): CallToolResult {
  const hasFailures = failed.length > 0;
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          { success: !hasFailures, total, succeeded, failed, ...extra },
          null,
          2,
        ),
      },
    ],
    ...(hasFailures ? { isError: true } : {}),
  };
}
```

### Running the items

Process items independently and collect outcomes — never let one rejection abort the rest. For API-bound work, cap fan-out concurrency (existing tools use `CONCURRENCY = 5`):

```ts
const CONCURRENCY = 5;
const succeeded: MySuccess[] = [];
const failed: BatchFailure[] = [];

for (let i = 0; i < items.length; i += CONCURRENCY) {
  const chunk = items.slice(i, i + CONCURRENCY);
  const settled = await Promise.all(
    chunk.map(async (item, j) => {
      const index = i + j;
      try {
        return { ok: true as const, index, value: await doOne(item) };
      } catch (err) {
        return {
          ok: false as const,
          index,
          key: item.key,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }),
  );
  for (const r of settled) {
    if (r.ok) succeeded.push({ index: r.index, ...r.value });
    else failed.push({ index: r.index, key: r.key, error: r.error });
  }
}

return assembleBatchResult(items.length, succeeded, failed);
```

> Some batch APIs accept all items in a single underlying request (e.g. Jira's `/issue/bulk`). In that case there is no per-item loop — map the API's own success/error arrays into `succeeded`/`failed` and still return via `assembleBatchResult`. See `jira-server/src/tools/bulk-create.ts`.

## Existing examples to model on

| Server   | Batch tool                 | Notes                                                       |
| -------- | -------------------------- | ----------------------------------------------------------- |
| jira     | `jira_bulk_create_tickets` | Single bulk API call; `{ success, total, created, failed }` |
| jira     | `jira_transition` (array)  | Single tool accepts `key: string \| string[]`               |
| github   | `github_pr_batch_status`   | Read-only fan-out, chunks 30/GraphQL query                  |
| github   | `github_resolve_threads`   | Array of thread IDs                                         |
| worktree | `worktree_remove_batch`    | —                                                           |
| make     | `terraform_state_mv_batch` | —                                                           |
