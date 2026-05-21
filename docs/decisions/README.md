# Architecture Decision Records

This directory contains ADRs (Architecture Decision Records) for major historical architectural
decisions in Legacy Sports. Each ADR documents a single decision, its context, and its consequences.

ADRs follow [Michael Nygard's format](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions).
See [`.agents/skills/dev-process/artifacts/adr.md`](../../.agents/skills/dev-process/artifacts/adr.md)
for authoring guidance and the immutability rule.

## Index

| ADR                                           | Title                                                       | Status   |
| --------------------------------------------- | ----------------------------------------------------------- | -------- |
| [0001](0001-pnpm-workspaces-and-nx.md)        | Use pnpm workspaces + Nx for monorepo orchestration         | Accepted |
| 0002                                          | Use Apollo Client normalized cache; mutations return entity | Planned  |
| 0003                                          | Use Tamagui for cross-platform web/native UI                | Planned  |
| 0004                                          | Define queries in `.graphql` files with codegen             | Planned  |
| 0005                                          | Use Pothos for GraphQL schema construction                  | Planned  |
| 0006                                          | Three GitHub Apps for separation of duties                  | Planned  |
| 0007                                          | Claude Code worktree checkbox as default agent surface      | Planned  |
| 0008                                          | Reach for CloudWatch first when test stdout is opaque       | Planned  |
| 0009                                          | Dev-process 13-entrypoint 6-phase framework                 | Planned  |
| [0010](0010-terraform-state-lock-watchdog.md) | Terraform state lock watchdog on a GitHub-hosted runner     | Accepted |
| [0011](0011-draft-board-sport-toggle.md)      | Draft Board: sport-agnostic surface (baseball + football)   | Accepted |
