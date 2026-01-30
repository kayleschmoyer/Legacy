# Task: Create Pull Request

## Pre-PR Checklist

- [ ] All validation passes (typecheck, lint, test, build)
- [ ] Changes committed with conventional format
- [ ] Branch pushed to remote

## Validation (Must Pass)

```powershell
pnpm exec nx affected -t typecheck   # 1. Types
pnpm exec nx affected -t lint --fix  # 2. Linting
pnpm exec nx affected -t test        # 3. Tests
pnpm exec nx affected -t build       # 4. Build

# Or use shortcut
make pre-commit
```

## Commit Changes

```powershell
git add .
git commit -m "feat(scope): brief description"
git push origin HEAD
```

### Commit Format

```
<type>(<scope>): <summary>

[optional body]

[optional footer]
```

**Types**: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

**Examples**:

- `feat(graphql): add career statistics resolver`
- `fix(auth): resolve OAuth token refresh issue`
- `docs(api): update GraphQL schema documentation`

## Create PR

```powershell
twig github pr create-pr
```

This opens GitHub in browser with pre-filled details.

## PR Template Checklist

- [ ] Title references Jira ticket: `LS-1234: Description`
- [ ] Link to Jira ticket in description
- [ ] Summary of changes
- [ ] Screenshots (if UI changes)
- [ ] Test results
- [ ] Breaking changes noted

## Update Jira

```powershell
acli jira workitem transition --key LS-1234 --status "In Review"
```

## After PR Merged

```powershell
acli jira workitem transition --key LS-1234 --status "Done"
```

## Common Issues

**Push rejected**:

```powershell
git pull origin <branch>
# Resolve conflicts if any
git push origin HEAD
```

**Pre-commit hooks fail**: Fix the reported issues and retry commit.

**CI fails**: Check logs with:

```powershell
gh run list --branch <branch> --limit 1
gh run view <run-id> --log-failed
```
