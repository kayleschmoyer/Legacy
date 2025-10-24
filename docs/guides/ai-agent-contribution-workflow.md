# AI Agent Contribution Workflow

## 📋 Overview

This guide provides a comprehensive, step-by-step workflow for AI agents contributing to the Legacy Sports codebase. It covers the complete development lifecycle from planning through pull request creation, with specific considerations for PowerShell environments and Nx monorepo patterns.

> **Target Audience**: AI agents working autonomously or in collaboration with developers  
> **Prerequisites**: Development environment setup complete (see [Development Setup](development-setup.md))  
> **Last Updated**: October 24, 2025

---

## 🤖 AI Agent Tools

### Twig MCP Server (Recommended)

This repository includes a **Twig MCP (Model Context Protocol) server** for AI agents. If your AI environment supports MCP:

- **Use the MCP server** for all twig operations instead of terminal commands
- **Benefits**: Structured responses, better error handling, direct API access
- **Configuration**: See `.vscode/settings.json`

If MCP is not available, use the PowerShell terminal commands documented below.

---

## 🎯 Quick Reference

### Essential Commands

````powershell
# Refresh PATH if acli not found
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

# Update Jira ticket status
acli issue transition LS-1234 "In Progress"    # Start work
acli issue transition LS-1234 "In Review"      # PR created
acli issue transition LS-1234 "Done"           # PR merged

# Create branch (new ticket from main)
git checkout main
git pull
twig github new-branch ticket-1234

# Create branch (continuation from current)
twig switch ticket-1234 -p

# Run affected tests
npx nx affected -t test

#### Scenario 1: Type Errors

**Problem**: TypeScript compilation fails

**Solution**:

```powershell
# Run type checking to see errors
npx npx nx affected -t typecheck
````

# Lint affected projects (with auto-fix)

npx nx affected -t lint --fix

# Build affected projects

npx nx affected -t build

# Create pull request

twig github pr create-pr

# Check CI status and logs (after PR)

gh run list --branch feature/branch --limit 5 # View recent CI runs
gh run view RUN_ID --log-failed # View failed logs
gh run rerun RUN_ID --failed # Re-run failed jobs

````

### Pre-Commit Checklist

- [ ] All affected tests pass
- [ ] Type checking passes
- [ ] Linting passes (no errors)
- [ ] Build succeeds
- [ ] Pre-commit hooks pass
- [ ] Changes committed with clear message
- [ ] Branch pushed to remote

---

## 🚀 Complete Workflow

### Step 1: Plan the Project (Jira Ticket Management)

**Purpose**: Create or reference Jira tickets for tracking work.

#### Option A: Ticket Already Exists

```powershell
# Verify ticket exists and review details
acli issue view LS-1234

# Update ticket status to "In Progress"
acli issue transition LS-1234 "In Progress"
````

#### Option B: Create New Ticket

```powershell
# Create a new ticket in the LS project
acli issue create --project LS --type Task --summary "Your task summary" --description "Detailed description"

# Or create a story
acli issue create --project LS --type Story --summary "User story" --description "As a user, I want..."

# Or create a bug
acli issue create --project LS --type Bug --summary "Bug description" --description "Steps to reproduce..."

# After creating, transition to "In Progress"
acli issue transition LS-1234 "In Progress"
```

#### Jira Workflow States

Throughout the development process, keep your Jira ticket status updated:

| Stage        | Jira Status     | When to Update                  |
| ------------ | --------------- | ------------------------------- |
| Planning     | **To Do**       | Ticket created, not yet started |
| Started Work | **In Progress** | When you begin implementation   |
| Validation   | **In Progress** | While running pre-commit checks |
| Code Review  | **In Review**   | After PR is created             |
| Merged       | **Done**        | After PR is merged to main      |

```powershell
# Common status transitions
acli issue transition LS-1234 "In Progress"    # Starting work
acli issue transition LS-1234 "In Review"      # PR created
acli issue transition LS-1234 "Done"           # PR merged
```

**Note**: If `acli` command is not found, refresh your PowerShell environment variables:

```powershell
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
```

---

### Step 2: Create Feature Branch

**Purpose**: Create an isolated branch for your changes using twig (Git branch management tool).

