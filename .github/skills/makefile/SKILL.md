---
name: makefile
description: 'Reference for all Makefile targets in the Legacy Sports monorepo; wraps Nx commands with cross-platform support, colored output, and pre-commit validation.'
---

# Skill: Makefile

## Overview

The Makefile is the primary entry point for all development tasks. It wraps Nx commands, scripts, and tooling with cross-platform support (Windows/macOS/Linux), colored output, and the LS-102 `windowsHide` patch to prevent console windows from spawning on Windows.

## When to Use

- **Always prefer `make <target>`** over raw `pnpm exec nx` or `npx` commands
- The Makefile sets `NODE_OPTIONS` to load the `windowsHide` patch automatically on Windows
- Use `make help` to discover available commands

## Quick Reference

### Pre-commit Validation

```powershell
make pc              # Full pre-commit (typecheck → format → lint → workflows → test → build)
make quick-check     # Quick check (typecheck + lint only)
```

### Code Quality

```powershell
make typecheck       # TypeScript type checking (all projects)
make lint            # Lint all projects
make lint-fix        # Lint with auto-fix
make format          # Format with Prettier
make lint-workflows  # Validate GitHub Actions workflow files
make validate        # Validate package.json and workspace deps
```

### Testing

```powershell
make test            # Test affected projects
make test-all        # Test all projects
make test-watch      # Test in watch mode
make test-e2e        # End-to-end tests (all tags, all browsers)
# To run CI-equivalent e2e (critical only, exclude @slow):
pnpm exec nx e2e web-e2e -- --grep='@critical' --grep-invert='@slow'
```

### Building

```powershell
make build           # Build affected projects
make build-all       # Build all projects
make build-web       # Build web app
make build-mobile    # Build mobile app
make build-lambdas   # Build all lambdas
make build-libs      # Build all libraries
```

### Development Servers

```powershell
make dev-web         # Start web dev server (Next.js)
make dev-mobile      # Start mobile dev server (React Native)
make dev-db          # Start database service
make dev-graphql     # Start GraphQL service (localhost:5000/graphql)
make dev-storybook   # Start Storybook
make graphiql        # Start GraphQL explorer
```

### Installation & Cleaning

```powershell
make install         # Install all deps (Node.js + Python)
make install-force   # Force install (handles Windows file locks)
make wt-setup WT=<path>  # Smart worktree setup (node_modules junction + .env + .twig)
make clean           # Full clean (node_modules, .nx cache, daemon)
make clean-cache     # Clear Nx cache only (alias: reset, clean-safe)
make force-clean     # Force clean with Windows lock handling
```

### Database

```powershell
make db-migrate      # Run migrations
make db-studio       # Open Drizzle Studio
make db-reset        # Reset database (drops all tables!)
make db-check-connections  # Check connection pool status
```

### Infrastructure

```powershell
make deploy-lambdas         # Deploy all lambdas
make deploy-infrastructure  # Deploy with Terraform
make terraform-init         # terraform init
make terraform-plan         # terraform plan
make terraform-apply        # terraform apply (with confirmation)
make terraform-apply-auto   # terraform apply -auto-approve
make terraform-destroy      # terraform destroy
```

### Branch Management

```powershell
make branch-tree             # Show branch tree (twig tree)
make rebase-tree             # Rebase entire branch tree
make rebase-tree-auto        # Rebase tree, no prompts
make squash-branch           # Squash commits (optional: MESSAGE="msg")
make cleanup-merged-branches # List merged branches (DELETE=1 to remove)
make resolve-conflicts       # Resolve conflicts in generated files
```

### Utilities

```powershell
make graph           # Open Nx dependency graph
make affected        # Show affected projects
make list-projects   # List all projects
make workspace-lint  # Run workspace-level validations
make pr              # Create PR via twig
make sync-worktrees             # Generate .code-workspace with all active worktrees
make sync-worktrees-add TICKET=507    # Add a worktree to existing workspace
make sync-worktrees-remove TICKET=493 # Remove a worktree from workspace
make worktree TICKET=507 DESC=desc    # Create worktree + auto-add to workspace
make diagnose        # Show platform, versions, diagnostics
make codegen         # Run GraphQL code generation
```

### Composite Pipelines

```powershell
make ci              # clean-safe → install → lint → typecheck → test → build
make ci-force        # Same but with force install (Windows locks)
make ci-full         # Same but with full clean
make full-check      # lint → typecheck → test
make dev-setup       # install → db-migrate
make full-deploy     # clean → install → build-all → deploy-lambdas → deploy-infrastructure
```

## How It Works

### Platform Detection

The Makefile detects Windows via `$(OS)` == `Windows_NT` and sets:

- `SHELL := cmd` with `/c` flags (Windows) or `/bin/bash` with `-ec` (Linux/macOS)
- `DETECTED_OS` variable used in `ifeq` blocks for platform-specific commands
- `PATH_SEP` (`\\` or `/`) for cross-platform path construction

### LS-102 Window Hiding (Windows Only)

On Windows, the Makefile exports `NODE_OPTIONS` to load `scripts/patch-child-process.js`, which monkey-patches all `child_process` methods (`spawn`, `fork`, `exec`, etc.) with `windowsHide: true`. This prevents console windows from flashing during Nx task execution.

### Colored Output

Five echo macros are available: `echo_blue`, `echo_green`, `echo_yellow`, `echo_red`, `echo_plain`. On Windows they use PowerShell `Write-Host`; on Linux/macOS they use ANSI escape codes.

## Common Issues

### Issue: Windows console windows flashing

**Solution**: Always use `make` targets instead of running `pnpm exec nx` directly. The Makefile sets `NODE_OPTIONS` to load the `windowsHide` patch.

### Issue: File lock errors on Windows

**Solution**: `make install-force` or `make fix-windows-locks` then retry.

### Issue: Stale build/test results

**Solution**: `make clean-cache` to reset the Nx cache.

### Issue: `make` not found on Windows

**Solution**: Install via `choco install make` or use the version bundled with Git for Windows.

## Best Practices

1. **Use `make pc`** before every commit — it runs the full validation pipeline
2. **Use `make quick-check`** for fast iteration during development
3. **Never run `npx nx` directly** — use `make` targets or `pnpm exec nx` to ensure proper environment
4. **Use composite targets** (`ci`, `full-check`, `dev-setup`) for multi-step workflows
5. **Check `make help`** when unsure — it lists all targets with descriptions

## Related Skills

- [Building](build.md)
- [Testing](test.md)
- [Type Checking](typecheck.md)
- [Linting](lint.md)
- [Formatting](format.md)
