# docs/design/

Design bundles synced from [Claude Design](https://claude.ai/design).

> **Don't hand-edit this directory.** It is owned by the `/sync-designs` cloud agent. The process docs and slash commands live elsewhere:
>
> - **Process overview**: [`docs/dev-process/design-sync.md`](../dev-process/design-sync.md)
> - **Operator skill (authoritative)**: [`.agents/skills/design-sync/SKILL.md`](../../.agents/skills/design-sync/SKILL.md)
> - **Cloud sync command**: [`.claude/commands/sync-designs.md`](../../.claude/commands/sync-designs.md)
> - **Local consumer command**: [`.claude/commands/implement-design.md`](../../.claude/commands/implement-design.md)

## What lives here

- `manifest.json` — registry of every known design (`id`, `url`, `lastSyncedHash`, `jiraKey`, `status`). The only file in this directory humans should touch, and only to **seed** a URL before the first sync run. See [manifest-schema.md](../../.agents/skills/design-sync/references/manifest-schema.md).
- `<design-id>/` — one folder per design. Populated by `/sync-designs`. Contains:
  - `SYNC-REPORT.md` — what changed in the most recent sync (added/modified/removed files)
  - `<slug>/` — a single content subdirectory whose name matches `manifest.designs[].slug` (e.g. `legacy-sports-public-leagues`). Inside it:
    - `README.md` — "CODING AGENTS: READ THIS FIRST" handoff doc written by Claude Design
    - `chats/chat*.md` — design conversation transcripts (where the user's intent lives — read these first)
    - `project/` — HTML prototypes plus supporting assets. Typical contents: `<Title>.html`, `colors_and_type.css`, `assets/`, `fonts/`, `icons/`, `uploads/`. Some bundles also include `components/`, `ds/`, `src/`, `design-canvas.jsx`, `preview-bundle.tsx`, or `styles*.css` — contents vary by design.

> **No `bundle.json`.** Older docs referenced a `bundle.json` metadata file; the real format is the layout above. The manifest entry plus `<slug>/README.md` plus the chat transcripts are the bundle's metadata.

## How to use

| You want to...                                              | Do this                                                                                                       |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Pull the latest designs into the repo                       | Dispatch `/sync-designs` from a Claude Code Web session                                                       |
| Implement a design that's already in the repo               | Dispatch `/implement-design LS-####` locally, where `LS-####` is the per-design ticket                        |
| Add a brand-new design URL the agent doesn't know about yet | Add a stub entry to `manifest.json` (id + url + title + `status: "active"`), commit, then run `/sync-designs` |

## Why a manifest at all

Designs in Claude Design live behind authentication and are only reachable from cloud agent sessions. Without a committed manifest, every sync would have to rediscover the entire design list from scratch — slow and lossy. The manifest is the durable contract between "what designs we care about" and "what's currently in the repo".
