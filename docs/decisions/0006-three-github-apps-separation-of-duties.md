# 0006. Three GitHub Apps for separation of duties in the bot-PR flow

Date: 2025-06-01

## Status

Accepted

## Context

Automating PR review and merge required GitHub API permissions. The question was
how to divide those permissions across automation actors.

**The alternatives:**

- **Single GitHub App with all permissions** — one app handles authoring, reviewing,
  and merging. Operationally simple but violates least-privilege: a token that can
  write code can also approve reviews and merge PRs. A compromised or buggy token
  can self-approve and self-merge without any human in the loop.
- **GitHub Actions only** — use `GITHUB_TOKEN` from workflow context. `GITHUB_TOKEN`
  cannot approve its own PR, so a bot-authored PR would need elevated permissions
  or a separate PAT. PATs are organization-scoped and hard to audit per-actor.
- **Two apps (author + merge)** — separates writing from merging but leaves review
  in an ambiguous middle ground; the merge app would need review permissions anyway.
- **Three apps with strict role boundaries** — each app has only the permissions
  needed for its role; a bug in one app cannot accidentally exercise a different
  role's capabilities.

The decision was driven by the bot-PR flow: the automation pipeline needs to write
code (Author), evaluate it (Reviewer Bot), and land it (Merge Queue Bot) — three
distinct trust boundaries.

## Decision

We will operate **three separate GitHub Apps**, each with the minimum permissions
for its role:

1. **Author Agent App** — writes commits, opens PRs, applies author-owned labels
   (`bot:ready-for-review`). Permissions: `contents: write`, `pull_requests: write`.
   Cannot approve reviews. Cannot merge.
2. **Reviewer Bot App** — reads PR diffs, posts review comments, applies review-owned
   labels (`merge-when-ready`, `bot:changes-requested`). Permissions:
   `pull_requests: write` (reviews). Cannot push commits or merge.
3. **Merge Queue Bot App** — triggers the merge queue or squash-merges when
   `merge-when-ready` is set and all checks pass. Permissions: `contents: write`
   (merge only), `pull_requests: write` (merge). Cannot review or push new commits.

Each app authenticates via a separate private key; tokens are stored as GitHub
Actions secrets and are never shared across roles.

## Consequences

### Easier

- Audit trails are unambiguous: commits from the Author App, review events from the
  Reviewer Bot, and merge events from the Merge Queue Bot each have a distinct actor.
- A bug that causes the Reviewer Bot to post incorrect review comments cannot
  simultaneously push a bad commit — the tokens are separate.
- Revoking or rotating one app's credentials does not affect the other two; incident
  blast radius is limited to the affected role.
- The PR merge-protection ruleset can require approval from the Reviewer Bot's
  identity specifically, preventing the Author App from self-approving.

### Harder

- Three apps means three sets of credentials to rotate, three GitHub App
  configurations to maintain, and three sets of secret keys in CI.
- The `AUTHOR_APP_PRIVATE_KEY`, `REVIEWER_BOT_PRIVATE_KEY`, and
  `MERGE_BOT_PRIVATE_KEY` secrets must all be present for the full bot-PR flow
  to work; a missing secret silently breaks only that role's actions.
- New contributors learning the bot-PR flow must understand which actor owns which
  label and which action — see `.agents/skills/pr-lifecycle/SKILL.md` for the label
  ownership table.

### Now constrained

- **The Author Agent must never apply `merge-when-ready`** — only the Reviewer Bot
  owns that label. Applying it from an Author Agent token would bypass the separation
  of duties this decision establishes.
- **Review approvals must come from the Reviewer Bot identity.** A branch protection
  rule requiring the Reviewer Bot's review prevents human or Author-Agent self-approval
  from satisfying the merge gate.
- **`review-bot-override` and similar escape hatches are maintainer-only.** The
  labels that bypass the bot-PR flow require the maintainer's GitHub identity, not any
  of the three bot identities.
