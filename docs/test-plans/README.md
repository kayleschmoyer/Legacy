# Test Plans

Standalone test plans that are too large for a PR body or span multiple PRs.

## Default home is the PR body

Per [artifacts/test-plan.md](../../.agents/skills/dev-process/artifacts/test-plan.md), a test plan normally lives as a section **in the PR description** where `testplan_extract` / `testplan_coverage_check` (on the `legacy-sports-dev-process` MCP server) can consume it. Use this directory only when the plan:

- spans multiple PRs (e.g. a migration rolled out in stages), or
- is a campaign-level plan (e.g. a release or launch validation matrix), or
- must outlive the PR as a rerunnable checklist.

The PR body then links to the file here instead of inlining it.

## Format

- **Path pattern:** `docs/test-plans/LS-####-slug.md` (ticket-keyed)
- **Template:** [test-plan-template.md](../../.agents/skills/dev-process/templates/test-plan-template.md); schema in [artifacts/test-plan.md](../../.agents/skills/dev-process/artifacts/test-plan.md)
- Every case states: setup, action, expected result, and how it is verified (automated test path or `manual: <evidence>`).

## Index

_No standalone test plans yet — directory created 2026-07-02 to make the dev-process artifact paths real._
