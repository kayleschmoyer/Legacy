# Postmortems

Blameless postmortems for production incidents, security events, and reverts.

## When one is required

Required by the [dev-process](../../.agents/skills/dev-process/SKILL.md) framework for entrypoints **01 incident-hotfix**, **03 security-cve**, **13 revert**, and any **Critical-tier** work. See [gates/risk-tiers.md](../../.agents/skills/dev-process/gates/risk-tiers.md).

## Format

- **Path pattern:** `docs/postmortems/YYYY-MM-DD-slug.md` (date = incident date)
- **Template:** [postmortem-template.md](../../.agents/skills/dev-process/templates/postmortem-template.md); schema and required sections in [artifacts/postmortem.md](../../.agents/skills/dev-process/artifacts/postmortem.md)
- **Scaffold tool:** `postmortem_create` on the `legacy-sports-dev-process` MCP server (also `postmortem_action_items`, `postmortem_recent`)
- **Timeline:** scheduled within 24h of incident close, published within 1 week
- Every action item gets a Jira ticket key; bare TODOs are not action items.

## Relationship to docs/fixes/

[docs/fixes/](../fixes/) is the older root-cause-analysis library — per-bug RCAs written at fix time, keyed by ticket (`LS-####-*.md`). It remains the home for bug-level RCAs. This directory is for **incident-level** postmortems (user-facing outage, security event, revert): timeline, impact, contributing factors, and tracked action items. When in doubt: if it paged someone or reverted a merge, it goes here; if it was caught and fixed in the normal flow, it goes in `docs/fixes/`.

## Index

_No postmortems yet — directory created 2026-07-02 to make the dev-process artifact paths real. Incident history predating this directory lives in [docs/fixes/](../fixes/) and the audit's incident chronicle (`scratch/skills-audit/synthesis.json`, gitignored)._
