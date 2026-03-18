# Pitfalls, Escalation, and Decision Checklist

## Decision Checklist

Before resolving any conflict, the agent should answer each of these. If any answer is "I don't know," investigate further (read git log, check the merge base, or ask the developer).

| #   | Question                                                       | If Yes                                         | If No                        |
| --- | -------------------------------------------------------------- | ---------------------------------------------- | ---------------------------- |
| 1   | Is this a generated file?                                      | Regenerate — never manually merge              | Continue to #2               |
| 2   | Is this a lock file or schema dump?                            | Regenerate                                     | Continue to #3               |
| 3   | Can I identify the intent of BOTH sides?                       | Proceed to resolve                             | Read git log / ask developer |
| 4   | Are the changes independent (different concerns)?              | Keep both                                      | Continue to #5               |
| 5   | Did main rename/refactor/restructure?                          | Use main's structure, reapply feature's intent | Continue to #6               |
| 6   | Did main delete code the feature branch modified?              | Usually accept deletion, verify intent         | Continue to #7               |
| 7   | Did both sides change the same logic differently?              | Synthesize — combine both intents              | Continue to #8               |
| 8   | Is the conflict just in added elements (imports, array items)? | Keep both additions, deduplicate               | Ask developer — unusual case |

## Common Pitfalls

### Pitfall 1: "I'll just take theirs and fix it later"

There is no "later." The rebase continues, the branch gets pushed, the regression ships. Resolve correctly **now**.

### Pitfall 2: Forgetting to Update All References After a Rename

If main renamed `calculateScore` → `computePlayerScore`, don't just fix the conflict block — search the entire file for the old name and update every occurrence.

```powershell
Select-String -Path <file> -Pattern "calculateScore"
```

### Pitfall 3: Losing Feature Branch Changes in Multi-Conflict Files

A file may have 5 conflict blocks. The agent resolves 3 correctly but picks `--theirs` for the other 2 because they seem "complex." This drops feature work. Resolve **every** block thoughtfully.

### Pitfall 4: Not Checking if the Merge Base Reveals the Original Code

When both sides look very different, seeing the original (pre-both-changes) code clarifies what each side actually changed:

```powershell
git show $(git merge-base HEAD REBASE_HEAD):<file-path>
```

### Pitfall 5: Resolving Types but Not Updating Tests

If the source resolution changed behavior, the corresponding test file probably also needs updating. Check for conflicted test files and resolve them to match your source resolution.

## When to Ask the Developer

**Do NOT guess when you're uncertain. Ask.** Some conflicts genuinely require human judgment, and a wrong guess creates a silent regression that's harder to find than the conflict itself. If you've followed the Resolution Framework above and still aren't confident, **stop and ask the developer for help**.

### Escalate when:

- Main deleted a feature and the branch extended it — was the deletion intentional?
- Both sides changed business logic (pricing, scoring rules, draft logic) in contradictory ways
- The conflict involves security-sensitive code (auth, permissions, input validation)
- You cannot determine the intent of one side even after reading git log and the merge base
- The resolution would require changes to files that aren't part of the conflict
- You've resolved the conflict but typecheck/lint still fails and you can't figure out why
- The conflict spans complex logic (state machines, multi-step workflows) where getting it wrong could cause data corruption

### How to ask:

When you need help, provide the developer with a **structured summary** so they can make a fast decision:

1. **The file and conflict location** — include the file path and the full conflict block (both sides)
2. **What each side changed** — one sentence per side explaining the intent
3. **What you've tried** — mention that you checked the merge base, git log, etc.
4. **Your best guess** — propose a resolution and explain why you're not confident
5. **What you need from them** — a specific question ("Should the deletion win, or should I keep the feature branch's extension?")

Example:

> I'm resolving a conflict in `lambdas/db/src/services/draft-service.ts` (lines 45–62).
>
> - **Main** removed the `validateDraftOrder` call — looks like it was replaced by `draftValidationService.validate()` in a refactor.
> - **Our branch** added a new `skipValidation` parameter to `validateDraftOrder`.
>
> I think the correct resolution is to add the `skipValidation` parameter to the new `draftValidationService.validate()` call instead, but I'm not sure that service supports that parameter. Can you confirm?

### What NOT to do when stuck:

- ❌ Pick `--ours` or `--theirs` and move on — this is the exact anti-pattern this skill exists to prevent
- ❌ Make your best guess without telling the developer you were uncertain — if it's wrong, nobody will know until something breaks
- ❌ Abort the entire rebase — ask about the specific conflict first; the rest may be fine
