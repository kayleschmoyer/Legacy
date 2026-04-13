# Cloud GitHub Authentication

> **When to apply:** Setting up a cloud agent environment, debugging PR creation failures, or troubleshooting GitHub API 401 errors.

## How the MCP server authenticates

The `legacy-sports-github` MCP server (`tools/mcp/github-server/src/auth.ts`) resolves a GitHub token using a 5-tier fallback chain:

1. **`GH_TOKEN` or `GITHUB_TOKEN` env var** — checked first, validated with `GET /user`
2. **Cached token file** — `~/.config/legacy-sports-github/token.json`
3. **`.netrc` file** — password for `machine github.com`
4. **`gh auth token` CLI** — 5-second timeout, silent fallback if `gh` is missing
5. **OAuth device flow** — interactive, prompts user via stderr to visit `github.com/login/device`

On 401 during an API call, the server invalidates caches and retries from step 1.

The server does **not** require the `gh` CLI — it calls the GitHub REST/GraphQL API directly with a Bearer token.

## Platform-specific setup

### Local development (Windows)

No setup needed. The fallback chain will:

- Use `gh auth token` if you've previously run `gh auth login`
- Otherwise, trigger the device flow (one-time interactive prompt)
- Cache the token for future sessions

### Claude Code on the web (recommended: GitHub App)

The easiest setup uses the **Agent Author GitHub App** to auto-generate tokens:

1. Go to claude.ai/code -> Settings -> Environment
2. Add environment variable: `AGENT_AUTHOR_APP_PRIVATE_KEY=<paste PEM contents>`
   - Replace literal newlines with `\n` if the UI requires single-line values
3. Paste `.claude/cloud-setup.sh` into the Setup script field

The setup script calls `scripts/generate-github-app-token.mjs` to generate a 1-hour scoped token and exports it as `GH_TOKEN`. Both the MCP server and `gh` CLI pick it up automatically.

**Alternative**: set `GH_TOKEN` directly with a fine-grained PAT (see Option 1 below).

**If no token is set**, the MCP server will attempt the OAuth device flow on first API call. This works in interactive sessions — watch stderr for the device code prompt.

### Copilot Coding Agent

Automatic — `GITHUB_TOKEN` is provided by GitHub and authenticated in `copilot-setup-steps.yml`.

## Token options

### Option 1: Fine-grained PAT (recommended for solo use)

1. Go to GitHub -> Settings -> Developer settings -> Fine-grained personal access tokens
2. Create a token with:
   - **Repository access**: Select your repository
   - **Permissions**: Contents (read/write), Pull requests (read/write), Metadata (read)
3. Set expiration (max 1 year — set a calendar reminder to rotate)
4. Store as `GH_TOKEN` in cloud environment settings

### Option 2: GitHub App installation token (recommended for teams/automation)

More secure than PATs — tokens are short-lived (1 hour) and scoped to the app's installation.

The repo uses two GitHub Apps for separation of duties:

| App                | ID        | Purpose                             | Secret                         |
| ------------------ | --------- | ----------------------------------- | ------------------------------ |
| **Agent Author**   | `3158619` | Push code, create PRs               | `AGENT_AUTHOR_APP_PRIVATE_KEY` |
| **Agent Reviewer** | `3142924` | Approve PRs, set `bot-review` check | `BOT_APP_PRIVATE_KEY`          |

> **Full permissions:** See the Separation of Duties table in `.agents/skills/workflow-overview/SKILL.md`.

**For Copilot Coding Agent**, this is already automated — `copilot-setup-steps.yml` generates a 1-hour token from the Agent Author app via `actions/create-github-app-token@v2` and exports it as `GH_TOKEN`.

**For Claude Code on the web**, this is automated via `.claude/cloud-setup.sh` — set `AGENT_AUTHOR_APP_PRIVATE_KEY` in cloud environment settings and the setup script generates a token automatically (see [Claude Code on the web](#claude-code-on-the-web-recommended-github-app) above).

The token expires after 1 hour — for longer sessions, the MCP server's device flow (Option 3) is more practical.

### Option 3: OAuth device flow (zero-config)

No token needed. On first MCP API call, the server prints:

```
To authenticate with GitHub, visit https://github.com/login/device and enter code: XXXX-XXXX
```

The token is cached to `~/.config/legacy-sports-github/token.json` and reused until it expires or is invalidated.

**Limitation**: Only works in interactive sessions where you can see stderr output.

## Troubleshooting

### "401 Unauthorized" on PR creation

1. Check if the token is set: look for `GH_TOKEN` in environment settings
2. Verify the token hasn't expired: `curl -sf -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $GH_TOKEN" https://api.github.com/user` (prints only the HTTP status code, not the token)
3. Verify the token has required permissions (see Token options above)
4. If using a cached token, delete `~/.config/legacy-sports-github/token.json` to force re-auth

### "Rate limited" errors

The server detects rate limits via `x-ratelimit-remaining: 0` headers. Wait for the reset time shown in the error message, or use a different token.

### MCP server fails to start

The server performs a non-blocking auth preflight on startup. If auth fails, it logs a warning but still starts — auth will retry on the first actual API call. Check MCP server logs for:

```
Auth preflight failed (will retry on first API call): ...
```

### Token variable confusion

- `.mcp.json` and `.vscode/mcp.json` forward **`GH_TOKEN`** from the host
- `.github/copilot/mcp.json` forwards **`GITHUB_TOKEN`** (auto-provided by GitHub)
- The MCP server checks **both** `GH_TOKEN` and `GITHUB_TOKEN` at runtime (in that order)
- When setting env vars manually, use `GH_TOKEN` to match the `gh` CLI convention
