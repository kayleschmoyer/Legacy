# CI/Bot-Review System Rebuild — Phase 5 Close (T30)

> **Epic**: LS-3857 CI/Bot-Review System Rebuild (Greenfield)  
> **Ticket**: LS-3887  
> **Date**: 2026-04-27

---

## Cost Reconciliation

Baseline: last 90 days pre-migration (normalized to monthly).  
Post: 30 days post-T29 (first full cycle available from ≈ 2026-05-27).

| Category                                         | Pre (monthly)                             | Post (monthly)         | Δ      | Notes                                                                                |
| ------------------------------------------------ | ----------------------------------------- | ---------------------- | ------ | ------------------------------------------------------------------------------------ |
| GitHub Actions minutes (paid overage)            | _pending billing data_                    | _pending_              | —      | Expect ↓: lightweight jobs migrated to `ubuntu-latest`; cron AMI-prune eliminated    |
| AWS self-hosted runner instance + storage        | _pending Cost Explorer_                   | _pending_              | —      | Runner fleet unchanged; SQS+DLQ removed (minimal line item)                          |
| Copilot subscriptions (review-related seats)     | _pending billing data_                    | _pending_              | —      | Copilot Coding Agent sunset (T24); CLI seat retained for CopilotCLIProvider fallback |
| Anthropic API spend (fallback + steady-state)    | $0 (pre-migration, no Anthropic reviewer) | _pending usage export_ | —      | AnthropicProvider is fallback-only; per-PR cost cap in place                         |
| LLM infra (S3 telemetry bucket, Discord webhook) | $0                                        | ~$0.01/mo S3           | +$0.01 | Reviewer telemetry S3 bucket added (T4); Discord webhook is free                     |
| **Total**                                        | _pending_                                 | _pending_              | —      |                                                                                      |

**Action required**: pull GitHub Actions billing and AWS Cost Explorer data once 30-day post-T29 window closes (~2026-05-27) and fill in the table above.

### Terraform Resources Destroyed (T16)

| Resource                                   | Type                              |
| ------------------------------------------ | --------------------------------- |
| `github_webhook_secret`                    | `aws_secretsmanager_secret`       |
| `github_bot_app_private_key`               | `aws_secretsmanager_secret`       |
| `github_webhook_secret_name`               | `aws_ssm_parameter`               |
| `github_webhook_race_check`                | `aws_sqs_queue`                   |
| `github_webhook_race_check_dlq`            | `aws_sqs_queue`                   |
| `github_webhook_lambda_race_check_sqs`     | `aws_iam_policy`                  |
| `github_webhook_lambda_race_check_sqs`     | `aws_iam_role_policy_attachment`  |
| `github_webhook_race_check` (queue policy) | `aws_sqs_queue_policy`            |
| `github_webhook_race_check_sqs`            | `aws_lambda_event_source_mapping` |

**Added**: 1 S3 bucket (`*-reviewer-telemetry`) for JSONL review telemetry (T4).

---

## Operational Simplification

| Metric                                         | Value                                                                                                                                           |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Workflows decommissioned                       | 3 (`copilot-review-handler.yml`, `prune-runner-amis.yml`, `copilot-setup-steps.yml`)                                                            |
| LOC removed from decommissioned workflows      | ~398 lines (229 + 169 lines respectively for the two CI workflows)                                                                              |
| Lambda bot-review handlers deleted             | 6 files (handle-pull-request, handle-pull-request-review, handle-review-thread, handle-workflow-run, handle-race-check, sqs-client + all tests) |
| Lambda LOC net delta                           | −4,630 lines (`lambdas/github-webhook/`)                                                                                                        |
| Terraform LOC net delta                        | −93 lines                                                                                                                                       |
| Total repo LOC net delta across epic           | −711 lines (96 files, +7,380 / −8,091)                                                                                                          |
| Workflows added                                | 4 (`review.yml`, `label-pager.yml`, `label-sync.yml`, `required-checks-lint.yml`)                                                               |
| AMI lifecycle change                           | Cron prune workflow → event-driven drift-check + OIDC runner AMI rebuild                                                                        |
| Engineer hours/week saved on infra maintenance | ~2–3 hrs/week estimate (SQS queue monitoring, Copilot review triage, AMI cron babysitting eliminated)                                           |

---

## Stuck-PR Rate Baseline

Measured 2026-04-27 (T29 merge) through 2026-04-27 (measurement date, ~0 days post-T29).

| Escalation Label              | PRs    | Notes          |
| ----------------------------- | ------ | -------------- |
| `needs-human-arbitration`     | 0      |                |
| `review-bot-degraded`         | 0      |                |
| `ci-stuck`                    | 0      |                |
| `needs-human-security-review` | 0      |                |
| **Total escalations**         | **0**  |                |
| Post-T29 merged PRs           | 35     |                |
| **Escalation rate**           | **0%** | Target: <1% ✅ |

