# Finding file template

Verbatim field order, copied from existing findings (e.g. `docs/agents/qa-coverage/jira-page-epics/pages/baseball-league-detail/features/free-agents-tab/variants/non-premium/findings/BLD-020.md`). Do not reorder or rename fields.

```markdown
# <PREFIX>-<NNN> — <one-line title>

**Severity:** Low|Medium|High
**Type:** Bug|Task
**Agent lens:** <lens name>
**Platform:** All | Web | Android Native | Web + Android Native
**File:** `<path>` (+ additional paths if relevant — no line numbers, cite the symbol or a stable anchor instead)

## Description

<prose: what's wrong, contrasted with what the Feature Story / doc promises>

## Steps to Reproduce

1. ...
2. ...

## Expected

<what the feature doc / Jira description says should happen>

## Actual

<what the code actually does>

## Recommendation

<concrete next step — a specific file/component to change, or "needs /define" if the fix is itself a sizable feature>
```

- `<PREFIX>` is scoped to the page being audited (e.g. `FLD` for football-league-detail), not a global sequence — check existing findings under the same page directory for the next free number.
- `Type: Task` is for gaps that aren't a runtime bug (missing test coverage, a documented-but-never-built feature) — `Type: Bug` is for behavior that actively contradicts the spec or crashes/misleads a user.
- Omit `## Steps to Reproduce` only when the finding is a pure code-inspection gap with no user-facing repro (e.g. dead code, a missing test) — keep the other sections.
