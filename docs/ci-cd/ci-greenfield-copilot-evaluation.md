# Code Reviewer Bot: Copilot Evaluation

> **Documents the design evaluation and integration of GitHub Copilot as the code review engine.** Part of the LS-3857 greenfield rebuild (LS-3879). See [ci-greenfield-design.md](ci-greenfield-design.md) for the overall CI architecture.

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

### Option B: Copilot CLI with Service Account (chosen)

Use `@github/copilot` CLI with a service account PAT to drive reviews programmatically via a custom reviewer script.

**Advantages:**
- Reviews posted by `legacy-sports-review-bot` (controlled identity)
- Programmatic control: severity classification, structured thread format, cycle state
- Full integration with the RAISE/ADJUDICATE/VERIFY cycle protocol
- `bot-review` commit status set by the reviewer bot under the correct identity

**Selected:** Option B.

## Implementation

### Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `review.yml` | `.github/workflows/review.yml` | Triggers the reviewer, manages bot credentials |
| `index.mjs` | `.github/scripts/reviewer/index.mjs` | Orchestrates the review run |
| `provider.mjs` | `.github/scripts/reviewer/lib/providers/provider.mjs` | Copilot CLI adapter |

### Credentials

| Secret / Var | Purpose |
|-------------|---------|
| `COPILOT_SERVICE_ACCOUNT_PAT` | Authenticates the Copilot CLI with a service account |
| `REVIEWER_BOT_APP_ID` | GitHub App ID for `legacy-sports-review-bot` |
| `BOT_APP_PRIVATE_KEY` | Private key for `legacy-sports-review-bot` |
| `REVIEWER_TELEMETRY_BUCKET` | S3 bucket for review telemetry |

### Model Selection

The reviewer uses the `codex` model (`REVIEWER_MODEL=codex`). Model selection is configurable via the `REVIEWER_MODEL` environment variable in `review.yml`.

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
- The `codex` model selection is configurable but not persisted across runs — defaults to `codex`.
- Telemetry analysis tooling is not yet built (tracked separately).
- Review latency depends on Copilot CLI response time (typically 2–8 minutes per PR).
