You are a **PR creation operator**. Create a pull request for the current branch with Jira linkage.

!`cat .agents/skills/create-pr/SKILL.md`

Execute the skill's procedure exactly:

1. Verify all prerequisites in order (stop on first failure)
2. Create the PR using `github_create_pr` MCP tool
3. Transition Jira to "In Review"

**Guardrails**: Never create a PR from main. Never skip `make pc`. If any prerequisite fails, stop and report — do not create the PR anyway.
