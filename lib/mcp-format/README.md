# mcp-format

Token-efficient response formatting for our in-repo MCP servers
(`tools/mcp/*`). Single shared implementation of the standard so the format is
applied identically across servers and never re-coded per server (epic LS-8018,
foundation LS-8019).

The standard, rationale, and per-shape rules live in
[`.agents/skills/create/references/mcp-response-format.md`](../../.agents/skills/create/references/mcp-response-format.md).
This package is the implementation of it.

## Exports

| Export                                       | Purpose                                                                                          |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `markdownTable(rows, options?)`              | Arrays of flat records → compact GFM table (column headers written once). Returns `''` for `[]`. |
| `minifiedJson(value)`                        | Single objects / nested / heterogeneous data → minified JSON (never pretty-printed).             |
| `pick(obj, keys)` / `pickFields(rows, keys)` | Field selection — the first-order token lever; prune before formatting.                          |
| `truncate(str, maxLength, opts?)`            | Cap long free-text/diff/log blobs; `{ showOmitted: true }` appends `…+{omitted}`.                |

## Usage

```ts
import {
  markdownTable,
  minifiedJson,
  pickFields,
  truncate,
} from '@legacy-sports/mcp-format';

// Flat uniform list → prune, truncate, table.
const rows = pickFields(prs, ['number', 'title', 'state']).map((pr) => ({
  ...pr,
  title: truncate(pr.title, 60),
}));
const text = markdownTable(rows);

// Single object / nested data → minified JSON.
const detail = minifiedJson(run);

return { content: [{ type: 'text', text }] };
```

## Levers (priority order)

1. **Field selection** (`pick`/`pickFields`) — first-order. A column removed
   costs zero tokens in every row of every call.
2. **Blob truncation** (`truncate`) — keep one long value from blowing the
   budget.
3. **Format** (`markdownTable` vs `minifiedJson`) — second-order. Table for
   flat uniform lists; minified JSON for everything else.
