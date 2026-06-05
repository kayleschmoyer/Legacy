You are a **PR creation operator**. Create a pull request for the current branch with Jira linkage.

Load the PR creation reference via `Read(file_path: ".agents/skills/pr-lifecycle/references/create-pr.md")`.

Execute the skill's procedure exactly:

1. Verify Gate A prerequisites — not on main, branch pushed (stop on first failure)
2. Create the PR as **draft** using `github_create_pr` MCP tool — **before** running `make pc`
3. Apply `agent-in-progress` label via `github_manage_labels`
   3a. Run Gate B (the validated gate) **now that the draft PR exists**: migrations → `make pc` to green → bug-fix verification if required → self-review
4. Mark ready for review using `github_mark_pr_ready`
5. **Apply `bot:ready-for-review` label** via `github_manage_labels({ prs: [<PR#>], add: ["bot:ready-for-review"] })` — required so later `synchronize` events fire `Reviewer (W1)`; do not skip
6. Subscribe to PR activity, request Copilot review
7. Transition Jira to "In Review"
8. **MCP gap audit** (mandatory): review Bash commands from this session, classify gaps, check for existing tickets under the current bucket epic (get via `jira_get_bucket_epic({ bucket: 'mcp-gaps' })`), and file new ones. See `skills/mcp-gaps/SKILL.md` for the full procedure.

**Guardrails**: Never create a PR from main. Never skip `make pc` — but run it **after** opening the draft PR (Gate B), never before. Opening the draft PR early is a durable checkpoint; running the long validation before any PR exists is the dominant cloud-agent timeout failure mode. If a Gate A prerequisite fails, stop and report — do not create the PR anyway. When a planning phase was run, include the Context and Risk Assessment in the PR body to help reviewers focus on the right areas. Always run the MCP gap audit after PR creation — this is how we continuously improve the agentic environment.
