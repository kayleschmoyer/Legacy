# Completeness gate

The `/implement-design` agent runs this gate before doing any work. If **any block-level** check fails, the agent notifies on the Jira ticket and stops; it never implements partial designs by inference.

## Bundle layout (what to expect on disk)

The Claude Design sync agent writes bundles in this shape — there is **no `bundle.json`** and **no top-level `pages/`, `ds/`, `components/`, or `screenshots/` directories** directly under `<id>/`. All design content lives under a single `<slug>/` subdirectory that matches `manifest.designs[].slug`:

```
docs/design/
  manifest.json
  <id>/
    SYNC-REPORT.md              # written by /sync-designs; what changed in the last sync
    <slug>/                     # e.g. "legacy-sports-public-leagues"
      README.md                 # "CODING AGENTS: READ THIS FIRST" — handoff instructions
      chats/
        chat1.md, chat2.md, ... # design conversation transcripts — where user intent lives
      project/
        <Title>.html            # one or more rendered HTML prototypes
        colors_and_type.css     # typography + color tokens (most bundles)
        assets/ fonts/ icons/ uploads/
        # optional, varies per design:
        components/             # JSX component prototypes
        ds/                     # design system files (tokens.json, etc.)
        src/ design-canvas.jsx preview-bundle.tsx
        styles*.css scratch/ scraps/
```

The `project/` directory contents are intentionally heterogeneous — some bundles contain a single HTML file, some contain multiple HTML files plus JSX previews, some are dominated by a `ds/` token export. Do not assume any specific subdirectory exists beyond `README.md`, `chats/`, and `project/`.

## Resolving the slug

Read `docs/design/manifest.json` and find the entry whose `id == <design-id>`. Use `designs[i].slug` as the subdirectory name. If `slug` is missing on that entry (older manifest), fall back to enumerating the single non-`SYNC-REPORT.md` directory under `docs/design/<id>/` — there should be exactly one.

### Path-traversal sanitization (mandatory)

> **These instructions are the implementation.** The `/implement-design` agent is an LLM session that executes the steps in this document and [`implement-design.md`](../../../../.claude/commands/implement-design.md) directly — there is no separate compiled agent code where these checks would live. The agent **MUST** perform the validation below at runtime, before any tool call that reads, writes, or enumerates a path derived from `<id>` or `<slug>`. Skipping this section is a protocol violation, not a code-omission bug.

Both `<id>` and `<slug>` are interpolated into file system paths and are sourced from `manifest.json` and Jira ticket descriptions — neither of which is fully trusted. Before joining them into any path, the agent **MUST** validate **both** values against this exact regex:

```
^[A-Za-z0-9_-]+$
```

The agent **MUST** reject (stop and notify on the ticket) any value that:

