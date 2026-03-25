---
name: work-ticket
description: 'Autonomously implement a Jira ticket end-to-end. For leaf tickets (task/story with no children): blocker check, worktree, code, validate, PR, Jira transition. For parent tickets (epic/story with children): iterate through child tickets, working each one to completion. Updates ticket and parent statuses automatically. Runs MCP gap audit before finishing. Load when the user gives a ticket key and expects autonomous completion.'
---

# Skill: Work Ticket

## Overview

Autonomously work a Jira ticket from To Do to In Review (or Done). Handles two modes:

1. **Leaf ticket** (task/story/bug with no children) — implement it solo using the standard worktree workflow
2. **Parent ticket** (epic/story with children) — iterate through child tickets, implementing each one

## When to Use

- User provides a Jira ticket key and expects autonomous implementation
- User says "work on LS-####" or "implement LS-####"
- Processing a backlog of tickets under an epic

## Steps

### Step 1: Inspect the ticket

```
jira_view(key: "LS-####")
```

Determine the ticket type and whether it has children:

```
jira_list_children(key: "LS-####")
```

| Condition                                           | Mode                                           |
| --------------------------------------------------- | ---------------------------------------------- |
| No children (or `jira_list_children` returns empty) | **Leaf mode** — implement this ticket directly |
| Has children                                        | **Parent mode** — work the children            |

### Step 2: Route to the correct mode

#### Leaf Mode (no children)

Follow the full [worktree-workflow skill](../worktree-workflow/SKILL.md):

