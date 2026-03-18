# In-Place Branching (Without Worktrees)

> **Prefer the worktree workflow for all ticket work.** Use in-place branching only when
> the user explicitly asks to work without a worktree (e.g., "no worktree" or "in-place").

## Commands

### Using branch-create script

```powershell
# Create branch from main (new ticket)
.\scripts\branch-create.ps1 -TicketKey LS-1234

# Create branch from current branch (follow-up work)
.\scripts\branch-create.ps1 -TicketKey LS-1234 -FromCurrent

# Non-interactive (for agents)
.\scripts\branch-create.ps1 -TicketKey LS-1234 -NonInteractive
.\scripts\branch-create.ps1 -TicketKey LS-1234 -NonInteractive -AddToSprint
```

### Using twig directly

```powershell
# From main branch (new independent ticket)
twig switch LS-1234 -p=main

# From current branch (dependent work)
twig switch LS-1234 -p=current

# From another Jira ticket's branch
twig switch LS-1234 -p=LS-1233
```

> **CRITICAL**: The `-p` flag requires equals-sign syntax (e.g., `-p=main`, `-p=current`).
> Space-separated `-p main` will fail. Bare `-p` defaults to current branch as parent.

### Twig `-p` Parent Values

| Value                     | Meaning                                           |
| ------------------------- | ------------------------------------------------- |
| `-p=main`                 | Branch from `main`                                |
| `-p=current` or bare `-p` | Branch from the currently checked-out branch      |
| `-p=LS-####`              | Branch from the branch linked to that Jira ticket |
| `-p=none`                 | No parent dependency tracking                     |

## Known Pitfall: Duplicate Branches

Do NOT combine `twig switch LS-####` with `twig worktree create LS-####/description`.
`twig switch` auto-generates a dash-format name (e.g., `LS-490-fix-rollbar-init`),
while `twig worktree create` uses your slash-format name (`LS-490/fix-rollbar-init`).
This creates **two branches per ticket**. Use one approach or the other.

## Choosing the Right Parent

- **`-p=main`**: New independent feature, unrelated tickets, first ticket in sprint
- **`-p=current`**: Follow-up to current work, dependent tickets
- **`-p=<ticket-or-branch>`**: Depends on another in-progress (unmerged) ticket