#### Scenario A: New Ticket (Branch from Main)

Use this when starting work on a completely new ticket that should be based on the latest main branch.

```powershell
# 1. Switch to main and update
git checkout main
git pull origin main

# 2. Create new branch with twig
twig github new-branch LS-1234

# This will create a branch like: feature/LS-1234-short-description
```

#### Scenario B: Follow-up Ticket (Branch from Current)

Use this when the ticket is a continuation or depends on your current branch work.

```powershell
# Create a child branch off current branch
twig switch LS-1234 -p

# The -p flag means "parent" - it creates the new branch from your current branch
# Useful for sequential work or tickets that build on each other
```

#### Branch Naming Convention

Twig automatically generates branch names following the pattern:

- `feature/LS-####-short-description` for features
- `bugfix/LS-####-short-description` for bugs
- `hotfix/LS-####-short-description` for hotfixes

**Warning (Critical):** Before editing any files, run `git status` and `git branch` to confirm you are on the ticket branch (for example `feature/LS-1234-short-description`) and that your working tree is clean. If you are still on `main`, stop immediately and create or switch to the correct branch with `twig` before making changes.

#### Maintaining Clean Branch Trees

> ⚠️ **Critical for Large Projects**: When working on projects with multiple dependent branches, preserving a clean commit history is essential for maintainability and code review.

##### Verify Your Branch Tree

Always check your branch's position in the dependency tree:

```powershell
# View the complete branch tree
twig tree

# Check current branch status
git status
```

The tree will show your branch's parent-child relationships:

```
main
└── LS-7/design-league-scoring-data-model          [+23]
    └── LS-17/set-up-matchup-system (current)      [+1]
        └── LS-18/extend-matchup-schema            [+1]
```

The `[+N]` notation shows unique commits in each branch:
- `[+1]` = 1 unique commit (✅ **clean**)
- `[+25]` = 25 commits, possibly includes duplicates (⚠️ **investigate**)

##### Avoid Duplicate Commits

**Problem**: When creating dependent branches, it's easy to accidentally include parent commits, creating duplicates across the tree.

**Prevention**:

```powershell
# CORRECT: Create child branch from specific parent
git checkout parent-branch-name
twig switch LS-1234 -p current

# VERIFY: Check commit count
git log --oneline parent-branch..current-branch
# Should show ONLY your new commits

# If you see parent commits listed, you have duplicates!
```

**Detection**:

```powershell
# Count commits between parent and current branch
git rev-list --count parent-branch..current-branch

# Compare with twig tree output
twig tree
# If counts don't match expected work, investigate
```

**Recovery** (if duplicates found):

```powershell
# Method 1: Cherry-pick only your unique commits
git checkout -b branch-name-clean parent-branch
git cherry-pick <your-commit-hash>
git branch -D branch-name-old
git branch -m branch-name-clean branch-name

# Method 2: Use rebase with --skip for duplicates
git checkout branch-name
git rebase parent-branch
# When conflicts occur on duplicate commits:
git rebase --skip  # Skip the duplicate
# Continue until only unique commits remain
```

##### Rebasing Dependent Branch Chains

When rebasing a chain of dependent branches:

```powershell
# Use twig's cascade command to rebase children automatically
git checkout parent-branch
twig cascade --show-graph --autostash

# This rebases all child branches on their parents
# Handles the dependency tree automatically
```

**Best Practices**:

1. **Plan your branch tree structure** before creating multiple dependent branches
2. **Use `twig tree` frequently** to verify structure
3. **Keep commits focused** - each branch should have only its unique work
4. **Rebase regularly** to keep branches up-to-date with their parents
5. **Avoid force-pushing** until you've verified the tree is clean

##### Example: Clean Multi-Branch Project

```powershell
# Project: Implement matchup system (LS-17 epic)

# 1. Create base branch from main
git checkout main; git pull
twig switch LS-17

# 2. Create database schema branch from LS-17
git checkout LS-17/set-up-matchup-system
twig switch LS-18 -p current

# 3. Verify tree structure
twig tree
# Should show:
# main
#   └── LS-17/set-up-matchup-system      [+1]
#       └── LS-18/extend-matchup-schema  [+1]

# 4. Create GraphQL branch from LS-18
git checkout LS-18/extend-matchup-schema
twig switch LS-19 -p current

# Final tree should show each branch with only its unique commits
```

