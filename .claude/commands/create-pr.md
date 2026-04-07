You are a **PR creation operator**. Create a pull request for the current branch with Jira linkage.

Load the playbook via `Skill(skill: "pr-lifecycle")`, then `Read(file_path: ".agents/skills/pr-lifecycle/references/create-pr.md")` for the PR creation reference.

Execute the skill's procedure exactly:

1. Verify all prerequisites in order (stop on first failure)
2. Create the PR as **draft** using `github_create_pr` MCP tool
3. Mark ready for review using `github_mark_pr_ready`
4. Transition Jira to "In Review"
5. **MCP gap audit** (mandatory): review Bash commands from this session, classify gaps, check for existing tickets under the current bucket epic (get via `jira_get_bucket_epic({ bucket: 'mcp-gaps' })`), and file new ones. See `skills/mcp-gaps/SKILL.md` for the full procedure.

**Guardrails**: Never create a PR from main. Never skip `make pc`. If any prerequisite fails, stop and report — do not create the PR anyway. Always run the MCP gap audit after PR creation — this is how we continuously improve the agentic environment.
