---
name: create-skill
description: 'Create or update an agent skill following the agentskills.io format. Load before creating, modifying, or auditing any agent skill file; covers frontmatter, content guidelines, token budget, description strategy, and validation.'
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
    ├── SKILL.md
    └── references/          ← optional load-on-demand files
        └── <topic>.md
```

- One directory per skill, named in **lowercase-hyphen** (kebab-case)
- The directory name **must exactly match** the `name` frontmatter field
- `SKILL.md` is the only required file
- Use `references/` for overflow content that exceeds the token budget (see Token Budget section)

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

The `description` is the **most important field** — it determines whether Copilot auto-loads your skill. Copilot matches user intent against this text.

### Description Principles ([agentskills.io best practices](https://agentskills.io/skill-creation/optimizing-descriptions))

1. **Use imperative phrasing** — "Use this skill when..." or "Load before..." not "This skill does..."
2. **Focus on user intent** — describe what the user is trying to achieve, not the skill's internal mechanics
3. **Be pushy** — explicitly list contexts where the skill applies, even implicit ones: "even if they don't mention CSV"
4. **Provide defaults not menus** — pick a default path and mention alternatives briefly
5. **Start with an action verb** — "Create", "Deploy", "Fix", "Load when", "Use when"
6. **End with a trigger** — "Load this skill before..." or "Use when..."
7. **Under 1024 characters** — long enough to cover scope, short enough to avoid context bloat

### Examples

| Quality | Description                                                                               | Why                          |
| ------- | ----------------------------------------------------------------------------------------- | ---------------------------- |
| ❌ Bad  | `'Helper for deployments'`                                                                | Vague, no triggers           |
| ❌ Bad  | `'Reference for all project configuration file conventions...'`                           | Declarative, not imperative  |
| ✅ Good | `'Deploy Lambda functions to the cloud. Use when pushing new code or infra changes...'`   | Imperative + trigger         |
| ✅ Good | `'Load before writing SQL queries to understand the public and app_internal schemas...'`  | User intent + trigger        |
| ✅ Good | `'Fix common dev environment problems: module-not-found, DB connectivity... Use when...'` | Action verb + explicit scope |

## Token Budget & Progressive Disclosure

Every SKILL.md must stay under **500 lines** and **5,000 tokens** (the [agentskills.io](https://agentskills.io) spec). SKILL.md files are loaded in full when Copilot matches a user request — oversized skills waste context window on every invocation.

### How to measure

```powershell
$c = Get-Content ".agents\skills\<name>\SKILL.md" -Raw
"Lines: $(($c -split \"`n\").Count)  Tokens: $([math]::Ceiling($c.Length / 4))"
```

### Progressive disclosure with `references/`

When a skill exceeds the limits (or approaches them), extract verbose content into `references/<topic>.md` files. These are **never auto-loaded** — agents fetch them only when explicitly instructed via a `📎 see references/...` link.

```
.agents/skills/<name>/
├── SKILL.md              ← always loaded when matched (<500L, <5000T)
└── references/
    ├── architecture.md   ← loaded on demand (no size limit)
    └── troubleshooting.md
```

**What to keep in SKILL.md** (always loaded):

- Decision logic, critical rules, essential commands
- "When to use" triggers, prerequisites, step summaries
- Short code examples (1 per concept)

**What to extract to `references/`** (load on demand):

- Detailed architecture diagrams and multi-table catalogs
- Long PowerShell scripts and verbose code examples
- Exhaustive troubleshooting guides
- Historical rationale and design decisions
- Recovery procedures and edge-case handling

**Link pattern** (use consistently):

```markdown
> 📎 **Full recovery procedures**: see [references/recovery.md](references/recovery.md)
```

### Always-loaded overhead

Skill **descriptions** (~50 tokens each × 59 skills ≈ 3,300T) load on **every request** for Copilot to decide which skills to invoke. The SKILL.md body only loads for matched skills (typically 1–3 per request). Keep descriptions impactful but concise — they're the most expensive text per character in the system.

### Budget guidelines

| Zone      | Tokens  | Action                                        |
| --------- | ------- | --------------------------------------------- |
| Green     | < 3,000 | No action needed                              |
| Yellow    | 3K–5K   | Review for extraction opportunities           |
| Over spec | > 5,000 | **Must** extract to references before merging |
| Lines     | > 500   | **Must** condense or extract before merging   |

## Skill Content Guidelines

After the frontmatter, write standard Markdown. The content should be complete enough that an AI agent can follow it autonomously without asking the user for clarification.

### Recommended Sections

```markdown
## Overview

Brief explanation of what this skill covers.

## When to Use

- Bullet list of specific triggers

## Gotchas

- Non-obvious environment-specific facts that defy assumptions
- Corrections to mistakes the agent will make without being told

## Steps

Numbered steps with commands and code blocks.

## Troubleshooting

Common failures and fixes (use tables for quick scanning).
```

> Keep gotchas in the main SKILL.md (not in references) — the agent needs them **before** encountering the situation, not after.

### Content Principles

Based on [agentskills.io best practices](https://agentskills.io/skill-creation/best-practices):

- **Add what the agent lacks, omit what it knows** — don't explain what a migration or PR is; focus on project-specific conventions, non-obvious edge cases, and which specific tools to use
- **Be prescriptive, not descriptive** — say "Run `make install`" not "You might want to install dependencies"
- **Provide defaults, not menus** — pick one approach and mention alternatives as escape hatches: "Use pdfplumber. For scanned PDFs, use pdf2image instead."
- **Favor procedures over declarations** — teach the agent how to approach a class of problems, not what to produce for one specific case
- **Include gotchas** — list environment-specific facts that defy reasonable assumptions (e.g., "The `users` table uses soft deletes — queries MUST include `WHERE deleted_at IS NULL`")
- **Add validation loops** — for multi-step workflows, instruct: do the work → run validator → fix → repeat until clean
- **Match specificity to fragility** — prescribe exactly for fragile operations; explain rationale for flexible ones so the agent can adapt
- **Include full commands** — agents copy-paste literally; use fenced code blocks with language tags
- **Use tables for references** — agents parse tables faster than prose
- **Respect the token budget** — extract verbose examples, scripts, and catalogs to `references/`
- **PowerShell syntax** — terminal commands use PowerShell conventions (`;` to chain, `$env:` for vars)

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

Check the token budget:

```powershell
$c = Get-Content ".agents\skills\<name>\SKILL.md" -Raw
"Lines: $(($c -split "`n").Count)  Tokens: $([math]::Ceiling($c.Length / 4))"
```

If over 500 lines or 5,000 tokens, extract content to `references/` (see Token Budget section).

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
| SKILL.md exceeds 500 lines or 5,000 tokens    | Extract verbose sections to `references/` — see Token Budget section above               |
| Skill table in copilot-instructions.md broken | Ensure table rows use `                                                                  | ` delimiters and match the existing column count |
