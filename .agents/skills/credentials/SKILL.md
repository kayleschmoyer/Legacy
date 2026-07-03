---
name: credentials
description: 'Deprecated pointer — the auth model and pre-flight checks moved to mcp-first. Load when: an inbound link brought you here; then load ../mcp-first/SKILL.md (Auth Model + Pre-flight Auth Check sections) instead.'
---

# Skill: Credentials (merged into mcp-first, 2026-07-02)

This skill's content was retired and replaced during the 2026-07 skills audit. The auth model it used to describe — per-session ~8 h Cognito ID tokens (`MCP_AUTH_TOKEN`) in `.mcp.json` URL-server headers, `GH_TOKEN`/`JIRA_EMAIL` set "in `.mcp.json` env", and 401 recovery via `node scripts/mcp-auth.mjs` + session restart — no longer exists (removed in LS-5094; `scripts/mcp-auth.mjs` purges the stale keys on every run).

Current homes:

| Need                                                                                | Go to                                                                                                               |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Auth model per tool surface (OAuth connectors, Copilot bearers, stdio env, e2e JWT) | [mcp-first — Auth Model](../mcp-first/SKILL.md#auth-model)                                                          |
| Pre-flight check (`auth_check_all`, per-service `*_auth_status`)                    | [mcp-first — Pre-flight Auth Check](../mcp-first/SKILL.md#pre-flight-auth-check)                                    |
| Mid-session 401 → `/mcp` re-consent protocol                                        | [mcp-first/references/diagnostics.md](../mcp-first/references/diagnostics.md#mid-session-401--token-expiry-ls-4874) |
| Tier-1 rule: never run auth-generation commands                                     | AGENTS.md — Critical Rules → Safety                                                                                 |
| Developer connector onboarding (Track A/B setup)                                    | [`docs/dev-process/mcp-connector-access.md`](../../../docs/dev-process/mcp-connector-access.md)                     |

This directory is retained only so inbound links keep resolving. Do not add content here — add it to the homes above.
