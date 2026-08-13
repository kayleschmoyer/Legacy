---
name: frontend-design
description: Create distinctive, production-grade frontend interfaces using the Legacy Sports design system. Use when building web components, pages, or any frontend UI in this repo.
metadata:
  scope: 'apps/web/**, apps/app/**, lib/shared-components/**'
---

## Design System

Before writing any code, fetch the Legacy Sports design system:

**URL**: https://claude.ai/design/p/670f7892-5193-4b8a-a54c-20b112ad11bb

Use WebFetch to load it and apply all tokens, colors, typography, and component patterns defined there to your implementation.

## Project Design Context

See [`docs/design/brand.md`](../../../docs/design/brand.md) for brand personality, color application rules, typography, motion principles, and layout guidelines specific to this project.

### Per-surface persistent guidance

Some surfaces carry hard-won rules that are easy to re-derive badly. Read the surface's
`CLAUDE.md` before changing its layout, padding, or hit targets:

- **League Detail** — [`docs/design/qDGBVlOyaV-306Id0kWq0Q/league-detail-page/project/CLAUDE.md`](../../../docs/design/qDGBVlOyaV-306Id0kWq0Q/league-detail-page/project/CLAUDE.md): responsive density tiers, phone header structure, and the rule that touch hit areas expand via transparent pseudo-element insets rather than physical size.

## Implementation

Produce production-grade, visually distinctive code that executes the design system with precision:

- Apply all tokens, colors, typography, and component patterns from the fetched design system
- Follow brand personality, motion principles, and layout guidelines from `AGENTS.md`
- Every visual decision must be traceable back to the design system URL or the AGENTS.md design context
- Avoid generic AI aesthetics — no Inter/Roboto, no purple gradients, no uniform card grids
