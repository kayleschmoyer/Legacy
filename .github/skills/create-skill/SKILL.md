---
name: create-skill
description: 'Create a new agent skill in the correct agentskills.io format under .github/skills/; covers directory structure, frontmatter requirements, content guidelines, gitignore pitfalls, and updating the skills index.'
---

# Skill: Create a New Agent Skill

## Overview

Agent skills live at `.github/skills/<name>/SKILL.md` and follow the [agentskills.io](https://agentskills.io) open standard. Copilot reads the `description` frontmatter field to decide when to auto-load a skill — write it as if answering "when should this be loaded?"

## Directory Structure

```
.github/skills/
└── <skill-name>/
    └── SKILL.md
```

- One directory per skill, named in **lowercase-hyphen** (kebab-case)
- The directory name **must exactly match** the `name` frontmatter field
- `SKILL.md` is the only required file (additional resource files can be added alongside it)

## Required Frontmatter

Every `SKILL.md` must start with a YAML frontmatter block:

```markdown
---
name: <skill-name>
description: '<what this skill does and when to use it>'
---
```

### Rules

| Field         | Constraints                                                                |
| ------------- | -------------------------------------------------------------------------- |
| `name`        | Lowercase + hyphens only · Max 64 chars · Must match parent directory name |
| `description` | Max 1024 chars · Shown to Copilot to decide auto-load · Be specific        |

### Optional Frontmatter

```yaml
argument-hint: '<hint shown to user when invoking>' # e.g. "ticket number"
user-invokable: false # hide from slash-command list (default: true)
disable-model-invocation: true # prevent Copilot from auto-loading (manual only)
```

## Writing a Good Description

The `description` is the most important field — it determines whether Copilot auto-loads your skill. Make it specific about:

- **What** the skill does (capabilities)
- **When** to use it (triggers / use cases)

**Bad** (too vague):

```yaml
description: 'Helper for deployments'
```

**Good** (specific capabilities + triggers):

```yaml
description: 'Deploy AWS Lambda functions to the cloud environment; the required sequence is: unlock Terraform lock, apply infrastructure, then deploy Lambda code.'
```

## Skill Content Guidelines

After the frontmatter, write standard Markdown. Recommended sections:

```markdown
## Overview

Brief explanation of what this skill covers.

## When to Use

- Bullet list of triggers

## Prerequisites

- Any required setup or context

## Steps

Numbered or headed steps with commands and code blocks.

## Troubleshooting

Common failures and fixes.
```

Use fenced code blocks with language tags for all commands and config examples.

## Steps

### 1. Check for gitignore conflicts

Some skill names match common ignore patterns (`build`, `dist`, `out`). Always check:

```powershell
git check-ignore -v .github/skills/<name>/SKILL.md
```

If ignored, add a negation rule in `.gitignore` immediately after the offending pattern:

```gitignore
**/build/
!.github/skills/build/
```

### 2. Create the directory and SKILL.md

```powershell
New-Item -ItemType Directory -Path ".github\skills\<name>" -Force
```

Create `.github/skills/<name>/SKILL.md` with the frontmatter block at the very top (line 1 must be `---`), followed by the skill content.

### 3. Validate the file

Run the official validator to confirm the frontmatter parses correctly:

```powershell
uvx --from skills-ref agentskills validate .github/skills/<name>
```

Or validate all skills at once:

```powershell
make lint-skills
```

### 4. Update the skills index in copilot-instructions.md

Add the new skill to the "Load When Needed" table in `.github/copilot-instructions.md`:

```markdown
| **New skill** | `skills/<name>/SKILL.md` |
```

Also update `agents.md` at the root if the skill is commonly needed by other agents.

## Audit All Skills

Run the official validator against all skills:

```powershell
make lint-skills
```

This calls `uvx --from skills-ref agentskills validate` on every directory under `.github/skills/` using the official [agentskills.io](https://agentskills.io) reference library. All failures are reported before exiting non-zero.

To validate a single skill during development:

```powershell
uvx --from skills-ref agentskills validate .github/skills/<name>
```
