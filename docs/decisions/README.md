# Architecture Decision Records

This directory contains ADRs (Architecture Decision Records) for major historical architectural
decisions in Legacy Sports. Each ADR documents a single decision, its context, and its consequences.

ADRs follow [Michael Nygard's format](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions).
See [`.agents/skills/dev-process/artifacts/adr.md`](../../.agents/skills/dev-process/artifacts/adr.md)
for authoring guidance and the immutability rule.

## Index

| ADR                                                      | Title                                                                                 | Status   |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------- |
| [0001](0001-pnpm-workspaces-and-nx.md)                   | Use pnpm workspaces + Nx for monorepo orchestration                                   | Accepted |
| [0002](0002-apollo-client-normalized-cache.md)           | Use Apollo Client normalized cache; mutations return entity                           | Accepted |
| [0003](0003-tamagui-cross-platform-ui.md)                | Use Tamagui for cross-platform web/native UI                                          | Accepted |
| [0004](0004-graphql-codegen-no-inline-gql.md)            | Define queries in `.graphql` files with codegen                                       | Accepted |
| [0005](0005-pothos-graphql-server.md)                    | Use Pothos for GraphQL schema construction                                            | Accepted |
| [0006](0006-three-github-apps-separation-of-duties.md)   | Three GitHub Apps for separation of duties                                            | Accepted |
| [0007](0007-claude-code-worktrees-as-default.md)         | Claude Code worktree checkbox as default agent surface                                | Accepted |
| [0008](0008-cloudwatch-archaeology-over-client-logs.md)  | Reach for CloudWatch first when test stdout is opaque                                 | Accepted |
| [0009](0009-dev-process-13-entrypoints-6-phase-spine.md) | Dev-process 13-entrypoint 6-phase framework                                           | Accepted |
| [0010](0010-terraform-state-lock-watchdog.md)            | Terraform state lock watchdog on a GitHub-hosted runner                               | Accepted |
| [0011](0011-draft-board-sport-toggle.md)                 | Draft Board: sport-agnostic surface (baseball + football)                             | Accepted |
| [0012](0012-pr-ci-e2e-coverage.md)                       | Affected-selection e2e coverage on PR CI                                              | Proposed |
| [0013](0013-runner-job-heartbeat.md)                     | Runner survival via a runner-level job heartbeat                                      | Accepted |
| [0014](0014-integration-nightly-bisect.md)               | Integration regression detection via nightly + bisection                              | Accepted |
| [0015](0015-semantic-page-objects.md)                    | Semantic Page Object Model for Playwright e2e tests                                   | Proposed |
| [0016](0016-test-dependency-injection.md)                | Test dependency injection: platform driver + backend seam                             | Accepted |
| [0017](0017-native-graphql-mock-server.md)               | Per-worker GraphQL mock server for hermetic native E2E runs                           | Accepted |
| [0018](0018-appium-native-driver.md)                     | AppiumNativeDriver: the native implementation of ADR-0016's platform seam             | Accepted |
| [0019](0019-realtime-reliability-hardening.md)           | Realtime reliability: subsystem ownership, binding rules, no-mocked-neighbour testing | Accepted |
| [0020](0020-native-websocket-fan-out-stays-manual.md)    | Native-emulator WebSocket fan-out coverage stays manual until mock server speaks WS   | Accepted |