> Note: measurement window is ~0 days (T29 merged same day). Re-run this query after 30 days (~2026-05-27) for a statistically meaningful sample.

---

## Retrospective

### What Went Well

- **Speed**: 30 tickets (T1–T29) completed in an intensive 2-day sprint (2026-04-26 → 2026-04-27). The incremental phase structure (shadow → blocking → hardening → decommission → close) gave clear go/no-go gates.
- **Shadow mode de-risked cutover**: Running the new LLM reviewer in parallel (T8–T10) before going blocking (T11) meant zero live-PR disruption during transition.
- **LLMProvider abstraction** proved its value immediately — `CopilotCLIProvider` as primary with `AnthropicProvider` as fallback gives cost control and resilience without committing to a single model.
- **Decommission was clean**: The Copilot webhook Lambda machinery (SQS, race-check queue, bot secrets) was removed completely with no lingering dead code; 4,630 LOC gone.
- **Escalation labels + W4 label-pager** were shipped before the system went blocking — the safety net was in place before it was needed.
- **CODEOWNERS + naming-discipline lint (W3)** added structural guardrails that benefit all future PRs, not just CI PRs.
- **Cycle protocol (RAISE/ADJUDICATE/VERIFY)** gave the bot a structured escalation path so stuck threads don't just rot.

### What Didn't Go as Expected

- **T24 (sunset Copilot Coding Agent)** required a separate ticket from T16 (decommission review handler) because the `copilot-setup-steps.yml` file wasn't in scope of the original decommission pass. The two concerns (Copilot review bot vs. Copilot Coding Agent) were conflated in early planning; they should have been split from the start.
- **Cost reconciliation table remains partially unfilled** — billing data from GitHub Actions, AWS Cost Explorer, and Anthropic API isn't accessible at build time. The table is scaffolded; a human needs to pull actuals after the 30-day post-T29 window closes.
- **The "30 days post-T29" stuck-PR rate measurement** is inherently deferred — T30 can be completed in code today but the stuck-PR _data_ isn't available yet. This is a design limitation of the ticket: a close task that depends on future observability data should either be time-boxed or split into a follow-up ticket.

### Phases That Took Longer Than Estimated

- **Phase 2 (LLM reviewer core, T5–T13)** was the bulk of the work: LLMProvider interface, CopilotCLIProvider, AnthropicProvider, multi-pass consolidator, chain-of-thought critique, FIX/JUSTIFY/CANNOT-COMPLY parser, context fetching, cost cap, telemetry. Estimated 4–5 tickets of medium complexity; turned into 9 interdependent tickets. Root cause: the provider abstraction revealed more edge cases than expected once real PR diffs were in scope.
- **Phase 3 hardening (T14–T17)** — especially the orchestrator trigger logic (`pull_request` → `pull_request_review` + `merge_group`) required careful reasoning about GitHub's event model; a non-obvious invariant that wasn't in the original design.

### Tickets That Should Have Been Broken Down Further

- **T16 (decommission Copilot bot-review machinery)** touched the Lambda, Terraform, workflow, and GitHub App config simultaneously. It shipped fine, but it's the kind of change that could mask a regression in code review. A finer slice would have been: (a) decommission workflow, (b) strip Lambda, (c) destroy Terraform resources, each independently verifiable.
- **T11 (switch reviewer shadow → blocking)** bundled the mode flip with W1 trigger tightening. These are orthogonal concerns that could have been validated separately.

### Follow-up Ideas for Next Iteration

- **CopilotSDKProvider**: When GitHub exposes a stable API-first interface for Copilot (vs. CLI shelling), migrate `CopilotCLIProvider` to it for latency and reliability improvements. Track in a new ticket when the SDK ships.
- **Anthropic-default**: If Anthropic API pricing per review drops below Copilot CLI cost-equivalent, reconsider making `AnthropicProvider` primary rather than fallback. Revisit at next billing review.
- **Stuck-PR rate follow-up**: If the 30-day post-T29 measurement (due ~2026-05-27) shows >1% escalation rate, root-cause and open a follow-up ticket. Add a calendar reminder.
- **Telemetry dashboard**: The JSONL records in S3 are not yet queryable via any dashboard. A lightweight Athena + QuickSight setup (or even a weekly CSV export) would let us track review quality over time.
- **Cost reconciliation actuals**: Pull billing data at the end of May 2026 and update this document.

---

## Epic Completion Checklist

- [x] Cost reconciliation table scaffolded (actuals pending 2026-05-27)
- [x] Operational simplification documented quantitatively
- [x] Retrospective written
- [x] Stuck-PR rate measured: 0% (re-measure 2026-05-27 for 30-day window)
- [ ] Epic LS-3857 transitioned to Done ← handled in PR merge hook
