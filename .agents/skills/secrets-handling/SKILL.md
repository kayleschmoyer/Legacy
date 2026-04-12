---
name: secrets-handling
description: 'How agents should handle secrets without exposing values in conversation history. Load when writing, reading, or populating secret values (API keys, tokens, private keys, secrets.auto.tfvars). Covers safe write patterns, file-to-file copy, and what NOT to do.'
---

# Skill: Secrets Handling

## The Core Rule

**Never embed raw secret values in tool calls.** Every tool call — `Edit`, `Write`, `Bash`, `github_secret_set` — is recorded in the session transcript and visible to anyone with access to the session. Secret values in tool call arguments are permanently exposed.

This means:

- **DO NOT**: `Edit(file: "secrets.auto.tfvars", new_string: 'my_api_key = "sk-abc123..."')`
- **DO NOT**: `Bash(command: 'echo "sk-abc123..." >> secrets.auto.tfvars')`
- **DO NOT**: Ask the user to paste a secret value into chat (it ends up in conversation history)
- **SAFE**: Reading from a file the user placed on disk and copying it to the target
- **SAFE**: Asking the user to write the value to a file path, then referencing that path

---

## Safe Write Patterns

### Pattern 1: User provides a file path, agent copies it

Ask the user to save the secret to a temp file themselves:

```
"Please save the private key to ~/Downloads/app.pem (or any path you prefer), then let me know and I'll copy it."
```

Then copy it without reading the value:

```bash
# Copy file directly — value never appears in the command
# (PEM files must use HCL heredoc syntax in .tfvars — not a bare cat append)
```

Or for base64-encoded keys (the correct format for `github_app_key_base64`):

```bash
# Base64-encode and append without surfacing the value
python -c "
import base64, sys
with open('<your-path>/app.pem', 'rb') as f:
    print('github_app_key_base64 = \"' + base64.b64encode(f.read()).decode() + '\"')
" >> terraform/secrets.auto.tfvars
```

If you need to write a raw multi-line PEM to a `.tfvars` file, use HCL heredoc syntax — a bare `cat >>` produces invalid HCL:

```hcl
github_app_key_pem = <<-EOT
  -----BEGIN RSA PRIVATE KEY-----
  ...
  -----END RSA PRIVATE KEY-----
EOT
```

Use the `Write` tool (not a shell `cat >>`) to produce this safely, and never inline the key content in the tool call — write a placeholder and ask the user to fill it in.

### Pattern 2: Use `github_secret_set` MCP tool with `valueFile`

The `github_secret_set` tool (MCP: `mcp__legacy-sports-github__github_secret_set`) has both a `value` string parameter and a `valueFile` parameter. **Always prefer `valueFile`** — pass the path to a file containing the secret instead of embedding the value directly:

```
# Safe: secret value stays on disk, never in the tool call
github_secret_set(name: "MY_SECRET", valueFile: "<your-path>/secret.txt")
```

**Do not use `value` directly** — it embeds the secret in the tool call transcript. If the user provides the secret in chat (they shouldn't), decline and ask them to save it to a file first:

```
"For security, please save the secret to a local file and give me the path — I'll use
 the valueFile parameter to set it without the value appearing in our session history.
 Alternatively, set it directly via the GitHub UI at Settings → Secrets and Variables → Actions."
```

### Pattern 3: `secrets.auto.tfvars` population

When populating `secrets.auto.tfvars`, never write actual values through Edit/Write tools. Instead:

1. Show the user the expected format with placeholder:
   ```hcl
   github_app_key_base64 = "<base64-encoded PEM>"
   github_app_webhook_secret = "<random 32-char hex>"
   ```
2. Ask the user to populate the values themselves, or provide a file path to read from.
3. If the user provides a source file, use `cat`/`python` to copy without surfacing the value (Pattern 1).

---

## What to Do When a User Pastes a Secret in Chat

If the user pastes a secret value directly into the conversation:

1. **Do not echo it back** in any tool call argument.
2. **Do not place it into any `Bash`, `Edit`, `Write`, or MCP tool call** (including via heredocs or shell variables). Instead, ask the user to save the value to a local file themselves and provide the file path, or ask them to edit the target file manually. If the destination is a GitHub Actions secret, use `github_secret_set(name: "...", valueFile: "<path>")` once they provide a file path.
3. Inform the user: "Note: this value is now in our session history. Please do not resend it. For future secrets, save them to a local file and give me the path — I can copy from the file without re-exposing the value in tool arguments."
4. If the user provides a file path afterward, use the safe file-copy pattern described above.

---

## secrets.auto.tfvars Reference

This file is in `terraform/secrets.auto.tfvars` and is gitignored. It holds Terraform `sensitive` variable values for local development. The expected variables and their formats are documented in `terraform/secrets.auto.tfvars.example`.

Never commit `secrets.auto.tfvars` (it's in `.gitignore`). Never display its contents unless the user explicitly asks and the values are not sensitive.

---

## Related Skills

- [add-secret-or-env-var](../add-secret-or-env-var/SKILL.md) — Full checklist for adding a new secret to the infrastructure (Terraform, AWS Secrets Manager, GitHub Actions, Lambda)
