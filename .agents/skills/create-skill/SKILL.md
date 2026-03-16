---
name: create-skill
description: 'Create a new agent skill in the correct agentskills.io format under .agents/skills/; covers directory structure, frontmatter requirements, content guidelines, description writing strategy, gitignore pitfalls, updating both skills indexes (copilot-instructions.md and agents.md), and validation. Load this skill before creating or modifying any agent skill file.'
---

# Skill: Create a New Agent Skill

## Overview

Agent skills live at `.agents/skills/<name>/SKILL.md` and follow the [agentskills.io](https://agentskills.io) open standard. Copilot reads the `description` frontmatter field to decide when to auto-load a skill — write it as if answering "when should this be loaded?"

This repo currently has 60+ skills covering everything from workflow automation to infrastructure deployment. Skills are the primary way domain knowledge is packaged for AI agents.

## When to Use

- Creating a brand-new skill for a domain not yet covered
- Refactoring an overgrown skill into focused sub-skills
- Adding a skill for a new tool, service, or workflow pattern

## Directory Structure

```
.agents/skills/
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

The `description` is the **most important field** — it determines whether Copilot auto-loads your skill. Copilot matches user intent against this text, so include:

- **What** the skill does (capabilities)
- **When** to use it (trigger phrases / use cases)
- **Keywords** an agent would look for (action verbs, domain terms)

### Examples from this Repo

**Bad** (too vague):

```yaml
description: 'Helper for deployments'
```

**Good** (specific capabilities + triggers):

```yaml
description: 'Deploy AWS Lambda functions to the cloud environment; the required sequence is: unlock Terraform lock, apply infrastructure, then deploy Lambda code.'
```

**Good** (multi-trigger with explicit anti-patterns):

```yaml
description: 'Never manually edit *.generated.ts files; always regenerate them via the codegen process. Use when you are about to edit a generated file, see generated file conflicts, or need to update GraphQL types after a schema change.'
```

**Good** (comprehensive with USE FOR / DO NOT USE FOR):

```yaml
description: 'Write, run, and debug Playwright E2E tests for the web app; covers file placement, auth fixtures, GraphQL mocking with page objects, snapshot conventions, test tagging (@critical/@smoke/@regression), Nx targets, and CI pipeline integration. Load this skill before creating or modifying any E2E test.'
```

### Description Strategy

1. Start with the primary action verb: "Create", "Deploy", "Write", "Debug", "Fix"
2. List the specific artifacts or systems involved
3. End with a "Load this skill before..." or "Use when..." trigger sentence
4. Keep under 1024 characters but use as much as needed — more specific is better

## Skill Content Guidelines

After the frontmatter, write standard Markdown. The content should be complete enough that an AI agent can follow it autonomously without asking the user for clarification.

### Recommended Sections

```markdown
## Overview

Brief explanation of what this skill covers.

## When to Use

- Bullet list of specific triggers

## Prerequisites

- Any required setup or context

## Steps

Numbered or headed steps with commands and code blocks.

## Troubleshooting

Common failures and fixes (use tables for quick scanning).
```

### Content Principles

- **Be prescriptive, not descriptive** — say "Run `make install`" not "You might want to install dependencies"
- **Include full commands** — agents copy-paste literally; use fenced code blocks with language tags
- **Show file contents** — when the skill creates files, show the complete template content
- **Use tables for references** — agents parse tables faster than prose
- **Link related skills** — reference other skills by path when there's overlap (e.g., "See `.agents/skills/codegen/SKILL.md` for regeneration steps")
- **PowerShell syntax** — all terminal commands should use PowerShell conventions (`;` to chain, `$env:` for vars)

## Steps

### 1. Check for gitignore conflicts

Some skill names match common ignore patterns (`build`, `dist`, `out`). Always check:

```powershell
git check-ignore -v .agents/skills/<name>/SKILL.md
```

If ignored, add a negation rule in `.gitignore` immediately after the offending pattern:

```gitignore
**/build/
!.agents/skills/build/
```

### 2. Create the directory and SKILL.md

```powershell
New-Item -ItemType Directory -Path ".github\skills\<name>" -Force
```

Create `.agents/skills/<name>/SKILL.md` with the frontmatter block at the very top (line 1 must be `---`), followed by the skill content.

### 3. Validate the file

Run the official validator to confirm the frontmatter parses correctly:

```powershell
uvx --from skills-ref agentskills validate .agents/skills/<name>
```

Or validate all skills at once:

```powershell
make lint-skills
```

### 4. Update BOTH skills indexes

Skills are registered in **two** places. You must update both.

#### a) `.github/copilot-instructions.md`

Add the new skill to the "Load When Needed" table (alphabetical order):

```markdown
| **New skill** | `.agents/skills/<name>/SKILL.md` |
```

#### b) `agents.md` (repo root)

Add to the "Docs Index" table in the same format:

```markdown
| **New skill** | `.agents/skills/<name>/SKILL.md` |
```

> **Why both?** `copilot-instructions.md` is auto-loaded by GitHub Copilot. `agents.md` is the entry point for non-Copilot agents (Cursor, Windsurf, etc.).

### 5. Verify the skill loads

After committing, test that Copilot can discover the skill:

1. Open a new chat
2. Describe the scenario your skill covers (use the trigger phrases from your description)
3. Confirm Copilot auto-loads your skill (it appears under "Used skills" in the chat)

## Audit All Skills

Run the official validator against all skills:

```powershell
make lint-skills
```

This calls `uvx --from skills-ref agentskills validate` on every directory under `.agents/skills/` using the official [agentskills.io](https://agentskills.io) reference library. All failures are reported before exiting non-zero.

To validate a single skill during development:

```powershell
uvx --from skills-ref agentskills validate .agents/skills/<name>
```

## Troubleshooting

| Problem                                       | Fix                                                                                      |
| --------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Skill not auto-loading                        | Improve the `description` field — add more trigger keywords and action verbs             |
| `git add` doesn't pick up skill file          | Check gitignore conflict (Step 1) — skill name may match an ignore pattern               |
| Validator fails on frontmatter                | Ensure line 1 is `---` (no BOM, no leading whitespace) and `name` matches directory name |
| Skill loads but agent ignores instructions    | Move critical rules to the top of the file — agents sometimes truncate long skills       |
| Skill table in copilot-instructions.md broken | Ensure table rows use `                                                                  | ` delimiters and match the existing column count |
