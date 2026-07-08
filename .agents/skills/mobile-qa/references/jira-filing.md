# Dedup & Jira Filing for Mobile QA Findings

How raw judge findings become Jira tickets. The hierarchy contract lives in the [QA coverage model](../../plan-ticket/references/qa-coverage-model.md) — this file is the mobile binding.

## Deduplication (scripts/mobile-qa/bug-filter.mjs)

Three passes, ported from the ai-qa-agent bugFilter with web routes replaced by QA-coverage screen slugs (derived from the artifact path, e.g. `trade-center`):

1. **Fingerprint** — exact-match dedup: functional findings with Maestro flow errors key on the normalized error text; everything else keys on `category + normalized title`. Merges affected screens; the higher-confidence copy survives.
2. **Semantic** — Jaccard similarity ≥ 0.40 on tokenized title+description (stop words removed), union-find clustering within a category; the highest-confidence member represents the cluster. Findings observed on 3+ screens get a +0.05 confidence boost.
3. **Category + screen overlap** — same category, >50% screen overlap, and title Jaccard ≥ 0.25 → keep the higher `confidence + severity/4` score.

Only entries with confidence ≥ 0.6 (`--min-confidence`) land in the report's `filable` list; the rest stay in `belowThreshold` for the run summary.

## Filing hierarchy

Every filable finding files as a **Bug (or Task for automation gaps), parented to the Feature Story** covering that feature, under the page's permanent Page Epic:

```
Page Epic  "QA — Page: <Name>"            (qa-page-epic)
└─ Feature Story "Feature: <Name>"        (qa-feature-story, page-<slug>)
   └─ Bug: [category] <finding title>     ← you file here
```

Procedure per filable entry:

1. **Resolve the Feature Story** — map the finding's screen slug to `docs/agents/qa-coverage/jira-page-epics/pages/<page>/features/…` and read the `feature.md` `**Jira:**` key. When no Feature Story covers the feature yet, create it first per the QA coverage model's "Filing a new page's coverage" steps (Page Epics are permanent — reuse, never recreate).
2. **Create the Bug** — `jira_create_ticket` with type `Bug`, summary = the finding title, parent = the Feature Story key, description = the entry's `jiraDescription` (already in Jira wiki markup, with screens, severity, confidence, repro steps, screenshot path, and the Maestro flow to replay).
3. **Labels** — labels are not settable via the create tools; note `qa-feature-story`-consistent labels plus `mobile` / `android` in the handoff for post-create application.
4. **Mirror on disk** — add a findings file under the feature's `variants/<variant>/findings/` (or `findings/` for the base variant) following the existing `<ID>.md` pattern, and update the feature's platform-coverage table.
5. **Attach evidence** — reference the screenshot path from `maestro/artifacts/` in the ticket; attach the image when the Jira tooling supports it.

Duplicate guard: before creating, search the Feature Story's existing children for the finding title (`jira_search`) — cross-run duplicates are expected because the epic is permanent.

## Provenance and maintenance

- 2026-07-07: ported from ai-qa-agent `src/agent/bugFilter.ts`; thresholds (0.40 Jaccard, 0.25 title similarity, 0.6 filing confidence) preserved from the original.
- Verify thresholds still match: `grep -n "0.4\|0.25\|minConfidence" scripts/mobile-qa/bug-filter.mjs`
