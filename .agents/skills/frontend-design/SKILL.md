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

### Responsive density

Before changing padding, type size, hit targets, or what a surface shows on a phone, read
[`.agents/skills/ui/references/responsive-density.md`](../ui/references/responsive-density.md) —
the breakpoint tier table (the real `@tamagui/config` values, which differ from
`lib/design-tokens`), the per-tier density ladder, the 44px touch-target floor, and the
reduction order for narrow widths.

### Per-surface persistent guidance

Some surfaces carry additional rules on top of the app-wide ones. Read the surface's
`CLAUDE.md` before reworking its layout:

- **League Detail** — [`docs/design/qDGBVlOyaV-306Id0kWq0Q/league-detail-page/project/CLAUDE.md`](../../../docs/design/qDGBVlOyaV-306Id0kWq0Q/league-detail-page/project/CLAUDE.md): phone header structure and known small-viewport gaps.

## Implementation

Produce production-grade, visually distinctive code that executes the design system with precision:

- Apply all tokens, colors, typography, and component patterns from the fetched design system
- Follow brand personality, motion principles, and layout guidelines from `AGENTS.md`
- Every visual decision must be traceable back to the design system URL or the AGENTS.md design context
- Avoid generic AI aesthetics — no Inter/Roboto, no purple gradients, no uniform card grids
