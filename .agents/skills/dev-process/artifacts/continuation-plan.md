# Artifact: Continuation Plan

A structured handoff posted as a PR comment when work on an in-flight PR transfers from one author to another (human-to-agent, agent-to-agent, agent-to-human, or self-resumption after a long gap), **or** a same-author checkpoint posted before a long step so a reaped container can resume.

## When required

- Entrypoint 10 (inherited-pr) — always.
- Self-resumption of stalled work after >24h gap or after context loss — always.
- Any time another author has pushed commits to a PR you are now driving.
- **Before a long validation/build step (e.g. `make pc`) in an ephemeral or time-limited container** — any cloud agent, and native ephemeral worktree sessions at risk of ending mid-task. This is the **timeout-resilience checkpoint**: a same-author plan posted so that, if the container is reaped during validation, a fresh container resumes from the checkpoint instead of restarting from zero. See [workflow-overview Step 10b](../../workflow-overview/SKILL.md) and [cloud-agent-mode → Container timeout resilience](../../cloud-agent-mode/SKILL.md#container-timeout-resilience).

## Precondition: a PR must exist

`continuation_post` writes a **PR comment**, so the PR has to exist before you can checkpoint. For the timeout-resilience case this is exactly why the workflow opens the PR as a **draft first** — before the long `make pc` — so the checkpoint has a durable home that survives the container. Do not defer PR creation until after validation if the container can be reaped mid-validation.

## Timeout-resilience checkpoints (same-author)

For the timeout case the "previous" and "resuming" author are the same identity, and the plan captures _pre-validation_ state rather than an inherited diff:

- **Inherited from / Resumed by**: your own identity (note "self — timeout-resilience checkpoint").
- **What's left**: the remaining workflow steps — run migrations, `make pc`, self-review, mark ready, drive to merge — phrased concretely enough that a cold container can execute them.
- Re-post (`continuation_post`) after each significant step so the resume point stays current; a fresh container reads the latest via `continuation_status`.

## Path

A PR comment with the marker `<!-- continuation-plan -->` on the first line. The marker enables tooling to find the most recent plan reliably.

## Required structure

```markdown
<!-- continuation-plan -->

## Continuation Plan

**Inherited from**: @<previous author> at SHA <sha>
**Inherited at**: YYYY-MM-DD HH:MM UTC
**Resumed by**: @<new author>

### Current state

- **Branch**: <branch name>, <N> commits ahead of <base branch>, <"clean" | "dirty" | "rebase in progress">
- **CI**: <pass | fail (which checks)>
- **Reviews**: <N open threads, M resolved>
- **Tests local**: <pass | fail (which) | not run>

### What's done

- <Bullet of finished work>
- <…>

### What's left

- [ ] <Concrete remaining task>
- [ ] <…>

### Open review threads not yet addressed

- <Thread URL>: <one-line description and planned response>
- <…>

### Risks / notes for the next reviewer

- <Anything subtle the original author was navigating that I should preserve>
- <…>

### My plan

<2–4 sentence narrative of how I will finish this. Specific enough that a reviewer can pre-flag concerns.>
```

## Posting rule

The continuation plan is posted **before** any new commit by the new author. Reviewers and the previous author see the handoff intent before the diff changes.

## Preserving the original author's commits

- Do **not** force-push to rewrite previous author's commits without explicit consent.
- Add new commits on top.
- If a rebase is needed, attempt it without rewriting authorship; if not possible, ask the original author or note in the continuation plan.

## Anti-patterns

- ❌ Resuming silently — original author and reviewers learn from the diff that someone else now drives.
- ❌ Vague "what's left": "finish the feature". Enumerate.
- ❌ Force-pushing over inherited commits without consent.
- ❌ Skipping the local-reproduction step in **Tests local**. Always confirm you can build the inherited state before resuming.

## Tool surface

MCP tools implemented in `tools/mcp/dev-process-server/` (server: `legacy-sports-dev-process`).
Requires `GITHUB_TOKEN` for posting/fetching comments; returns formatted body for manual posting otherwise:

- ✅ `continuation_post({ pr, inheritedFrom, inheritedAtSha, currentState, done, todo, openThreads, risks, plan })` — post the structured comment.
- ✅ `continuation_status({ pr })` — return the most recent continuation plan parsed.
- `continuation_list({ pr })` — list all continuation plans on a PR (planned; use `continuation_status` and GitHub comment search for now).

## Related

- [Entrypoint 10: inherited-pr](../entrypoints/10-inherited-pr.md).
- [drive-pr skill](../../drive-pr/SKILL.md) — the operational driver-agent flow.
- [cloud-agent-mode → Container timeout resilience](../../cloud-agent-mode/SKILL.md#container-timeout-resilience) — the timeout-resilience checkpoint flow.
- [workflow-overview Step 10b](../../workflow-overview/SKILL.md) — draft-PR-first ordering in the canonical checklist.
- [Template](../templates/continuation-plan-template.md).
