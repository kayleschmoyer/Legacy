# MCP Response-Format Standard

The token-efficient output standard for our **10 in-repo MCP servers**
(`tools/mcp/*`: worktree, make, nx, jira, github, ci, db, aws, browser,
dev-process). Foundation deliverable of epic **LS-8018** (LS-8019). Third-party
/ hosted servers we don't control (Atlassian, Stripe, Claude-in-Chrome,
computer-use) are **out of scope** — do not touch them.

## Why

Most tool responses are pretty-printed JSON (`JSON.stringify(x, null, 2)`). For
list/table-shaped payloads that repeats every field name on every row and spends
10–40% of tokens on structural punctuation and indentation that carry no
semantic value. High-traffic tools (PR dashboards, CI run lists, search results)
are called many times per session, so the waste compounds.

The goal is **not** "convert everything to Markdown." Markdown nesting is lossy
and, for nested data, larger than minified JSON. Format choice is **per response
shape**.

## The two levers, in priority order

1. **Field selection (first-order).** Prune to the fields agents actually
   consume _before_ picking a format. A column removed costs zero tokens in
   every row of every call — this dominates any format choice. Drop internal
   ids, URLs nobody follows, redundant derived fields, and verbose nested
   objects an agent never reads.
2. **Format (second-order).** Then pick the representation that fits the shape
   (next section).

Across the board, **truncate long blobs** (diffs, logs, bodies) so one row can't
blow the budget.

## Format rules by shape

| Response shape                                                                 | Format             | Why                                                                              |
| ------------------------------------------------------------------------------ | ------------------ | -------------------------------------------------------------------------------- |
| **Flat, uniform list/table** (PR lists, check runs, search results, run lists) | **Markdown table** | Column headers written once instead of repeating JSON keys per row. Biggest win. |
| **Single object / a few scalars**                                              | **Minified JSON**  | A table or MD headers/bullets would add structural noise and can be larger.      |
| **Deeply nested / heterogeneous data**                                         | **Minified JSON**  | Markdown nesting is lossy and not cheaper; keep it machine-parseable.            |

Rules of thumb:

- If every element is the same flat record shape → **table**.
- If elements differ in shape, or contain nested objects/arrays an agent needs →
  **minified JSON** (never pretty-printed).
- Never emit `JSON.stringify(x, null, 2)` in a tool response. Minified is the
  floor; a table is the win where the shape allows.

## Use the shared helper — don't re-implement

The standard is implemented once in **`@legacy-sports/mcp-format`**
(`lib/mcp-format`). Import it; never hand-roll table joins or `JSON.stringify`
spacing per server.

```ts
import {
  markdownTable,
  minifiedJson,
  pickFields,
  truncate,
} from '@legacy-sports/mcp-format';

// Flat uniform list → prune fields, truncate blobs, then table.
function formatPullRequests(prs: PullRequest[]): string {
  const rows = pickFields(prs, ['number', 'title', 'state', 'author']).map(
    (pr) => ({ ...pr, title: truncate(pr.title, 60) }),
  );
  return markdownTable(rows, {
    columns: ['number', 'title', 'state', 'author'],
  });
}

// Single object or nested/heterogeneous → minified JSON.
function formatRunDetail(run: RunDetail): string {
  return minifiedJson(pick(run, ['id', 'status', 'conclusion', 'jobs']));
}

// Plug into the MCP content envelope:
return { content: [{ type: 'text', text: formatPullRequests(prs) }] };
```

### API

| Export                                       | Use for                                                                           |
| -------------------------------------------- | --------------------------------------------------------------------------------- |
| `markdownTable(rows, options?)`              | Arrays of flat records → compact GFM table (headers once). Returns `''` for `[]`. |
| `minifiedJson(value)`                        | Single objects, nested or heterogeneous data → minified JSON.                     |
| `pick(obj, keys)` / `pickFields(rows, keys)` | Field selection (the first-order lever).                                          |
| `truncate(str, maxLength, opts?)`            | Cap long blobs; `{ showOmitted: true }` appends `…+{omitted}`.                    |

`markdownTable` options: `columns` (order + prune in one step), `headers`
(per-column label override), `pad` (align with spaces — off by default; enable
only for human-facing output, never for agent token efficiency).

## Migration checklist (per server tool)

When migrating a tool (or writing a new one):

1. **Prune** — `pickFields`/`pick` down to fields agents consume. Justify each
   retained field.
2. **Truncate** — cap free-text/diff/log fields with `truncate`.
3. **Pick a format** — table for flat uniform lists, `minifiedJson` otherwise.
4. **Preserve information** agents depend on — pruning is not silent data loss;
   keep what downstream tools/decisions read.
5. **Empty results** — `markdownTable([])` is `''`; emit an explicit signal
   (e.g. `'No results'` or `minifiedJson({ total: 0, items: [] })`) so the
   agent isn't handed a blank string.
6. **Measure** — record before/after token counts in the PR (epic LS-8018 ships
   a measurement harness).

## Enforcement (LS-9707)

`.github/checks/mcp-response-format.sh` fails the `custom-checks` job on any
`JSON.stringify(x, null, 2)` under `tools/mcp/**` outside a `.spec.ts`. Writing
JSON to disk (`writeFile`/`writeFileSync`) is exempt — pretty printing a file
costs no tokens and helps humans read it.

It is a check script rather than an ESLint rule on purpose: several MCP servers
(`mcp-jira-server`, `mcp-ci-server`) define no lint target and get none
inferred, so `nx affected -t lint` skips them entirely — and those are exactly
the servers that went unmigrated. A repo-wide grep covers every server
regardless of its nx configuration.

Per AGENTS.md Tier-3 there is no suppression escape: fix the site, or widen the
script's exemption if you have found a genuinely new legitimate case.

**Why this exists.** This was review pattern #45, enforced manually, and manual
enforcement failed. Epic LS-8018 closed `Done` with all ten per-server children
`Done` while worktree-server and ci-server still had 30 pretty-printed response
sites between them.

Reviewers: pattern **#45** in
[`common-review-patterns.md`](../../pr-lifecycle/references/common-review-patterns.md).
Default expectation — flat uniform lists are `markdownTable`; everything else is
`minifiedJson`; both go through `pickFields`/`truncate` first.
