# Agent Skills Documentation

## Overview

This directory contains **detailed** skill documentation for AI agents. For **quick reference**, see:

- [`quick-reference.md`](../quick-reference.md) - Essential commands and workflows
- [`tasks/`](../tasks/) - Quick task guides (2-3 KB each)
- [`commands.yml`](../commands.yml) - Structured command lookup

**Load skills files only when task guides are insufficient.**

Each skill provides comprehensive guidance on executing specific development tasks.

## Available Skills

### Core Validation Skills

1. **[Type Checking](typecheck.md)** - TypeScript type validation
2. **[Linting](lint.md)** - Code quality and style checking with ESLint
3. **[Testing](test.md)** - Running Jest tests
4. **[Building](build.md)** - Compiling and bundling code
5. **[Formatting](format.md)** - Code formatting with Prettier

### Development Server Skills

6. **[Dev Web Server](dev-web.md)** - Running Next.js development server
7. **[Dev DB Lambda](dev-db-lambda.md)** - Running local GraphQL Lambda
8. **[Sync Environment](sync-env.md)** - Syncing environment variables from AWS
9. **[Database Query](db-query.md)** - Execute SQL queries for debugging and verification

### Code & Database Skills### Workflow & Branch Management Skills

9. **[Complete Workflow: Ticket to PR](workflow-ticket-to-pr.md)** ⭐ **START HERE** - Complete workflow preventing common mistakes
10. **[Branch Creation](branch-create.md)** - Creating feature branches with Jira integration
11. **[Jira Ticket Management](jira-ticket.md)** - Managing ticket status and workflow
12. **[Pull Request Creation](create-pr.md)** - Creating PRs with twig
13. **[Branch Tree Management](branch-tree.md)** - Managing dependent branch trees

### Code Generation & Database Skills

14. **[GraphQL Codegen](codegen.md)** - Regenerating GraphQL types
15. **[Write Database Migration](db-migration-write.md)** - Creating new database migration files
16. **[Run Database Migration](db-migrate.md)** - Applying pending migrations
17. **[Database Connection](db-connect.md)** - Testing database connectivity

### Troubleshooting & Maintenance Skills

18. **[Nx Cache Reset](nx-reset.md)** - Clearing Nx cache when stuck
19. **[Affected Projects Check](affected-check.md)** - Viewing project dependency graph
20. **[Workspace Validation](validate-workspace.md)** - Validating workspace integrity

### Deployment Skills

21. **[Lambda Deployment](deploy-lambda.md)** - Deploying AWS Lambda functions
22. **[Terraform Infrastructure](terraform-apply.md)** - Managing AWS infrastructure

### CLI & Administrative Tools

23. **[CLI Usage](cli-usage.md)** - Using the Legacy Sports CLI for database operations, user management, and debugging

## Skill Structure

Each skill document follows this structure:

- **Overview**: What the skill does
- **When to Use**: Appropriate scenarios
- **Command**: Primary command(s) to execute
- **Alternative Commands**: Variations and options
- **Expected Output**: What success/failure looks like
- **Common Issues**: Known problems and solutions
- **Best Practices**: Guidelines for proper use
- **Integration with Workflow**: How it fits in the development process
- **Related Skills**: Links to complementary skills

## Pre-commit Validation Sequence

The complete validation sequence using these skills:

```powershell
# Optional: Format code first
pnpm exec prettier --write .

# Required validation sequence (in order)
pnpm exec nx affected -t typecheck   # 1. Type checking
pnpm exec nx affected -t lint --fix  # 2. Linting
pnpm exec nx affected -t test        # 3. Testing
pnpm exec nx affected -t build       # 4. Building
```

## Quick Commands

### Makefile Shortcuts

````pValidation Skills
```powershell
# Type checking only
pnpm exec nx affected -t typecheck

# Linting only (with auto-fix)
pnpm exec nx affected -t lint --fix

# Testing only
pnpm exec nx affected -t test

# Building only
pnpm exec nx affected -t build

# Formatting (entire project)
pnpm exec prettier --write .
````

### Development Server Skills

```powershell
# Sync environment variables
.\scripts\sync-env.ps1

# Start web development server
npm start

# Start DB Lambda locally
pnpm exec nx run db:serve
```

### CLI Tools

```powershell
# Test database connection
pnpm run cli:test-connection

# List all players
pnpm run cli:list-players

# Add a new user
pnpm exec nx start cli -- add-user --email "user@example.com" --username "username"

