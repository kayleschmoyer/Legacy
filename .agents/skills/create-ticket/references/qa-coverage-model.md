# QA-Coverage Model

How the project structures QA coverage in Jira. The catalog entry is §4 of [ticket-templates.md](ticket-templates.md); this file is the model behind it. The on-disk mirror lives under `docs/agents/qa-coverage/jira-page-epics/pages/`.

## Core principle: coverage = automated E2E, not manual passes

The QA team cannot hand-test every feature on every run. A feature is **covered** only when a passing, hermetic Playwright E2E test in `apps/web-e2e/src/tests/` asserts the user-facing journey end to end. Manual spot-checks do not satisfy a Feature Story. Every ticket in this model exists to drive toward one automated test per user journey.

## Hierarchy

```
Page Epic  (qa-page-epic)            — one per page, permanent parent across all QA runs
└─ Feature Story  (qa-feature-story) — one per user-facing feature on that page
   ├─ Variant Story                  — premium/tier, platform, or edge-case variant of the feature
   └─ Bug / Task finding             — a specific defect or automation gap found during a run
```

- **Page Epic** — type `Epic`, summary `QA — Page: <Name>`, label `qa-page-epic`, no parent. The durable rollup for a page; its description states the page's user journeys and the E2E-first goal. Examples: LS-5279 (Live Draft Board), LS-5299 (Trade Center).
- **Feature Story** — type `Story`, summary `Feature: <Name>`, labels `qa-feature-story` + `page-<slug>`, parent = the page epic. One per feature; its acceptance criterion is "a Playwright spec exists and proves the journey." Example: LS-5678 (Submit New Trade Offer) under LS-5299.
- **Variant Story** — a Feature Story whose scope is a variation (e.g. non-premium overlay, Android touch flow). Parent = the Feature Story.
- **Bug / finding** — type `Bug` or `Task`, parent = the Feature Story it was found under. QA-run findings (e.g. `GAP-001`, `VGL-025`) chain here.

## On-disk mirror

Each ticket mirrors a Markdown file:

```
docs/agents/qa-coverage/jira-page-epics/pages/<page>/
  features/<feature>/
    feature.md                          # the Feature Story: description, platforms, entitlement, test coverage
    variants/<variant>/findings/<ID>.md # per-run findings
```

A `feature.md` records the unit tests and the hermetic E2E spec that back the feature (see `pages/trade-center/features/submit-new-trade/feature.md` for the worked example: it lists the `TradingCenter.spec.tsx` unit cases and the `apps/web-e2e/src/tests/submit-new-trade.spec.ts` E2E cases).

## Filing a new page's coverage

1. Create the **Page Epic** (`QA — Page: <Name>`, type `Epic`). Apply `qa-page-epic` after creation.
2. Enumerate the page's user-facing features. For each, create a **Feature Story** (`Feature: <Name>`, parent = the epic). Use `jira_bulk_create_tickets` when filing several at once. Apply `qa-feature-story` + `page-<slug>` after creation.
3. In each Feature Story, write the user journey as an E2E acceptance criterion pointing at the target spec path in `apps/web-e2e/src/tests/`.
4. As QA runs surface defects, file **Bug/finding** tickets parented under the relevant Feature Story.

## Gotchas

- **Labels are not settable via the create tools** — `qa-page-epic` / `qa-feature-story` / `page-<slug>` must be applied after creation (Atlassian plugin or by hand). Note the required labels in your handoff.
- **The epic is permanent** — never close a page epic when a run finishes; new runs nest fresh findings under the same epic for a durable cross-run rollup.
- **Hermetic, not live** — specs under `apps/web-e2e/src/tests/` mock the backend (`route.fulfill()`, never `route.continue()`). Live-backend checks belong in `apps/web-e2e/src/integration/tests/` and are a separate, complementary layer — don't conflate the two in a Feature Story's acceptance criteria. See the [testing](../../testing/SKILL.md) skill.
