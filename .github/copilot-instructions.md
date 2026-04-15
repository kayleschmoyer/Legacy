# Copilot Review Instructions

## Review Philosophy

Be **thorough in a single pass**. Surface all findings in one review rather than trickling comments across multiple rounds. A comprehensive first review is far more valuable than three incremental ones — each round costs CI time and developer context switches.

**A follow-up review from you is a failure mode, not a feature.** If you add comments after a PR is updated with fixes from your previous comments, you have failed to do your job completely the first time.

### Full-Diff-First Protocol

Before writing **any** comment:

1. **Read every file in the diff** — do not comment as you read; complete the full survey first.
2. **Identify cross-file patterns** — the same bug or anti-pattern may appear in multiple files; group these into a single comment with all affected locations noted.
3. **Run the exhaustiveness checklist** (see below) — mentally check each tier before opening a review.
4. **Then write all comments at once** — submit a single comprehensive review, not a stream of incremental observations.

### Pre-Submit Exhaustiveness Checklist

Before submitting your review, confirm you have checked:

- [ ] All Tier 1 categories across every changed file
- [ ] All Tier 2 categories for files with significant logic changes
- [ ] Cross-file concerns: shared state, exported types, GraphQL schema ↔ codegen consistency
- [ ] Async correctness: `await` placement, unhandled rejections, race conditions
- [ ] Test coverage: is changed behavior exercised by a test?
- [ ] Import boundaries: does the change violate Nx module boundaries?

If any box would be unchecked, keep reviewing — do not submit until you have covered everything.

## Authoring Workflow

When writing or modifying code as a Copilot Coding Agent, two rules apply before any other procedure:

- **Implement only what was asked** — no extra features, refactors, error handling for impossible cases, or speculative abstractions beyond the ticket scope
- **Done means merged** — a task is not complete at `make pc` or after opening a PR; complete = PR merged + Jira transitioned to Done + MCP gap audit run + tracking tasks completed

### Pre-Push Self-Review Gate

Do **not** push immediately after tests or `make pc` pass. A strong self-review is a mandatory gate before every push and PR update.

1. Run the mechanical checks first: `make lint-review-patterns`
2. Read **every changed file in full** — not just diff hunks
3. Manually check the judgment-requiring patterns from `.agents/skills/pr-lifecycle/references/common-review-patterns.md`: **#3, #4, #7, #8, #9, #19, #20**
4. Scan for the issues that generate repeat Copilot review cycles: dead code, missing/null guards, unsafe casts, async correctness, stale comments, misleading success logs, and missing tests for changed behavior
5. Fix everything you can directly, then re-run the relevant validation
6. Produce a **Self-Review Summary** listing the files reviewed, the patterns checked, and any issues fixed

> **Copilot Coding Agent note:** if repo-specific slash skills are unavailable, inline the checklist from `.agents/skills/pr-lifecycle/references/self-review.md` yourself. Lack of slash-command support is **not** a reason to skip self-review.

## Priority Tiers

Focus your review budget on high-impact issues. If you must limit comments, prioritize by tier:

### Tier 1 — Must Fix (always comment)

- **Security vulnerabilities**: injection, credential exposure, unsafe deserialization, path traversal, SSRF
- **Data integrity bugs**: race conditions, incorrect mutations, missing transactions, lost updates
- **Logic errors**: wrong boolean conditions, off-by-one, null/undefined dereference, unreachable code
- **Breaking changes**: API contract violations, backwards-incompatible schema changes, removed exports

### Tier 2 — Should Fix (comment if significant)

- **Error handling gaps**: unhandled promise rejections, swallowed errors hiding failures, missing cleanup on error paths
- **Resource leaks**: unclosed handles, missing cleanup (temp files, connections, event listeners)
- **Type safety**: unsafe casts, overly broad types that defeat type checking, missing null checks at system boundaries
- **Test gaps**: changed behavior without corresponding test updates

### Tier 3 — Consider (comment only if pattern is repeated or egregious)

- **Code clarity**: confusing variable names, misleading comments, complex logic that could be simplified
- **DRY violations**: duplicated logic that will clearly drift (not one-time similar code)
- **Performance**: only when measurable impact is likely (hot paths, N+1 queries, unnecessary re-renders)

### Do NOT Comment On

- **Style/formatting**: Prettier and ESLint handle this — never suggest formatting changes
- **Import ordering**: automated by tooling
- **Comment style preferences**: JSDoc vs inline, capitalization, trailing periods
- **Hypothetical future issues**: "if you ever need to X" — review the code that exists, not code that might exist
- **Single-use abstractions**: don't suggest extracting a helper for code used once
- **Documentation files**: `.md` files, `SKILL.md` files, and `AGENTS.md` are agent-facing docs — review for accuracy, not prose style

