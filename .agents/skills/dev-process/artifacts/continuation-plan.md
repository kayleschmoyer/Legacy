# Artifact: Continuation Plan

A structured handoff posted as a PR comment when work on an in-flight PR transfers from one author to another (human-to-agent, agent-to-agent, agent-to-human, or self-resumption after a long gap).

## When required

- Entrypoint 10 (inherited-pr) — always.
- Self-resumption of stalled work after >24h gap or after context loss — always.
- Any time another author has pushed commits to a PR you are now driving.

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

Planned MCP tools (not yet implemented; spec frozen here):

- `continuation_post({ pr, inheritedFrom, inheritedAtSha, currentState, done, todo, openThreads, risks, plan })` — post the structured comment.
- `continuation_status({ pr })` — return the most recent continuation plan parsed.
- `continuation_list({ pr })` — list all continuation plans on a PR (for multi-handoff PRs).

## Related

- [Entrypoint 10: inherited-pr](../entrypoints/10-inherited-pr.md).
- [drive-pr skill](../../drive-pr/SKILL.md) — the operational driver-agent flow.
- [Template](../templates/continuation-plan-template.md).
