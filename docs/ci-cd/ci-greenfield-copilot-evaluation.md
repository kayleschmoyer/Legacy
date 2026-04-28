# Code Reviewer Bot: LLM Provider

> **Documents the design evaluation and integration of the LLM that powers W1 code review.** Part of the LS-3857 greenfield rebuild (LS-3879). See [ci-greenfield-design.md](ci-greenfield-design.md) for the overall CI architecture.
>
> **Current default**: Google Gemini (`gemini-2.5-flash`) — uses the `GEMINI_CODE_REVIEW_API_KEY` repo secret, calls the Generative Language REST API directly. The earlier GitHub Models and Copilot CLI evaluations are preserved below as historical context; `GitHubModelsProvider`, `CopilotCLIProvider`, and `AnthropicProvider` are still selectable via `LLM_PROVIDER`.

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

**Initially selected**, then superseded — see Option D. The Copilot CLI provider remains in the codebase and is selectable via `LLM_PROVIDER=copilot-cli`.

### Option C: GitHub Models (historical, then backed out)

Call the GitHub Models REST inference endpoint (`https://models.github.ai/inference/chat/completions`) directly using the workflow's auto-issued `GITHUB_TOKEN` and a `permissions: { models: read }` grant.

Initially selected (LS-3930) for its zero-secret setup. **Backed out (LS-3954-followup)** because the GitHub Models REST API enforces an **8000-input-token cap on the Copilot Pro tier** regardless of which model is selected — every non-trivial PR (multi-pass review with full diff + expanded file context) exceeded this cap and the reviewer started returning 413 errors. Only Copilot Enterprise plans raise this to 16K, which is still tight. The provider remains in the codebase and is selectable via `LLM_PROVIDER=github-models` for orgs on Enterprise plans where the cap is acceptable.

### Option D: Gemini (current default)

Call the Google Gemini REST API (`https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`) directly from the reviewer script using a Google AI Studio API key stored in the `GEMINI_CODE_REVIEW_API_KEY` repo secret.

**Advantages over Option C:**

- 1M-token context window on `gemini-2.5-flash` removes the 8K cap that broke the GitHub Models path entirely
- Cheap at multi-pass scale: ~$0.02/non-trivial PR on the paid tier with prompt caching, ~$28/mo at 1,400 PRs/mo
- Free tier (10 RPM / 250 RPD / 250K TPM) viable for low-volume repos; paid tier (billing-attached project) for higher volume
- Explicit `cachedContents` API caches the system prompt (reviewer-rules + persona + format spec) across calls; user content prefix benefits from Gemini's automatic implicit caching across the 3 multi-pass calls
- Typed errors (`auth`, `rate-limit`, `quota`, `context-too-large`, `invalid-request`, `transient`) routed to author-facing failure messages so PR authors get actionable guidance instead of opaque "infrastructure error" reviews

**Currently selected.** The reviewer's controlled bot identity (`legacy-sports-review-bot`) for posting reviews is unaffected by this swap — that identity comes from `BOT_APP_PRIVATE_KEY`, not from the LLM auth token.

## Implementation

### Components

| Component           | Location                                                   | Purpose                                                                                  |
| ------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `review.yml`        | `.github/workflows/review.yml`                             | Triggers the reviewer, manages bot credentials                                           |
| `index.mjs`         | `.github/scripts/reviewer/index.mjs`                       | Orchestrates the review run, selects provider via `LLM_PROVIDER`                         |
| `provider.mjs`      | `.github/scripts/reviewer/lib/providers/provider.mjs`      | `LLMProvider` interface contract                                                         |
| `gemini.mjs`        | `.github/scripts/reviewer/lib/providers/gemini.mjs`        | **Default** — calls Google Gemini REST API with explicit system caching and typed errors |
| `github-models.mjs` | `.github/scripts/reviewer/lib/providers/github-models.mjs` | Calls GitHub Models REST inference (8K input cap on Pro tier)                            |
| `copilot-cli.mjs`   | `.github/scripts/reviewer/lib/providers/copilot-cli.mjs`   | Spawns `@github/copilot` CLI (requires PAT)                                              |
| `anthropic.mjs`     | `.github/scripts/reviewer/lib/providers/anthropic.mjs`     | Calls Anthropic SDK with prompt caching                                                  |

### Credentials