---

### Step 3: Implement Ticket Requirements

**Purpose**: Write code to fulfill the ticket requirements.

#### Development Guidelines

##### A. Work in Nx Monorepo Context

**Always use Nx commands** for consistency and caching benefits:

```powershell
# ❌ DON'T: Run commands directly
npm run test

# ✅ DO: Use nx to run targets
npx nx affected -t test
nx run project-name:test
npx nx run-many -t test --projects=lib1,lib2
```

##### B. Development Servers Already Running

The following services are **already running** in the background:

- **Dev Server** (web app): `npm start`
- **GraphQL Service**: Backend API

**Do NOT start these services again**. They are persistent and available for your use.

##### C. Run Affected Commands

Use `nx affected` to only run tasks on projects impacted by your changes:

```powershell
# Test only affected projects
npx nx affected -t test

# Build only affected projects
npx nx affected -t build

# Lint only affected projects
npx nx affected -t lint

# Type check only affected projects
npx nx affected -t typecheck
```

##### D. Focus on Specific Projects

When working on a specific project:

```powershell
# Run tests for a single project
npx npx nx test project-name

# Run build for a single project
npx nx build project-name

# Run multiple targets for a project
npx nx run-many -t test,build,lint --projects=project-name
```

#### Common Development Patterns

##### Working with GraphQL

```powershell
# GraphQL server is already running, but if you need to regenerate types:
npx nx codegen project-name

# Run codegen for all affected projects
npx nx affected -t codegen
```

##### Working with Database

```powershell
# Sync environment credentials first
npm run sync-env

# Run migrations
npm run db:migrate

# Test database connection (CLI)
npm run cli:test-connection
```

##### Working with React Native/Mobile

```powershell
# Build Android debug
nx build-android-debug app

# Run on Android device/emulator
nx run-android app

# Validate Android versions
npm run android:validate-versions
```

---

### Step 4: Pre-Commit Validation

**Purpose**: Ensure all quality checks pass before committing.

> **Important**: Always use `npx nx` instead of just `nx` when running Nx commands in PowerShell. This ensures the command is found even if `nx` is not in your PATH.

#### Required Checks (Must All Pass)

Run these checks in sequence. Fix any errors before proceeding to the next check.

##### 1. Type Checking

```powershell
# Check types for affected projects
npx nx affected -t typecheck

# Or check specific project
nx typecheck project-name
```

**Common Issues**:

- Missing type definitions
- Incorrect type assignments
- `any` types where specific types should be used

**Fix Strategy**: Address type errors directly. Avoid `// @ts-ignore` unless absolutely necessary and documented.

##### 2. Linting

```powershell
# Lint affected projects with auto-fix
npx nx affected -t lint --fix

# Or lint specific project
npx nx lint project-name --fix
```

**Common Issues**:

- Import ordering
- Unused variables
- ESLint rule violations
- Floating promises

**Fix Strategy**:

1. Run with `--fix` flag first (auto-fixes many issues)
2. Review remaining errors
3. Fix structural issues (imports, exports)
4. Fix code quality issues (unused vars, etc.)
5. Only use `eslint-disable` comments as last resort with clear justification

##### 3. Testing

```powershell
# Run tests for affected projects
npx nx affected -t test

# Run tests in watch mode for development
npx nx affected -t test --watch

# Run tests with coverage
npx nx affected -t test --coverage
```

**Common Issues**:

- Test failures due to missing mocks
- Snapshot mismatches
- Timing issues in async tests

**Fix Strategy**:

1. Read test failure messages carefully
2. Update tests if implementation changed intentionally
3. Update snapshots if UI/output changed intentionally: `npx npx nx test project-name --updateSnapshot`
4. Fix actual bugs if tests reveal issues

##### 4. Building

```powershell
# Build affected projects
npx nx affected -t build

# Build specific project
npx nx build project-name
```

**Common Issues**:

- Missing dependencies
- Import path errors
- Build configuration issues