# Authenticate CLI for GraphQL operations
pnpm exec nx start cli -- auth login
```

## Why This Order Matters

1. **Typecheck First**: Type errors can cause false positives in later steps
2. **Lint Second**: Code quality issues should be fixed before testing
3. **Test Third**: Ensure code works correctly before building
4. **Build Last**: Final verification that everything compiles

## Performance Tips

### Use Affected Commands

Always use `nx affected` to only check changed files:

```powershell
pnpm exec nx affected -t <target>
```

### Parallel Execution

Nx aStart Development Session

```powershell
# 1. Sync environment variables
.\scripts\sync-env.ps1

# 2. Start web server (Terminal 1)
npm start

# 3. Start DB Lambda (Terminal 2, optional)
pnpm exec nx run db:serve

# Ready to develop!
```

### utomatically parallelizes across projects - don't run tasks manually in parallel.

### Cache Benefits

Nx caches results - unchanged projects skip execution automatically.

### Reset Cache if Needed

```powershell
pnpm exec nx reset
```

## Common Workflows

### Quick Development Check

```powershell
make quick-check  # Fast: typecheck + lint
```

### Full Pre-commit Validation

```powershell
make pre-commit  # Complete: all 4 validation steps
```

### Specific Project Only

```powershell
pnpm exec nx run <project-name>:typecheck
pnpm exec nx run <project-name>:lint --fix
pnpm exec nx run <project-name>:test
pnpm exec nx run <project-name>:build
```

## Integration with CI/CD

These same commands run in CI pipelines:

- GitHub Actions uses identical Nx commands
- Same caching mechanisms apply
- Parallel execution across CI workers

See [CI System Documentation](../../../docs/ci-cd/ci-system-documentation.md) for details.

## Related Documentation

- **[AI Agent Contribution Workflow](../../../docs/guides/ai-agent-contribution-workflow.md)** - Complete development process
- **[Development Workflow CSV](../../../docs/agents/development-workflow.csv)** - Quick reference patterns
- **[Troubleshooting Guide](../../../docs/guides/troubleshooting.md)** - Common issues and solutions
- **[ESLint Standards CSV](../../../docs/agents/eslint-standards.csv)** - Linting rules details
- **[Type Safety CSV](../../../docs/agents/type-safety.csv)** - TypeScript patterns
- **[Testing Strategy CSV](../../../docs/agents/testing-strategy.csv)** - Testing patterns

## For AI Agents

When working on tasks:

1. **Start with environment sync**: Always run `.\scripts\sync-env.ps1` before starting dev servers
2. **Use development servers**: Start web and/or Lambda servers for testing changes
3. **Always validate before committing**: Run the full pre-commit sequence
4. **Fix issues in order**: Don't skip steps if earlier validation fails
5. **Use affected commands**: Don't waste time checking unchanged code
6. **Read error messages carefully**: They often indicate the fix needed
   7 **[Development Workflow CSV](../development-workflow.csv)** - Quick reference patterns

- **[Troubleshooting Guide](../../guides/troubleshooting.md)** - Common issues and solutions
- **[ESLint Standards CSV](../eslint-standards.csv)** - Linting rules details
- **[Type Safety CSV](../type-safety.csv)** - TypeScript patterns
- **[Testing Strategy CSV](../testing-strategy.csv)** - Testing patterns

## For AI Agents

When working on tasks:

1. **Always validate before committing**: Run the full pre-commit sequence
2. **Fix issues in order**: Don't skip steps if earlier validation fails
3. **Use affected commands**: Don't waste time checking unchanged code
4. **Read error messages carefully**: They often indicate the fix needed
5. **Consult specific skill docs**: Each skill has detailed troubleshooting

## Contributing to Skills

If you discover new patterns or issues:

1. Update the relevant skill document
2. Add to the "Common Issues" section
3. Document solutions clearly
4. Include examples where helpful

## Support

- **Common Issues**: Check individual skill docs
- **Workflow Questions**: See [AI Agent Contribution Workflow](../../../docs/guides/ai-agent-contribution-workflow.md)
- **Architecture Questions**: See [docs/architecture/](../../../docs/architecture/)
- **Can't Find Answer**: Search all docs starting from [docs/README.md](../../../docs/README.md)
- **Quick Reference**: See [agents.md](../../../agents.md) at repository root
- **Quick Reference**: See [agents.md](../../../agents.md) at repository root
