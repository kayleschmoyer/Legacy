---
name: jira-rollover
description: 'Manage Jira bucket epic rollovers at sprint boundaries. Run after sprint close to sync project properties, close old epics, and re-parent stranded tickets. Use jira_get_bucket_epic to look up current epic keys instead of hardcoding a specific ticket number.'
---

# Skill: Jira Rollover

## Overview

Two long-lived "bucket" epics track ongoing intake queues:

| Bucket      | Label                | Current epic                                   |
| ----------- | -------------------- | ---------------------------------------------- |
| Client bugs | `bucket:client-bugs` | resolved at runtime via `jira_get_bucket_epic` |
| MCP gaps    | `bucket:mcp-gaps`    | resolved at runtime via `jira_get_bucket_epic` |

At each sprint close, a Jira Automation rule creates new bucket epics with the same labels. The sync script updates the Jira project properties so all readers immediately see the new epic.

## When to Use

- After a sprint closes and new bucket epics have been created by the Jira Automation rule
- When you notice tickets are stranded in a closed epic (use `--check` to detect)
- When the Jira Automation rule failed to fire (use `--rollover` to create epics manually)

## Steps

### 1. Check current state (read-only)

```
make jira-rollover-sync
```

Or: `make jira-rollover-sync ARGS=--check`

Reports whether project properties match the newest open epic, and lists any stranded tickets.

### 2. Sync after sprint close (standard operation)

```
make jira-rollover-sync ARGS=--sync
```

This:

1. Finds the newest open epic for each bucket (by label)
2. Updates `bucket.client-bugs` and `bucket.mcp-gaps` project properties
3. Closes the previous open epic with a "Rolled over to LS-####" comment
4. Re-parents any stranded tickets to the new epic

Run this after every sprint close. Takes ~5 seconds.

### 3. Manual rollover (if Jira Automation didn't fire)

```
make jira-rollover-sync ARGS="--rollover --sprint 'Sprint 8'"
```

Creates the new epics first, then runs sync.

### 4. Fix stranded tickets only

```
make jira-rollover-sync ARGS=--fix
```

Re-parents stranded tickets without touching epic status or project properties. Safe to run any time.

## Looking up the current epic in code

Never hardcode a bucket epic key by its ticket number. Use:

```
jira_get_bucket_epic({ bucket: 'mcp-gaps' })   → { key: "LS-####" }
jira_get_bucket_epic({ bucket: 'client-bugs' }) → { key: "LS-####" }
```

Result is cached 5 minutes per MCP server process.

## Gotchas

- **Automation limit**: if the Jira Automation rule didn't fire due to hitting the monthly limit, use `--rollover` to create epics and sync manually.
- **Permission**: `jira_set_bucket_epic` and `--sync`/`--rollover` modes require "Administer Projects" on the LS project. The local service account has this. Lambda and agent read-only calls don't.
- **Cache**: `jira_get_bucket_epic` caches for 5 minutes. If you just ran `--sync`, wait up to 5 minutes or restart the MCP server to see the new key immediately.