**Fix Strategy**:

1. Check that all imports are correct
2. Verify `tsconfig.json` paths are correct
3. Ensure all dependencies are in `package.json`
4. Check Nx project configuration in `project.json`

#### Pre-Commit Hooks

The repository has **automatic pre-commit hooks** that run when you commit. These hooks validate:

✅ **Secret Detection**:

- No JWT secrets in tracked files
- No cookie secrets in tracked files
- No production database endpoints
- No AWS account IDs
- Only safe placeholder values

✅ **Syntax Validation**:

- Valid YAML syntax (`.yml`, `.yaml` files)
- Valid JSON syntax (`.json` files)

**If hooks fail**:

1. Read the error message carefully
2. Fix the identified issues
3. Re-stage your changes: `git add .`
4. Try committing again

**Hook Installation** (if not already installed):

```powershell
npm run security:install-hooks
```

---

### Step 5: Commit and Push Changes

**Purpose**: Save your changes with clear, descriptive commit messages.

#### Commit Message Format

Follow conventional commit format for clarity and automation:

```
<type>(<scope>): <short summary>

<detailed description (optional)>

<footer (optional)>
```

**Types**:

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, no logic change)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks, dependencies, config

**Examples**:

```powershell
# Feature commit
git commit -m "feat(graphql): add career statistics resolver

- Implemented career stats aggregation
- Added Pothos schema definitions
- Integrated with existing season stats"

# Bug fix commit
git commit -m "fix(auth): resolve OAuth token refresh issue

- Fixed race condition in token refresh
- Added retry logic for network failures
- Updated tests to cover edge cases"

# Documentation commit
git commit -m "docs(api): update GraphQL schema documentation"

# Chore commit
git commit -m "chore(deps): upgrade Nx to v21.5.2"
```

#### Commit Workflow

```powershell
# 1. Review your changes
git status
git diff

# 2. Stage all changes (or stage selectively)
git add .

# Or stage specific files
git add path/to/file1.ts path/to/file2.ts

# 3. Commit with message
git commit -m "feat(scope): your message here"

# 4. Push to remote
git push origin HEAD

# Or push and set upstream tracking
git push -u origin HEAD
```

#### First Push for New Branch

If it's your first push on a new branch:

```powershell
# Push and set upstream
git push -u origin feature/LS-1234-description

# Or use HEAD to push current branch
git push -u origin HEAD
```

---

### Step 6: Create Pull Request

**Purpose**: Submit your changes for review and merge into main branch.

#### Using Twig (Recommended)

```powershell
# Create PR with twig (opens in browser)
twig github pr create-pr

# After PR is created, update Jira ticket status
acli issue transition LS-1234 "In Review"
```

Twig will:

1. Push your branch if not already pushed
2. Open GitHub in your browser
3. Pre-fill PR details based on your commits and ticket info

#### PR Template Checklist

Ensure your PR includes:

- [ ] Clear title referencing the Jira ticket (e.g., "LS-1234: Add career statistics resolver")
- [ ] Description of changes and why they were made
- [ ] Link to Jira ticket
- [ ] Screenshots (if UI changes)
- [ ] Test results (all passing)
- [ ] Breaking changes noted (if any)
- [ ] Documentation updates (if needed)

#### PR Best Practices

**Title Format**:

```
LS-1234: Brief description of changes
```

**Description Template**:

```markdown
## Summary

Brief overview of what this PR does.

## Jira Ticket

[LS-1234](https://your-jira.atlassian.net/browse/LS-1234)

## Changes Made

- Change 1
- Change 2
- Change 3

## Testing Done

- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing completed
- [ ] E2E tests pass (if applicable)

## Screenshots

(If applicable)

## Breaking Changes

None / List any breaking changes

## Additional Notes

Any additional context or notes for reviewers.
```

---

## 🔍 Troubleshooting Common Issues

---

### Issue: CI Failures - How to Diagnose

**Symptom**: GitHub Actions CI pipeline fails.

**Solution**:

```powershell
# View CI logs using GitHub CLI
gh run view RUN_ID --log-failed

# Or get the latest run for current branch
gh run list --branch feature/your-branch --limit 1

# View specific job logs
gh run view RUN_ID --job JOB_ID --log

# Re-run failed jobs
gh run rerun RUN_ID --failed
```