| Secret / Var                  | Purpose                                                                                                                                                                                                         |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GEMINI_CODE_REVIEW_API_KEY`  | Required for `LLM_PROVIDER=gemini` (default). Google AI Studio API key, generated at https://aistudio.google.com/apikey. The provider also accepts `GEMINI_API_KEY` and `GOOGLE_API_KEY` as fallback env names. |
| `GITHUB_TOKEN` (workflow)     | Used by `gh` CLI calls for posting reviews/comments and by `LLM_PROVIDER=github-models`. The `models: read` permission is only needed for the GitHub Models provider.                                           |
| `COPILOT_SERVICE_ACCOUNT_PAT` | Optional: service-account PAT used for `LLM_PROVIDER=copilot-cli`; mapped in the workflow to `COPILOT_GITHUB_TOKEN` for the `@github/copilot` CLI                                                               |
| `ANTHROPIC_API_KEY`           | Optional: required for `LLM_PROVIDER=anthropic` to authenticate Anthropic SDK requests                                                                                                                          |
| `REVIEWER_BOT_APP_ID`         | GitHub App ID for `legacy-sports-review-bot`                                                                                                                                                                    |
| `BOT_APP_PRIVATE_KEY`         | Private key for `legacy-sports-review-bot`                                                                                                                                                                      |
| `REVIEWER_TELEMETRY_BUCKET`   | S3 bucket for review telemetry                                                                                                                                                                                  |

The default Gemini path requires the `GEMINI_CODE_REVIEW_API_KEY` repo secret. If you switch providers via `LLM_PROVIDER`, also configure the optional provider-specific credentials above: `COPILOT_SERVICE_ACCOUNT_PAT` (mapped to `COPILOT_GITHUB_TOKEN`) for `copilot-cli`, or `ANTHROPIC_API_KEY` for `anthropic`. The `github-models` provider needs no extra secret but requires `permissions: models: read` re-added to `review.yml`.

### Model Selection

The reviewer uses `gemini-2.5-flash` by default (`REVIEWER_MODEL=gemini-2.5-flash`). Other Gemini models are selectable: `gemini-2.5-flash-lite` (cheaper, weaker), `gemini-2.5-pro` (top quality, ~10× cost). Override via the `REVIEWER_MODEL` env var in `review.yml`.

When `LLM_PROVIDER=github-models`, the reviewer accepts `{publisher}/{model_name}` ids — e.g. `openai/gpt-4o-mini`, `openai/gpt-4o`, `meta/Llama-3.3-70B-Instruct`, `microsoft/Phi-4`.

### Free vs. paid tier (Gemini)

The Gemini API free tier has tight rate limits — for `gemini-2.5-flash`, **10 requests/minute, 250 requests/day, 250K tokens/minute**. Since multi-pass review fires 3 calls per non-trivial PR, the daily cap can be exhausted by ~80 non-trivial PRs/day. When the cap is hit, the reviewer posts a typed `quota`-kind comment on the PR explaining the cause and recovery steps (resume after Pacific midnight reset, or enable billing). To remove the daily cap, enable billing on the Google Cloud project tied to the API key; paid-tier rates are $0.30/M input, $2.50/M output, $0.075/M cached input.

### Failure handling

The reviewer maps provider errors to specific PR-author messages instead of always posting the same "infrastructure error" review. Each kind has a tailored message and review event:

| Error kind          | Trigger                                    | Review event                 | Author guidance                                                  |
| ------------------- | ------------------------------------------ | ---------------------------- | ---------------------------------------------------------------- |
| `auth`              | API key invalid/revoked (401/403)          | `COMMENT` (non-blocking)     | Maintainer regenerates key and re-applies `bot:ready-for-review` |
| `rate-limit`        | Per-minute quota hit (429, retryable)      | `COMMENT` (non-blocking)     | Wait + re-apply `bot:ready-for-review`                           |
| `quota`             | Daily quota exhausted (429, terminal)      | `COMMENT` (non-blocking)     | Wait for daily reset or enable billing                           |
| `context-too-large` | Input exceeds model window (400)           | `REQUEST_CHANGES` (blocking) | Split PR into smaller pieces                                     |
| `cost-cap`          | `CostCapExceededError` from `cost-cap.mjs` | `REQUEST_CHANGES` (blocking) | Split PR or raise `REVIEWER_COST_CAP_USD`                        |
| Unknown / transient | 5xx, network, retries exhausted            | `REQUEST_CHANGES` (blocking) | Re-apply `bot:ready-for-review` to retry                         |

Non-retryable errors (auth, daily quota, context-too-large, invalid request) skip the 30s/90s/270s retry backoff via `withRetry`'s `retryable: false` short-circuit, saving ~6.5 minutes of CI time per occurrence.

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
