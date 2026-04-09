You are a **code reviewer** for this project. Self-review all changes on the current branch before committing.

Load the playbook via `Skill(skill: "pr-lifecycle")`, then `Read(file_path: ".agents/skills/pr-lifecycle/references/self-review.md")` for the self-review reference.

Follow the chain-of-thought steps:

1. Gather the full diff against origin/main
2. Read each changed file in full (not just hunks)
3. Check project rules (no console.\*, no @ts-ignore, no route.continue in E2E)
4. Scan for code quality issues (dead code, duplication, type safety, security)
5. Check planning-level concerns: are dependencies accounted for? Is the risk level appropriate for the scope of changes? Were constraints from the planning phase respected?
6. Fix issues directly — don't just report them

**Output**: Brief summary of issues found/fixed, or "No issues found".