**Common CI Failure Types**:

**1. Snapshot Test Failures**:

```
Snapshot Summary
› 3 snapshots failed from 1 test suite
```

**Cause**: UI changes that affect test snapshots (most common after accessibility or styling updates).

**Fix**:

```powershell
# Update snapshots locally
npx npx nx test project-name --updateSnapshot

# Or for affected projects
npx nx affected -t test --updateSnapshot

# Review the changes in git
git diff

# If changes look correct, commit updated snapshots
git add .
git commit -m "test: update snapshots after UI changes"
git push
```

**2. Type Check Failures**:

```
error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'
```

**Fix**: Address TypeScript errors in the indicated files, then push the fixes.

**3. Lint Failures**:

```
error: 'variable' is assigned a value but never used
```

**Fix**:

```powershell
# Fix lint issues locally
npx nx affected -t lint --fix

# Commit fixes
git add .
git commit -m "fix: resolve linting issues"
git push
```

**4. Test Failures**:

```
FAIL apps/web/src/app/app.spec.tsx
Expected: true
Received: false
```

**Fix**: Update the failing tests or fix the code causing test failures.

---

### Issue: Jira Ticket Status Transition Fails

**Symptom**: `acli issue transition` command fails or status doesn't update.

**Possible Causes & Solutions**:

**1. Invalid status name**:

```powershell
# List available transitions for a ticket
acli issue transitions LS-1234

# Use the exact status name from the list
acli issue transition LS-1234 "In Progress"
```

**2. Workflow doesn't allow the transition**:

```powershell
# Check current status
acli issue view LS-1234

# Some workflows require intermediate steps
# Example: To Do → In Progress (allowed)
# Example: To Do → Done (not allowed, must go through In Progress first)

# Follow the correct workflow path
acli issue transition LS-1234 "In Progress"
acli issue transition LS-1234 "In Review"
acli issue transition LS-1234 "Done"
```

**3. Permission issues**:

```powershell
# Verify you have permission to modify the ticket
acli issue view LS-1234

# Check if you're assigned to the ticket
# You may need to be assigned before transitioning

# Assign to yourself if needed
acli issue assign LS-1234 @me
```

---

### Issue: `acli` Command Not Found

**Symptom**: PowerShell doesn't recognize `acli` command.

**Solution**:

```powershell
# Refresh PATH variables
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

# Verify acli is now available
acli --version
```

**Prevention**: Add this to your PowerShell profile for automatic loading:

```powershell
# Edit profile: notepad $PROFILE
# Add this line:
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
```

---

### Issue: Twig Command Fails

**Symptom**: `twig` command errors or doesn't recognize repository.

**Solution**:

```powershell
# 1. Verify you're in git repository
git status

# 2. Check twig installation
twig --version

# 3. Re-initialize twig if needed
twig init
```

---

### Issue: Pre-Commit Hook Fails

**Symptom**: Commit is blocked by pre-commit hooks.

**Solution**:

```powershell
# 1. Read the error message - it will tell you what failed

# 2. Common failures:
# - Secret detected: Remove the secret, use environment variables instead
# - YAML syntax error: Fix the YAML file syntax
# - JSON syntax error: Fix the JSON file syntax

# 3. Fix the issue and try again
git add .
git commit -m "your message"

# 4. If you need to skip hooks (USE SPARINGLY, only for urgent fixes)
git commit --no-verify -m "your message"
```

---

### Issue: Nx Affected Returns No Projects

**Symptom**: `npx nx affected -t test` says no projects affected.

**Possible Causes & Solutions**:

**1. You're on main branch**:

```powershell
# Create feature branch first
git checkout -b feature/LS-1234
```

**2. No changes since main**:

```powershell
# Make sure you have uncommitted changes
git status
```

**3. Nx cache issue**:

```powershell
# Reset Nx cache
nx reset

# Try again
npx nx affected -t test
```

---

### Issue: Build Fails with Module Not Found

**Symptom**: `Cannot find module '@legacy-sports/some-package'`

**Solution**:

