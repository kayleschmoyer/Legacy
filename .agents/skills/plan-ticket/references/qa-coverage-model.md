# QA-Coverage Model

How the project structures QA coverage in Jira. The catalog entry is §4 of [ticket-templates.md](ticket-templates.md); this file is the model behind it. The on-disk mirror lives under `docs/agents/qa-coverage/jira-page-epics/pages/`.

## Core principle: coverage = automated E2E, not manual passes

The QA team cannot hand-test every feature on every run. A feature is **covered** only when a passing automated E2E flow asserts the user-facing journey end to end — per platform:

- **web** — a hermetic Playwright spec in `apps/web-e2e/src/tests/`.
- **android** — a Maestro flow in `maestro/flows/<page>/` (run per the [mobile-qa](../../mobile-qa/SKILL.md) skill, which adds AI screenshot judging on top).

Manual spot-checks do not satisfy a Feature Story. Every ticket in this model exists to drive toward one automated test per user journey on each platform the feature's `**Platforms:**` line declares.

## Platform coverage in feature docs

Each `feature.md` tracks its per-platform automation status in a **Platform coverage** table so web (Playwright) and mobile (Maestro) coverage are visible side by side:

```markdown
## Platform coverage

| Platform | Harness    | Spec / Flow                                | Status  |
| -------- | ---------- | ------------------------------------------ | ------- |
| web      | Playwright | `apps/web-e2e/src/tests/<feature>.spec.ts` | covered |
| android  | Maestro    | `maestro/flows/<page>/<flow>.yaml`         | pending |
```

Status values: `covered` (passing automated flow exists), `pending` (flow path targeted, not yet written/passing), `n/a` (platform not in the feature's `**Platforms:**`). A Feature Story's acceptance criteria point at the target spec/flow path for every non-`n/a` row.

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
3. In each Feature Story, write the user journey as an E2E acceptance criterion pointing at the target spec/flow path for each platform (web: `apps/web-e2e/src/tests/`; android: `maestro/flows/<page>/`).
4. As QA runs surface defects, file **Bug/finding** tickets parented under the relevant Feature Story.

## Gotchas

- **Labels are not settable via the create tools** — `qa-page-epic` / `qa-feature-story` / `page-<slug>` must be applied after creation (Atlassian plugin or by hand). Note the required labels in your handoff.
- **A Bug/finding can't have a Story as its Jira `parent`** — the project's issue-type hierarchy scheme only allows `parent` on an Epic; `jira_set_parent(bug, story)` fails with `"Issues with this Issue Type must be created in the same project as the parent."` regardless of project match. Use `jira_link_issues({ inwardKey: <finding>, outwardKey: <featureStory>, linkType: "Relates" })` instead when re-parenting a finding under its Feature Story, and note in the finding's description that the link substitutes for the model's conceptual "parent" (LS-7686).
- **The epic is permanent** — never close a page epic when a run finishes; new runs nest fresh findings under the same epic for a durable cross-run rollup.
- **Hermetic, not live (web)** — specs under `apps/web-e2e/src/tests/` mock the backend (`route.fulfill()`, never `route.continue()`). Live-backend checks belong in `apps/web-e2e/src/integration/tests/` and are a separate, complementary layer — don't conflate the two in a Feature Story's acceptance criteria. See the [testing](../../testing/SKILL.md) skill.
- **Mobile flows are live** — Maestro drives a real dev build against the dev backend, so android rows depend on seeded data (a league on the test account, matchup/draft state). Flows degrade gracefully around data-dependent states — see the [mobile-qa](../../mobile-qa/SKILL.md) flow-authoring gotchas.
