---
name: cloud-teleport
description: 'Session teleport protocol for cloud-to-local handoff. When a cloud agent hits a capability boundary (AWS operations, real DB migrations, Terraform, infrastructure), it commits progress, writes a structured handoff artifact, and alerts the user to continue locally. Load when a cloud agent detects it cannot complete a task due to environment limitations.'
---

# Skill: Cloud Session Teleport

## Overview

Cloud agents (Claude Code on the web, Copilot Coding Agent) operate in sandboxed environments without AWS credentials, production database access, or infrastructure tooling. When a cloud agent reaches a task that **requires** these capabilities, it should not fail silently or skip the step — it should **teleport** the session by committing all progress and producing a structured handoff artifact that a local session can pick up seamlessly.

## When to Use

A cloud agent should trigger the teleport protocol when it encounters any of these **cloud-blocked operations**:

| Category                          | Blocked Operations                                                                  | Why                                   |
| --------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------- |
| **Database (production/staging)** | Migrations against real AWS RDS, schema changes that need live validation           | No AWS credentials in cloud           |
| **Infrastructure**                | `terraform plan/apply`, AWS resource management, Lambda deployment                  | No AWS SSO, no Terraform state access |
| **Secrets**                       | Rotating or provisioning real secrets in AWS Secrets Manager                        | No AWS credentials                    |
| **AWS Services**                  | CloudWatch log queries against live environments, S3 operations, SQS/SNS management | No AWS access                         |
| **Local tooling**                 | Worktree junction management (`twig`), Windows-specific operations                  | Linux sandbox, no twig                |
| **Integration testing**           | Tests requiring real backend services, live API endpoints                           | Sandboxed network                     |

**Do NOT teleport for:**

- Local Docker PostgreSQL operations (migrations against dev seed — these work in cloud)
- Code changes, linting, type checking, building, unit tests
- PR creation, Jira transitions, CI log queries
- Any operation that works with the cloud MCP servers

## Protocol

### Step 1: Detect the boundary

When a cloud agent determines the next required step is cloud-blocked, it should **stop before attempting the blocked operation**. Do not try and fail — detect proactively.

Common detection points in the workflow:

- `make pc` passes but the ticket requires a real DB migration (not just local Docker)
- The ticket description mentions Terraform changes, infrastructure, or AWS resources
- The task requires deploying a Lambda or updating CloudFormation/SAM templates
- Secrets need to be provisioned or rotated in AWS Secrets Manager

### Step 2: Commit all progress

Before writing the handoff, ensure all work is committed and pushed:

```
# Stage and commit all changes
git add -A
git commit -m "wip(teleport): progress before cloud-to-local handoff"
git push -u origin <branch-name>
```

If `make pc` has already passed, use a proper commit message instead of `wip`:

```
git commit -m "feat(scope): description — awaiting local teleport for <blocked-step>"
```

### Step 3: Write the handoff artifact

Create `.claude/teleport-handoff.md` in the repo root with this structure:

> **SECURITY: Never include raw secret values in the handoff artifact.** This file is committed to the repo and pushed to GitHub. Never include database passwords, API keys, tokens, AWS access keys, full connection strings, tunnel credentials, or any other sensitive values. **Reference secrets by name only** — use the secret's AWS Secrets Manager ARN, SSM parameter key, env var name, or `.env` key instead of the value itself. See the [secrets-handling skill](../secrets-handling/SKILL.md) for the full rules. If the local agent needs a secret value to complete the work, it should fetch it from the canonical source (AWS Secrets Manager, `.env`, etc.) — not from the handoff file.

```markdown
# Cloud-to-Local Teleport Handoff

## Session Info

- **Branch**: `<branch-name>`
- **Ticket**: `LS-####`
- **Cloud agent session**: <timestamp or session ID if available>
- **Date**: YYYY-MM-DD

> **No secrets in this file** — reference secret names/ARNs/SSM keys only, never raw values.

## Completed Steps

<!-- Check off what's done -->

- [x] Jira ticket transitioned to In Progress
- [x] Code implementation complete
- [x] Unit tests written and passing
- [x] `make pc` passes (lint, typecheck, test, build)
- [ ] Real DB migration applied
- [ ] PR created

