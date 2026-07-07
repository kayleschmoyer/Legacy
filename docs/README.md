# Legacy Sports Documentation Hub

Legacy Sports is a fantasy-sports product where users draft **historical players** into leagues and score them against randomly-selected real seasons and games. Product source of truth: [product/subscription-tiers.md](product/subscription-tiers.md) (tiers and entitlements) and [games/season-draft-game.md](games/season-draft-game.md) (core game design). Domain ground truth for agents: [`.agents/skills/domain-reference/SKILL.md`](../.agents/skills/domain-reference/SKILL.md).

**Two documentation layers exist:**

1. **`docs/`** (this tree) — human-facing reference: architecture, product, decisions, runbooks, incident records.
2. **[`.agents/skills/`](../.agents/skills/)** — agent-facing operational skills (how to build, test, ship, and operate). Start from [AGENTS.md](../AGENTS.md). When the two layers overlap, the skill is the operational authority and the doc is orientation.

Placement rules, status markers, and the archive policy live in [DOCUMENTATION_STRUCTURE.md](DOCUMENTATION_STRUCTURE.md).

## Directory map

| Directory                                | What it holds                                                                                       | Status                                                                                                    |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| [agents/](agents/)                       | Older CSV-based agent instructions                                                                  | Legacy — superseded by [`.agents/skills/`](../.agents/skills/) for agent guidance                         |
| [api/](api/)                             | GraphQL schema notes, matchup API reference                                                         | Current                                                                                                   |
| [architecture/](architecture/)           | System design: multi-sport model, league state machine, matchups, shared components, premium gating | Current core; verify schema claims against the Drizzle models in `lib/db-client`                          |
| [authentication/](authentication/)       | OAuth flows, auto-provisioning, invite codes, machine credentials                                   | Current                                                                                                   |
| [build-and-tooling/](build-and-tooling/) | Nx/Jest/package conventions                                                                         | Mixed — all `nx-cloud-*` / DTE docs are historical (Nx Cloud removed by the LS-3857 CI rebuild)           |
| [ci-cd/](ci-cd/)                         | CI pipeline design (post-LS-3857 greenfield), CI Gate aggregator, merge queue, troubleshooting      | Current; superseded material in [ci-cd/archive/](ci-cd/archive/)                                          |
| [database/](database/)                   | Migration policy, Drizzle ORM practices                                                             | Current                                                                                                   |
| [decisions/](decisions/)                 | Architecture Decision Records (ADRs) — see [decisions/README.md](decisions/README.md) for the index | Current, append-only                                                                                      |
| [deployment/](deployment/)               | AWS infrastructure, Lambda deployment, [deployment/terraform/](deployment/terraform/)               | Mixed — check per-doc dates                                                                               |
| [design/](design/)                       | Design bundles synced from Claude Design + [brand.md](design/brand.md)                              | Machine-owned — do not hand-edit; see [design/README.md](design/README.md)                                |
| [dev-process/](dev-process/)             | Human-facing process overview, LLM environment notes, design-sync process                           | Current; operational authority is [`.agents/skills/dev-process/`](../.agents/skills/dev-process/SKILL.md) |
| [development-plans/](development-plans/) | Forward-looking design sketches                                                                     | Aspirational — not commitments                                                                            |
| [features/](features/)                   | Major feature designs (draft picks, timers, WAR methodology)                                        | Mixed — check per-doc dates                                                                               |
| [fixes/](fixes/)                         | Root-cause analyses and applied fixes (incident library)                                            | Current — indexed in [fixes/README.md](fixes/README.md)                                                   |
| [games/](games/)                         | Game-mode design docs                                                                               | Current                                                                                                   |
| [guides/](guides/)                       | Setup, troubleshooting, and feature how-tos                                                         | Mixed — setup/tooling guides may lag the skills layer                                                     |
| [migration-history/](migration-history/) | Completed-work summaries from past migrations                                                       | Historical by definition                                                                                  |
| [mobile/](mobile/)                       | React Native / Android build docs                                                                   | Current                                                                                                   |
| [operations/](operations/)               | Oncall runbooks (DB/infra procedures with rollback steps)                                           | Current                                                                                                   |
| [postmortems/](postmortems/)             | Blameless postmortems — see [postmortems/README.md](postmortems/README.md)                          | Current (directory established 2026-07-02)                                                                |
| [product/](product/)                     | Product source-of-truth docs (subscription tiers)                                                   | Current, human-owned                                                                                      |
| [rfcs/](rfcs/)                           | RFCs (accepted and draft), e.g. the modules-pool RFC                                                | Current                                                                                                   |
| [runners/](runners/)                     | Self-hosted CI runner AMI claim-vs-observed ledger                                                  | Current                                                                                                   |
| [security/](security/)                   | Security scanning, GitHub secrets guide                                                             | Mixed — check per-doc dates                                                                               |
| [test-plans/](test-plans/)               | Standalone/multi-PR test plans — see [test-plans/README.md](test-plans/README.md)                   | Current (directory established 2026-07-02)                                                                |
| [web/](web/)                             | Web app docs                                                                                        | Mixed — see stack corrections below                                                                       |