1. **Blocker check**: `jira_check_blockers(key: "LS-####")` — STOP if blockers are not In Review/Done
2. **Jira "In Progress"**: `jira_transition(key: "LS-####", status: "In Progress")`
3. **Worktree**: `make worktree TICKET=#### DESC=description` (use `PARENT=` if blocker is In Review)
4. **Setup**: `make wt-setup WT=$wt`
5. **Implement**: read the ticket description, investigate the codebase, write code + tests
   - **Bug tickets**: follow the [bug verification workflow](../debugging/SKILL.md#verification-by-bug-type) — reproduce the bug **before** writing any fix, then verify the fix resolves the reported behavior **after**. Include before/after evidence in the PR body under a `## Verification` section (appended after the standard template). `make pc` passing is necessary but not sufficient for bugs. The `## Verification` section is not part of the standard PR template -- add it manually for bug-fix PRs.
6. **Self-review**: run the [self-review phase](../pr-lifecycle/references/self-review.md) to catch rule violations
7. **Validate**: migrations (`db:status` + `db:up`), then `make pc`
8. **Ship**: commit, push, [create PR](../pr-lifecycle/references/create-pr.md), transition Jira to "In Review"

> After shipping, if this ticket is a child of a parent being processed in Parent Mode, return to the parent loop.

#### Parent Mode (has children)

1. **Transition parent to In Progress** (if not already):

   ```
   jira_transition(key: "LS-####", status: "In Progress")
   ```

2. **List actionable children** — get To Do and In Progress children:

   ```
   jira_list_children(key: "LS-####")
   ```

3. **Select a batch and build dependency tiers** — organize children by their dependency relationships:

   a. Check blockers for each child: `jira_check_blockers(key: "LS-####")`
   b. Group children into **dependency tiers**:
   - **Tier 0**: children with no blockers (or all blockers Done) — can start immediately
   - **Tier 1**: children blocked by Tier 0 tickets — start after Tier 0 completes
   - **Tier N**: children blocked by Tier N-1 tickets — start after Tier N-1 completes
   - Children with blockers outside the epic that are not In Review/Done → **skip** (report as blocked)
     c. Cap at **5 tickets per session** across all tiers — inform the user how many remain after the batch

4. **Claim work just-in-time** — transition children to "In Progress" per tier in sub-batches (up to 3 tickets), immediately before starting work on each sub-batch:

   ```
   for each tier in dependency_tiers:
     sub_batches = chunk(tier.children, size=3)
     for each sub_batch in sub_batches:
       for each child in sub_batch:
         jira_transition(key: child.key, status: "In Progress")
       # Now spawn agents for this sub_batch
   ```

   This prevents other agents from picking up the same tickets when scanning for work, while limiting the number of tickets marked "In Progress" if the workflow is interrupted. Tickets not yet in an active sub-batch remain "To Do" and are available for other agents.

   **Recovery on abort**: if this parent workflow aborts or crashes and some children are left "In Progress" without a corresponding worktree/branch/PR, transition those children back to "To Do" before re-running the parent workflow.

5. **Process each tier**, parallelizing independent tickets within a tier:

   A tier is considered **complete** when every ticket in it has a PR opened and marked ready for review (i.e., the branch is pushed and the PR exists — merging is not required). This is the signal that unblocks the next tier.

   **Within a tier** — spawn concurrent agents (up to 3 at a time) for independent children:
   - Use the `Agent` tool to spawn one agent per child ticket, each running Leaf Mode
   - Each agent gets its own worktree + branch + PR (one ticket = one PR)
   - Cap concurrent agents at **3** to avoid disk I/O and API rate limit saturation
   - If a tier has more than 3 tickets, process in sub-batches of 3

   **Between tiers** — process sequentially:
   - Wait for all agents in Tier N to complete (all PRs opened) before starting Tier N+1
   - Tier N+1 tickets use `PARENT=LS-####/branch-name` to branch from their blocker's branch
   - **Multiple blockers**: if a ticket has multiple in-epic blockers, use the **most recently pushed** blocker branch as `PARENT` — the other blockers must also have PRs open (tier complete) before this ticket starts

   **Agent prompt template** for each spawned agent:

   ```
   Work Jira ticket LS-#### to completion using the /work-ticket skill (Leaf Mode).
   Worktree path: <assigned worktree path>
   The ticket is already "In Progress" — skip the Jira transition to In Progress.
   After PR creation, transition the ticket to "In Review".
   Run make pc before pushing. Do NOT skip validation.
   If you fail and no meaningful code was written, transition the ticket back to "To Do".
   ```

   **Fallback to sequential** — process tickets one at a time if:
   - All children in the tier depend on each other (no parallelism possible)
   - The agent platform does not support concurrent sub-agents
   - Resource constraints prevent parallel worktree creation

   After each agent completes (or each sequential child ships):
   - Verify the PR was created successfully
   - Clean up the worktree: `twig worktree clean`
   - If an agent failed, **revert the ticket status** to reflect its actual state:

     | Outcome                              | Correct status                                            |
     | ------------------------------------ | --------------------------------------------------------- |
     | PR created and pushed                | **In Review** (agent should have transitioned already)    |
     | Code written but validation failed   | Keep **In Progress** — work exists but is incomplete      |
     | No meaningful work done (early fail) | Revert to **To Do** — release the ticket for other agents |

   - Log the failure reason and continue with remaining tickets

6. **Update parent status** after processing children:

   | Children state                                          | Parent status                                        |
   | ------------------------------------------------------- | ---------------------------------------------------- |
   | All children Done                                       | Transition parent to **Done**                        |
   | All children In Review or Done (none To Do/In Progress) | Transition parent to **In Review**                   |
   | Some children still To Do                               | Keep parent **In Progress** — report remaining count |

### Step 3: MCP gap audit

After all tickets are shipped, run the [mcp-gap-audit skill](../mcp-gap-audit/SKILL.md) Phase 1 (Audit):

1. Review all Bash commands from this session
2. Classify gaps: `missing-tool`, `missing-feature`, or `missing-awareness`
3. Check for existing tickets under LS-1455
4. Create tickets for new gaps
5. Audit MCP tool result overflows

This is **mandatory** — it ensures we continuously improve the agentic environment.

### Step 4: Report results

After completing the batch (or the single ticket), summarize:

- Tickets worked: list keys + PR links
- Tickets skipped: list keys + reason (blocked, too many, etc.)
- Parent status: current state and remaining children count (if applicable)
- MCP gap audit: gaps found, tickets created

## Status Transition Rules

These rules apply to both leaf and parent tickets:

| Transition               | When                                                               |
| ------------------------ | ------------------------------------------------------------------ |
| To Do -> In Progress     | Work begins (after blocker check passes)                           |
| In Progress -> In Review | PR is created and pushed                                           |
| In Review -> Done        | PR is merged (not handled by this skill — happens via CI/reviewer) |

**Parent status mirrors children:**

- Parent moves to In Progress when first child starts
- Parent moves to In Review only when ALL children are at least In Review
- Parent moves to Done only when ALL children are Done
- Never transition a parent ahead of its children

## Gotchas

- **Always check blockers before starting** — working a ticket whose blocker is still in progress wastes effort
- **One worktree per child** — never combine multiple child tickets into one branch/PR
- **Don't skip `make pc`** — even when processing multiple children, validate each one
- **Epic-level artifacts** — if the parent needs its own code changes (shared config, design docs), create a separate worktree for the parent ticket itself (see worktree-workflow skill)
- **Stacked dependencies** — if child B depends on child A, create child B's worktree with `PARENT=LS-A/branch-name` so it branches from A's branch
- **Clean up worktrees** — after each child PR is created (or agent completes), clean the worktree (`twig worktree clean`)
- **Session cap** — 5 tickets per session prevents context degradation; inform the user of remaining tickets so they can invoke again
- **Parallel agent cap** — max 3 concurrent agents per tier to avoid disk I/O saturation and API rate limits. If an agent fails, do not retry in the same session — log the failure and continue
- **Tier ordering is mandatory** — never start a Tier N+1 ticket before all Tier N tickets complete. Stacked branches require the parent branch to exist first
- **Bug fixes require proof** — for Bug-type tickets, code changes alone are not sufficient. You must reproduce the broken behavior before fixing, and verify the fix resolves it after. See the [verification-by-bug-type table](../debugging/SKILL.md#verification-by-bug-type) for the specific method per bug category (UI screenshots, failing tests, integration tests, or query results)
