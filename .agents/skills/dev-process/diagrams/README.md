# Diagrams

Source-of-truth diagrams for the dev-process skill, authored in [Mermaid](https://mermaid.js.org/) and rendered to SVG for sharing outside markdown contexts.

## Files

| Source                               | Generated SVG                       | Used by                                          |
| ------------------------------------ | ----------------------------------- | ------------------------------------------------ |
| [master-flow.mmd](master-flow.mmd)   | `master-flow.svg` (built artifact)  | [SKILL.md](../SKILL.md) — overall framework view |
| [spine-detail.mmd](spine-detail.mmd) | `spine-detail.svg` (built artifact) | [spine.md](../spine.md) — phase-by-phase detail  |

## Authoring rule

Edit the `.mmd` files. SVG files are regenerated from source — never edit them by hand.

Mermaid renders natively in GitHub-flavored markdown when included as a fenced code block (` ```mermaid `). The `.mmd` files exist for:

1. Single source of truth across markdown contexts that don't render mermaid (Confluence, certain doc viewers).
2. SVG generation for embedding in slide decks, design docs, etc.

## Regenerating SVGs

```bash
# One-shot
make diagrams

# Or directly
node scripts/generate-diagrams.mjs
```

The script reads every `.mmd` file under `.agents/skills/**/diagrams/` and writes a sibling `.svg`.

## Diagram conventions

- **Direction**: top-to-bottom (`flowchart TB`) for sequential flows, left-to-right (`flowchart LR`) for parallel branches.
- **Subgraphs** group related nodes (entrypoints, phases, gates).
- **Decision diamonds** (`{...}`) for gate checks; rectangles for activities.
- **Risk tiers** noted on entrypoint nodes in `(parens)`.
- Keep node labels under 40 characters where possible — long labels degrade SVG layout.