```powershell
# 1. Install dependencies
npm install

# 2. Build dependencies first (libs before apps)
npx nx run-many -t build --projects=tag:scope:lib

# 3. Then build your target
npx nx build your-project

# 4. If still failing, check imports
# Verify the package exists in package.json
# Verify the import path matches tsconfig.json paths
```

---

### Issue: Tests Fail Due to Database Connection

**Symptom**: Tests fail with database connection errors.

**Solution**:

```powershell
# 1. Sync environment variables
npm run sync-env

# 2. Verify database credentials are set
npm run db:credentials

# 3. Test connection
npm run cli:test-connection

# 4. If using test database, check it's running
npm run dev:db
```

---

### Issue: GraphQL Codegen Fails

**Symptom**: `nx codegen` fails or generates incorrect types.

**Solution**:

```powershell
# 1. Ensure GraphQL server is running (should already be running)
# Check terminal labeled "GQL"

# 2. Verify GraphQL endpoint is accessible
# Open http://localhost:5000/graphql in browser

# 3. Set environment variable
$env:VITE_GRAPHQL_HOST = 'http://localhost:5000/graphql'

# 4. Run codegen
npx nx affected -t codegen

# 5. If still failing, restart GraphQL server
# (This should rarely be needed)
```

---

### Issue: PowerShell Script Execution Blocked

**Symptom**: "Running scripts is disabled on this system"

**Solution**:

```powershell
# Check current execution policy
Get-ExecutionPolicy

# Set execution policy for current user (one-time setup)
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Or run with bypass flag
powershell -ExecutionPolicy Bypass -File scripts/sync-env.ps1
```

---

### Issue: Git Push Rejected

**Symptom**: `git push` fails with "rejected" or "non-fast-forward" error.

**Solution**:

```powershell
# 1. Pull latest changes from remote
git pull origin feature/LS-1234

# 2. Resolve any merge conflicts if they occur
# Edit conflicting files, then:
git add .
git commit -m "Merge remote changes"

# 3. Push again
git push origin feature/LS-1234

# If branch diverged significantly, consider rebasing (advanced)
git pull --rebase origin feature/LS-1234
```

---

## 📚 Related Documentation

### Essential Reading

- **[Development Setup](development-setup.md)**: Initial environment setup
- **[Authentication Guide](authentication-guide.md)**: OAuth implementation details
- **[Troubleshooting](troubleshooting.md)**: Comprehensive error resolution
- **[Agent Commands](agent-commands.md)**: CLI command reference

### Architecture & Patterns

- **[Cross-Platform System](../architecture/cross-platform-system.md)**: Magic string patterns
- **[Build System](../architecture/build-system.md)**: Nx monorepo structure
- **[GraphQL Integration](../architecture/graphql-integration.md)**: API design
- **[Database Schema](../architecture/database-schema.md)**: Database patterns

### CI/CD & Quality

- **[CI System Documentation](../ci-cd/ci-system-documentation.md)**: GitHub Actions workflows
- **[CI Troubleshooting](../ci-cd/ci-troubleshooting-guide.md)**: Pipeline debugging
- **[Security Guidelines](../security/security-audit-status.md)**: Security best practices

### AI Agent Resources

- **[AI Agent Instructions](../agents/README.md)**: Structured CSV guidelines
- **[Development Workflow CSV](../agents/development-workflow.csv)**: Workflow patterns
- **[Common Pitfalls CSV](../agents/common-pitfalls.csv)**: Mistakes to avoid

---

## 🤖 AI Agent-Specific Notes

### Context Awareness

As an AI agent, you should:

1. **Always verify the current state before acting**:

   ```powershell
   git status              # Check current branch and changes
   git branch              # List all branches
   nx affected:graph       # Visualize affected projects
   ```

2. **Understand the repository structure**:
   - `apps/`: Application projects (web, mobile)
   - `lib/`: Shared libraries
   - `lambdas/`: AWS Lambda functions
   - `docs/`: Documentation

3. **Use Nx intelligently**:
   - Prefer `nx affected` over `npx nx run-many --all` for efficiency
   - Understand project dependencies via `nx graph`
   - Leverage Nx cache for faster builds