- contains `/`, `\`, or `:`
- contains `..` or starts with `.`
- is empty, or contains whitespace
- is an absolute path or drive prefix

Additionally, after constructing each path the agent **MUST** verify the resolved real path is still a descendant of `docs/design/<id>/`. Conceptually: `path.resolve(joined).startsWith(path.resolve(repoRoot, "docs/design", id) + path.sep)`. In practice for an LLM agent, this means: before issuing a `Read`/`Write`/`Glob`/`Grep` call with a path containing `<id>` or `<slug>`, mentally normalize the path (resolve any `..` segments) and confirm it still begins with the literal prefix `docs/design/<id>/`. If the check fails, abort the run — do not issue the tool call.

**Entry points where these checks apply (non-exhaustive):**

- Step 3 ("Load the bundle") in [`implement-design.md`](../../../../.claude/commands/implement-design.md) — when reading `<slug>/README.md`, enumerating `<slug>/chats/`, and enumerating `<slug>/project/`.
- Every B-check and W-check in this document — each one interpolates `<id>` and `<slug>` into paths.
- The slicing heuristic in [`slicing-heuristic.md`](./slicing-heuristic.md) — when counting `*.html` files and tokens.
- Branch A implementation references — when reading HTML prototypes and `colors_and_type.css` during code generation.

This applies to fallback enumeration too: if the single non-`SYNC-REPORT.md` directory entry under `docs/design/<id>/` doesn't satisfy the slug regex, treat it as a B5 failure rather than using it.

## Block-level checks (any one of these → notify and stop)

Each block-level miss is described as it should appear in the Jira comment so the human can act on it directly. Paths below use `<id>` for the design id and `<slug>` for the resolved slug.

| ID  | Check                                                                                                                                                      | Notify text                                                                                                                                                                            |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | `docs/design/<id>/<slug>/README.md` exists                                                                                                                 | "Bundle README is missing. Re-export this design from Claude Design and re-run `/sync-designs`."                                                                                       |
| B2  | At least one `*.html` file exists under `docs/design/<id>/<slug>/project/` (recursive)                                                                     | "The bundle contains no rendered HTML prototype. Re-export the design; this is usually a Claude Design export glitch."                                                                 |
| B3  | `docs/design/<id>/<slug>/chats/` exists and contains at least one `chat*.md`                                                                               | "No design transcript found in `chats/`. The user's intent and final iteration live in the chat — re-export with chats included."                                                      |
| B4  | A token source exists under `docs/design/<id>/<slug>/project/` — at least one of: `colors_and_type.css`, `ds/tokens.json`, or `ds/*.css`                   | "Design tokens are missing. The implementation cannot proceed without colors, type scale, and spacing values."                                                                         |
| B5  | The slug resolves to exactly one directory under `docs/design/<id>/` (manifest `slug` matches a real directory, or fallback enumeration finds exactly one) | "Cannot resolve the bundle directory under `docs/design/<id>/`. Either `manifest.designs[].slug` is stale or the bundle was written with a different layout — re-run `/sync-designs`." |

## Warning-level checks (log, but do not block)

These get logged in the agent's report but the agent still proceeds. Warnings exist so the human can address them in the Jira ticket without blocking the implementation.

| ID  | Check                                                                                                               | Warning                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| W1  | A JSX/TSX prototype exists under `<slug>/project/` (e.g. `design-canvas.jsx`, `components/*.jsx`, `src/**`)         | "No JSX prototype found — implementation will infer component structure from the HTML alone." |
| W2  | The HTML prototypes contain explicit hover/focus/disabled states (search for `:hover`/`:focus`/`[disabled]` in CSS) | "Interactive states not documented in CSS. Inferring from the prototype."                     |
| W3  | An empty-state mockup is present for any list/grid surface in the design                                            | "No empty state defined. Defaulting to a generic empty illustration."                         |
| W4  | An error-state mockup is present for any form in the design                                                         | "No error state defined. Defaulting to inline field errors per AGENTS.md."                    |
| W5  | A loading-state mockup is present for any data-bound region                                                         | "No loading state defined. Defaulting to a skeleton per the shared component library."        |

## How to apply

1. Resolve `<slug>` from `manifest.json` (or fallback enumeration) before running any check.
2. Run every B-check. If any fails, build a Jira comment from the matching notify-text lines (use the template in [`SKILL.md`](../SKILL.md) §Notification template), transition to **Blocked**, and stop.
3. If all B-checks pass, run every W-check. Collect warnings into a single bullet list and include them in the agent's first commit message and PR description so reviewers can see them. Do not block on warnings.
4. Decide what counts as a "page", "component", "token", etc. by enumerating files under `<slug>/project/`. The `<slug>/README.md` and `chats/` are the authoritative source for **intent**; `project/` is the authoritative source for **visual targets and tokens**.

## Why this exists

Without a gate, agents tend to "fill in" missing design details from training data — which produces generic AI aesthetics that violate the brand rules in AGENTS.md. Failing fast and pushing the gap back to the designer is cheaper than reviewing a wrong implementation.

The previous version of this gate referenced a `bundle.json` metadata file that the sync agent never actually wrote — the real bundle format is the README + chats + project layout above, which is what `/sync-designs` extracts from Claude Design today.