## Blocked Step

<!-- What specifically can't be done in the cloud -->

**Operation**: <e.g., "Apply Drizzle migration to staging RDS">
**Reason**: No AWS credentials available in cloud environment
**Category**: Database / Infrastructure / Secrets / AWS Services

## Remaining Steps

<!-- Ordered list of what the local session needs to do -->

1. <specific step, e.g., "Run `make db-migrate` against real database">
2. <next step>
3. Create PR and transition Jira to In Review

## Context for Local Agent

<!-- Any important context the local agent needs -->

- <e.g., "Migration file is at lib/db-client/migrations/0042_add_user_preferences.sql">
- <e.g., "The new column `preferences` is nullable so no data backfill needed">
- <e.g., "Depends on LS-1234 being merged first for the base schema">

## Files Changed

<!-- Key files the local agent should review -->

- `path/to/file1.ts` — <brief description>
- `path/to/file2.ts` — <brief description>
```

Commit and push the handoff artifact:

```
git add .claude/teleport-handoff.md
git commit -m "chore(teleport): add cloud-to-local handoff artifact"
git push
```

### Step 4: Alert the user

Output a clear, actionable message:

```
## Teleport Required: Cloud → Local

I've completed everything I can in the cloud environment. The next step
requires **[blocked operation category]** which isn't available here.

**Branch**: `<branch-name>`
**Blocked on**: <one-line description>

To continue locally:
1. `git fetch origin <branch-name>`
2. `git checkout <branch-name>` (or create a worktree)
3. Review `.claude/teleport-handoff.md` for full context
4. Continue with: <specific next command>

All code changes are committed and `make pc` passes.
```

## Local Pickup Protocol

When a local session picks up a teleported branch:

### Step 1: Fetch and review

```bash
git fetch origin <branch-name>
# Either checkout or create a worktree
make worktree TICKET=#### DESC=description
# Or if continuing on existing branch:
git checkout <branch-name>
```

### Step 2: Read the handoff

Read `.claude/teleport-handoff.md` to understand:

- What's already done (don't redo work)
- What's blocked and why
- What remains in order
- Key files and context

### Step 3: Execute remaining steps

Follow the "Remaining Steps" section. Common patterns:

**DB migration teleport:**

```bash
make db-migrate          # Apply migrations to real database
make pc                  # Re-validate after migration
```

**Infrastructure teleport:**

```bash
terraform -chdir=terraform/main plan    # Review infra changes
terraform -chdir=terraform/main apply   # Apply after review
```

**Deployment teleport:**

```bash
make deploy-<lambda>     # Deploy the Lambda
```

### Step 4: Clean up the handoff

After completing the remaining steps, remove the handoff artifact:

```bash
git rm .claude/teleport-handoff.md
git commit -m "chore(teleport): remove handoff artifact — local steps complete"
```

Then continue with the normal workflow (PR creation, Jira transition, etc.).

## Integration with work-ticket Skill

When the `work-ticket` skill is running in cloud mode and hits a teleport boundary:

1. The ticket stays in **In Progress** (do not transition to In Review)
2. All completed code is committed and pushed
3. The handoff artifact is written
4. The agent alerts the user and **stops work on that ticket**
5. If working in parent/batch mode, the agent can continue to the next child ticket that doesn't require local operations

## Edge Cases

**Ticket requires local work from the start**: If the agent detects during Step 1 (ticket inspection) that the entire ticket is cloud-blocked (e.g., pure infrastructure ticket), teleport immediately with an empty "Completed Steps" section. Don't waste time on partial work that can't be validated.

**Multiple blocked steps**: List all blocked steps in the handoff, not just the first one. The local session should see the full picture.

**Partial `make pc`**: If code changes are complete but `make pc` can't fully pass due to missing real DB state, note this explicitly. The local agent needs to know whether to re-run `make pc` from scratch.

**PR already created**: If the PR was created before hitting the boundary (e.g., during a review-fix cycle), include the PR number in the handoff and note that the local session should push to the existing branch.