4. **Follow the fail-fast philosophy**:
   - Don't suppress errors or warnings
   - Fix root causes, not symptoms
   - Let TypeScript and ESLint catch issues early

### Decision-Making Framework

When implementing changes, ask yourself:

1. **Does this change affect multiple projects?**
   - If yes, consider impact on all affected projects
   - Run `nx affected:graph` to visualize dependencies

2. **Does this require documentation updates?**
   - New features → Update relevant guides
   - API changes → Update API documentation
   - Breaking changes → Update migration guides

3. **Does this need tests?**
   - New features → Add unit tests
   - Bug fixes → Add regression tests
   - API changes → Update integration tests

4. **Are there security implications?**
   - Authentication changes → Review security guidelines
   - New dependencies → Check for vulnerabilities
   - Secrets handling → Use environment variables

### Contributing Back to Agent Knowledge

When you discover new patterns, issues, or solutions:

1. **Update relevant CSV files** in `docs/agents/`:
   - Add new rules to appropriate CSV
   - Document the pattern, issue, and solution
   - Include code examples and file paths

2. **Suggest documentation improvements**:
   - If this guide was unclear, suggest improvements
   - If you found a gap, document what's missing
   - If you solved a novel problem, share the solution

3. **Format for agent contribution**:
   ```csv
   Category,Subcategory,Rule_Type,Pattern_Concept,Description,Code_Example,File_Path
   your_category,your_area,LEARNED,pattern_name,"Clear description","Practical example","path/to/file"
   ```

---

## 📋 Quick Start Checklist

Use this checklist for each contribution:

### Planning Phase

- [ ] Jira ticket exists (created or verified)
- [ ] Ticket details reviewed and understood
- [ ] Requirements and acceptance criteria clear
- [ ] Ticket status updated to "In Progress"

### Branch Creation

- [ ] Determined if branching from main or current branch
- [ ] Checked out correct base branch
- [ ] Created feature branch with twig
- [ ] Branch name follows convention

### Implementation

- [ ] Code implements ticket requirements
- [ ] Follows existing patterns and conventions
- [ ] Adds/updates tests as needed
- [ ] Adds/updates documentation as needed
- [ ] Uses Nx commands (not direct npm commands)
- [ ] Respects running dev servers

### Validation

- [ ] Type checking passes (`npx nx affected -t typecheck`)
- [ ] Linting passes (`npx nx affected -t lint --fix`)
- [ ] Tests pass (`npx nx affected -t test`)
- [ ] Build succeeds (`npx nx affected -t build`)
- [ ] Pre-commit hooks pass

### Submission

- [ ] Changes committed with clear message
- [ ] Conventional commit format used
- [ ] Branch pushed to remote
- [ ] PR created with twig
- [ ] Jira ticket status updated to "In Review"
- [ ] PR template filled out completely
- [ ] Jira ticket linked in PR

### Post-Merge

- [ ] PR merged to main
- [ ] Jira ticket status updated to "Done"

---

## 🎓 Learning Resources

### PowerShell Resources

- [PowerShell Documentation](https://docs.microsoft.com/powershell/)
- [PowerShell Gallery](https://www.powershellgallery.com/)

### Nx Resources

- [Nx Documentation](https://nx.dev)
- [Nx Affected Commands](https://nx.dev/nx-api/nx/documents/affected)
- [Nx Cloud](https://nx.app)

### Git Resources

- [Git Documentation](https://git-scm.com/doc)
- [Conventional Commits](https://www.conventionalcommits.org/)

### Twig Resources

- [Twig Documentation](https://github.com/rongierlach/git-twig)

---

## 📝 Version History

| Version | Date       | Changes                                      |
| ------- | ---------- | -------------------------------------------- |
| 1.0.0   | 2025-10-15 | Initial comprehensive workflow documentation |

---

## 🤝 Contributing to This Guide

This guide is a living document. If you find areas for improvement:

1. Create a ticket: `acli issue create --project LS --type Task --summary "Update AI agent workflow guide"`
2. Follow this workflow to make changes
3. Submit a PR with improvements

**Questions or Suggestions?** Open a GitHub issue or discuss with the team.

---

**Happy Contributing! 🚀**
