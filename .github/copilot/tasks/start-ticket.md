# Task: Start Working on Ticket

## Pre-flight Check

- [ ] Ticket exists in Jira
- [ ] You're on `main` branch (or correct parent)
- [ ] Latest code pulled

## Steps

### 1. Create Branch

```powershell
# For new ticket from main
git checkout main
git pull
twig switch LS-1234

# For follow-up from current branch
twig switch LS-1234 -p current
```

### 2. Update Jira

```powershell
acli jira workitem transition --key LS-1234 --status "In Progress"
```

### 3. Verify Setup

```powershell
# Check you're on correct branch
git branch

# Verify branch tree (if using dependent branches)
twig tree
```

## Common Issues

**`acli not found`**:

```powershell
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
```

**Already on feature branch**:

```powershell
git stash
git checkout main
git pull
twig switch LS-1234
git stash pop
```

## Next: Make Your Changes

After branch creation, edit files to implement ticket requirements.

See: `fix-types.md`, `fix-lint.md`, or `create-pr.md` for next steps.