Top-level file: [feature-flags.md](feature-flags.md) (GrowthBook). The full env-var/flag reference for agents is [`.agents/skills/config-and-flags/SKILL.md`](../.agents/skills/config-and-flags/SKILL.md).

## Stack corrections (2026-07-02)

Older docs in this tree claim a stack that no longer exists. Ground truth:

- **Web app**: Vite + React + `react-router-dom` with `BrowserRouter`, dev server on port **4200** (`apps/web/vite.config.mts`, `apps/web/project.json`). It is **not** Next.js, and [web/web-hash-routing.md](web/web-hash-routing.md) is historical — `apps/web/src/main.tsx` uses `BrowserRouter`.
- **CI**: GitHub Actions with local-only Nx (no Nx Cloud, no DTE) since the LS-3857 CI rebuild — see [ci-cd/ci-rebuild-retrospective.md](ci-cd/ci-rebuild-retrospective.md). Ignore any doc that routes CI problems to Nx Cloud quota or DTE tuning.
- **Error tracking**: Rollbar (the repo migrated off Sentry; treat Sentry references as historical).

## Routing by task

| Task                           | Start here                                                                                                                                             |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Understand the product/domain  | [product/subscription-tiers.md](product/subscription-tiers.md) → [architecture/league-state-machine.md](architecture/league-state-machine.md)          |
| Set up a dev environment       | [guides/development-setup.md](guides/development-setup.md); agents use [`.agents/skills/dev-environment/`](../.agents/skills/dev-environment/SKILL.md) |
| Make an architectural decision | [decisions/README.md](decisions/README.md) (ADR index + format)                                                                                        |
| Propose a significant design   | [rfcs/](rfcs/) via the [dev-process RFC artifact](../.agents/skills/dev-process/artifacts/rfc.md)                                                      |
| Debug a production incident    | [fixes/README.md](fixes/README.md) (has this failed before?) → [operations/](operations/) runbooks → write a [postmortem](postmortems/README.md)       |
| Change the database schema     | [database/migration-policy.md](database/migration-policy.md)                                                                                           |
| Deploy / change infrastructure | [deployment/terraform/](deployment/terraform/); agents use [`.agents/skills/terraform/`](../.agents/skills/terraform/SKILL.md)                         |
| Fix failing CI                 | [ci-cd/ci-troubleshooting-guide.md](ci-cd/ci-troubleshooting-guide.md)                                                                                 |
| Implement a synced design      | [design/README.md](design/README.md)                                                                                                                   |

## Routing by role

- **AI agents**: [AGENTS.md](../AGENTS.md) → the generated routing index [`.agents/skills/INDEX.md`](../.agents/skills/INDEX.md) → [`.agents/skills/`](../.agents/skills/). This `docs/` tree is your reference library, not your runbook. The CSVs in [agents/](agents/) are a legacy stratum — prefer skills.
- **New engineers**: [guides/development-setup.md](guides/development-setup.md) → [dev-process/README.md](dev-process/README.md) → [architecture/](architecture/).
- **Backend/API**: [architecture/graphql-integration.md](architecture/graphql-integration.md), [api/](api/), [database/](database/).
- **Web**: [web/](web/) (mind the stack corrections above), [architecture/shared-components.md](architecture/shared-components.md).
- **Mobile**: [mobile/](mobile/), [architecture/cross-platform-system.md](architecture/cross-platform-system.md).
- **DevOps/Platform**: [deployment/](deployment/), [ci-cd/](ci-cd/), [runners/](runners/), [security/](security/).
- **QA**: the testing authority is [`.agents/skills/testing/SKILL.md`](../.agents/skills/testing/SKILL.md); human-facing context in [build-and-tooling/](build-and-tooling/) (skip the `nx-cloud-*` docs).

## Contributing to documentation

Where a new doc goes, how to mark a doc stale, and when to archive: [DOCUMENTATION_STRUCTURE.md](DOCUMENTATION_STRUCTURE.md). Documentation ships **in the same PR** as the code it describes ([dev-process freshness gate](../.agents/skills/dev-process/gates/documentation-freshness.md)).

## Provenance and maintenance

- 2026-07-02: rewritten from the skills/docs audit (`scratch/skills-audit/`); replaced the 2025-10 hub that routed to Nx Cloud/Next.js-era docs.
- Verify web port: `grep -n '"port"' apps/web/project.json`
- Verify router: `grep -n 'Router' apps/web/src/main.tsx`
- Verify Nx Cloud absence: `grep -rn NX_NO_CLOUD .github/workflows | head -3`
- Verify directory list: `ls docs/`
