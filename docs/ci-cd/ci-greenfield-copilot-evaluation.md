# Code Reviewer Bot: LLM Provider

> **Documents the design evaluation and integration of the LLM that powers W1 code review.** Part of the LS-3857 greenfield rebuild (LS-3879). See [ci-greenfield-design.md](ci-greenfield-design.md) for the overall CI architecture.
>
> **Current default**: GitHub Models (`openai/gpt-4o-mini`) — uses the workflow `GITHUB_TOKEN` with `models: read` permission, no service-account PAT required. The original Copilot CLI evaluation is preserved below as historical context; the `CopilotCLIProvider` and `AnthropicProvider` are still selectable via `LLM_PROVIDER`.

## Motivation

The greenfield CI rebuild needed an automated code reviewer that could:

1. Catch real code quality issues (not just formatting/style)
2. Provide structured, actionable findings with file/line references
3. Post reviews via a dedicated bot account (not the user's personal account)
4. Support a structured agent-driven fix cycle (Author Agent Contract)
5. Scale to the full PR diff without human intervention

## Evaluation: Copilot CLI vs. GitHub Copilot Code Review Feature

Two approaches were evaluated:

### Option A: GitHub Copilot Code Review (native feature)

GitHub Copilot's native "Code Review" repository ruleset (`review_on_push: true`) posts reviews using the Copilot product's GitHub App.

**Advantages:** Zero setup, uses GitHub's infrastructure directly.

**Disqualifying limitations:**
- Reviews appear under GitHub's Copilot App identity, not a controllable bot account
- No programmatic access to review state or finding severity
- Cannot integrate with the RAISE/ADJUDICATE/VERIFY cycle protocol
- Cannot set `bot-review` commit status with the correct identity

### Option B: Copilot CLI with Service Account (historical — initial choice)

Use `@github/copilot` CLI with a service account PAT to drive reviews programmatically via a custom reviewer script.

**Advantages:**
- Reviews posted by `legacy-sports-review-bot` (controlled identity)
- Programmatic control: severity classification, structured thread format, cycle state
- Full integration with the RAISE/ADJUDICATE/VERIFY cycle protocol
- `bot-review` commit status set by the reviewer bot under the correct identity

**Initially selected**, then superseded — see Option C. The Copilot CLI provider remains in the codebase and is selectable via `LLM_PROVIDER=copilot-cli`, but is no longer the default.

### Option C: GitHub Models (current default)

Call the GitHub Models REST inference endpoint (`https://models.github.ai/inference/chat/completions`) directly from the reviewer script using the workflow's auto-issued `GITHUB_TOKEN` and a `permissions: { models: read }` grant in `review.yml`.

**Advantages over Option B:**
- No service-account PAT required — `GITHUB_TOKEN` is auto-issued by Actions
- Free at the workflow's existing GitHub plan tier (rate limits scale with the plan)
- Multiple model families available via `{publisher}/{model_name}` ids (`openai/gpt-4o-mini`, `meta/Llama-3.3-70B-Instruct`, `microsoft/Phi-4`, etc.)
- Programmatic control, identity, and cycle-protocol integration are all preserved (the reviewer script is unchanged; only the provider class swapped)

**Currently selected.** The reviewer's controlled bot identity (`legacy-sports-review-bot`) for posting reviews is unaffected by this swap — that identity comes from `BOT_APP_PRIVATE_KEY`, not from the LLM auth token.

## Implementation

### Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `review.yml` | `.github/workflows/review.yml` | Triggers the reviewer, manages bot credentials |
| `index.mjs` | `.github/scripts/reviewer/index.mjs` | Orchestrates the review run, selects provider via `LLM_PROVIDER` |
| `provider.mjs` | `.github/scripts/reviewer/lib/providers/provider.mjs` | `LLMProvider` interface contract |
| `github-models.mjs` | `.github/scripts/reviewer/lib/providers/github-models.mjs` | **Default** — calls GitHub Models REST inference |
| `copilot-cli.mjs` | `.github/scripts/reviewer/lib/providers/copilot-cli.mjs` | Spawns `@github/copilot` CLI (requires PAT) |
| `anthropic.mjs` | `.github/scripts/reviewer/lib/providers/anthropic.mjs` | Calls Anthropic SDK with prompt caching |

### Credentials

| Secret / Var | Purpose |
|-------------|---------|
| `GITHUB_TOKEN` (workflow) | Authenticates GitHub Models inference; `permissions: models: read` granted in `review.yml` |
| `COPILOT_SERVICE_ACCOUNT_PAT` | Optional: service-account PAT used for `LLM_PROVIDER=copilot-cli`; mapped in the workflow to `COPILOT_GITHUB_TOKEN` for the `@github/copilot` CLI |
| `ANTHROPIC_API_KEY` | Optional: required for `LLM_PROVIDER=anthropic` to authenticate Anthropic SDK requests |
| `REVIEWER_BOT_APP_ID` | GitHub App ID for `legacy-sports-review-bot` |
| `BOT_APP_PRIVATE_KEY` | Private key for `legacy-sports-review-bot` |
| `REVIEWER_TELEMETRY_BUCKET` | S3 bucket for review telemetry |

The default GitHub Models path requires no extra secrets beyond the auto-issued workflow `GITHUB_TOKEN`. If you switch providers via `LLM_PROVIDER`, also configure the optional provider-specific credentials above: `COPILOT_SERVICE_ACCOUNT_PAT` (mapped to `COPILOT_GITHUB_TOKEN`) for `copilot-cli`, or `ANTHROPIC_API_KEY` for `anthropic`.

### Model Selection

The reviewer uses `openai/gpt-4o-mini` by default (`REVIEWER_MODEL=openai/gpt-4o-mini`). GitHub Models accepts `{publisher}/{model_name}` ids — e.g. `openai/gpt-4o`, `meta/Llama-3.3-70B-Instruct`, `microsoft/Phi-4`. Override via the `REVIEWER_MODEL` env var in `review.yml`.

## Review Cycle Protocol

The bot follows a structured 3-cycle protocol enforced at the workflow level. The full Author Agent Contract is in `AGENTS.md §8`.

### Cycle 1 — RAISE

Triggered: PR `opened` / `ready_for_review`

Bot analyzes the diff and posts findings as review comments:
- **Critical/high findings** → GitHub `REQUEST_CHANGES` review + `bot-review: failure`
- **Clean diff** → GitHub `APPROVE` review + `bot-review: success` + `merge-when-ready` label

**Required author response (per open thread):**
- `FIX: <sha>` — fix already committed at the given SHA
- `JUSTIFY: <rationale>` — finding is incorrect or suggestion is out of scope

### Cycle 2 — ADJUDICATE

Triggered: `bot:ready-for-review` label applied by author after Cycle 1 responses

Bot re-evaluates findings, incorporating author justifications. Unaddressed mandates become final.

**Required author response (per open thread):**
- `FIX: <sha>` only — `JUSTIFY:` is **not** accepted in Cycle 2

### Cycle 3+ — VERIFY / Escalation

Triggered: `bot:ready-for-review` label applied again

For findings the author cannot comply with:
- `CANNOT-COMPLY: <issue-id>` with reason on the next line — escalates to a human reviewer

```
CANNOT-COMPLY: LS-1234
This change requires modifying a generated file that must not be edited manually.
```

### Format Rules

- Every open thread **must** have a structured response (`FIX:`, `JUSTIFY:`, or `CANNOT-COMPLY:`)
- Free-form text is ignored by the bot
- The bot detects malformed responses and posts a corrective reply in-thread
- Never edit the bot's own review comments — the bot reads its thread state to determine cycle progression

## `bot-review` Commit Status Lifecycle

```
PR opened/ready_for_review
    ↓
review.yml fires → reviewer script runs
    ↓
findings? → bot-review: failure     no findings? → bot-review: success
                                                          ↓
                                               merge-when-ready label added
author: FIX / JUSTIFY per thread
    ↓
author applies bot:ready-for-review
    ↓
Cycle 2: adjudicate
    ↓
mandates fixed? → bot-review: success     unresolved? → bot-review: failure
```

## Telemetry

Review runs upload telemetry (review content, timing, cycle counts, finding severity distribution) to an S3 bucket. AWS credentials use OIDC — no long-lived keys.

Telemetry upload is `continue-on-error: true`; failures do not block the review.

## Known Limitations

- Reviews are scoped to the PR diff. Context beyond the diff requires the reviewer script to fetch additional files.
- Model selection is configurable via `REVIEWER_MODEL` but not persisted across runs — defaults to `openai/gpt-4o-mini` (GitHub Models).
- Telemetry analysis tooling is not yet built (tracked separately).
- GitHub Models free-tier rate limits are shared across the account — heavy bursts may queue. The rate limit scales with the GitHub plan attached to the workflow; see [GitHub Models billing](https://docs.github.com/billing/managing-billing-for-your-products/about-billing-for-github-models).
- Review latency depends on the chosen provider/model (GitHub Models `gpt-4o-mini`: typically <30s; Copilot CLI: 2–8 min; Anthropic Sonnet 4.6: 30–90s).
