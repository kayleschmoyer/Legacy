# VS Code Configuration

Workspace-level editor settings for the Legacy Sports monorepo. See `.vscode/settings.json` for the full configuration.

## Agent File Edit Behavior

`chat.editing.autoAcceptDelay` is set to `0` so agent sessions (Copilot, Claude Code) apply file edits immediately without a countdown prompt. If you prefer a review window, override this in your **user** settings (`Ctrl+Shift+P` → "Open User Settings (JSON)"):

```json
"chat.editing.autoAcceptDelay": 10000
```

## Twig

Use `twig` terminal commands for branch management. See the skills in `.agents/skills/` for detailed guidance:
- `branch-create` — creating feature branches
- `branch-tree` — viewing and managing dependent branch trees
- `create-pr` — creating pull requests