## Project Context

This is an **Nx monorepo** with:

- **Stack**: React Native (Expo), Next.js, AWS Lambda, GraphQL (Apollo), PostgreSQL (Drizzle ORM)
- **Package manager**: pnpm (enforced via corepack)
- **Commit format**: `type(scope): message` (conventional commits)
- **Logging**: `LOGGER` from `@legacy-sports/logging` — `console.*` is banned (ESLint enforced)
- **Lint suppression**: `@ts-ignore` and `eslint-disable` are banned — fix root causes
- **GraphQL**: prefer `.graphql` files + codegen over inline `gql` template literals
- **E2E tests**: hermetic — `route.fulfill()` only, never `route.continue()` (no backend in CI)

## Design Context

This section informs all frontend code generation and review. When writing or reviewing UI code, apply these principles.

### Users

Fantasy sports players (25–45) who are league commissioners and active participants in baseball and football leagues. They use the app nights and evenings — often while watching live games. This is a passion and ritual, not a utility. They are competitive, data-obsessive, and have deep league loyalty.

**Emotional goal**: anticipation and excitement — the feeling right before draft picks start, when everything feels possible.

### Brand Personality

**Nostalgic, sporty, professional.** The confident voice of a seasoned beat reporter who still gets excited every Opening Day. Not flashy, not corporate, not casual. Heritage details (aged gold, deep navy) are earned — they appear at meaningful moments, not as wallpaper.

**Anti-reference**: Yahoo Sports — blocky, no craft, information dumped in uniform card grids. Every screen should have an editorial point of view.

### Typography

- **Display / Headings**: Big Shoulders Display (condensed grotesque — scoreboard, pennant, vintage baseball program energy)
- **Body / UI**: Literata (reading-optimized, editorial warmth — not a tech tool font)
- **Data**: tabular figures (`font-variant-numeric: tabular-nums`) for all statistics; numbers in columns must align on the decimal
- **Scale**: fixed `rem` steps for app/dashboard UI; fluid `clamp()` only for marketing/landing pages
- **Never use**: Inter, Playfair Display, Syne, or any font from the standard AI design reflex list

### Color Application Rules

- **Backgrounds**: layer `#0A0F1A` → `#0D1526` → `#111B2F` → `#16223A` (page → subtle → panel → elevated)
- **Accents** (use sparingly — these are earned moments, not decoration):
  - Heritage gold `#C5A55A` — match results, wins, trophy states
  - Seam red `#C41E3A` — critical alerts, losing states, action required
  - Deep navy `#1B3A5C` — primary interactive (buttons, selected states)
- **Banned patterns**:
  - No `border-left` / `border-right` accent stripes wider than 1px on cards or callouts
  - No gradient text (`background-clip: text` with a gradient)
  - No cyan/purple/neon glow accents

### Navigation & Motion

- **Route transitions must have directional meaning**: drill-down slides in from right; back slides out to left; tab switches crossfade (parallel, not hierarchical)
- **Timing**: navigation 280–320ms ease-out-quart; micro-interactions 120–150ms
- **Animate only transform and opacity** — never width, height, padding, or margin
- **Honor `prefers-reduced-motion`**: crossfades only, no positional movement

### Layout Principles

- **Progressive disclosure**: surface what matters now; hide secondary navigation behind deliberate action
- **Editorial hierarchy**: not everything is equal weight — a standings table and a player card are different, treat them differently
- **No generic card grids**: not every piece of content belongs in the same card template
- **Data is the product**: statistics tables should feel as designed as headlines — crisp, legible, visually weighted

## Code Review Conventions

- When suggesting a fix, prefer a concrete `suggestion` block over a prose description
- **Group repeated patterns**: if a bug or anti-pattern appears in multiple files, write **one** comment that names all affected locations — never one comment per occurrence
- **Never drip-feed**: if you discover something during a follow-up pass that you could have caught in the first pass, that is a process failure — retrospectively note all missed findings in a single follow-up comment rather than opening a new review round for each one
- For shell scripts (`.sh`): focus on correctness under `set -euo pipefail` — unquoted variables, missing error handling, and commands that fail silently are the priority
- For TypeScript: focus on type safety, error handling, and async correctness over style
- For infrastructure files (`.yml`, `.json` configs): focus on security and correctness, not formatting
