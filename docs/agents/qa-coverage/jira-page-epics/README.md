# QA Coverage — Jira Page Epics

This tree is the on-disk mirror of the project's structured QA-coverage model in Jira. Each page of the product has a permanent **Page Epic** that accumulates QA findings across every run, so a page has one durable rollup over time instead of scattered one-off tickets.

## The model

```
Page Epic  (qa-page-epic)            — one per page, permanent parent across all QA runs
└─ Feature Story  (qa-feature-story) — one per user-facing feature on that page
   ├─ Variant Story                  — premium/tier, platform, or edge-case variant
   └─ Bug / Task finding             — a defect or automation gap found during a run
```

When a per-run finding is filed, its Feature Story is created with `parent` set to the page epic's `LS-####` key; Variant Stories and individual Bug/Task findings chain underneath.

## Coverage is automated E2E, not manual testing

The QA team is at capacity and cannot hand-test every feature on every run. **A feature is "covered" only when a passing, hermetic Playwright E2E test in `apps/web-e2e/src/tests/` asserts the user-facing journey end to end.** Every Feature Story under a Page Epic must be backed by such a test. Manual spot-checks do not satisfy a Feature Story.

## Folder layout

```
pages/<page>/
  epic.md                              # mirrors the Page Epic
  features/<feature>/
    feature.md                         # mirrors the Feature Story: description, platforms, entitlement, test coverage
    variants/<variant>/findings/<ID>.md # per-run findings (e.g. GAP-001, VGL-025)
```

See `pages/trade-center/features/submit-new-trade/feature.md` for a worked Feature Story that lists both its unit cases and its `apps/web-e2e/src/tests/submit-new-trade.spec.ts` E2E cases.

## Authoring tickets in this model

Use the **[create-ticket skill](../../../../.agents/skills/create-ticket/SKILL.md)** — it holds the canonical templates, summary conventions, and label rules for Page Epics, Feature Stories, and findings (§4 of its templates reference, plus the full hierarchy in `references/qa-coverage-model.md`). Key rules:

- **Page Epic** — type `Epic`, summary `QA — Page: <Name>`, label `qa-page-epic`, no parent.
- **Feature Story** — type `Story`, summary `Feature: <Name>`, labels `qa-feature-story` + `page-<slug>`, parent = the page epic.
- **Labels are not settable via the Jira create tools** — apply `qa-page-epic` / `qa-feature-story` / `page-<slug>` after creation.
- **The page epic is permanent** — never close it when a run finishes; new runs nest fresh findings under the same epic.
