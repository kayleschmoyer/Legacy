# GitHub Copilot Instructions for Legacy Sports

## Overview

This workspace contains a comprehensive set of AI agent documentation and skills for contributing to the Legacy Sports codebase. GitHub Copilot should use these resources to provide accurate, context-aware assistance.

## Primary Documentation

**Main Entry Point**: [`agents.md`](../agents.md) - Start here for complete AI agent documentation

This file provides:
- Quick start guide for AI agents
- Complete workflow overview
- Links to all documentation resources
- Essential commands and patterns

## Skills Documentation

**Location**: [`.github/copilot/skills/`](.github/copilot/skills/)

Structured skill documentation for common development tasks:

### Validation & Quality
- [Type Checking](copilot/skills/typecheck.md) - TypeScript type validation
- [Linting](copilot/skills/lint.md) - ESLint code quality checks
- [Testing](copilot/skills/test.md) - Jest testing
- [Building](copilot/skills/build.md) - Compiling and bundling
- [Formatting](copilot/skills/format.md) - Prettier code formatting

### Development Servers
- [Dev Web Server](copilot/skills/dev-web.md) - Next.js development server
- [Dev DB Lambda](copilot/skills/dev-db-lambda.md) - Local GraphQL Lambda
- [Sync Environment](copilot/skills/sync-env.md) - AWS environment variable sync

## Structured Guidelines (CSV Format)

**Location**: [`docs/agents/`](../docs/agents/)

Quick-reference CSV files for specific patterns:
- [Contribution Workflow](../docs/agents/contribution-workflow.csv) - Complete workflow patterns
- [Development Workflow](../docs/agents/development-workflow.csv) - Daily development patterns
- [Common Pitfalls](../docs/agents/common-pitfalls.csv) - Mistakes to avoid
- [ESLint Standards](../docs/agents/eslint-standards.csv) - Code quality rules
- [Type Safety](../docs/agents/type-safety.csv) - TypeScript standards
- [Testing Strategy](../docs/agents/testing-strategy.csv) - Testing patterns
- [Platform Components](../docs/agents/platform-components.csv) - Cross-platform patterns
- [Security Guidelines](../docs/agents/security-guidelines.csv) - Security best practices

See full index: [docs/agents/README.md](../docs/agents/README.md)

## Architecture Documentation

**Location**: [`docs/architecture/`](../docs/architecture/)

- [Cross-Platform System](../docs/architecture/cross-platform-system.md) - Magic strings and platform resolution
- [Build System](../docs/architecture/build-system.md) - Nx monorepo structure
- [GraphQL Integration](../docs/architecture/graphql-integration.md) - API design
- [Database Schema](../docs/architecture/database-schema.md) - Data models

## Essential Guides

**Location**: [`docs/guides/`](../docs/guides/)

- [AI Agent Contribution Workflow](../docs/guides/ai-agent-contribution-workflow.md) ⭐ - Complete step-by-step process
- [Branch Tree Management](../docs/guides/branch-tree-management.md) - Twig tree management
- [Development Setup](../docs/guides/development-setup.md) - Environment configuration
- [Troubleshooting Guide](../docs/guides/troubleshooting.md) - Common issues and solutions
- [Authentication Guide](../docs/guides/authentication-guide.md) - OAuth implementation
- [Security & Secrets](../docs/guides/security-and-secrets.md) - Secrets management

## Quick Commands Reference

### Pre-commit Validation
```powershell
make quick-check  # Fast: typecheck + lint
make pre-commit   # Full: typecheck + lint + test + build
```

### Development Setup
```powershell
.\scripts\sync-env.ps1    # Sync environment variables
npm start                 # Start web server
pnpm exec nx run db:serve # Start DB Lambda
```

### Validation Sequence
```powershell
pnpm exec nx affected -t typecheck   # 1. Type checking
pnpm exec nx affected -t lint --fix  # 2. Linting
pnpm exec nx affected -t test        # 3. Testing
pnpm exec nx affected -t build       # 4. Building
```

### Branch Management
```powershell
.\scripts\branch-create.ps1 -TicketKey LS-1234  # Create branch + update Jira
twig tree                                       # View branch tree
make rebase-tree                                # Interactive rebase tree
```

## Key Principles for Copilot

1. **Always use Nx commands**: `pnpm exec nx affected -t <target>`
2. **PowerShell syntax**: Use `;` for chaining, `$env:` for variables
3. **Validation order**: typecheck → lint → test → build
4. **Never suppress errors**: Fix root causes, don't use `@ts-ignore` or `eslint-disable` without justification
5. **Update Jira tickets**: Track status throughout workflow
6. **Use affected commands**: Only check/build changed projects

## Environment Context

- **Platform**: Windows with PowerShell
- **Monorepo**: Nx workspace
- **Package Manager**: pnpm
- **Jira Project**: LS
- **Dev Servers**: Already running (don't start again)
- **Branch Tool**: Twig for branch management

## Documentation Index

**Full Documentation Hub**: [docs/README.md](../docs/README.md)

Organized by role and topic for comprehensive reference.

---

**For detailed workflow instructions, always start with [`agents.md`](../agents.md)**
